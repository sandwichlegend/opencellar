import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarQuery, idOf } from "../lib/convex";

export default defineTool({
  description: "Get one wine with its producer, appellation, grapes, and every vintage with in-cellar counts and drink windows.",
  inputSchema: z.object({ wineId: idOf("wines") }),
  async execute({ wineId }) {
    return await cellarQuery(api.catalog.getWine, { wineId });
  },
});
