import type { ToolStub } from "eve/evals";

export const ids = {
  producer: "producer_musar",
  wine: "wine_musar_rouge",
  vintage2016: "vintage_musar_2016",
  vintage2019: "vintage_musar_2019",
  ingestJob: "ingest_1",
} as const;

const musar = { producerId: ids.producer, producerName: "Château Musar", wineId: ids.wine, wineName: "", color: "red", style: "still" };

export function searchReturning(year: number, vintageId: string | null): ToolStub {
  const reasons = ["producer 1", "cuvée 1", vintageId ? "vintage exists" : "vintage missing"];
  return {
    id: "search",
    tool: "search_catalog",
    outcome: {
      response: {
        candidates: [vintageId ? { ...musar, vintageId, year, score: 1, reasons } : { ...musar, year, score: 0.98, reasons }],
      },
    },
  };
}

export function addBottlesCommitting(vintageId: string, bottleCount: number): ToolStub {
  return {
    id: "add",
    tool: "add_bottles",
    outcome: {
      response: {
        outcome: "committed",
        ingestJobId: ids.ingestJob,
        producerId: ids.producer,
        wineId: ids.wine,
        vintageId,
        bottleIds: Array.from({ length: bottleCount }, (_, index) => `bottle_${index + 1}`),
        reused: { producer: "provided", wine: "provided", vintage: vintageId === ids.vintage2016 ? "provided" : "created" },
      },
    },
  };
}
