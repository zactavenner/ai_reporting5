# External Agent Wake-up + Shared Agent Group Chat (inspection + recommendation)

No edits or deploys made. Endpoint/secret presence only; no values read.

## What exists today

**Two separate agent worlds**
1. Model-backed personas — `agency_agents` (10 rows: Jarvis/account_manager, video_ads, static_ads, copywriter, media_buyer, media_buyer_jeremy, reporting, sales_agent, gregory). All run on OpenRouter via `run-agent` / `agent-task-run`. These are prompts, not real assistants.
2. Only one real external assistant is wired: `jeremy_ai` (`capabilities.provider = utari_persona`), reached via `agency_personas` (1 active row, `jeremy`, endpoint configured) through `_shared/personas.ts` + `_shared/utariPersona.ts` (MCP send_message + poll).

**Grok PPM, Alfred, Muse, Claude** exist only as human-style rows in `agency_members` (task counts: Alfred 43, Grok Bot 15, Muse 1, Claude 1). They have email, no phone, and no endpoint/webhook/agent columns. Assigning them a task today only triggers `notify-task-assignee` (agency email/SMS). Nothing wakes them. `grok-booking` + `selected_grok_model` are xAI model calls, not the Grok PPM assistant.

**Task + dispatch plumbing**
- Human tasks: `tasks` + `task_assignees` (via `set_task_assignees` RPC) → `notify-task-assignee` / `retry-task-notification` / watchdogs.
- Agent queue: `agent_tasks` (0 rows) drained every minute by `jarvis-dispatch` (claims with `claimed_by`, `max_attempts` 3, logs to `cron_run_log`) → `run-agent`. Routing in `_shared/agentRouting.ts`.
- Other paths: `hermes-orchestrator`, `hermes-task-executor`, `hermes-inbound` (shared `hermes_api_key`; `hermes_callback_url` column exists), `dispatch-scheduled-agents`, `jarvis-goal-worker`, `openclaw` two-way sync (memory).
- Outbound MCP client: `_shared/mcpClient.ts` (Streamable HTTP, tools/list, tools/call).
- Inbound MCP: our own `mcp` server (OAuth, 17 read tools incl. `list_tasks`) and `mcp-agent-server`.

**Chat**
- `agent_channels` (17 rows; kinds agent / jarvis-hermes / jarvis-team) and `agent_messages` (0 rows) with realtime, `AgentChannelPane`, `AllChannelsInbox`, `EscalateButton`. Supports `from_agent_id`/`to_agent_id`, but only `agency_agents` ids — no identity for external assistants, no group channel, no mentions.

## Gaps
- No registry entry or adapter for Grok PPM, Alfred, Muse, Claude (endpoint, transport, auth).
- No link between `agency_members` rows for those four and an agent identity, so task assignment can't trigger a wake-up.
- No assignment outbox: notifications are fire-and-forget; `agent_tasks` is model-only.
- No authenticated callback for external agents to post status, comments, results or chat replies (`hermes-inbound` uses one shared static key — don't reuse that pattern).
- No group channel, mention parsing, or loop/budget limits for agent-to-agent chat.

## Missing from Zac (needed per agent)
For each of Grok PPM, Alfred (ChatGPT), Muse, Claude: how it is reachable (MCP URL, webhook, OpenAI Assistant/Custom GPT action, Claude connector, Slack/email bot), and its credential. If an agent can only *pull* (e.g. ChatGPT/Claude via our MCP server), it's woken by polling a `get_my_assignments` tool rather than a push.

## Recommendation

```text
task_assignees insert (member linked to external agent)
   -> trigger -> agent_assignment_outbox (unique task_id+agent_id+revision)
   -> agent-wake-worker (cron 1 min + immediate pg_net kick)
        atomic claim (FOR UPDATE SKIP LOCKED, lease expiry)
        adapter by transport: persona_mcp | webhook | mcp_pull
        bounded backoff, max attempts, ambiguous -> needs_review (no blind resend)
   -> external agent
   -> agent-callback (per-agent HMAC secret, idempotency key)
        -> task comment/status + agent_messages in #agent-team
```

1. **Registry**: extend `agency_personas` to hold all four external agents (`transport`, endpoint, per-agent callback secret ref, enabled flag), linked to `agency_agents` (`provider = external`) and to the matching `agency_members` row. Keep the endpoint service-role only and show masked values in Settings → Personas.
2. **Durable outbox**: new `agent_assignment_outbox` fed by a trigger on `task_assignees`. Stable idempotency key, status pending/claimed/delivered/acked/failed/needs_review, redacted response metadata. Reassign or unassign cancels pending rows.
3. **Worker**: new `agent-wake-worker`, modelled on `jarvis-dispatch` claim + `cron_run_log`, but with a lease and SKIP LOCKED. Adapters reuse `utariPersona.ts` and `mcpClient.ts`, plus a signed-webhook adapter. Pull-only agents get `list_my_assignments` / `ack_assignment` / `post_task_update` tools on the existing OAuth `mcp` server.
4. **Callbacks**: new `agent-callback` endpoint. HMAC per agent, timestamp window, replay-safe idempotency key; it can only touch tasks assigned to that agent. No shared password.
5. **Group chat**: one `agent_channels` row (`kind = agent-team`), with `agent_messages` gaining `from_external_agent`. `@mentions` enqueue a wake into the same outbox. Limits: only mentioned agents wake, a max hop depth per thread (e.g. 3), a per-agent hourly cap, and no agent waking itself. Humans can always post. UI reuses `AgentChannelPane` with a mention picker.
6. **Tests**: idempotent enqueue, concurrent claim, callback auth/replay rejection, cross-agent task denial, mention hop cap.

Ships with every external agent disabled until Zac provides each endpoint and credential and a test wake succeeds.
