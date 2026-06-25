# Checklist

Tracks progress against the assignment requirements (`README.md`) and the build plan. See
`IMPLEMENTATION.md` for how each piece actually works and a fuller write-up of the gaps below.

## Assignment Requirements

### 1. AI Agent (Backend)
- [x] Backend service hosting the agent + tool-use loop (`backend/src/agent/agent.ts`)
- [x] Uses an LLM API (OpenRouter, swappable model)
- [x] Connects to MCP servers (tool discovery + execution via stdio)
- [ ] **At least 2 working MCP servers** — only Marathon (custom) is registered; the remote
      server (Exa) is **not yet wired in** (`mcp-client.ts` SSE branch is a stub)
- [x] Proper tool-use loop (LLM decides → policy check → MCP execute → result fed back)
- [x] Live tool discovery, not hardcoded (`mcp-registry.ts discoverTools()`)

### 2. Policy / Guardrails Dashboard (Frontend)
- [x] Block specific tools entirely (`BLOCK` rule type)
- [x] Require human approval before executing certain tools (`REQUIRE_APPROVAL` rule type)
- [x] Input validation rules, e.g. regex on tool input (`VALIDATE` rule type)
- [ ] Cost/token budget per conversation — `BUDGET` rule type exists and is *evaluated*, but
      nothing currently sums usage or blocks once a budget is exceeded (recorded, not enforced)
- [ ] Bonus: conversation log viewer — audit log viewer UI exists
      (`AuditLogViewer.tsx`) and is functional, not yet verified end-to-end with real conversations
- [x] Rules take effect on the running agent without restart (DB write → policy cache refresh →
      WebSocket broadcast → dashboard re-fetch)

### 3. Custom MCP Server
- [x] Exposes 4–5+ tools (6 implemented: create/list marathons, runner stats, register, update,
      cancel registration)
- [x] Follows MCP spec properly (tool listing, JSON schema, execution, error handling)
- [x] Plug-and-play — backend discovers its tools with no agent-side hardcoding
- [x] Creative real-world data: seeded with 3 real upcoming Delhi-NCR half marathons (researched
      live), not placeholder data

### Constraints
- [x] No hardcoded tool lists — discovered from MCP servers at runtime
- [x] Policy engine is a separate, self-contained module (`backend/src/policy/`)
- [x] Dashboard changes propagate to the running agent without restart
- [x] Code cleanly split across agent / policy / MCP transport / API / db layers

### Edge Cases (need a point of view, not necessarily code)
- [ ] MCP server crashes mid-tool-call — not explicitly handled (no reconnect/retry logic yet)
- [ ] Prompt injection bypass attempts — no dedicated detection; `VALIDATE` rules are generic
      regex only
- [x] Conflicting guardrail rules — resolved deterministically by `priority` ordering, `BLOCK`
      checked before `REQUIRE_APPROVAL`/`VALIDATE`/`BUDGET` within that order
- [ ] Approver offline when approval is required — loop currently just informs the LLM and
      continues; it does not actually suspend and wait for `POST /api/approvals/:id/approve`

### Bonus Points
- [x] Custom MCP server does something creative (marathon registration w/ real race data)
- [ ] Guardrails actively handle prompt injection attempts

### Logistics / Deliverables
- [ ] Deployed link
- [ ] 5-minute recording walking through the system live
- [ ] Submission email to fuzail@armoriq.io (CC aniket/arun/pulkit@armoriq.io)

---

## Build Task Status

### Phase 1 — Custom Marathon MCP Server
- [x] Project setup
- [x] Marathon/Runner/Registration data model
- [x] 6 MCP tools implemented
- [x] MCP server (stdio transport, tool listing/execution/error handling)
- [x] Seeded with real Delhi-NCR race data

### Phase 2 — Backend
- [x] Project setup & Neon database schema
- [x] MCP client & tool discovery
- [x] Policy engine & rule store
- [x] Agent loop with LLM (OpenRouter)
- [x] Conversation & audit logging
- [x] REST API endpoints
- [x] WebSocket server & real-time rule sync
- [x] CORS configured for frontend origin
- [x] Fixed: MCP SDK stdio transport spawn bug
- [x] Fixed: `resultSchema.parse` bug (now uses SDK's `listTools()`/`callTool()`)
- [x] Fixed: OpenRouter wrong domain (`openrouter.io` → `openrouter.ai`)
- [x] Fixed: `postgres.js` `UNDEFINED_VALUE` crashes (rule updates, conversation updates, audit log)
- [ ] Integration & testing (end-to-end, user-driven)
- [ ] Exa (remote MCP server) integration
- [ ] Approval suspend/resume in the agent loop
- [ ] Budget enforcement (currently evaluated but not enforced)

### Phase 3 — Frontend
- [x] React + Vite + Tailwind project setup
- [x] Guardrail builder (create/enable/disable/delete)
- [x] Tool catalog view
- [x] Conversation/chat interface
- [x] Audit log viewer
- [x] WebSocket integration (live rule updates)
- [x] REST API integration
- [x] Dashboard layout & styling
- [ ] Full testing & bug fixes (user-driven)

### Phase 4 — Integration & Submission
- [ ] Full system integration test (Marathon server + backend + frontend, end to end)
- [ ] Record 5-minute demo video
- [ ] Deploy backend + frontend
- [ ] Send submission email

---

## Legend
- [x] Done and verified in code
- [ ] Outstanding — either not started or known-incomplete (see `IMPLEMENTATION.md` → Known Gaps)
