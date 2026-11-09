import { type Color, DEFAULT_BOTTLE_ML, type DrinkWindow, type Style } from "./domain";
import { normalize } from "./normalize";

export type CellarTrackerRecord = {
  line: number;
  iInventory?: string;
  barcode?: string;
  location?: string;
  bin?: string;
  size?: string;
  currency?: string;
  price?: number;
  storeName?: string;
  purchaseDate?: string;
  vintage: number | null;
  wine?: string;
  country?: string;
  region?: string;
  subRegion?: string;
  appellation?: string;
  producer?: string;
  type?: string;
  color?: string;
  category?: string;
  varietal?: string;
  masterVarietal?: string;
  designation?: string;
  vineyard?: string;
  beginConsume?: number;
  endConsume?: number;
  quantity?: number;
};

export type CellarTrackerIngest = {
  line: number;
  ingestKey: string;
  externalRef?: string;
  producer: { name: string; country?: string; region?: string };
  wine: {
    name: string;
    color: Color;
    style: Style;
    appellation?: { name: string; country: string; region?: string };
    grapes: { grape: string }[];
  };
  vintage: { year: number | null; drinkWindow?: DrinkWindow };
  sizeMl: number;
  quantity: number;
  location?: { name: string; bin?: string };
  purchase?: { merchant?: string; purchasedOn?: string; unitPrice?: number; currency?: string };
};

export type ParseIssue = { line: number; error: string };

const NON_VINTAGE_SENTINEL = 1001;

const PLACEHOLDER_VALUES = new Set(["", "unknown", "n/a", "na", "none", "-"]);

type TextColumn = Exclude<keyof CellarTrackerRecord, "line" | "vintage" | "price" | "beginConsume" | "endConsume" | "quantity">;

const TEXT_COLUMNS: Record<string, TextColumn> = {
  iinventory: "iInventory",
  barcode: "barcode",
  location: "location",
  bin: "bin",
  size: "size",
  currency: "currency",
  storename: "storeName",
  purchasedate: "purchaseDate",
  wine: "wine",
  country: "country",
  region: "region",
  subregion: "subRegion",
  appellation: "appellation",
  producer: "producer",
  type: "type",
  color: "color",
  category: "category",
  varietal: "varietal",
  mastervarietal: "masterVarietal",
  designation: "designation",
  vineyard: "vineyard",
};

const NUMBER_COLUMNS: Record<string, "price" | "beginConsume" | "endConsume" | "quantity"> = {
  price: "price",
  beginconsume: "beginConsume",
  endconsume: "endConsume",
  quantity: "quantity",
};

const NAMED_SIZES_ML: Record<string, number> = {
  "split": 187,
  "piccolo": 187,
  "half": 375,
  "half bottle": 375,
  "demi": 375,
  "clavelin": 620,
  "standard": 750,
  "bottle": 750,
  "liter": 1000,
  "litre": 1000,
  "magnum": 1500,
  "double magnum": 3000,
  "jeroboam": 3000,
  "rehoboam": 4500,
  "imperial": 6000,
  "methuselah": 6000,
  "salmanazar": 9000,
};

const SIZE_UNITS_ML: Record<string, number> = { ml: 1, cl: 10, l: 1000 };

const COLOR_BY_LABEL: Record<string, Color> = {
  red: "red",
  white: "white",
  rose: "rose",
  "rosé": "rose",
  pink: "rose",
  orange: "orange",
  amber: "orange",
};

const STYLE_BY_CATEGORY: Record<string, Style> = {
  dry: "still",
  still: "still",
  sparkling: "sparkling",
  fortified: "fortified",
  sweet: "sweet",
  "sweet/dessert": "sweet",
  dessert: "sweet",
};

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const headerEnd = source.search(/\r?\n/);
  const header = headerEnd === -1 ? source : source.slice(0, headerEnd);
  const delimiter = header.includes("\t") && !header.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function cleanText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return PLACEHOLDER_VALUES.has(trimmed.toLowerCase()) ? undefined : trimmed;
}

function parseNumber(raw: string | undefined): number | undefined {
  const text = cleanText(raw)?.replace(/[^0-9.\-]/g, "");
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export function parseSizeMl(raw: string | undefined): number | undefined {
  const text = cleanText(raw)?.toLowerCase();
  if (!text) return undefined;
  const named = NAMED_SIZES_ML[text];
  if (named !== undefined) return named;
  const match = /^(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b/.exec(text);
  if (!match) return undefined;
  const amount = Number(match[1].replace(",", "."));
  const unit = SIZE_UNITS_ML[match[2]];
  return Math.round(amount * unit);
}

export function parseUsDate(raw: string | undefined): string | undefined {
  const text = cleanText(raw);
  if (!text) return undefined;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

function parseVintage(raw: string | undefined): number | null {
  const year = parseNumber(raw);
  return year === undefined || year === NON_VINTAGE_SENTINEL ? null : Math.trunc(year);
}

export function parseCellarTrackerCsv(csv: string): CellarTrackerRecord[] {
  const [header, ...body] = parseCsv(csv);
  if (!header) return [];
  const columns = header.map((name) => name.trim().toLowerCase());
  return body.map((cells, index) => {
    const record: CellarTrackerRecord = { line: index + 2, vintage: null };
    columns.forEach((column, position) => {
      const cell = cells[position];
      const textKey = TEXT_COLUMNS[column];
      if (textKey) {
        const value = cleanText(cell);
        if (value !== undefined) record[textKey] = value;
        return;
      }
      const numberKey = NUMBER_COLUMNS[column];
      if (numberKey) {
        const value = parseNumber(cell);
        if (value !== undefined) record[numberKey] = value;
        return;
      }
      if (column === "vintage") record.vintage = parseVintage(cell);
    });
    return record;
  });
}

function stripProducerPrefix(wine: string, producer: string): string {
  const target = normalize(producer);
  const words = wine.split(/\s+/);
  for (let count = words.length; count > 0; count--) {
    if (normalize(words.slice(0, count).join(" ")) === target) return words.slice(count).join(" ");
  }
  return wine;
}

export function cuveeName(record: CellarTrackerRecord, producer: string): string {
  const named = [record.designation, record.vineyard].filter((part): part is string => part !== undefined);
  if (named.length > 0) return named.join(" ");
  return record.wine ? stripProducerPrefix(record.wine, producer).trim() : "";
}

function resolveColor(record: CellarTrackerRecord): Color {
  const label = (record.color ?? record.type ?? "").toLowerCase();
  const direct = COLOR_BY_LABEL[label];
  if (direct) return direct;
  const word = Object.keys(COLOR_BY_LABEL).find((key) => label.includes(key));
  return word ? COLOR_BY_LABEL[word] : "red";
}

function resolveStyle(record: CellarTrackerRecord): Style {
  const category = (record.category ?? "").toLowerCase();
  const type = (record.type ?? "").toLowerCase();
  return STYLE_BY_CATEGORY[category] ?? (type.includes("sparkling") ? "sparkling" : "still");
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function recordFingerprint(record: CellarTrackerRecord): string {
  const { line: _line, ...content } = record;
  return fnv1a(JSON.stringify(content));
}

export function planCellarTrackerImport(records: CellarTrackerRecord[]): {
  rows: CellarTrackerIngest[];
  issues: ParseIssue[];
} {
  const rows: CellarTrackerIngest[] = [];
  const issues: ParseIssue[] = [];
  const fingerprintCounts = new Map<string, number>();
  for (const record of records) {
    if (!record.producer) {
      issues.push({ line: record.line, error: "missing Producer" });
      continue;
    }
    const fingerprint = recordFingerprint(record);
    const occurrence = (fingerprintCounts.get(fingerprint) ?? 0) + 1;
    fingerprintCounts.set(fingerprint, occurrence);
    const ingestKey = record.iInventory ? `ct:${record.iInventory}` : `ct:h:${fingerprint}:${occurrence}`;
    const window =
      record.beginConsume !== undefined || record.endConsume !== undefined
        ? { from: record.beginConsume, to: record.endConsume, source: "import" as const }
        : undefined;
    const grape = record.varietal ?? record.masterVarietal;
    rows.push({
      line: record.line,
      ingestKey,
      externalRef: record.iInventory ?? record.barcode,
      producer: { name: record.producer, country: record.country, region: record.region },
      wine: {
        name: cuveeName(record, record.producer),
        color: resolveColor(record),
        style: resolveStyle(record),
        appellation:
          record.appellation && record.country
            ? { name: record.appellation, country: record.country, region: record.region }
            : undefined,
        grapes: grape ? [{ grape }] : [],
      },
      vintage: { year: record.vintage, drinkWindow: window },
      sizeMl: parseSizeMl(record.size) ?? DEFAULT_BOTTLE_ML,
      quantity: Math.max(1, Math.trunc(record.quantity ?? 1)),
      location: record.location ? { name: record.location, bin: record.bin } : undefined,
      purchase:
        record.storeName || record.purchaseDate || record.price !== undefined
          ? {
              merchant: record.storeName,
              purchasedOn: parseUsDate(record.purchaseDate),
              unitPrice: record.price,
              currency: record.currency,
            }
          : undefined,
    });
  }
  return { rows, issues };
}
