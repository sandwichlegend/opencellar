import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { addMusar, apiKey, expectCode, setup } from "./harness";

const fixture = readFileSync(new URL("../fixtures/cellartracker.csv", import.meta.url), "utf8");

describe("cellar.addBottles", () => {
  it("creates producer, wine, vintage, and bottles on the first call", async () => {
    const t = setup();
    const result = await addMusar(t, { key: "label:musar-2016", quantity: 3 });
    expect(result).toMatchObject({
      outcome: "committed",
      reused: { producer: "created", wine: "created", vintage: "created" },
    });
    expect(result.bottleIds).toHaveLength(3);
    const listing = await t.query(api.cellar.list, { apiKey });
    expect(listing).toMatchObject({ bottles: 3, rows: [{ producer: "Château Musar", year: 2016, count: 3 }] });
  });

  it("returns the original ids and writes nothing when the ingest key repeats", async () => {
    const t = setup();
    const first = await addMusar(t, { key: "label:musar-2016", quantity: 2 });
    const again = await addMusar(t, { key: "label:musar-2016", quantity: 5, year: 2019 });
    expect(again).toEqual({
      outcome: "replayed",
      ingestJobId: first.ingestJobId,
      producerId: first.producerId,
      wineId: first.wineId,
      vintageId: first.vintageId,
      bottleIds: first.bottleIds,
    });
    const listing = await t.query(api.cellar.list, { apiKey });
    expect(listing.bottles).toBe(2);
    expect(listing.rows.map((row) => row.year)).toEqual([2016]);
  });

  it("reuses a producer and wine whose normalized names already exist", async () => {
    const t = setup();
    const first = await addMusar(t);
    const second = await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: "label:ch-musar-2017",
      source: "photo",
      producer: { name: "CH. MUSAR" },
      wine: { name: "", color: "red" },
      vintage: { year: 2017 },
      quantity: 1,
    });
    expect(second).toMatchObject({
      outcome: "committed",
      producerId: first.producerId,
      wineId: first.wineId,
      reused: { producer: "matched", wine: "matched", vintage: "created" },
    });
    expect(second.vintageId).not.toBe(first.vintageId);
  });

  it("rejects a wine id that belongs to another producer and writes nothing", async () => {
    const t = setup();
    const musar = await addMusar(t);
    await expectCode(
      t.mutation(api.cellar.addBottles, {
        apiKey,
        ingestKey: "label:mismatch",
        source: "text",
        producer: { name: "Krug" },
        wine: { id: musar.wineId },
        vintage: { year: null },
        quantity: 1,
      }),
      "conflict",
    );
    expect(await t.query(api.catalog.search, { apiKey, producer: "Krug" })).toEqual([]);
  });
});

describe("bottles", () => {
  it("moves cellar bottles to a location", async () => {
    const t = setup();
    const { bottleIds } = await addMusar(t, { quantity: 2 });
    const rack = await t.mutation(api.locations.create, { apiKey, name: "Rack 1", kind: "rack" });
    await expect(
      t.mutation(api.bottles.move, { apiKey, bottleIds, locationId: rack.locationId }),
    ).resolves.toEqual({ moved: 2, locationId: rack.locationId });
    const listing = await t.query(api.cellar.list, { apiKey, locationId: rack.locationId });
    expect(listing.rows[0].locations).toEqual([{ locationId: rack.locationId, name: "Rack 1", count: 2 }]);
    const locations = await t.query(api.locations.list, { apiKey });
    expect(locations).toEqual([expect.objectContaining({ name: "Rack 1", inCellar: 2 })]);
  });

  it("consumes a bottle once and rejects a second consume", async () => {
    const t = setup();
    const { bottleIds } = await addMusar(t, { quantity: 2 });
    const consumed = await t.mutation(api.bottles.consume, {
      apiKey,
      bottleId: bottleIds[0],
      drunkOn: "2026-11-01",
      rating: 94,
      pairedWith: "lamb",
    });
    expect(consumed.state).toEqual({ status: "consumed", at: "2026-11-01" });
    await expectCode(t.mutation(api.bottles.consume, { apiKey, bottleId: bottleIds[0] }), "invalid_state");
    const rack = await t.mutation(api.locations.create, { apiKey, name: "Rack", kind: "rack" });
    await expectCode(
      t.mutation(api.bottles.move, { apiKey, bottleIds: [bottleIds[0]], locationId: rack.locationId }),
      "invalid_state",
    );
    expect((await t.query(api.cellar.list, { apiKey })).bottles).toBe(1);
    expect((await t.query(api.cellar.list, { apiKey, status: "consumed" })).bottles).toBe(1);
  });
});

describe("cellar.drinkingSoon", () => {
  it("lists vintages whose window closes within the horizon, oldest first", async () => {
    const t = setup();
    const closing = await addMusar(t, { year: 2016 });
    const late = await addMusar(t, { year: 2018 });
    const past = await addMusar(t, { year: 2005 });
    await addMusar(t, { year: 2020 });
    const windows = [
      [closing.vintageId, 2027],
      [late.vintageId, 2040],
      [past.vintageId, 2024],
    ] as const;
    for (const [vintageId, to] of windows) {
      await t.mutation(api.catalog.updateVintage, { apiKey, vintageId, drinkWindow: { to, source: "user" } });
    }
    const due = await t.query(api.cellar.drinkingSoon, { apiKey, withinYears: 2, asOfYear: 2026 });
    expect(due.map(({ year, urgency }) => ({ year, urgency }))).toEqual([
      { year: 2005, urgency: "past-window" },
      { year: 2016, urgency: "closing" },
    ]);
  });
});

describe("imports.cellarTracker", () => {
  it("imports the fixture and treats a re-import as a no-op", async () => {
    const t = setup();
    const first = await t.action(api.imports.cellarTracker, { apiKey, csv: fixture });
    expect(first).toEqual({
      rows: 8,
      rowsCommitted: 8,
      rowsReplayed: 0,
      rowsFailed: 0,
      failures: [],
      bottlesAdded: 8,
      created: { producers: 6, wines: 7, vintages: 7, locations: 6 },
    });

    const listing = await t.query(api.cellar.list, { apiKey });
    const byProducer = (name: string) => listing.rows.filter((row) => row.producer === name);
    expect(listing.bottles).toBe(8);
    expect(byProducer("Château Musar")).toEqual([
      expect.objectContaining({ year: 2016, count: 2, locations: [expect.objectContaining({ name: "Basement / A1", count: 2 })] }),
    ]);
    expect(byProducer("Domaine Tempier").map(({ wine, sizes }) => ({ wine, sizes }))).toEqual([
      { wine: "Bandol Rosé", sizes: [{ sizeMl: 750, count: 1 }] },
      { wine: "Cuvée Cabassaou", sizes: [{ sizeMl: 1500, count: 1 }] },
    ]);
    expect(byProducer("Krug")).toEqual([expect.objectContaining({ year: null, style: "sparkling" })]);
    expect(byProducer("Dönnhoff")).toEqual([expect.objectContaining({ style: "sweet", color: "white" })]);

    const [yquem] = await t.query(api.catalog.search, { apiKey, producer: "Ch. d'Yquem", year: 2017 });
    expect(yquem).toMatchObject({ producerName: "Château d'Yquem", year: 2017 });
    expect(yquem.vintageId).toBeDefined();

    const again = await t.action(api.imports.cellarTracker, { apiKey, csv: fixture });
    expect(again).toMatchObject({
      rowsCommitted: 0,
      rowsReplayed: 8,
      bottlesAdded: 0,
      created: { producers: 0, wines: 0, vintages: 0, locations: 0 },
    });
    expect((await t.query(api.cellar.list, { apiKey })).bottles).toBe(8);
    expect(await t.query(api.locations.list, { apiKey })).toHaveLength(6);
  });
});
