import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarMutation, idOf } from "../lib/convex";

export default defineTool({
  description: "Move bottles that are still in the cellar to a location. Fails without changes if any bottle has left the cellar.",
  inputSchema: z.object({
    bottleIds: z.array(idOf("bottles")).min(1),
    locationId: idOf("locations"),
  }),
  async execute(input) {
    return await cellarMutation(api.bottles.move, input);
  },
});
