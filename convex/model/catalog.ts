import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { type AliasSource, decideDrinkWindow } from "../lib/domain";
import { normalize } from "../lib/normalize";
import type { AliasTarget, VintagePatch, appellationRef } from "../validators";

export type Resolution = "provided" | "matched" | "created";

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export async function getOrThrow<T extends TableNames>(ctx: QueryCtx, id: Id<T>, label: string): Promise<Doc<T>> {
  const doc = await ctx.db.get(id);
  if (!doc) fail("not_found", `${label} ${id} does not exist`);
  return doc;
}

export async function findProducerByName(ctx: QueryCtx, normalizedName: string): Promise<Doc<"producers"> | null> {
  const exact = await ctx.db
    .query("producers")
    .withIndex("by_normalized", (q) => q.eq("normalizedName", normalizedName))
    .first();
  if (exact) return exact;
  const aliases = await ctx.db
    .query("aliases")
    .withIndex("by_normalized", (q) => q.eq("normalized", normalizedName))
    .collect();
  for (const alias of aliases) {
    if (alias.target.kind !== "producer") continue;
    const producer = await ctx.db.get(alias.target.producerId);
    if (producer) return producer;
  }
  return null;
}

export async function findWineByName(
  ctx: QueryCtx,
  producerId: Id<"producers">,
  normalizedName: string,
): Promise<Doc<"wines"> | null> {
  const exact = await ctx.db
    .query("wines")
    .withIndex("by_producer", (q) => q.eq("producerId", producerId).eq("normalizedName", normalizedName))
    .first();
  if (exact) return exact;
  const aliases = await ctx.db
    .query("aliases")
    .withIndex("by_normalized", (q) => q.eq("normalized", normalizedName))
    .collect();
  for (const alias of aliases) {
    if (alias.target.kind !== "wine") continue;
    const wine = await ctx.db.get(alias.target.wineId);
    if (wine && wine.producerId === producerId) return wine;
  }
  return null;
}

export async function resolveAppellation(
  ctx: MutationCtx,
  ref: Infer<typeof appellationRef>,
): Promise<Id<"appellations">> {
  if ("id" in ref) return (await getOrThrow(ctx, ref.id, "appellation"))._id;
  const normalizedName = normalize(ref.name);
  const existing = await ctx.db
    .query("appellations")
    .withIndex("by_normalized", (q) => q.eq("normalizedName", normalizedName))
    .first();
  return existing?._id ?? (await ctx.db.insert("appellations", { ...ref, normalizedName }));
}

export type PatchReport = { applied: string[]; skipped: { field: string; reason: string }[] };

export async function applyVintagePatch(
  ctx: MutationCtx,
  vintage: Doc<"vintages">,
  patch: VintagePatch,
  mode: "overwrite" | "fill",
): Promise<PatchReport> {
  const report: PatchReport = { applied: [], skipped: [] };
  const changes: Partial<Doc<"vintages">> = {};
  for (const field of ["lwin11", "abv"] as const) {
    const value = patch[field];
    if (value === undefined) continue;
    if (mode === "fill" && vintage[field] !== undefined) {
      report.skipped.push({ field, reason: "already set" });
      continue;
    }
    Object.assign(changes, { [field]: value });
    report.applied.push(field);
  }
  if (patch.drinkWindow) {
    const decision = decideDrinkWindow(vintage.drinkWindow, patch.drinkWindow);
    if (decision.kind === "apply") {
      changes.drinkWindow = decision.window;
      report.applied.push("drinkWindow");
    } else {
      report.skipped.push({ field: "drinkWindow", reason: decision.reason });
    }
  }
  if (report.applied.length > 0) await ctx.db.patch(vintage._id, changes);
  return report;
}

export async function cellarBottles(ctx: QueryCtx, vintageId: Id<"vintages">): Promise<Doc<"bottles">[]> {
  const bottles = await ctx.db
    .query("bottles")
    .withIndex("by_vintage", (q) => q.eq("vintageId", vintageId))
    .collect();
  return bottles.filter((bottle) => bottle.state.status === "cellar");
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function upsertAlias(
  ctx: MutationCtx,
  target: AliasTarget,
  text: string,
  source: AliasSource,
): Promise<{ aliasId: Id<"aliases">; outcome: "created" | "existing" }> {
  const normalized = normalize(text);
  if (normalized.length === 0) fail("invalid_input", "alias text is empty");
  const existing = await ctx.db
    .query("aliases")
    .withIndex("by_normalized", (q) => q.eq("normalized", normalized))
    .collect();
  const same = existing.find((alias) =>
    alias.target.kind === "producer"
      ? target.kind === "producer" && alias.target.producerId === target.producerId
      : target.kind === "wine" && alias.target.wineId === target.wineId,
  );
  if (same) return { aliasId: same._id, outcome: "existing" };
  return { aliasId: await ctx.db.insert("aliases", { target, text, normalized, source }), outcome: "created" };
}
