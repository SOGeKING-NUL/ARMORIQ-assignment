# Implementation

This document describes how the system is actually built today: the three components, how
they connect, the data model, and the known gaps. For the original assignment requirements see
`README.md`.

## Overview

Three independent services:

```
custom-mcp-server/   Marathon registration MCP server (stdio transport)
backend/             Express API + LLM agent loop + policy engine + WebSocket
frontend/             React guardrails dashboard
```

The backend spawns the Marathon MCP server as a child process on startup, discovers its tools
over the MCP protocol, and exposes them to an LLM. Every tool call the LLM wants to make is
routed through the policy engine first. The dashboard reads/writes guardrail rules via REST and
gets pushed live updates over a WebSocket.

```
┌──────────────┐   REST + WS    ┌──────────────────────────────────────────┐
│   Frontend   │ ─────────────► │                Backend                    │
│ (React/Vite) │ ◄───────────── │                                            │
└──────────────┘                │  ┌────────┐   ┌────────────┐   ┌────────┐ │
                                 │  │ Agent  │──►│   Policy   │   │  MCP   │ │
                                 │  │  Loop  │   │   Engine   │   │Registry│ │
                                 │  └───┬────┘   └─────┬──────┘   └───┬────┘ │
                                 │      │  uses tools   │ checks       │ stdio │
                                 │      └───────────────┴──────────────┘      │
                                 │                  │                          │
                                 │            Neon Postgres                    │
                                 └──────────────────┬───────────────────────────┘
                                                     │ spawns (stdio)
                                            ┌────────▼─────────┐
                                            │ Marathon MCP      │
                                            │ Server (child)    │
                                            └───────────────────┘
```

## 1. Custom MCP Server (`custom-mcp-server/`)

A standalone Node/TypeScript process built on `@modelcontextprotocol/sdk`. Started by the
backend as a child process and talks over **stdio** — the SDK's `StdioClientTransport` spawns
and owns the process itself (the backend does not manually `spawn()` it).

- `src/storage.ts` — in-memory store (plain `Map`s, no DB) for `Marathon`, `Runner`,
  `Registration`. Resets every time the process restarts.
- `src/validation.ts` — input validation (email format, future-dated events, age range, UUID
  shape, registration status enum).
- `src/schemas.ts` — JSON Schema for every tool's input, used both for MCP `tools/list` and for
  the LLM's function-calling schema on the backend side.
- `src/index.ts` — registers 6 tools and seeds sample data on boot:
  - `create_marathon(name, date, distance, location)`
  - `list_marathons()`
  - `get_runner_stats(runner_email)`
  - `register_runner_for_marathon(runner_email, marathon_name, runner_name?, runner_age?)`
  - `update_registration(registration_id, new_status)`
  - `cancel_registration(registration_id)`

**Seed data**: `storage.seedSampleData()` registers 3 real upcoming Delhi-NCR half marathons
(Kargil Vijay Diwas Half Marathon, Dwarka Half Marathon, Tuffman Half Marathon Delhi — researched
live, not placeholders) plus 3 sample runners. Because storage is in-memory, this seed runs fresh
every time the server process boots — i.e. every time the backend starts.

## 2. Backend (`backend/`)

Express + TypeScript. Entry point is `src/index.ts`, which on startup: initializes the Neon
connection and schema, spawns and connects to the Marathon MCP server, discovers its tools,
loads guardrail rules into the policy engine's cache, then starts the HTTP + WebSocket server.

### Agent loop (`src/agent/`)

- `llm-client.ts` — calls an LLM via **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`),
  using OpenAI-style function-calling (`tools` / `tool_choice: 'auto'` / `tool_calls` in the
  response). Default model: `openai/gpt-4-turbo-preview`, swappable via `setModel()`.
- `agent.ts` — the tool-use loop, run per incoming chat message:
  1. Call the LLM with the full live tool catalog from `mcpRegistry`.
  2. If the LLM responds with a tool call, send `(toolName, toolInput)` to `policyEngine.evaluate()`.
  3. **Blocked** → log as `BLOCKED`, feed the rejection back to the LLM as the next user turn,
     loop continues (LLM can explain to the user or try something else).
  4. **Requires approval** → create a `pending_approvals` row, log as `REQUIRES_APPROVAL`, feed
     that back to the LLM, loop continues. (No suspend/resume yet — see Known Gaps.)
  5. **Allowed** → execute via `mcpRegistry.callTool()`, log the result as `ALLOWED`, feed the
     tool result back to the LLM.
  6. Loop ends when the LLM responds with plain text (no further tool call) or after
     `maxIterations` (default 10).
  - Conversation history is accumulated in-memory for the duration of a single `agent.run()`
    call only — it is not reloaded from the database on the next HTTP request (see Known Gaps).

### Policy engine (`src/policy/`)

Deliberately separate from the agent — `agent.ts` only ever calls `policyEngine.evaluate()` and
never inspects rules itself.

- `policy-engine.ts` — holds an in-memory `Map<toolName, Guardrail[]>` cache, rebuilt by
  `refreshRules()` (a full re-read of the `guardrails` table, rules ordered by `priority`).
  `evaluate(toolName, toolInput, userId?, conversationId?)` checks rules for the exact tool name
  plus any `tool_name = '*'` wildcard rules, in priority order:
  - `BLOCK` → deny immediately.
  - `VALIDATE` → run `input_pattern` as a regex against `JSON.stringify(toolInput)`; no match ⇒ deny.
  - `REQUIRE_APPROVAL` → allow, but flag `requiresApproval: true`.
  - `BUDGET` → allow, attach a `costEstimate` (budget is recorded, not yet enforced — see Known Gaps).
  - No matching rule at all for a tool ⇒ allowed by default.
- `rule-store.ts` — CRUD for guardrail rows. Every create/update/delete calls
  `policyEngine.refreshRules()` immediately afterward, and the REST layer broadcasts the change
  over WebSocket — this is the "no restart needed" mechanism end to end: DB write → in-memory
  cache rebuild → WebSocket push to the dashboard.

### MCP client/registry (`src/mcp/`)

- `mcp-client.ts` — thin wrapper around the SDK's `Client`. For stdio servers it passes
  `{ command, args, cwd }` straight to `StdioClientTransport`, which spawns the process itself.
  Tool listing and execution go through the SDK's own `client.listTools()` / `client.callTool()`
  helpers (not hand-rolled JSON-RPC envelopes).
- `mcp-registry.ts` — owns one `MCPClient` per named server. `discoverTools()` queries every
  registered client and merges results into a single catalog tagged with `server: <name>`; this
  is the live tool discovery the LLM and the dashboard both read from. `callTool()` resolves
  which server owns a tool name and routes the call there.
- **Only the Marathon server is currently registered** (in `index.ts` at startup). The SSE
  transport branch of `mcp-client.ts` is a stub that throws — Exa (the planned second/remote MCP
  server) is not wired in yet (see Known Gaps).

### Database (`src/db/`)

Neon-hosted Postgres, accessed via the `postgres` package (`postgres.js`). Schema
(`schema.sql`, applied idempotently with `CREATE TABLE IF NOT EXISTS` on every boot):

- `guardrails` — rule definitions (`type`, `tool_name`, `blocked`, `requires_approval`,
  `input_pattern`, `cost_budget_tokens`, `priority`, `enabled`).
- `conversations` — one row per chat session (`status`, `token_count`, `cost_estimate`).
- `audit_log` — one row per tool-call attempt, including the policy decision and reasoning.
- `pending_approvals` — tool calls awaiting human sign-off.

`conversation-store.ts` wraps all reads/writes to `conversations`, `audit_log`, and
`pending_approvals`.

> **postgres.js gotcha (fixed):** the library throws `UNDEFINED_VALUE` if a plain JS `undefined`
> is bound into a tagged-template query — even inside `COALESCE(...)`. Every optional field in
> `rule-store.ts` and `conversation-store.ts` now coerces with `?? null` (or `?? true`/`?? false`
> where that's the correct business default, e.g. `enabled` on rule creation) before being bound.

### REST API (`src/api/routes.ts`)

| Method/Path | Purpose |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/tools` | Current discovered tool catalog |
| `POST /api/conversations` | Start a conversation |
| `GET /api/conversations/:id` | Fetch conversation state |
| `POST /api/conversations/:id/messages` | Send a chat message → runs the agent loop |
| `GET /api/conversations/:id/audit-log` | Full tool-call history for a conversation |
| `GET/POST /api/rules` | List / create guardrails |
| `GET/PUT/DELETE /api/rules/:id` | Read / update / delete a guardrail |
| `PATCH /api/rules/:id/toggle` | Flip a guardrail's `enabled` flag |
| `GET /api/approvals` | List pending approvals |
| `POST /api/approvals/:id/approve` \| `/reject` | Resolve a pending approval |

`POST /api/rules`, `PUT /api/rules/:id`, and `DELETE /api/rules/:id` each broadcast over
WebSocket after the DB write succeeds.

### Real-time sync (`src/websocket.ts`)

A `ws` `WebSocketServer` attached to the same HTTP server as Express. Broadcasts
`RULE_CREATED` / `RULE_UPDATED` / `RULE_DELETED` (and has helpers for conversation/approval
events, not yet wired to call sites). The frontend's `useWebSocket` hook listens and re-fetches
rules on any rule event — this is the whole "dashboard changes apply without restarting the
agent" mechanism.

### CORS

`cors()` middleware restricts the API to `FRONTEND_URL` (default `http://localhost:5173`),
since the Vite dev server and the API run on different origins.

## 3. Frontend (`frontend/`)

React 18 + Vite + Tailwind. No MCP awareness at all — it only talks to the backend's REST API
and WebSocket.

- `pages/Dashboard.tsx` — top-level tabbed shell (Guardrails / Tools / Conversation / Audit Log),
  owns the `rules` and `tools` state and a "Start New Conversation" action.
- `components/GuardrailBuilder.tsx` — create/enable/disable/delete guardrails. Note: the create
  form does not send `enabled`, relying on the backend's `?? true` default.
- `components/ToolCatalog.tsx` — read-only view of `GET /api/tools`, grouped by MCP server name.
- `components/ConversationView.tsx` — chat box; posts to
  `/api/conversations/:id/messages` and renders the returned `toolCalls` with their policy
  decision badges (allowed/blocked/requires-approval).
- `components/AuditLogViewer.tsx` — expandable table over `GET /api/conversations/:id/audit-log`.
- `hooks/useWebSocket.ts` — opens a `ws://<host>:3000` connection and dispatches incoming
  messages to a callback.
- `api/client.ts` — single Axios instance wrapping every backend endpoint.

## Known Gaps / Not Yet Implemented

These are real, current limitations — not hidden:

1. **Exa (remote MCP server) is not integrated.** Only the Marathon server is registered. The
   SSE transport in `mcp-client.ts` throws `'SSE transport not yet implemented'`. The assignment
   requires at least one pre-existing remote MCP server in addition to the custom one.
2. **Approvals don't suspend/resume the agent loop.** When a tool requires approval, the loop
   tells the LLM so and continues — it does not actually pause execution and wait for
   `POST /api/approvals/:id/approve` before retrying the original tool call.
3. **Budget rules are recorded but not enforced.** `BUDGET` rules return a `costEstimate` but
   nothing currently sums token usage per conversation or blocks once a budget is exceeded.
4. **No prompt-injection-specific guardrails.** `VALIDATE` rules are generic regex checks; there
   is no dedicated detection for prompt-injection attempts in tool arguments or LLM output.
5. **Conversation history is not persisted across HTTP requests.** Each `POST .../messages` call
   rebuilds `conversationHistory` from scratch inside `agent.run()` — multi-turn context within
   a conversation is not reloaded from the database.
6. **In-memory Marathon data does not survive restarts.** Acceptable for a demo; not a real
   datastore.

## Local Development

```bash
# 1. Build & the Marathon MCP server (must be built before backend starts it)
cd custom-mcp-server && npm install && npm run build

# 2. Backend — needs DATABASE_URL (Neon) and OPENROUTER_API_KEY in backend/.env
cd backend && npm install && npm run dev

# 3. Frontend
cd frontend && npm install && npm run dev
```

Backend listens on `:3000`, frontend dev server on `:5173`. See `.env.example` in each of
`backend/` and `frontend/` for required environment variables.
