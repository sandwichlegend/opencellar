import { customAction, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return difference === 0;
}

export function requireApiKey(apiKey: string): void {
  const expected = process.env.OPENCELLAR_API_KEY;
  if (!expected) throw new ConvexError({ code: "unauthorized", message: "OPENCELLAR_API_KEY is not set on the deployment" });
  if (!constantTimeEqual(apiKey, expected)) throw new ConvexError({ code: "unauthorized", message: "invalid api key" });
}

const apiKeyGuard = {
  args: { apiKey: v.string() },
  input: async (_ctx: unknown, { apiKey }: { apiKey: string }) => {
    requireApiKey(apiKey);
    return { ctx: {}, args: {} };
  },
};

export const apiQuery = customQuery(query, apiKeyGuard);
export const apiMutation = customMutation(mutation, apiKeyGuard);
export const apiAction = customAction(action, apiKeyGuard);
