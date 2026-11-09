import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail, getOrThrow, upsertAlias } from "./catalog";

export type MergeKind = "producer" | "wine" | "vintage";

export type MergeSummary = {
  kind: MergeKind;
  keepId: string;
  mergedId: string;
  moved: { wines: number; vintages: number; bottles: number; evidence: number; ingestJobs: number; aliases: number };
  folded: { wines: number; vintages: number };
  aliasesRecorded: string[];
};

function emptySummary(kind: MergeKind, keepId: string, mergedId: string): MergeSummary {
  return {
    kind,
    keepId,
    mergedId,
    moved: { wines: 0, vintages: 0, bottles: 0, evidence: 0, ingestJobs: 0, aliases: 0 },
    folded: { wines: 0, vintages: 0 },
    aliasesRecorded: [],
  };
}

async function foldVintage(ctx: MutationCtx, keep: Doc<"vintages">, merged: Doc<"vintages">, summary: MergeSummary) {
  const bottles = await ctx.db
    .query("bottles")
    .withIndex("by_vintage", (q) => q.eq("vintageId", merged._id))
    .collect();
  for (const bottle of bottles) await ctx.db.patch(bottle._id, { vintageId: keep._id });
  summary.moved.bottles += bottles.length;

  const evidence = await ctx.db
    .query("evidence")
    .withIndex("by_vintage", (q) => q.eq("vintageId", merged._id))
    .collect();
  for (const item of evidence) await ctx.db.patch(item._id, { vintageId: keep._id });
  summary.moved.evidence += evidence.length;

  const jobs = await ctx.db
    .query("ingestJobs")
    .withIndex("by_vintage", (q) => q.eq("state.vintageId", merged._id))
    .collect();
  for (const job of jobs) {
    if (job.state.status === "committed") await ctx.db.patch(job._id, { state: { ...job.state, vintageId: keep._id } });
  }
  summary.moved.ingestJobs += jobs.length;

  await ctx.db.patch(keep._id, {
    lwin11: keep.lwin11 ?? merged.lwin11,
    abv: keep.abv ?? merged.abv,
    drinkWindow: keep.drinkWindow ?? merged.drinkWindow,
  });
  await ctx.db.delete(merged._id);
}

async function retargetWineAliases(ctx: MutationCtx, from: Id<"wines">, to: Id<"wines">, summary: MergeSummary) {
  const aliases = await ctx.db
    .query("aliases")
    .withIndex("by_wine_target", (q) => q.eq("target.wineId", from))
    .collect();
  for (const alias of aliases) await ctx.db.patch(alias._id, { target: { kind: "wine", wineId: to } });
  summary.moved.aliases += aliases.length;
}

async function foldWine(ctx: MutationCtx, keep: Doc<"wines">, merged: Doc<"wines">, summary: MergeSummary) {
  const vintages = await ctx.db
    .query("vintages")
    .withIndex("by_wine_year", (q) => q.eq("wineId", merged._id))
    .collect();
  for (const vintage of vintages) {
    const twin = await ctx.db
      .query("vintages")
      .withIndex("by_wine_year", (q) => q.eq("wineId", keep._id).eq("year", vintage.year))
      .first();
    if (twin) {
      await foldVintage(ctx, twin, vintage, summary);
      summary.folded.vintages++;
    } else {
      await ctx.db.patch(vintage._id, { wineId: keep._id });
      summary.moved.vintages++;
    }
  }
  await retargetWineAliases(ctx, merged._id, keep._id, summary);
  if (merged.normalizedName.length > 0 && merged.normalizedName !== keep.normalizedName) {
    await upsertAlias(ctx, { kind: "wine", wineId: keep._id }, merged.name, "merge");
    summary.aliasesRecorded.push(merged.name);
  }
  await ctx.db.patch(keep._id, {
    appellationId: keep.appellationId ?? merged.appellationId,
    lwin7: keep.lwin7 ?? merged.lwin7,
    grapes: keep.grapes.length > 0 ? keep.grapes : merged.grapes,
  });
  await ctx.db.delete(merged._id);
}

async function foldProducer(ctx: MutationCtx, keep: Doc<"producers">, merged: Doc<"producers">, summary: MergeSummary) {
  const wines = await ctx.db
    .query("wines")
    .withIndex("by_producer", (q) => q.eq("producerId", merged._id))
    .collect();
  for (const wine of wines) {
    const twin = await ctx.db
      .query("wines")
      .withIndex("by_producer", (q) => q.eq("producerId", keep._id).eq("normalizedName", wine.normalizedName))
      .first();
    if (twin) {
      await foldWine(ctx, twin, wine, summary);
      summary.folded.wines++;
    } else {
      await ctx.db.patch(wine._id, { producerId: keep._id });
      summary.moved.wines++;
    }
  }
  const aliases = await ctx.db
    .query("aliases")
    .withIndex("by_producer_target", (q) => q.eq("target.producerId", merged._id))
    .collect();
  for (const alias of aliases) await ctx.db.patch(alias._id, { target: { kind: "producer", producerId: keep._id } });
  summary.moved.aliases += aliases.length;
  if (merged.normalizedName !== keep.normalizedName) {
    await upsertAlias(ctx, { kind: "producer", producerId: keep._id }, merged.name, "merge");
    summary.aliasesRecorded.push(merged.name);
  }
  await ctx.db.patch(keep._id, {
    country: keep.country ?? merged.country,
    region: keep.region ?? merged.region,
    wikidataId: keep.wikidataId ?? merged.wikidataId,
    lwinProducer: keep.lwinProducer ?? merged.lwinProducer,
  });
  await ctx.db.delete(merged._id);
}

export type MergeRequest =
  | { kind: "producer"; keepId: Id<"producers">; mergeId: Id<"producers"> }
  | { kind: "wine"; keepId: Id<"wines">; mergeId: Id<"wines"> }
  | { kind: "vintage"; keepId: Id<"vintages">; mergeId: Id<"vintages"> };

export async function merge(ctx: MutationCtx, request: MergeRequest): Promise<MergeSummary> {
  if (request.keepId === request.mergeId) fail("invalid_input", "keepId and mergeId are the same");
  const summary = emptySummary(request.kind, request.keepId, request.mergeId);
  switch (request.kind) {
    case "producer":
      await foldProducer(
        ctx,
        await getOrThrow(ctx, request.keepId, "producer"),
        await getOrThrow(ctx, request.mergeId, "producer"),
        summary,
      );
      break;
    case "wine":
      await foldWine(
        ctx,
        await getOrThrow(ctx, request.keepId, "wine"),
        await getOrThrow(ctx, request.mergeId, "wine"),
        summary,
      );
      break;
    case "vintage": {
      const keep = await getOrThrow(ctx, request.keepId, "vintage");
      const merged = await getOrThrow(ctx, request.mergeId, "vintage");
      if (keep.wineId !== merged.wineId) fail("conflict", "vintages belong to different wines; merge the wines instead");
      await foldVintage(ctx, keep, merged, summary);
      summary.folded.vintages++;
      break;
    }
  }
  return summary;
}
