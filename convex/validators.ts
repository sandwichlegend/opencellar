import { type Infer, v } from "convex/values";
import { BOTTLE_STATUSES } from "./lib/bottleState";
import {
  ALIAS_SOURCES,
  COLORS,
  EVIDENCE_SIDES,
  INGEST_SOURCES,
  LOCATION_KINDS,
  STYLES,
  WINDOW_SOURCES,
} from "./lib/domain";

function literals<T extends string>(values: readonly T[]) {
  return v.union(...values.map((value) => v.literal(value)));
}

export const color = literals(COLORS);
export const style = literals(STYLES);
export const locationKind = literals(LOCATION_KINDS);
export const ingestSource = literals(INGEST_SOURCES);
export const evidenceSide = literals(EVIDENCE_SIDES);
export const aliasSource = literals(ALIAS_SOURCES);
export const windowSource = literals(WINDOW_SOURCES);

export const isoDate = v.string();
export const year = v.union(v.number(), v.null());

export const drinkWindow = v.object({
  from: v.optional(v.number()),
  to: v.optional(v.number()),
  source: windowSource,
});

export const grapes = v.array(v.object({ grape: v.string(), percent: v.optional(v.number()) }));

export const bottleState = v.union(
  v.object({ status: v.literal("cellar") }),
  v.object({ status: v.literal("consumed"), at: isoDate }),
  v.object({ status: v.literal("gifted"), at: isoDate }),
  v.object({ status: v.literal("lost"), at: isoDate }),
);
export const bottleStatus = literals(BOTTLE_STATUSES);

export const aliasTarget = v.union(
  v.object({ kind: v.literal("producer"), producerId: v.id("producers") }),
  v.object({ kind: v.literal("wine"), wineId: v.id("wines") }),
);
export type AliasTarget = Infer<typeof aliasTarget>;

export const ingestState = v.union(
  v.object({ status: v.literal("committed"), vintageId: v.id("vintages"), bottleIds: v.array(v.id("bottles")) }),
  v.object({ status: v.literal("failed"), error: v.string() }),
);

export const producerFields = {
  name: v.string(),
  country: v.optional(v.string()),
  region: v.optional(v.string()),
  wikidataId: v.optional(v.string()),
  lwinProducer: v.optional(v.string()),
};

export const appellationFields = {
  name: v.string(),
  country: v.string(),
  region: v.optional(v.string()),
  kind: v.optional(v.string()),
};

export const appellationRef = v.union(v.object({ id: v.id("appellations") }), v.object(appellationFields));

export const wineFields = {
  name: v.string(),
  color,
  style: v.optional(style),
  appellation: v.optional(appellationRef),
  grapes: v.optional(grapes),
  lwin7: v.optional(v.string()),
};

export const vintagePatchFields = {
  lwin11: v.optional(v.string()),
  abv: v.optional(v.number()),
  drinkWindow: v.optional(drinkWindow),
};
const vintagePatch = v.object(vintagePatchFields);
export type VintagePatch = Infer<typeof vintagePatch>;

export const vintageFields = { year, ...vintagePatchFields };

export const purchaseFields = {
  merchant: v.optional(v.string()),
  purchasedOn: v.optional(isoDate),
  unitPrice: v.optional(v.number()),
  currency: v.optional(v.string()),
};

export const addBottlesArgs = {
  ingestKey: v.string(),
  source: ingestSource,
  producer: v.union(v.object({ id: v.id("producers") }), v.object(producerFields)),
  wine: v.union(v.object({ id: v.id("wines") }), v.object(wineFields)),
  vintage: v.union(v.object({ id: v.id("vintages") }), v.object(vintageFields)),
  quantity: v.number(),
  sizeMl: v.optional(v.number()),
  locationId: v.optional(v.id("locations")),
  purchase: v.optional(v.object(purchaseFields)),
  externalRef: v.optional(v.string()),
};
const addBottlesInput = v.object(addBottlesArgs);
export type AddBottlesInput = Infer<typeof addBottlesInput>;

export const cellarTrackerRow = v.object({
  line: v.number(),
  ingestKey: v.string(),
  externalRef: v.optional(v.string()),
  producer: v.object({ name: v.string(), country: v.optional(v.string()), region: v.optional(v.string()) }),
  wine: v.object({
    name: v.string(),
    color,
    style,
    appellation: v.optional(v.object({ name: v.string(), country: v.string(), region: v.optional(v.string()) })),
    grapes,
  }),
  vintage: v.object({ year, drinkWindow: v.optional(drinkWindow) }),
  sizeMl: v.number(),
  quantity: v.number(),
  location: v.optional(v.object({ name: v.string(), bin: v.optional(v.string()) })),
  purchase: v.optional(v.object(purchaseFields)),
});
