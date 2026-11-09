import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarQuery } from "../lib/convex";

export default defineTool({
  description: "List storage locations (cellars, racks, bins, fridges) with their full path and in-cellar bottle counts.",
  inputSchema: z.object({}),
  async execute() {
    return { locations: await cellarQuery(api.locations.list, {}) };
  },
});
