

# Plan: Fix Agents Scheduler + Repair Slack Integration

## Critical issues found

**Agents**
1. **No scheduler running** — `cron.job` has no entry for `run-agent`. Every agent has a `schedule_cron` string in the UI, but nothing actually executes it. Last successful run was Apr 11–14 (manual). `agent_runs` for the last 7 days is empty.
2. **Wrong CRON in templates** — KEEPER set to `0 * * * *` (every hour, very expensive), JARVIS at `5,35 * * * *` (twice/hour). These will burn tokens once the scheduler is wired up.
3. **No cost tracking** — `cost_usd` is hardcoded to `0`. Token usage is captured but never priced.
4. **No timeout / parallel run guard** — `run-agent` loops over every active client sequentially. With 20+ clients × 8 agents this can exceed the 150s edge limit. No "already running" check, so cron + manual click can double-fire.
5. **Failure recovery hole** — auto-disable at 3 failures works, but there is no Slack/email alert when it triggers. Agent silently turns off.
6. **Duplicate template** — Two "Call Analysis Agent (ANALYST)" rows exist in DB.

**Slack**
1. **Missing tables** — `slack_channel_mappings` and `slack_activity_log` do not exist in the database. The Slack Chat Tab, channel mapping settings, and `slack-sync-channels` function all silently fail (queries return errors swallowed by `enabled` flags).
2. **No event ingestion** — `slack-events` function exists but has no Slack app webhook configured (no logs ever).
3. **Two notification paths competing** — `slack-notify` (per-client mappings) and `send-task-review-slack` (uses `client_settings.slack_review_channel_id`) both try to notify, but the mapping table doesn't exist so the first one fails for every client.
4. **No per-channel re-sync schedule** — `slack-sync-channels` is built to pull message history but there's no cron job calling it.

## What I will build

### Part 1 — Agents

1. **Create the missing scheduler** — add a single pg_cron job (`agent-scheduler`, every 5 min) that calls a new `agent-scheduler` edge function. The function reads `agents` where `enabled=true`, evaluates each agent's `schedule_cron` against the current minute (using a lightweight cron matcher), and invokes `run-agent` per due agent. Records `last_scheduled_at` to prevent duplicate fires within the same minute.
2. **Add concurrency guard** — `run-agent` checks for an existing `agent_runs` row with `status='running'` started < 10 min ago for the same `(agent_id, client_id)` and skips. Also stamps a `started_at` upfront.
3. **Cost calculation** — add a small price table per model (gemini-2.5-flash, pro, gpt-5, etc.) and compute `cost_usd = input_tokens × in_rate + output_tokens × out_rate`. Surface 24h and 7d spend in the AgentsTab stats card (replace the second "Escalations" card).
4. **Auto-disable alert** — when `consecutive_failures` reaches 3 and an agent is disabled, post a Slack DM to the agency owner and insert an `agent_escalations` row (severity=high) so it shows in the UI.
5. **Sane default schedules** — update `AGENT_TEMPLATES`: KEEPER → `0 9 * * *`, JARVIS → `0 7,17 * * *`, OPS → `0 */4 * * *`, BROOKLYN → `0 11 * * *`. Keep heavy daily ones as-is.
6. **Dedupe** — remove the orphan duplicate ANALYST row (`ba5ebac2…`, never run).
7. **Currently-running indicator** — AgentsTab shows a pulsing dot on agents with an active run row.

### Part 2 — Slack

1. **Create the missing tables** via migration:
   - `slack_channel_mappings` (id, client_id, channel_id, channel_name, channel_type, monitor_messages, auto_create_tasks, last_synced_at, timestamps) with unique `(client_id, channel_id)` and RLS.
   - `slack_activity_log` (id, client_id, channel_id, event_type, message_ts, user_id, user_name, text, is_bot, ai_analysis jsonb, created_at) with RLS + index on `(client_id, created_at desc)` and `(channel_id, message_ts)`.
2. **Wire `slack-sync-channels` to a cron** — every 15 min, sync channels where `monitor_messages=true`. Stores cursor in `slack_channel_mappings.last_synced_at`.
3. **Unify notification paths** — make `slack-notify` the single source of truth. Have `send-task-review-slack` and `slack-daily-report` call into it (or share the same channel-resolution helper) so a missing mapping cleanly falls back to `client_settings.slack_review_channel_id`.
4. **Auto-create-tasks safety** — currently `slack-sync-channels` calls Gemini for every monitored channel. Add a per-channel `auto_create_tasks` gate (already in schema) and a daily token cap per client to prevent runaway costs.
5. **Channel sync UI fix** — the "Sync" buttons in `SlackChannelMappingSection` and `SlackChatTab` work once the tables exist; add a friendly empty-state if `useSlackChannels` returns 0 (caused by the Slack connector not having `channels:read`).
6. **Verify connector scopes** — surface a banner if the Slack connection is missing required scopes (`channels:history`, `channels:read`, `chat:write`, `users:read`) using `get_connection_configuration`, with a one-click reconnect.

## Files

**New**
- `supabase/functions/agent-scheduler/index.ts`
- `supabase/migrations/<ts>_slack_tables_and_agent_cost.sql` (creates `slack_channel_mappings`, `slack_activity_log`, adds `agents.last_scheduled_at`, `agent_runs.cost_usd` already exists)
- `src/components/slack/SlackHealthBanner.tsx`

**Modified**
- `supabase/functions/run-agent/index.ts` — concurrency guard, cost calc, auto-disable alert
- `supabase/functions/slack-notify/index.ts` — fallback to `client_settings` when no mapping
- `src/hooks/useAgents.ts` — updated template schedules, remove duplicate, add cost in stats
- `src/components/agents/AgentsTab.tsx` — running indicator, 24h/7d cost tile
- `src/components/settings/SlackChannelMappingSection.tsx` — empty-state + scope banner
- `src/components/slack/SlackChatTab.tsx` — empty-state when tables empty

**Cron jobs added (via insert tool, not migration)**
- `agent-scheduler` — `*/5 * * * *` → `agent-scheduler` function
- `slack-channel-sync` — `*/15 * * * *` → `slack-sync-channels` function

## Out of scope (flag for later)
- Per-end-user Slack OAuth (current connector authenticates the agency owner only)
- Receiving Slack events (mentions, replies) — would require disconnecting the Lovable Slack connector and creating a custom Slack app

