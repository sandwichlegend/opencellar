import { defineDynamic, defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import {
  api,
  cellarMutation,
  colorSchema,
  drinkWindowSchema,
  idOf,
  styleSchema,
  yearSchema,
} from "../lib/convex";

const appellationSchema = z.union([
  z.object({ id: idOf("appellations") }),
  z.object({ name: z.string().min(1), country: z.string().min(1), region: z.string().optional() }),
]);

const grapesSchema = z.array(z.object({ grape: z.string().min(1), percent: z.number().min(0).max(100).optional() }));

const addBottles = defineTool({
  description:
    "Add bottles in one all-or-nothing write. Pass {id} for any producer, wine, or vintage that search_catalog returned; pass fields only for entries that do not exist yet. A producer or wine whose name already exists is reused, and the result's `reused` says so. Idempotent by ingestKey: repeating a key returns the original ids and writes nothing.",
  inputSchema: z.object({
    ingestKey: z
      .string()
      .min(1)
      .describe("Stable key derived from the input, such as 'photo:<sha of the image>' or 'text:<producer>|<wine>|<year>|<date>'."),
    source: z.enum(["photo", "text", "receipt", "csv", "mcp"]),
    producer: z.union([
      z.object({ id: idOf("producers") }),
      z.object({
        name: z.string().min(1),
        country: z.string().optional(),
        region: z.string().optional(),
        wikidataId: z.string().optional(),
        lwinProducer: z.string().optional(),
      }),
    ]),
    wine: z.union([
      z.object({ id: idOf("wines") }),
      z.object({
        name: z.string().describe("Cuvée name without the producer; empty string for the basic wine."),
        color: colorSchema,
        style: styleSchema.optional(),
        appellation: appellationSchema.optional(),
        grapes: grapesSchema.optional(),
        lwin7: z.string().optional(),
      }),
    ]),
    vintage: z.union([
      z.object({ id: idOf("vintages") }),
      z.object({
        year: yearSchema,
        lwin11: z.string().optional(),
        abv: z.number().min(0).max(30).optional(),
        drinkWindow: drinkWindowSchema.optional(),
      }),
    ]),
    quantity: z.number().int().min(1).max(240),
    sizeMl: z.number().int().positive().optional().describe("Defaults to 750."),
    locationId: idOf("locations").optional(),
    purchase: z
      .object({
        merchant: z.string().optional(),
        purchasedOn: z.string().optional(),
        unitPrice: z.number().optional(),
        currency: z.string().optional(),
      })
      .optional(),
  }),
  label: { start: ({ quantity }) => `Add ${quantity} bottle${quantity === 1 ? "" : "s"}` },
  async execute(input) {
    return await cellarMutation(api.cellar.addBottles, input);
  },
});

const mergeSchema = z.object({
  kind: z.enum(["producer", "wine", "vintage"]),
  keepId: z.string().min(1).describe("The entry that survives."),
  mergeId: z.string().min(1).describe("The duplicate that is folded into keepId and deleted."),
});

const merge = defineTool({
  description:
    "Merge a duplicate producer, wine, or vintage into the one to keep. Children move, same-year vintages and same-name wines fold together, and the duplicate's name becomes an alias. Irreversible, so it always asks the user first.",
  inputSchema: mergeSchema,
  approval: always<z.infer<typeof mergeSchema>>(),
  label: { start: ({ kind }) => `Merge duplicate ${kind}` },
  async execute(input) {
    return await cellarMutation(api.catalog.merge, input);
  },
});

const recordAlias = defineTool({
  description:
    "Remember another spelling for a producer or wine, such as a label abbreviation the user corrected. Future searches treat it as an exact alias match.",
  inputSchema: z.object({
    target: z.union([
      z.object({ kind: z.literal("producer"), producerId: idOf("producers") }),
      z.object({ kind: z.literal("wine"), wineId: idOf("wines") }),
    ]),
    text: z.string().min(1),
    source: z.enum(["correction", "import", "merge"]),
  }),
  async execute(input) {
    return await cellarMutation(api.catalog.recordAlias, input);
  },
});

const updateWine = defineTool({
  description: "Correct or enrich a wine: name, color, style, appellation, grapes, or LWIN-7.",
  inputSchema: z.object({
    wineId: idOf("wines"),
    name: z.string().optional(),
    color: colorSchema.optional(),
    style: styleSchema.optional(),
    appellation: appellationSchema.optional(),
    grapes: grapesSchema.optional(),
    lwin7: z.string().optional(),
  }),
  async execute(input) {
    return await cellarMutation(api.catalog.updateWine, input);
  },
});

const updateVintage = defineTool({
  description:
    "Enrich a vintage with LWIN-11, ABV, or a drink window. An agent-sourced window never replaces one the user or an import set; the result lists it under `skipped`.",
  inputSchema: z.object({
    vintageId: idOf("vintages"),
    lwin11: z.string().optional(),
    abv: z.number().min(0).max(30).optional(),
    drinkWindow: drinkWindowSchema.optional(),
  }),
  async execute(input) {
    return await cellarMutation(api.catalog.updateVintage, input);
  },
});

const createLocation = defineTool({
  description: "Create a storage location, optionally inside a parent. Returns the existing one if the same name already exists there.",
  inputSchema: z.object({
    name: z.string().min(1),
    kind: z.enum(["cellar", "rack", "bin", "fridge", "other"]),
    parentId: idOf("locations").optional(),
    capacity: z.number().int().positive().optional(),
  }),
  async execute(input) {
    return await cellarMutation(api.locations.create, input);
  },
});

export default defineDynamic(() => ({
  add_bottles: addBottles,
  merge,
  record_alias: recordAlias,
  update_wine: updateWine,
  update_vintage: updateVintage,
  create_location: createLocation,
}));
