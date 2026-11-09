import { v } from "convex/values";
import { apiMutation } from "./auth";
import { transition } from "./lib/bottleState";
import { fail, getOrThrow, todayIso } from "./model/catalog";
import { isoDate } from "./validators";

export const move = apiMutation({
  args: { bottleIds: v.array(v.id("bottles")), locationId: v.id("locations") },
  handler: async (ctx, { bottleIds, locationId }) => {
    await getOrThrow(ctx, locationId, "location");
    for (const bottleId of bottleIds) {
      const bottle = await getOrThrow(ctx, bottleId, "bottle");
      const next = transition(bottle.state, { type: "move" });
      if (!next.ok) fail("invalid_state", `cannot move bottle ${bottleId}: ${next.error}`);
      await ctx.db.patch(bottleId, { locationId });
    }
    return { moved: bottleIds.length, locationId };
  },
});

export const consume = apiMutation({
  args: {
    bottleId: v.id("bottles"),
    drunkOn: v.optional(isoDate),
    rating: v.optional(v.number()),
    note: v.optional(v.string()),
    pairedWith: v.optional(v.string()),
  },
  handler: async (ctx, { bottleId, drunkOn = todayIso(), ...details }) => {
    const bottle = await getOrThrow(ctx, bottleId, "bottle");
    const next = transition(bottle.state, { type: "consume", at: drunkOn });
    if (!next.ok) fail("invalid_state", `cannot consume bottle ${bottleId}: ${next.error}`);
    await ctx.db.patch(bottleId, { state: next.state });
    const consumptionId = await ctx.db.insert("consumptions", { bottleId, drunkOn, ...details });
    return { bottleId, consumptionId, state: next.state };
  },
});
