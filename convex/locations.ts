import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { apiMutation, apiQuery } from "./auth";
import type { LocationKind } from "./lib/domain";
import { getOrThrow } from "./model/catalog";
import { locationKind } from "./validators";

export async function ensureLocation(
  ctx: MutationCtx,
  fields: { name: string; parentId?: Id<"locations">; kind: LocationKind; capacity?: number },
): Promise<{ locationId: Id<"locations">; outcome: "created" | "existing" }> {
  const name = fields.name.trim();
  const existing = await ctx.db
    .query("locations")
    .withIndex("by_parent_name", (q) => q.eq("parentId", fields.parentId).eq("name", name))
    .first();
  if (existing) return { locationId: existing._id, outcome: "existing" };
  return { locationId: await ctx.db.insert("locations", { ...fields, name }), outcome: "created" };
}

export const create = apiMutation({
  args: {
    name: v.string(),
    parentId: v.optional(v.id("locations")),
    kind: locationKind,
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.parentId) await getOrThrow(ctx, args.parentId, "parent location");
    return await ensureLocation(ctx, args);
  },
});

export const list = apiQuery({
  args: {},
  handler: async (ctx) => {
    const locations = await ctx.db.query("locations").collect();
    const byId = new Map<Id<"locations">, Doc<"locations">>(locations.map((location) => [location._id, location]));
    const path = (location: Doc<"locations">): string => {
      const parent = location.parentId ? byId.get(location.parentId) : undefined;
      return parent ? `${path(parent)} / ${location.name}` : location.name;
    };
    return await Promise.all(
      locations.map(async (location) => {
        const bottles = await ctx.db
          .query("bottles")
          .withIndex("by_location", (q) => q.eq("locationId", location._id))
          .collect();
        return {
          locationId: location._id,
          name: location.name,
          path: path(location),
          kind: location.kind,
          parentId: location.parentId ?? null,
          capacity: location.capacity ?? null,
          inCellar: bottles.filter((bottle) => bottle.state.status === "cellar").length,
        };
      }),
    );
  },
});
