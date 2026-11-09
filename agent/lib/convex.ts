import { ConvexHttpClient, type HttpMutationOptions } from "convex/browser";
import type {
  ArgsAndOptions,
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import type { Id, TableNames } from "../../convex/_generated/dataModel";
import { z } from "zod";

export { api } from "../../convex/_generated/api.js";

type Keyed = { apiKey: string };
type Call<Kind extends "query" | "mutation" | "action"> = FunctionReference<Kind, "public", Keyed & Record<string, unknown>>;
type Unkeyed<F extends FunctionReference<"query" | "mutation" | "action">> = Omit<FunctionArgs<F>, "apiKey">;

let cached: { client: ConvexHttpClient; apiKey: string } | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See README "Environment".`);
  return value;
}

function connection() {
  cached ??= { client: new ConvexHttpClient(requireEnv("CONVEX_URL")), apiKey: requireEnv("OPENCELLAR_API_KEY") };
  return cached;
}

function keyed<F extends FunctionReference<"query" | "mutation" | "action">>(args: Unkeyed<F>): FunctionArgs<F> {
  return { ...args, apiKey: connection().apiKey } as FunctionArgs<F>;
}

export function cellarQuery<F extends Call<"query">>(fn: F, args: Unkeyed<F>): Promise<FunctionReturnType<F>> {
  return connection().client.query(fn, ...([keyed<F>(args)] as OptionalRestArgs<F>));
}

export function cellarMutation<F extends Call<"mutation">>(fn: F, args: Unkeyed<F>): Promise<FunctionReturnType<F>> {
  return connection().client.mutation(fn, ...([keyed<F>(args)] as unknown as ArgsAndOptions<F, HttpMutationOptions>));
}

export function cellarAction<F extends Call<"action">>(fn: F, args: Unkeyed<F>): Promise<FunctionReturnType<F>> {
  return connection().client.action(fn, ...([keyed<F>(args)] as OptionalRestArgs<F>));
}

export function idOf<T extends TableNames>(table: T): z.ZodType<Id<T>> {
  return z.string().min(1).describe(`A ${table} id returned by an earlier OpenCellar tool call.`) as unknown as z.ZodType<Id<T>>;
}

export const colorSchema = z.enum(["red", "white", "rose", "orange"]);
export const styleSchema = z.enum(["still", "sparkling", "fortified", "sweet"]);
export const yearSchema = z.number().int().nullable().describe("Vintage year, or null for a non-vintage wine.");
export const drinkWindowSchema = z.object({
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  source: z.enum(["user", "agent", "import"]).describe('"user" only when the user stated it; your own estimate is "agent".'),
});
