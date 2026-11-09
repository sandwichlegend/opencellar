import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCellarTrackerCsv,
  parseCsv,
  parseSizeMl,
  planCellarTrackerImport,
} from "../../convex/lib/cellartracker";

const fixture = readFileSync(new URL("../fixtures/cellartracker.csv", import.meta.url), "utf8");

describe("parseCsv", () => {
  it("handles BOMs, quoted delimiters, escaped quotes, CRLF, and embedded newlines", () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\nline2"],
    ]);
  });

  it("reads tab-separated exports", () => {
    expect(parseCsv("Producer\tVintage\nKrug\t1001\n")).toEqual([
      ["Producer", "Vintage"],
      ["Krug", "1001"],
    ]);
  });
});

describe("parseSizeMl", () => {
  it.each([
    ["750ml", 750],
    ["1.5L", 1500],
    ["1,5 L", 1500],
    ["37.5cl", 375],
    ["Magnum", 1500],
    ["mystery", undefined],
  ])("parses %j", (input, expected) => {
    expect(parseSizeMl(input)).toBe(expected);
  });
});

describe("parseCellarTrackerCsv", () => {
  const records = parseCellarTrackerCsv(fixture);

  it("reads every row by header name", () => {
    expect(records).toHaveLength(8);
    expect(records[0]).toMatchObject({
      iInventory: "1001",
      producer: "Château Musar",
      vintage: 2016,
      price: 55,
      storeName: "K&L Wine Merchants",
      beginConsume: 2024,
      endConsume: 2040,
    });
  });

  it("treats 1001 as non-vintage and Unknown as missing", () => {
    const krug = records.find((record) => record.producer === "Krug");
    expect(krug?.vintage).toBeNull();
    expect(krug?.beginConsume).toBeUndefined();
    expect(records[0].designation).toBeUndefined();
  });

  it("tolerates missing columns", () => {
    expect(parseCellarTrackerCsv("Producer,Wine\nKrug,Krug Grande Cuvée\n")).toEqual([
      { line: 2, vintage: null, producer: "Krug", wine: "Krug Grande Cuvée" },
    ]);
  });
});

describe("planCellarTrackerImport", () => {
  const { rows, issues } = planCellarTrackerImport(parseCellarTrackerCsv(fixture));
  const byKey = new Map(rows.map((row) => [row.ingestKey, row]));

  it("keys rows by iInventory so re-imports collide", () => {
    expect(issues).toEqual([]);
    expect(rows.map((row) => row.ingestKey)).toEqual([
      "ct:1001", "ct:1002", "ct:1003", "ct:1004", "ct:1005", "ct:1006", "ct:1007", "ct:1008",
    ]);
  });

  it("maps cuvée, color, style, size, window, and purchase", () => {
    expect(byKey.get("ct:1001")).toMatchObject({
      producer: { name: "Château Musar", country: "Lebanon" },
      wine: { name: "", color: "red", style: "still" },
      vintage: { year: 2016, drinkWindow: { from: 2024, to: 2040, source: "import" } },
      sizeMl: 750,
      location: { name: "Basement", bin: "A1" },
      purchase: { merchant: "K&L Wine Merchants", purchasedOn: "2023-03-14", unitPrice: 55, currency: "USD" },
    });
    expect(byKey.get("ct:1003")).toMatchObject({ wine: { name: "Cuvée Cabassaou" }, sizeMl: 1500 });
    expect(byKey.get("ct:1004")).toMatchObject({ wine: { color: "white", style: "sparkling" }, vintage: { year: null } });
    expect(byKey.get("ct:1005")).toMatchObject({ wine: { name: "Spätlese Oberhäuser Brücke", style: "sweet" } });
    expect(byKey.get("ct:1007")).toMatchObject({ wine: { name: "Bandol Rosé", color: "rose" } });
    expect(byKey.get("ct:1008")).toMatchObject({ wine: { color: "orange" }, vintage: { drinkWindow: undefined } });
  });

  it("falls back to a content hash with an occurrence counter when iInventory is missing", () => {
    const csv = "Producer,Wine,Vintage\nKrug,Krug Grande Cuvée,1001\nKrug,Krug Grande Cuvée,1001\n";
    const keys = planCellarTrackerImport(parseCellarTrackerCsv(csv)).rows.map((row) => row.ingestKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^ct:h:[0-9a-f]{8}:1$/);
    expect(keys[1]).toBe(keys[0].replace(/:1$/, ":2"));
  });

  it("reports rows without a producer", () => {
    const planned = planCellarTrackerImport(parseCellarTrackerCsv("Producer,Wine\n,Mystery\n"));
    expect(planned.issues).toEqual([{ line: 2, error: "missing Producer" }]);
  });
});
