import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarQuery } from "../lib/convex";

export default defineTool({
  description: "List cellar vintages whose drink window closes within the next few years, including ones already past their window.",
  inputSchema: z.object({
    withinYears: z.number().int().min(0).max(30).optional().describe("Horizon in years. Defaults to 2."),
  }),
  async execute(input) {
    return { vintages: await cellarQuery(api.cellar.drinkingSoon, input) };
  },
});
