import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarMutation, idOf } from "../lib/convex";

export default defineTool({
  description: "Mark one bottle as drunk and record the tasting. Fails if the bottle was already consumed, gifted, or lost.",
  inputSchema: z.object({
    bottleId: idOf("bottles"),
    drunkOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("ISO date. Defaults to today."),
    rating: z.number().min(0).max(100).optional(),
    note: z.string().optional(),
    pairedWith: z.string().optional(),
  }),
  async execute(input) {
    return await cellarMutation(api.bottles.consume, input);
  },
});
