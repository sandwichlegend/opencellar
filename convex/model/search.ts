import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Color, Style } from "../lib/domain";
import { normalize } from "../lib/normalize";
import { roundScore, similarity } from "../lib/similarity";
import { fail } from "./catalog";

export type SearchQuery = {
  producer: string;
  wine?: string;
  year?: number | null;
  appellation?: string;
  color?: Color;
  style?: Style;
  limit?: number;
};

export type SearchCandidate = {
  producerId: Id<"producers">;
  producerName: string;
  wineId?: Id<"wines">;
  wineName?: string;
  color?: Color;
  style?: Style;
  vintageId?: Id<"vintages">;
  year?: number | null;
  score: number;
  reasons: string[];
};

type ProducerHit = { producer: Doc<"producers">; score: number; aliasMatch: boolean; reasons: string[] };

const PRODUCER_FLOOR = 0.35;
const PRODUCER_EXPANSION = 5;
const SCAN_CAP = 5000;
const DEFAULT_LIMIT = 10;
const WEIGHTS = { producer: 0.6, wine: 0.4 };
const COLOR_MISMATCH_FACTOR = 0.8;
const APPELLATION_BONUS = 0.03;
const VINTAGE_BONUS = 0.02;

async function producerHits(ctx: QueryCtx, query: string): Promise<ProducerHit[]> {
  const hits = new Map<Id<"producers">, ProducerHit>();
  const offer = (producer: Doc<"producers">, score: number, reason: string, aliasMatch = false) => {
    const current = hits.get(producer._id);
    if (!current) {
      hits.set(producer._id, { producer, score, aliasMatch, reasons: [reason] });
      return;
    }
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    current.score = Math.max(current.score, score);
    current.aliasMatch ||= aliasMatch;
  };

  const aliases = await ctx.db
    .query("aliases")
    .withIndex("by_normalized", (q) => q.eq("normalized", query))
    .collect();
  for (const alias of aliases) {
    if (alias.target.kind !== "producer") continue;
    const producer = await ctx.db.get(alias.target.producerId);
    if (producer) offer(producer, 1, "alias match", true);
  }

  const indexed = await ctx.db
    .query("producers")
    .withSearchIndex("search_normalized", (q) => q.search("normalizedName", query))
    .take(20);
  const scanned = await ctx.db.query("producers").take(SCAN_CAP);
  for (const producer of [...indexed, ...scanned]) {
    const score = similarity(query, producer.normalizedName);
    if (score >= PRODUCER_FLOOR) offer(producer, score, `producer ${roundScore(score)}`);
  }

  return [...hits.values()].sort((a, b) => Number(b.aliasMatch) - Number(a.aliasMatch) || b.score - a.score);
}

async function wineAliasIds(ctx: QueryCtx, query: string): Promise<Set<Id<"wines">>> {
  const aliases = await ctx.db
    .query("aliases")
    .withIndex("by_normalized", (q) => q.eq("normalized", query))
    .collect();
  return new Set(aliases.flatMap((alias) => (alias.target.kind === "wine" ? [alias.target.wineId] : [])));
}

async function scoreWine(
  ctx: QueryCtx,
  hit: ProducerHit,
  wine: Doc<"wines">,
  search: SearchQuery,
  aliasedWines: Set<Id<"wines">>,
): Promise<SearchCandidate> {
  const reasons = [...hit.reasons];
  let score = hit.score;
  if (search.wine !== undefined) {
    const wanted = normalize(search.wine);
    const aliasMatch = aliasedWines.has(wine._id);
    const wineScore = aliasMatch ? 1 : wanted === wine.normalizedName ? 1 : similarity(wanted, wine.normalizedName);
    reasons.push(aliasMatch ? "cuvée alias match" : `cuvée ${roundScore(wineScore)}`);
    score = WEIGHTS.producer * hit.score + WEIGHTS.wine * wineScore;
  }
  if (search.color && search.color !== wine.color) {
    score *= COLOR_MISMATCH_FACTOR;
    reasons.push(`color ${wine.color}`);
  }
  if (search.style && search.style !== wine.style) {
    score *= COLOR_MISMATCH_FACTOR;
    reasons.push(`style ${wine.style}`);
  }
  if (search.appellation && wine.appellationId) {
    const appellation = await ctx.db.get(wine.appellationId);
    if (appellation && similarity(normalize(search.appellation), appellation.normalizedName) >= 0.8) {
      score += APPELLATION_BONUS;
      reasons.push("appellation match");
    }
  }
  const candidate: SearchCandidate = {
    producerId: hit.producer._id,
    producerName: hit.producer.name,
    wineId: wine._id,
    wineName: wine.name,
    color: wine.color,
    style: wine.style,
    score,
    reasons,
  };
  if (search.year !== undefined) {
    const vintage = await ctx.db
      .query("vintages")
      .withIndex("by_wine_year", (q) => q.eq("wineId", wine._id).eq("year", search.year ?? null))
      .first();
    candidate.year = search.year;
    if (vintage) {
      candidate.vintageId = vintage._id;
      candidate.score += VINTAGE_BONUS;
      reasons.push("vintage exists");
    } else {
      reasons.push("vintage missing");
    }
  }
  candidate.score = roundScore(Math.min(1, candidate.score));
  return candidate;
}

export async function searchCatalog(ctx: QueryCtx, search: SearchQuery): Promise<SearchCandidate[]> {
  const query = normalize(search.producer);
  if (query.length === 0) fail("invalid_input", "producer is required");
  const hits = (await producerHits(ctx, query)).slice(0, PRODUCER_EXPANSION);
  const aliasedWines = search.wine !== undefined ? await wineAliasIds(ctx, normalize(search.wine)) : new Set<Id<"wines">>();
  const ranked: { candidate: SearchCandidate; aliasMatch: boolean }[] = [];
  for (const hit of hits) {
    const wines = await ctx.db
      .query("wines")
      .withIndex("by_producer", (q) => q.eq("producerId", hit.producer._id))
      .collect();
    if (wines.length === 0) {
      ranked.push({
        aliasMatch: hit.aliasMatch,
        candidate: {
          producerId: hit.producer._id,
          producerName: hit.producer.name,
          score: roundScore(hit.score),
          reasons: [...hit.reasons, "no wines yet"],
        },
      });
      continue;
    }
    for (const wine of wines) {
      ranked.push({ aliasMatch: hit.aliasMatch, candidate: await scoreWine(ctx, hit, wine, search, aliasedWines) });
    }
  }
  return ranked
    .sort((a, b) => Number(b.aliasMatch) - Number(a.aliasMatch) || b.candidate.score - a.candidate.score)
    .slice(0, search.limit ?? DEFAULT_LIMIT)
    .map((entry) => entry.candidate);
}
