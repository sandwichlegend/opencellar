import { type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, internalMutation } from "./_generated/server";
import { apiAction } from "./auth";
import { type CellarTrackerIngest, parseCellarTrackerCsv, planCellarTrackerImport } from "./lib/cellartracker";
import { ensureLocation } from "./locations";
import { addBottles, findIngestJob, recordFailedIngest } from "./model/ingest";
import { cellarTrackerRow } from "./validators";

const BATCH_SIZE = 25;

type ImportTally = {
  rowsCommitted: number;
  rowsReplayed: number;
  bottlesAdded: number;
  created: { producers: number; wines: number; vintages: number; locations: number };
};

function emptyTally(): ImportTally {
  return { rowsCommitted: 0, rowsReplayed: 0, bottlesAdded: 0, created: { producers: 0, wines: 0, vintages: 0, locations: 0 } };
}

function addTally(into: ImportTally, from: ImportTally): void {
  into.rowsCommitted += from.rowsCommitted;
  into.rowsReplayed += from.rowsReplayed;
  into.bottlesAdded += from.bottlesAdded;
  for (const key of Object.keys(into.created) as (keyof ImportTally["created"])[]) into.created[key] += from.created[key];
}

async function placeRow(ctx: MutationCtx, row: CellarTrackerIngest, tally: ImportTally): Promise<Id<"locations"> | undefined> {
  if (!row.location) return undefined;
  const room = await ensureLocation(ctx, { name: row.location.name, kind: "cellar" });
  if (room.outcome === "created") tally.created.locations++;
  if (!row.location.bin) return room.locationId;
  const bin = await ensureLocation(ctx, { name: row.location.bin, parentId: room.locationId, kind: "bin" });
  if (bin.outcome === "created") tally.created.locations++;
  return bin.locationId;
}

async function importRow(ctx: MutationCtx, row: Infer<typeof cellarTrackerRow>, tally: ImportTally): Promise<void> {
  const prior = await findIngestJob(ctx, row.ingestKey);
  if (prior?.state.status === "committed") {
    tally.rowsReplayed++;
    return;
  }
  const locationId = await placeRow(ctx, row, tally);
  const result = await addBottles(ctx, {
    ingestKey: row.ingestKey,
    source: "csv",
    producer: row.producer,
    wine: row.wine,
    vintage: row.vintage,
    quantity: row.quantity,
    sizeMl: row.sizeMl,
    locationId,
    purchase: row.purchase,
    externalRef: row.externalRef,
  });
  if (result.outcome === "replayed") {
    tally.rowsReplayed++;
    return;
  }
  tally.rowsCommitted++;
  tally.bottlesAdded += result.bottleIds.length;
  if (result.reused.producer === "created") tally.created.producers++;
  if (result.reused.wine === "created") tally.created.wines++;
  if (result.reused.vintage === "created") tally.created.vintages++;
}

export const importRows = internalMutation({
  args: { rows: v.array(cellarTrackerRow) },
  handler: async (ctx, { rows }) => {
    const tally = emptyTally();
    for (const row of rows) await importRow(ctx, row, tally);
    return tally;
  },
});

export const recordFailure = internalMutation({
  args: { ingestKey: v.string(), error: v.string() },
  handler: (ctx, { ingestKey, error }) => recordFailedIngest(ctx, ingestKey, "csv", error),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const cellarTracker = apiAction({
  args: { csv: v.string() },
  handler: async (ctx, { csv }) => {
    const { rows, issues } = planCellarTrackerImport(parseCellarTrackerCsv(csv));
    const totals = emptyTally();
    const failures = [...issues];
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      try {
        addTally(totals, await ctx.runMutation(internal.imports.importRows, { rows: batch }));
      } catch {
        for (const row of batch) {
          try {
            addTally(totals, await ctx.runMutation(internal.imports.importRows, { rows: [row] }));
          } catch (error) {
            failures.push({ line: row.line, error: errorMessage(error) });
            await ctx.runMutation(internal.imports.recordFailure, { ingestKey: row.ingestKey, error: errorMessage(error) });
          }
        }
      }
    }
    return { rows: rows.length + issues.length, ...totals, rowsFailed: failures.length, failures };
  },
});
