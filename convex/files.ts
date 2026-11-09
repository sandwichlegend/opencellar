import { apiMutation } from "./auth";

export const generateUploadUrl = apiMutation({
  args: {},
  handler: async (ctx) => ({ uploadUrl: await ctx.storage.generateUploadUrl() }),
});
