# opencellar

An open-source, self-hostable, agent-first wine cellar manager.

OpenCellar tracks one person's cellar: producers, wines, vintages, and the bottles you own. You talk to it through an AI agent instead of a web app. Other agents, such as Claude or Grok, can connect to it over MCP.

This repository is the backend. It has no frontend.

## Architecture

OpenCellar has two parts.

- **Convex owns the data and the catalog logic.** The schema, matching, merging, imports, and idempotency live in `convex/`. Search is deterministic. It normalizes names ("Ch. Musar" becomes "chateau musar"), checks recorded aliases, and scores candidates by trigram similarity. It never calls a model.
- **eve is the interface.** The agent in `agent/` reads labels, decides what a bottle is, and calls Convex through typed tools. eve also serves those tools to other agents over MCP.

Every public Convex function requires an `apiKey` argument that matches `OPENCELLAR_API_KEY`. If that variable is unset on the deployment, every call fails.

```text
convex/            schema, public functions, and model/ logic
convex/lib/        pure modules: normalize, similarity, CellarTracker CSV, bottle states
agent/             eve agent: instructions, tools, skills, channels
evals/             eve evals for the identify-wine flow
scripts/           comment check, MCP smoke test, CSV import
test/              vitest suites (convex-test and unit)
```

## Setup

You need Node.js 24 or newer.

```bash
npm install
```

### 1. Convex

Pick one.

- **Local, no account.** Run `CONVEX_AGENT_MODE=anonymous npx convex dev`. It starts a local backend and writes `CONVEX_URL` to `.env.local`.
- **Convex cloud.** Run `npx convex dev` and sign in. Use `npx convex deploy` for production.
- **Self-hosted Convex.** Run the open-source backend with Docker, then set `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` before `npx convex deploy`. See the Convex self-hosting guide.

Then set the API key on the deployment:

```bash
npx convex env set OPENCELLAR_API_KEY "$(openssl rand -hex 24)"
```

### 2. Environment

The agent reads these variables. `.env.example` lists them.

| Variable               | Used by      | Purpose                                                        |
| ---------------------- | ------------ | -------------------------------------------------------------- |
| `CONVEX_URL`           | agent        | Your Convex deployment URL.                                    |
| `OPENCELLAR_API_KEY`   | agent        | The same key you set on the Convex deployment.                 |
| `OPENCELLAR_MCP_TOKEN` | agent        | Bearer token MCP clients send in production.                   |
| `ANTHROPIC_API_KEY`    | agent, evals | Model key. Required to chat and to run evals.                  |

### 3. Model

`agent/agent.ts` uses `anthropic()` from `eve/models/anthropic`, which reads `ANTHROPIC_API_KEY`. To change models, edit that one line. Use `openai()` from `eve/models/openai`, a gateway string such as `"anthropic/claude-opus-5.5"` with `AI_GATEWAY_API_KEY`, or any AI SDK model.

### 4. Run and deploy eve

```bash
npx eve dev              # local server and terminal UI on port 2000
npx eve build            # production build in .output/
PORT=3000 npx eve start --host 0.0.0.0
```

For Vercel, run `npx eve deploy`. For other hosts, see eve's self-hosting guide in `node_modules/eve/docs/guides/deployment/self-hosting/`. Forward both `/eve/` and `/.well-known/workflow/` through your proxy.

### 5. Connect an MCP client

The MCP endpoint is `/eve/v1/mcp`. In development, `localDev()` accepts local requests with no token. In production, clients send `Authorization: Bearer $OPENCELLAR_MCP_TOKEN`. Requests without a valid token get a 401.

## MCP tools

The channel publishes the agent's skills and two kinds of tool.

**Direct tools** run against Convex with no model. Callers already hold the ids they need.

| Tool              | What it does                                                      |
| ----------------- | ----------------------------------------------------------------- |
| `search_catalog`  | Ranked catalog candidates with scores and reasons.                |
| `get_wine`        | One wine with every vintage, in-cellar counts, and drink windows. |
| `list_cellar`     | Bottles grouped by vintage, filterable by status, producer, color, style, or location. |
| `drinking_soon`   | Vintages whose drink window closes soon or has passed.           |
| `list_locations`  | Storage locations with paths and bottle counts.                   |
| `find_duplicates` | Likely duplicate producers and wines. Read only.                  |
| `move_bottles`    | Move cellar bottles to a location.                                |
| `consume_bottle`  | Mark a bottle drunk and record the tasting.                       |

**Agent tools** create or change catalog entries. Only the eve agent can call them. MCP clients reach them by asking the agent with `agent_start`.

| Tool              | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `add_bottles`     | Add bottles in one idempotent write. Reuses existing entries.        |
| `merge`           | Fold a duplicate into the entry to keep. Always asks for approval.   |
| `record_alias`    | Remember another spelling for a producer or wine.                    |
| `update_wine`     | Correct or enrich a wine.                                            |
| `update_vintage`  | Enrich a vintage. Agent estimates never replace the user's values.   |
| `create_location` | Create a storage location.                                           |

The boundary is structural. eve's MCP channel publishes root tools that have `execute`. It never publishes tools from a dynamic resolver. The agent tools all come from one `defineDynamic` resolver in `agent/tools/catalog_writes.ts`. `npm run smoke:mcp` checks this over the wire.

## Import from CellarTracker

In CellarTracker, export **My Cellar** as CSV. Then run:

```bash
CONVEX_URL=... OPENCELLAR_API_KEY=... node scripts/import-cellartracker.mjs export.csv
```

The importer reads columns by header name and tolerates missing ones. Vintage `1001` means non-vintage. Sizes such as `750ml`, `1.5L`, and `Magnum` become millilitres. `Location` and `Bin` become nested locations. `BeginConsume` and `EndConsume` become a drink window with source `import`.

Each row's idempotency key is `ct:<iInventory>`. Rows without one use a content hash. Running the same export again adds nothing. Producers and wines that already exist are reused.

## Development

```bash
npm run check      # tsc, vitest, then the no-comments check
npm run smoke:mcp  # starts local Convex and eve dev, then checks the MCP surface
npx eve eval       # runs the evals; needs a model key
```

The codebase has no comments. `scripts/check-no-comments.mjs` uses the TypeScript parser to enforce that, so `//` inside a string or URL is fine.
