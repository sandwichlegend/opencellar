import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const [path] = process.argv.slice(2);
const url = process.env.CONVEX_URL;
const apiKey = process.env.OPENCELLAR_API_KEY;

if (!path || !url || !apiKey) {
  console.error("usage: CONVEX_URL=... OPENCELLAR_API_KEY=... node scripts/import-cellartracker.mjs <export.csv>");
  process.exit(2);
}

const result = await new ConvexHttpClient(url).action(api.imports.cellarTracker, {
  apiKey,
  csv: readFileSync(path, "utf8"),
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.rowsFailed > 0 ? 1 : 0);
