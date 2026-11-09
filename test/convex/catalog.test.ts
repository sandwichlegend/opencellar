import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { addMusar, apiKey, expectCode, ingestKey, setup } from "./harness";

describe("catalog.search", () => {
  it("finds Château Musar from an abbreviated label", async () => {
    const t = setup();
    await addMusar(t);
    await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { name: "Château Margaux" },
      wine: { name: "", color: "red" },
      vintage: { year: 2010 },
      quantity: 1,
    });
    const [best, ...rest] = await t.query(api.catalog.search, { apiKey, producer: "Ch. Musar", year: 2016 });
    expect(best).toMatchObject({ producerName: "Château Musar", year: 2016, score: 1 });
    expect(best.vintageId).toBeDefined();
    expect(best.reasons).toEqual(expect.arrayContaining(["producer 1", "vintage exists"]));
    expect(rest.every((candidate) => candidate.producerName !== "Château Musar")).toBe(true);
  });

  it("reports a missing vintage for a known wine", async () => {
    const t = setup();
    await addMusar(t);
    const [best] = await t.query(api.catalog.search, { apiKey, producer: "Chateau Musar", year: 2019 });
    expect(best.vintageId).toBeUndefined();
    expect(best.reasons).toContain("vintage missing");
  });

  it("ranks alias hits ahead of a higher-scoring name match", async () => {
    const t = setup();
    const musar = await addMusar(t);
    await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { name: "Hochar" },
      wine: { name: "Red", color: "red" },
      vintage: { year: 2018 },
      quantity: 1,
    });
    await t.mutation(api.catalog.recordAlias, {
      apiKey,
      target: { kind: "producer", producerId: musar.producerId },
      text: "Hochar",
      source: "correction",
    });
    const candidates = await t.query(api.catalog.search, { apiKey, producer: "hochar", wine: "Red" });
    expect(candidates.map((candidate) => candidate.producerName)).toEqual(["Château Musar", "Hochar"]);
    expect(candidates[0].reasons).toContain("alias match");
    expect(candidates[0].score).toBeLessThan(candidates[1].score);
  });

  it("returns nothing for an unrelated producer", async () => {
    const t = setup();
    await addMusar(t);
    await expect(t.query(api.catalog.search, { apiKey, producer: "Ridge" })).resolves.toEqual([]);
  });
});

describe("catalog.updateVintage", () => {
  it("never lets an agent window overwrite a user window", async () => {
    const t = setup();
    const { vintageId } = await addMusar(t);
    const userWindow = { from: 2024, to: 2040, source: "user" as const };
    await expect(t.mutation(api.catalog.updateVintage, { apiKey, vintageId, drinkWindow: userWindow })).resolves.toMatchObject({
      applied: ["drinkWindow"],
    });
    const agentAttempt = await t.mutation(api.catalog.updateVintage, {
      apiKey,
      vintageId,
      abv: 14,
      drinkWindow: { from: 2026, to: 2030, source: "agent" },
    });
    expect(agentAttempt).toMatchObject({ applied: ["abv"], skipped: [{ field: "drinkWindow", reason: "user-set" }] });
    const wine = await t.query(api.catalog.getWine, { apiKey, wineId: (await addMusar(t)).wineId });
    expect(wine.vintages[0]).toMatchObject({ drinkWindow: userWindow, abv: 14 });
  });

  it("lets the user replace an agent estimate", async () => {
    const t = setup();
    const { vintageId } = await addMusar(t);
    await t.mutation(api.catalog.updateVintage, { apiKey, vintageId, drinkWindow: { to: 2030, source: "agent" } });
    const report = await t.mutation(api.catalog.updateVintage, { apiKey, vintageId, drinkWindow: { to: 2045, source: "user" } });
    expect(report).toMatchObject({ applied: ["drinkWindow"], skipped: [] });
  });
});

describe("catalog.findDuplicates", () => {
  it("pairs near-identical producers and wines without writing", async () => {
    const t = setup();
    await addMusar(t);
    await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { name: "Chateau Musard" },
      wine: { name: "Jeune Rouge", color: "red" },
      vintage: { year: 2021 },
      quantity: 1,
    });
    const pairs = await t.query(api.catalog.findDuplicates, { apiKey });
    expect(pairs).toEqual([
      expect.objectContaining({ kind: "producer", a: expect.objectContaining({ name: "Château Musar" }) }),
    ]);
    expect(await t.query(api.catalog.search, { apiKey, producer: "Château Musar" })).toHaveLength(2);
  });
});

describe("catalog.merge", () => {
  it("folds same-year vintages when merging wines and moves the bottles", async () => {
    const t = setup();
    const rouge = await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { name: "Château Musar" },
      wine: { name: "Rouge", color: "red" },
      vintage: { year: 2016 },
      quantity: 2,
    });
    const red2016 = await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { id: rouge.producerId },
      wine: { name: "Red", color: "red" },
      vintage: { year: 2016, drinkWindow: { to: 2040, source: "agent" } },
      quantity: 1,
    });
    await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { id: rouge.producerId },
      wine: { id: red2016.wineId },
      vintage: { year: 2018 },
      quantity: 1,
    });

    const summary = await t.mutation(api.catalog.merge, { apiKey, kind: "wine", keepId: rouge.wineId, mergeId: red2016.wineId });
    expect(summary).toMatchObject({
      folded: { vintages: 1, wines: 0 },
      moved: { vintages: 1, bottles: 1, ingestJobs: 1 },
      aliasesRecorded: ["Red"],
    });

    const wine = await t.query(api.catalog.getWine, { apiKey, wineId: rouge.wineId });
    expect(wine.vintages.map(({ year, inCellar }) => ({ year, inCellar }))).toEqual([
      { year: 2016, inCellar: 3 },
      { year: 2018, inCellar: 1 },
    ]);
    expect(wine.vintages[0].drinkWindow).toEqual({ to: 2040, source: "agent" });
    await expectCode(t.query(api.catalog.getWine, { apiKey, wineId: red2016.wineId }), "not_found");

    const replay = await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: "replay-check",
      source: "text",
      producer: { id: rouge.producerId },
      wine: { name: "Red", color: "red" },
      vintage: { year: 2016 },
      quantity: 1,
    });
    expect(replay).toMatchObject({ wineId: rouge.wineId, vintageId: rouge.vintageId, reused: { wine: "matched", vintage: "matched" } });
  });

  it("moves wines and records an alias when merging producers", async () => {
    const t = setup();
    const keep = await addMusar(t);
    const dupe = await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { name: "Musar Estate", region: "Bekaa Valley" },
      wine: { name: "Jeune", color: "white" },
      vintage: { year: 2021 },
      quantity: 2,
    });
    const sameName = await t.mutation(api.cellar.addBottles, {
      apiKey,
      ingestKey: ingestKey(),
      source: "text",
      producer: { id: dupe.producerId },
      wine: { name: "", color: "red" },
      vintage: { year: 2016 },
      quantity: 1,
    });
    expect(sameName.producerId).toBe(dupe.producerId);

    const summary = await t.mutation(api.catalog.merge, {
      apiKey,
      kind: "producer",
      keepId: keep.producerId,
      mergeId: dupe.producerId,
    });
    expect(summary).toMatchObject({
      moved: { wines: 1, bottles: 1 },
      folded: { wines: 1, vintages: 1 },
      aliasesRecorded: ["Musar Estate"],
    });

    const [hit] = await t.query(api.catalog.search, { apiKey, producer: "Musar Estate", wine: "Jeune" });
    expect(hit).toMatchObject({ producerId: keep.producerId, wineId: dupe.wineId, wineName: "Jeune" });
    expect(hit.reasons).toContain("alias match");

    const listing = await t.query(api.cellar.list, { apiKey, producerId: keep.producerId });
    expect(listing.rows.map(({ wine, year, count }) => ({ wine, year, count }))).toEqual([
      { wine: "", year: 2016, count: 2 },
      { wine: "Jeune", year: 2021, count: 2 },
    ]);
  });

  it("rejects merging an entity into itself", async () => {
    const t = setup();
    const { producerId } = await addMusar(t);
    await expectCode(t.mutation(api.catalog.merge, { apiKey, kind: "producer", keepId: producerId, mergeId: producerId }), "invalid_input");
  });
});
