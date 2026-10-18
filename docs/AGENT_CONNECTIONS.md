# Connecting AI team members to the board (agent-tasks-api)

**Status: DRAFT.** Nothing is deployed, applied, or minted yet. All of it waits on Zac's direct approval.

- **Endpoint (after deploy):** `https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/agent-tasks-api`
- **MCP endpoint:** `…/agent-tasks-api/mcp`
- **Auth:** `Authorization: Bearer <that AI's own key>`. Every AI gets its own key with its own scopes. The shared dashboard password is rejected on this API.
- **Access:** tasks and task comments only, read / create / update. There are no deletes. Agents cannot move a task out of **Needs Zac Approval**, and can only mark a task **Done** from **Needs QA**.
- **Every call** is rate-limited per key (60/min by default) and written to `agent_api_audit_log`.

## One-time setup (operator, after approval)
1. Apply the migrations: `20261018060000_agent_api_keys.sql`, `20261018060100_task_stages_v2.sql`, and `20261018060200_seed_ai_members.sql` (seed only if approved).
2. Optionally set the edge-function secret `AGENT_KEY_PEPPER`, a random string. If you set it, use the same value when generating keys.
3. Deploy `agent-tasks-api`. `config.toml` already sets `verify_jwt = false`, because the function does its own key auth.
4. For each AI, run `scripts/generate-agent-key.ts`. It writes the plaintext only to `/home/box/secrets/agent-keys/<name>.env` and the hash-only SQL to `<name>.insert.sql`. Run that SQL.
5. To revoke a key: `update agent_api_keys set revoked_at = now() where name = '<name>';`

## Key names (proposed; no values exist yet)

| Key name | Acts as member | Scopes |
|---|---|---|
| `hermes` | Grok Bot / Project Manager | tasks:read, tasks:create, tasks:update, comments:read, comments:create |
| `chatgpt` | (assign a member) | tasks:read, tasks:create, tasks:update, comments:read, comments:create |
| `claude` | Claude (8ca2346c-47dd-473a-9c8e-f81dca39576b) | tasks:read, tasks:create, tasks:update, comments:read, comments:create, comments:update |
| `codex` | Codex (formerly Alfred, 32328983-…) | tasks:read, tasks:update, comments:read, comments:create |
| `muse` | Muse (47c559aa-…) | tasks:read, tasks:update, comments:read, comments:create |
| `qa-bot` and one per specialist bot | that bot | tasks:read, tasks:update, comments:read, comments:create |

The env var names in the secrets files follow the pattern `AGENT_KEY_<NAME>`, for example `AGENT_KEY_CLAUDE` or `AGENT_KEY_HERMES`.

## Hermes (inbound link)
Hermes calls the REST surface directly.
1. In Hermes's outbound/webhook config, set:
   - Base URL: `https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/agent-tasks-api`
   - Header: `Authorization: Bearer $AGENT_KEY_HERMES`
2. Calls it can make:
   - `GET /tasks?stage=needs_qa`
   - `POST /tasks` with `{"title":"…","client_id":"…","assignee_ids":["…"]}`
   - `PATCH /tasks/<id>` with `{"stage":"in_progress"}`
   - `POST /tasks/<id>/comments` with `{"content":"…"}`
3. Keep the existing `hermes-inbound` (Jarvis) link as is, or retire it later. It still uses the shared `hermes_api_key`, and this PR does not change it.

## ChatGPT (Custom GPT Action)
ChatGPT's MCP connectors need OAuth, so use a Custom GPT Action with an API key instead.
1. In ChatGPT: **Explore GPTs → Create → Configure → Actions → Create new action**.
2. **Authentication:** API Key → Auth type **Bearer** → paste the value of `AGENT_KEY_CHATGPT` (from `/home/box/secrets/agent-keys/chatgpt.env`).
3. **Schema:** paste `docs/agent-tasks-openapi.yaml`.
4. **Privacy policy URL:** `https://reporting.highperformanceads.com`
5. Save the GPT as "Only me" or workspace-only. Do not publish it.

## Claude (MCP server with a scoped key)
- **Claude Desktop / Claude Code** (header auth is supported):
  - Claude Code:
    `claude mcp add --transport http hpa-board https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/agent-tasks-api/mcp --header "Authorization: Bearer $AGENT_KEY_CLAUDE"`
  - Claude Desktop (`claude_desktop_config.json`):
    `{"mcpServers":{"hpa-board":{"command":"npx","args":["-y","mcp-remote","https://jgwwmtuvjlmzapwqiabu.supabase.co/functions/v1/agent-tasks-api/mcp","--header","Authorization: Bearer ${AGENT_KEY_CLAUDE}"],"env":{"AGENT_KEY_CLAUDE":"<from secrets file>"}}}}`
- **Claude.ai web / team "custom connectors":** these require OAuth and cannot send a static key. Use Desktop or Code, or add an OAuth front-end later.
- **Tools exposed:** list_tasks, get_task, create_task, update_task, list_comments, add_comment, list_stages.

## Stages
`todo` → `in_progress` → `needs_qa` → `needs_zac_approval` → `done`.
- The legacy stage `agency_review` is shown in, and filtered as, `needs_qa`.
- `client_tasks`, `stuck`, `review` and `revisions` remain valid for existing tasks.
