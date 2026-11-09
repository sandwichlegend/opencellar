import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DEFAULT_BOTTLE_ML, type IngestSource } from "../lib/domain";
import { normalize } from "../lib/normalize";
import type { AddBottlesInput } from "../validators";
import {
  applyVintagePatch,
  fail,
  findProducerByName,
  findWineByName,
  getOrThrow,
  type Resolution,
  resolveAppellation,
} from "./catalog";

const MAX_BOTTLES_PER_INGEST = 240;

type CommittedIds = {
  ingestJobId: Id<"ingestJobs">;
  producerId: Id<"producers">;
  wineId: Id<"wines">;
  vintageId: Id<"vintages">;
  bottleIds: Id<"bottles">[];
};

export type AddBottlesResult =
  | (CommittedIds & { outcome: "committed"; reused: { producer: Resolution; wine: Resolution; vintage: Resolution } })
  | (CommittedIds & { outcome: "replayed" });

type Resolved<T> = { doc: T; resolution: Resolution };

async function resolveProducer(ctx: MutationCtx, input: AddBottlesInput["producer"]): Promise<Resolved<Doc<"producers">>> {
  if ("id" in input) return { doc: await getOrThrow(ctx, input.id, "producer"), resolution: "provided" };
  const normalizedName = normalize(input.name);
  if (normalizedName.length === 0) fail("invalid_input", "producer name is empty");
  const existing = await findProducerByName(ctx, normalizedName);
  if (existing) return { doc: existing, resolution: "matched" };
  const id = await ctx.db.insert("producers", { ...input, normalizedName });
  return { doc: await getOrThrow(ctx, id, "producer"), resolution: "created" };
}

async function resolveWine(
  ctx: MutationCtx,
  producerId: Id<"producers">,
  input: AddBottlesInput["wine"],
): Promise<Resolved<Doc<"wines">>> {
  if ("id" in input) {
    const wine = await getOrThrow(ctx, input.id, "wine");
    if (wine.producerId !== producerId) fail("conflict", `wine ${wine._id} belongs to producer ${wine.producerId}`);
    return { doc: wine, resolution: "provided" };
  }
  const normalizedName = normalize(input.name);
  const existing = await findWineByName(ctx, producerId, normalizedName);
  if (existing) return { doc: existing, resolution: "matched" };
  const { appellation, ...fields } = input;
  const id = await ctx.db.insert("wines", {
    ...fields,
    producerId,
    normalizedName,
    style: input.style ?? "still",
    grapes: input.grapes ?? [],
    appellationId: appellation ? await resolveAppellation(ctx, appellation) : undefined,
  });
  return { doc: await getOrThrow(ctx, id, "wine"), resolution: "created" };
}

async function resolveVintage(
  ctx: MutationCtx,
  wineId: Id<"wines">,
  input: AddBottlesInput["vintage"],
): Promise<Resolved<Doc<"vintages">>> {
  if ("id" in input) {
    const vintage = await getOrThrow(ctx, input.id, "vintage");
    if (vintage.wineId !== wineId) fail("conflict", `vintage ${vintage._id} belongs to wine ${vintage.wineId}`);
    return { doc: vintage, resolution: "provided" };
  }
  const { year, ...patch } = input;
  const existing = await ctx.db
    .query("vintages")
    .withIndex("by_wine_year", (q) => q.eq("wineId", wineId).eq("year", year))
    .first();
  if (existing) {
    await applyVintagePatch(ctx, existing, patch, "fill");
    return { doc: existing, resolution: "matched" };
  }
  const id = await ctx.db.insert("vintages", { wineId, ...input });
  return { doc: await getOrThrow(ctx, id, "vintage"), resolution: "created" };
}

async function replay(ctx: MutationCtx, job: Doc<"ingestJobs">): Promise<AddBottlesResult | null> {
  if (job.state.status !== "committed") return null;
  const vintage = await getOrThrow(ctx, job.state.vintageId, "vintage");
  const wine = await getOrThrow(ctx, vintage.wineId, "wine");
  return {
    outcome: "replayed",
    ingestJobId: job._id,
    producerId: wine.producerId,
    wineId: wine._id,
    vintageId: vintage._id,
    bottleIds: job.state.bottleIds,
  };
}

export async function findIngestJob(ctx: MutationCtx, ingestKey: string): Promise<Doc<"ingestJobs"> | null> {
  return await ctx.db
    .query("ingestJobs")
    .withIndex("by_key", (q) => q.eq("ingestKey", ingestKey))
    .first();
}

export async function addBottles(ctx: MutationCtx, input: AddBottlesInput): Promise<AddBottlesResult> {
  const prior = await findIngestJob(ctx, input.ingestKey);
  const replayed = prior ? await replay(ctx, prior) : null;
  if (replayed) return replayed;

  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_BOTTLES_PER_INGEST) {
    fail("invalid_input", `quantity must be an integer from 1 to ${MAX_BOTTLES_PER_INGEST}`);
  }
  const sizeMl = input.sizeMl ?? DEFAULT_BOTTLE_ML;
  if (!(sizeMl > 0)) fail("invalid_input", "sizeMl must be positive");
  if (input.locationId) await getOrThrow(ctx, input.locationId, "location");

  const producer = await resolveProducer(ctx, input.producer);
  const wine = await resolveWine(ctx, producer.doc._id, input.wine);
  const vintage = await resolveVintage(ctx, wine.doc._id, input.vintage);

  const purchaseId = input.purchase
    ? await ctx.db.insert("purchases", { ...input.purchase, quantity: input.quantity })
    : undefined;
  const committed = { status: "committed" as const, vintageId: vintage.doc._id, bottleIds: [] as Id<"bottles">[] };
  const ingestJobId = prior
    ? (await ctx.db.patch(prior._id, { source: input.source, state: committed }), prior._id)
    : await ctx.db.insert("ingestJobs", { ingestKey: input.ingestKey, source: input.source, state: committed });

  const addedAt = Date.now();
  const bottleIds: Id<"bottles">[] = [];
  for (let i = 0; i < input.quantity; i++) {
    bottleIds.push(
      await ctx.db.insert("bottles", {
        vintageId: vintage.doc._id,
        sizeMl,
        locationId: input.locationId,
        purchaseId,
        ingestJobId,
        addedAt,
        externalRef: input.externalRef,
        state: { status: "cellar" },
      }),
    );
  }
  await ctx.db.patch(ingestJobId, { state: { ...committed, bottleIds } });

  return {
    outcome: "committed",
    ingestJobId,
    producerId: producer.doc._id,
    wineId: wine.doc._id,
    vintageId: vintage.doc._id,
    bottleIds,
    reused: { producer: producer.resolution, wine: wine.resolution, vintage: vintage.resolution },
  };
}

export async function recordFailedIngest(
  ctx: MutationCtx,
  ingestKey: string,
  source: IngestSource,
  error: string,
): Promise<void> {
  const prior = await findIngestJob(ctx, ingestKey);
  if (prior?.state.status === "committed") return;
  const state = { status: "failed" as const, error };
  if (prior) await ctx.db.patch(prior._id, { source, state });
  else await ctx.db.insert("ingestJobs", { ingestKey, source, state });
}
