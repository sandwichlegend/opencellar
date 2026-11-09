import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

export const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/_generated/*.js", "!../../convex/**/*.d.ts"]);

export const apiKey = "test-key";

export function setup() {
  vi.stubEnv("OPENCELLAR_API_KEY", apiKey);
  return convexTest(schema, modules);
}

export type Harness = ReturnType<typeof setup>;

export async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConvexError);
  expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
}

let keyCounter = 0;

export function ingestKey(): string {
  keyCounter += 1;
  return `test:${keyCounter}`;
}

export async function addMusar(t: Harness, overrides: { year?: number | null; quantity?: number; key?: string } = {}) {
  return await t.mutation(api.cellar.addBottles, {
    apiKey,
    ingestKey: overrides.key ?? ingestKey(),
    source: "text",
    producer: { name: "Château Musar", country: "Lebanon" },
    wine: { name: "", color: "red" },
    vintage: { year: overrides.year === undefined ? 2016 : overrides.year },
    quantity: overrides.quantity ?? 1,
  });
}
