import { distinctivePart } from "./normalize";

function trigrams(normalized: string): Set<string> {
  const grams = new Set<string>();
  for (const word of normalized.split(" ")) {
    if (word.length === 0) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

function trigramDice(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared++;
  return (2 * shared) / (left.size + right.size);
}

const DISTINCTIVE_WEIGHT = 0.75;

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const whole = trigramDice(a, b);
  const core = trigramDice(distinctivePart(a), distinctivePart(b));
  return (1 - DISTINCTIVE_WEIGHT) * whole + DISTINCTIVE_WEIGHT * core;
}

export function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}
