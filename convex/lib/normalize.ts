const LIGATURES: Record<string, string> = {
  "œ": "oe",
  "æ": "ae",
  "ß": "ss",
  "ø": "o",
  "ł": "l",
  "đ": "d",
};

const ABBREVIATIONS: Record<string, string> = {
  ch: "chateau",
  chat: "chateau",
  cht: "chateau",
  chau: "chateau",
  dom: "domaine",
  dne: "domaine",
  st: "saint",
  ste: "sainte",
  mt: "mont",
};

const GENERIC_TOKENS = new Set([
  "chateau",
  "domaine",
  "clos",
  "maison",
  "weingut",
  "bodega",
  "bodegas",
  "tenuta",
  "cantina",
  "azienda",
  "agricola",
  "quinta",
  "estate",
  "winery",
  "vineyards",
  "cellars",
  "wines",
]);

const FILLER_TOKENS = new Set(["d", "l", "de", "du", "des", "la", "le", "les", "the", "et", "and"]);

export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[œæßøłđ]/g, (char) => LIGATURES[char] ?? char)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

export function normalizeTokens(text: string): string[] {
  const expanded = foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0)
    .map((token) => ABBREVIATIONS[token] ?? token);
  const meaningful = expanded.filter((token) => !FILLER_TOKENS.has(token));
  return meaningful.length > 0 ? meaningful : expanded;
}

export function normalize(text: string): string {
  return normalizeTokens(text).join(" ");
}

export function distinctivePart(normalized: string): string {
  const tokens = normalized.split(" ").filter((token) => token.length > 0);
  const distinctive = tokens.filter((token) => !GENERIC_TOKENS.has(token));
  return (distinctive.length > 0 ? distinctive : tokens).join(" ");
}
