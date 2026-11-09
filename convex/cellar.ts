import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { apiMutation, apiQuery } from "./auth";
import { getOrThrow } from "./model/catalog";
import { addBottles as addBottlesCore } from "./model/ingest";
import { addBottlesArgs, bottleStatus, color, evidenceSide, style } from "./validators";

export const addBottles = apiMutation({
  args: addBottlesArgs,
  handler: (ctx, args) => addBottlesCore(ctx, args),
});

export const attachEvidence = apiMutation({
  args: {
    vintageId: v.id("vintages"),
    ingestJobId: v.optional(v.id("ingestJobs")),
    storageId: v.id("_storage"),
    side: evidenceSide,
    extracted: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await getOrThrow(ctx, args.vintageId, "vintage");
    if (args.ingestJobId) await getOrThrow(ctx, args.ingestJobId, "ingest job");
    if (!(await ctx.db.system.get(args.storageId))) throw new Error(`file ${args.storageId} does not exist`);
    return { evidenceId: await ctx.db.insert("evidence", args) };
  },
});

function memo<K, V>(load: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const cache = new Map<K, Promise<V>>();
  return (key) => {
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = load(key);
    cache.set(key, pending);
    return pending;
  };
}

function catalogReader(ctx: QueryCtx) {
  const vintage = memo((id: Id<"vintages">) => getOrThrow(ctx, id, "vintage"));
  const wine = memo((id: Id<"wines">) => getOrThrow(ctx, id, "wine"));
  const producer = memo((id: Id<"producers">) => getOrThrow(ctx, id, "producer"));
  const locationPath: (id: Id<"locations">) => Promise<string> = memo(async (id: Id<"locations">) => {
    const location = await getOrThrow(ctx, id, "location");
    return location.parentId ? `${await locationPath(location.parentId)} / ${location.name}` : location.name;
  });
  return { vintage, wine, producer, locationPath };
}

function tally<K>(items: K[]): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

function groupByVintage(bottles: Doc<"bottles">[]): Map<Id<"vintages">, Doc<"bottles">[]> {
  const groups = new Map<Id<"vintages">, Doc<"bottles">[]>();
  for (const bottle of bottles) groups.set(bottle.vintageId, [...(groups.get(bottle.vintageId) ?? []), bottle]);
  return groups;
}

export const list = apiQuery({
  args: {
    status: v.optional(bottleStatus),
    producerId: v.optional(v.id("producers")),
    color: v.optional(color),
    style: v.optional(style),
    locationId: v.optional(v.id("locations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "cellar";
    const bottles = args.locationId
      ? (
          await ctx.db
            .query("bottles")
            .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
            .collect()
        ).filter((bottle) => bottle.state.status === status)
      : await ctx.db
          .query("bottles")
          .withIndex("by_status", (q) => q.eq("state.status", status))
          .collect();
    const read = catalogReader(ctx);
    const rows = [];
    for (const [vintageId, group] of groupByVintage(bottles)) {
      const vintage = await read.vintage(vintageId);
      const wine = await read.wine(vintage.wineId);
      if (args.producerId && wine.producerId !== args.producerId) continue;
      if (args.color && wine.color !== args.color) continue;
      if (args.style && wine.style !== args.style) continue;
      const producer = await read.producer(wine.producerId);
      const locations = [];
      for (const [locationId, count] of tally(group.map((bottle) => bottle.locationId ?? null))) {
        locations.push({ locationId, name: locationId ? await read.locationPath(locationId) : null, count });
      }
      rows.push({
        vintageId,
        wineId: wine._id,
        producerId: producer._id,
        producer: producer.name,
        wine: wine.name,
        color: wine.color,
        style: wine.style,
        year: vintage.year,
        count: group.length,
        sizes: [...tally(group.map((bottle) => bottle.sizeMl))].map(([sizeMl, count]) => ({ sizeMl, count })),
        locations,
        drinkWindow: vintage.drinkWindow ?? null,
      });
    }
    rows.sort(
      (a, b) =>
        a.producer.localeCompare(b.producer) ||
        a.wine.localeCompare(b.wine) ||
        (a.year ?? 0) - (b.year ?? 0),
    );
    const limited = rows.slice(0, args.limit ?? rows.length);
    return { status, vintages: limited.length, bottles: limited.reduce((sum, row) => sum + row.count, 0), rows: limited };
  },
});

export const drinkingSoon = apiQuery({
  args: { withinYears: v.optional(v.number()), asOfYear: v.optional(v.number()) },
  handler: async (ctx, { withinYears = 2, asOfYear = new Date().getUTCFullYear() }) => {
    const bottles = await ctx.db
      .query("bottles")
      .withIndex("by_status", (q) => q.eq("state.status", "cellar"))
      .collect();
    const read = catalogReader(ctx);
    const horizon = asOfYear + withinYears;
    const due = [];
    for (const [vintageId, group] of groupByVintage(bottles)) {
      const vintage = await read.vintage(vintageId);
      const to = vintage.drinkWindow?.to;
      if (to === undefined || to > horizon) continue;
      const wine = await read.wine(vintage.wineId);
      const producer = await read.producer(wine.producerId);
      due.push({
        vintageId,
        wineId: wine._id,
        producer: producer.name,
        wine: wine.name,
        year: vintage.year,
        count: group.length,
        drinkWindow: vintage.drinkWindow ?? null,
        urgency: to < asOfYear ? ("past-window" as const) : ("closing" as const),
      });
    }
    return due.sort((a, b) => (a.drinkWindow?.to ?? 0) - (b.drinkWindow?.to ?? 0));
  },
});
