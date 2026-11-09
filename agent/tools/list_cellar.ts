import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, cellarQuery, colorSchema, idOf, styleSchema } from "../lib/convex";

export default defineTool({
  description:
    "List bottles grouped by vintage with producer, wine, year, counts, sizes, locations, and drink window. Defaults to bottles still in the cellar.",
  inputSchema: z.object({
    status: z.enum(["cellar", "consumed", "gifted", "lost"]).optional(),
    producerId: idOf("producers").optional(),
    color: colorSchema.optional(),
    style: styleSchema.optional(),
    locationId: idOf("locations").optional(),
    limit: z.number().int().min(1).optional(),
  }),
  async execute(input) {
    return await cellarQuery(api.cellar.list, input);
  },
});
