import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const PUBLISHED = [
  "search_catalog",
  "get_wine",
  "list_cellar",
  "drinking_soon",
  "list_locations",
  "find_duplicates",
  "move_bottles",
  "consume_bottle",
];
const AGENT_ONLY = ["add_bottles", "merge", "record_alias", "update_wine", "update_vintage", "create_location"];
const PROTOCOL_VERSION = "2025-11-25";
const children = [];
let failures = 0;

function check(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
  if (!ok) failures++;
  return ok;
}

function readDotEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")]),
  );
}

async function waitFor(label, probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function start(label, command, args, env) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => log.push(chunk.toString()));
  child.on("exit", (code) => log.push(`[${label} exited with ${code}]`));
  children.push(child);
  return { child, log };
}

function stopAll() {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function convexReachable(url) {
  const response = await fetch(`${url}/version`);
  return response.ok;
}

function convexEnv(args) {
  return execFileSync("npx", ["convex", "env", ...args], { encoding: "utf8", env: process.env }).trim();
}

async function ensureConvex() {
  const fileEnv = readDotEnv(".env.local");
  const url = process.env.CONVEX_URL ?? fileEnv.CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL is not set. Run `npx convex dev --once` first.");
  const up = await convexReachable(url).catch(() => false);
  if (!up) {
    console.log(`starting local Convex backend for ${url}`);
    const convex = start("convex", "npx", ["convex", "dev", "--tail-logs", "disable"], { CONVEX_AGENT_MODE: "anonymous" });
    await waitFor("Convex backend", () => convexReachable(url), 180_000).catch((error) => {
      console.error(convex.log.join(""));
      throw error;
    });
    await waitFor("Convex functions", () => convex.log.join("").includes("Convex functions ready"), 180_000);
  }
  const configured = convexEnv(["get", "OPENCELLAR_API_KEY"]).split("\n").pop() ?? "";
  const apiKey = process.env.OPENCELLAR_API_KEY ?? (configured.length > 0 && !/not found/i.test(configured) ? configured : `smoke-${randomBytes(12).toString("hex")}`);
  if (apiKey !== configured) convexEnv(["set", "OPENCELLAR_API_KEY", apiKey]);
  return { url, apiKey };
}

async function rpc(endpoint, id, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
    },
    body: JSON.stringify(id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  if (id === undefined) return { status: response.status };
  const payloads = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => JSON.parse(line.slice(5)))
    : [JSON.parse(text)];
  const message = payloads.find((payload) => payload.id === id);
  if (!message) throw new Error(`${method}: HTTP ${response.status} without a JSON-RPC reply: ${text.slice(0, 300)}`);
  return message;
}

async function main() {
  const convex = await ensureConvex();
  check(true, `Convex reachable at ${convex.url}`);

  const client = new ConvexHttpClient(convex.url);
  const seeded = await client.mutation(api.cellar.addBottles, {
    apiKey: convex.apiKey,
    ingestKey: "smoke:musar-2016",
    source: "mcp",
    producer: { name: "Château Musar", country: "Lebanon" },
    wine: { name: "", color: "red" },
    vintage: { year: 2016 },
    quantity: 1,
  });
  check(seeded.bottleIds.length === 1, `seeded Château Musar 2016 through cellar.addBottles (${seeded.outcome})`);

  let base = process.env.SMOKE_EVE_URL;
  if (!base) {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    console.log(`starting eve dev on ${base}`);
    const eve = start("eve", "npx", ["eve", "dev", "--no-ui", "--port", String(port)], {
      CONVEX_URL: convex.url,
      OPENCELLAR_API_KEY: convex.apiKey,
    });
    await waitFor(
      "eve dev MCP endpoint",
      async () => (await rpc(`${base}/eve/v1/mcp`, 0, "ping", {})).jsonrpc === "2.0",
      240_000,
    ).catch((error) => {
      console.error(eve.log.join("").slice(-4000));
      throw error;
    });
  }
  const endpoint = `${base}/eve/v1/mcp`;

  const init = await rpc(endpoint, 1, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "opencellar-smoke", version: "0.1.0" },
  });
  check(
    Boolean(init.result?.serverInfo),
    `initialize -> ${init.result?.serverInfo?.name} ${init.result?.serverInfo?.version}, protocol ${init.result?.protocolVersion}`,
  );
  await rpc(endpoint, undefined, "notifications/initialized", {});

  const listed = await rpc(endpoint, 2, "tools/list", {});
  const names = (listed.result?.tools ?? []).map((tool) => tool.name);
  console.log(`tools/list -> ${names.join(", ")}`);
  for (const name of PUBLISHED) check(names.includes(name), `published: ${name}`);
  for (const name of AGENT_ONLY) check(!names.includes(name), `absent: ${name}`);

  const listing = await rpc(endpoint, 3, "tools/call", { name: "list_cellar", arguments: {} });
  const structured = listing.result?.structuredContent;
  check(listing.result?.isError !== true, "tools/call list_cellar succeeded");
  check(Array.isArray(structured?.rows), `list_cellar structuredContent has rows (${structured?.rows?.length ?? 0})`);
  check(
    structured?.rows?.some((row) => row.producer === "Château Musar" && row.year === 2016 && row.count >= 1),
    "list_cellar includes the seeded Château Musar 2016",
  );
  console.log(`list_cellar structuredContent: ${JSON.stringify({ ...structured, rows: structured?.rows?.slice(0, 2) })}`);

  const blocked = await rpc(endpoint, 4, "tools/call", {
    name: "add_bottles",
    arguments: { ingestKey: "smoke:blocked", source: "mcp", producer: { name: "X" }, wine: { name: "", color: "red" }, vintage: { year: 2020 }, quantity: 1 },
  });
  check(
    Boolean(blocked.error) || blocked.result?.isError === true,
    `tools/call add_bottles is refused over MCP (${blocked.error?.message ?? blocked.result?.content?.[0]?.text ?? "no error"})`,
  );
}

main()
  .catch((error) => {
    check(false, error.message);
  })
  .finally(() => {
    stopAll();
    console.log(failures === 0 ? "smoke-mcp: all checks passed" : `smoke-mcp: ${failures} check(s) failed`);
    process.exit(failures === 0 ? 0 : 1);
  });
