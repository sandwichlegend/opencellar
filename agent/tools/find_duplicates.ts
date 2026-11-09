import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarQuery } from "../lib/convex";

export default defineTool({
  description:
    "Find likely duplicate producers, and likely duplicate wines under one producer, with similarity scores. Read only: it never merges.",
  inputSchema: z.object({
    threshold: z.number().min(0).max(1).optional().describe("Minimum similarity. Defaults to 0.8."),
  }),
  async execute(input) {
    return { pairs: await cellarQuery(api.catalog.findDuplicates, input) };
  },
});
