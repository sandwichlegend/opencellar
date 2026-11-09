import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  aliasSource,
  aliasTarget,
  appellationFields,
  bottleState,
  color,
  drinkWindow,
  evidenceSide,
  grapes,
  ingestSource,
  ingestState,
  isoDate,
  locationKind,
  producerFields,
  purchaseFields,
  style,
  year,
} from "./validators";

export default defineSchema({
  producers: defineTable({ ...producerFields, normalizedName: v.string() })
    .index("by_normalized", ["normalizedName"])
    .searchIndex("search_normalized", { searchField: "normalizedName" }),

  wines: defineTable({
    producerId: v.id("producers"),
    name: v.string(),
    normalizedName: v.string(),
    color,
    style,
    appellationId: v.optional(v.id("appellations")),
    grapes,
    lwin7: v.optional(v.string()),
  }).index("by_producer", ["producerId", "normalizedName"]),

  vintages: defineTable({
    wineId: v.id("wines"),
    year,
    lwin11: v.optional(v.string()),
    abv: v.optional(v.number()),
    drinkWindow: v.optional(drinkWindow),
  }).index("by_wine_year", ["wineId", "year"]),

  bottles: defineTable({
    vintageId: v.id("vintages"),
    sizeMl: v.number(),
    locationId: v.optional(v.id("locations")),
    purchaseId: v.optional(v.id("purchases")),
    ingestJobId: v.optional(v.id("ingestJobs")),
    addedAt: v.number(),
    externalRef: v.optional(v.string()),
    state: bottleState,
  })
    .index("by_vintage", ["vintageId"])
    .index("by_location", ["locationId"])
    .index("by_status", ["state.status"]),

  consumptions: defineTable({
    bottleId: v.id("bottles"),
    drunkOn: isoDate,
    rating: v.optional(v.number()),
    note: v.optional(v.string()),
    pairedWith: v.optional(v.string()),
  }).index("by_bottle", ["bottleId"]),

  aliases: defineTable({
    target: aliasTarget,
    text: v.string(),
    normalized: v.string(),
    source: aliasSource,
  })
    .index("by_normalized", ["normalized"])
    .index("by_producer_target", ["target.producerId"])
    .index("by_wine_target", ["target.wineId"]),

  appellations: defineTable({ ...appellationFields, normalizedName: v.string() }).index("by_normalized", [
    "normalizedName",
  ]),

  locations: defineTable({
    name: v.string(),
    parentId: v.optional(v.id("locations")),
    kind: locationKind,
    capacity: v.optional(v.number()),
  }).index("by_parent_name", ["parentId", "name"]),

  purchases: defineTable({ ...purchaseFields, quantity: v.number() }),

  ingestJobs: defineTable({
    ingestKey: v.string(),
    source: ingestSource,
    state: ingestState,
  })
    .index("by_key", ["ingestKey"])
    .index("by_vintage", ["state.vintageId"]),

  evidence: defineTable({
    vintageId: v.id("vintages"),
    ingestJobId: v.optional(v.id("ingestJobs")),
    storageId: v.id("_storage"),
    side: evidenceSide,
    extracted: v.optional(v.any()),
  }).index("by_vintage", ["vintageId"]),
});
