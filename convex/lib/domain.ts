export const COLORS = ["red", "white", "rose", "orange"] as const;
export type Color = (typeof COLORS)[number];

export const STYLES = ["still", "sparkling", "fortified", "sweet"] as const;
export type Style = (typeof STYLES)[number];

export const LOCATION_KINDS = ["cellar", "rack", "bin", "fridge", "other"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const INGEST_SOURCES = ["photo", "text", "receipt", "csv", "mcp"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export const EVIDENCE_SIDES = ["front", "back", "receipt"] as const;
export type EvidenceSide = (typeof EVIDENCE_SIDES)[number];

export const ALIAS_SOURCES = ["merge", "correction", "import"] as const;
export type AliasSource = (typeof ALIAS_SOURCES)[number];

export const WINDOW_SOURCES = ["user", "import", "agent"] as const;
export type WindowSource = (typeof WINDOW_SOURCES)[number];

export type DrinkWindow = { from?: number; to?: number; source: WindowSource };

const WINDOW_AUTHORITY: Record<WindowSource, number> = { agent: 0, import: 1, user: 2 };

export type WindowDecision =
  | { kind: "apply"; window: DrinkWindow }
  | { kind: "skip"; reason: `${WindowSource}-set` };

export function decideDrinkWindow(existing: DrinkWindow | undefined, proposed: DrinkWindow): WindowDecision {
  if (existing && WINDOW_AUTHORITY[proposed.source] < WINDOW_AUTHORITY[existing.source]) {
    return { kind: "skip", reason: `${existing.source}-set` };
  }
  return { kind: "apply", window: proposed };
}

export const DEFAULT_BOTTLE_ML = 750;
