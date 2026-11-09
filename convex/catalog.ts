import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { apiMutation, apiQuery } from "./auth";
import { normalize } from "./lib/normalize";
import { roundScore, similarity } from "./lib/similarity";
import { applyVintagePatch, cellarBottles, fail, getOrThrow, resolveAppellation, upsertAlias } from "./model/catalog";
import { type MergeRequest, merge as mergeEntities } from "./model/merge";
import { searchCatalog } from "./model/search";
import {
  aliasSource,
  aliasTarget,
  appellationRef,
  color,
  grapes,
  style,
  vintagePatchFields,
  year,
} from "./validators";

const DUPLICATE_THRESHOLD = 0.8;
const DUPLICATE_SCAN_CAP = 2000;

export const search = apiQuery({
  args: {
    producer: v.string(),
    wine: v.optional(v.string()),
    year: v.optional(year),
    appellation: v.optional(v.string()),
    color: v.optional(color),
    style: v.optional(style),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => searchCatalog(ctx, args),
});

export const getWine = apiQuery({
  args: { wineId: v.id("wines") },
  handler: async (ctx, { wineId }) => {
    const wine = await getOrThrow(ctx, wineId, "wine");
    const producer = await getOrThrow(ctx, wine.producerId, "producer");
    const appellation = wine.appellationId ? await ctx.db.get(wine.appellationId) : null;
    const vintages = await ctx.db
      .query("vintages")
      .withIndex("by_wine_year", (q) => q.eq("wineId", wineId))
      .collect();
    return {
      wineId: wine._id,
      name: wine.name,
      color: wine.color,
      style: wine.style,
      grapes: wine.grapes,
      lwin7: wine.lwin7,
      producer: { producerId: producer._id, name: producer.name, country: producer.country, region: producer.region },
      appellation: appellation ? { appellationId: appellation._id, name: appellation.name, country: appellation.country } : null,
      vintages: await Promise.all(
        vintages.map(async (vintage) => ({
          vintageId: vintage._id,
          year: vintage.year,
          inCellar: (await cellarBottles(ctx, vintage._id)).length,
          drinkWindow: vintage.drinkWindow ?? null,
          abv: vintage.abv,
          lwin11: vintage.lwin11,
        })),
      ),
    };
  },
});

export const findAppellation = apiQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) =>
    await ctx.db
      .query("appellations")
      .withIndex("by_normalized", (q) => q.eq("normalizedName", normalize(name)))
      .collect(),
});

const MERGE_TABLES = { producer: "producers", wine: "wines", vintage: "vintages" } as const;

export const merge = apiMutation({
  args: {
    kind: v.union(v.literal("producer"), v.literal("wine"), v.literal("vintage")),
    keepId: v.string(),
    mergeId: v.string(),
  },
  handler: async (ctx, { kind, keepId, mergeId }) => {
    const table = MERGE_TABLES[kind];
    const keep = ctx.db.normalizeId(table, keepId);
    const merged = ctx.db.normalizeId(table, mergeId);
    if (!keep || !merged) fail("invalid_input", `keepId and mergeId must both be ${table} ids`);
    return await mergeEntities(ctx, { kind, keepId: keep, mergeId: merged } as MergeRequest);
  },
});

export const recordAlias = apiMutation({
  args: { target: aliasTarget, text: v.string(), source: aliasSource },
  handler: async (ctx, { target, text, source }) => {
    if (target.kind === "producer") await getOrThrow(ctx, target.producerId, "producer");
    else await getOrThrow(ctx, target.wineId, "wine");
    return await upsertAlias(ctx, target, text, source);
  },
});

export const updateWine = apiMutation({
  args: {
    wineId: v.id("wines"),
    name: v.optional(v.string()),
    color: v.optional(color),
    style: v.optional(style),
    appellation: v.optional(appellationRef),
    grapes: v.optional(grapes),
    lwin7: v.optional(v.string()),
  },
  handler: async (ctx, { wineId, appellation, ...fields }) => {
    await getOrThrow(ctx, wineId, "wine");
    const changes: Partial<Doc<"wines">> = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    if (fields.name !== undefined) changes.normalizedName = normalize(fields.name);
    if (appellation) changes.appellationId = await resolveAppellation(ctx, appellation);
    await ctx.db.patch(wineId, changes);
    return { wineId, applied: Object.keys(changes).filter((key) => key !== "normalizedName") };
  },
});

export const updateVintage = apiMutation({
  args: { vintageId: v.id("vintages"), ...vintagePatchFields },
  handler: async (ctx, { vintageId, ...patch }) => {
    const vintage = await getOrThrow(ctx, vintageId, "vintage");
    const report = await applyVintagePatch(ctx, vintage, patch, "overwrite");
    return { vintageId, ...report };
  },
});

type DuplicatePair =
  | { kind: "producer"; score: number; a: { producerId: Id<"producers">; name: string }; b: { producerId: Id<"producers">; name: string } }
  | {
      kind: "wine";
      score: number;
      producerId: Id<"producers">;
      producerName: string;
      a: { wineId: Id<"wines">; name: string };
      b: { wineId: Id<"wines">; name: string };
    };

export const findDuplicates = apiQuery({
  args: { threshold: v.optional(v.number()) },
  handler: async (ctx, { threshold = DUPLICATE_THRESHOLD }) => {
    const producers = await ctx.db.query("producers").take(DUPLICATE_SCAN_CAP);
    const pairs: DuplicatePair[] = [];
    for (let i = 0; i < producers.length; i++) {
      for (let j = i + 1; j < producers.length; j++) {
        const score = similarity(producers[i].normalizedName, producers[j].normalizedName);
        if (score < threshold) continue;
        pairs.push({
          kind: "producer",
          score: roundScore(score),
          a: { producerId: producers[i]._id, name: producers[i].name },
          b: { producerId: producers[j]._id, name: producers[j].name },
        });
      }
    }
    for (const producer of producers) {
      const wines = await ctx.db
        .query("wines")
        .withIndex("by_producer", (q) => q.eq("producerId", producer._id))
        .collect();
      for (let i = 0; i < wines.length; i++) {
        for (let j = i + 1; j < wines.length; j++) {
          if (wines[i].color !== wines[j].color) continue;
          const score = similarity(wines[i].normalizedName, wines[j].normalizedName);
          if (score < threshold) continue;
          pairs.push({
            kind: "wine",
            score: roundScore(score),
            producerId: producer._id,
            producerName: producer.name,
            a: { wineId: wines[i]._id, name: wines[i].name },
            b: { wineId: wines[j]._id, name: wines[j].name },
          });
        }
      }
    }
    return pairs.sort((x, y) => y.score - x.score);
  },
});
