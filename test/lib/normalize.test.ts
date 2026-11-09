import { describe, expect, it } from "vitest";
import { normalize } from "../../convex/lib/normalize";
import { similarity } from "../../convex/lib/similarity";

describe("normalize", () => {
  it.each([
    ["Château Musar", "chateau musar"],
    ["Ch. Musar", "chateau musar"],
    ["CHÂT. MUSAR", "chateau musar"],
    ["Cht Musar", "chateau musar"],
    ["Dom. de la Romanée-Conti", "domaine romanee conti"],
    ["St-Julien", "saint julien"],
    ["Ste. Michelle", "sainte michelle"],
    ["Mt. Eden", "mont eden"],
    ["Château d'Yquem", "chateau yquem"],
    ["  Dönnhoff   Oberhäuser  Brücke ", "donnhoff oberhauser brucke"],
    ["Cœur de Bœuf", "coeur boeuf"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it("keeps filler tokens when they are the whole name", () => {
    expect(normalize("Le")).toBe("le");
    expect(normalize("De La")).toBe("de la");
  });

  it("returns an empty string for punctuation only", () => {
    expect(normalize(" - . ")).toBe("");
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for disjoint ones", () => {
    expect(similarity("chateau musar", "chateau musar")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
    expect(similarity("", "musar")).toBe(0);
  });

  it("scores near-misses high and different producers low", () => {
    expect(similarity("chateau musar", "chateau musard")).toBeGreaterThan(0.75);
    expect(similarity("domaine tempier", "domaine tempie")).toBeGreaterThan(0.75);
    expect(similarity("musar", "chateau musar")).toBeGreaterThan(0.85);
    expect(similarity("chateau musar", "chateau margaux")).toBeLessThan(0.4);
  });

  it("is symmetric and stays within 0..1", () => {
    const pairs: [string, string][] = [["krug", "krug grande cuvee"], ["gut oggau", "oggau"]];
    for (const [a, b] of pairs) {
      expect(similarity(a, b)).toBe(similarity(b, a));
      expect(similarity(a, b)).toBeGreaterThan(0);
      expect(similarity(a, b)).toBeLessThanOrEqual(1);
    }
  });
});
