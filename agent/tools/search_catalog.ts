import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarQuery, colorSchema, styleSchema, yearSchema } from "../lib/convex";

export default defineTool({
  description:
    "Search the cellar catalog for a producer, cuvée, and vintage. Deterministic: it normalizes abbreviations such as 'Ch.' and 'Dom.', checks recorded aliases, and returns ranked candidates with a 0..1 score and the reasons behind it ('alias match', 'producer 0.93', 'cuvée 0.88', 'vintage exists', 'vintage missing'). Call it before adding any bottle.",
  inputSchema: z.object({
    producer: z.string().min(1).describe("Producer as read from the label."),
    wine: z.string().optional().describe("Cuvée or wine name without the producer. Use an empty string for the producer's basic wine."),
    year: yearSchema.optional(),
    appellation: z.string().optional(),
    color: colorSchema.optional(),
    style: styleSchema.optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  label: { start: ({ producer, year }) => `Search catalog for ${producer}${year ? ` ${year}` : ""}` },
  async execute(input) {
    return { candidates: await cellarQuery(api.catalog.search, input) };
  },
});
