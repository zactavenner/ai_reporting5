

## Plan: Integrate Agent Workforce Dashboard

### What You Already Have

Your current agents system is solid but basic:

| Component | What It Does |
|-----------|-------------|
| `agents` + `agent_runs` DB tables | Store agent configs and run history |
| `run-agent` edge function | Executes agents: pulls client data (DB, Meta, GHL), calls AI via OpenRouter, posts to Slack, updates metrics |
| `mcp-agent-server` edge function | JSON-RPC MCP server for Claude Code Desktop integration |
| `AgentsTab` component | Simple list/detail view: create, enable/disable, run, delete, view recent runs |
| `useAgents` hooks | CRUD + run mutations, 3 agent templates (Data QA, Creatives Performance, Onboarding QA) |

### What the Uploaded Dashboard Brings

The `agent-workforce-dashboard.jsx` is a more feature-rich agent management UI. Since I can't extract the zip in read-only mode, I'll need to extract and review it in implementation mode. Based on the file name and typical "workforce dashboard" patterns, this likely includes:

- **Workforce overview** with agent status cards, health indicators, and scheduling visibility
- **Run history timeline** with richer output display (not just last 5 truncated)
- **Agent configuration editor** (inline prompt editing, connector toggles, model selection)
- **Scheduling/cron visualization**
- **Performance metrics** per agent (tokens used, success rates, avg run time)

### Integration Plan

**Step 1 — Extract and audit the uploaded file**
- Unzip `agents.zip`, read the JSX file(s), map every component/feature to what already exists

**Step 2 — Migrate to TypeScript and adapt to existing patterns**
- Convert JSX to TSX with proper typing
- Replace any standalone state/API calls with existing `useAgents`, `useAgentRuns`, `useCreateAgent`, `useUpdateAgent`, `useDeleteAgent`, `useRunAgent` hooks
- Use existing UI components (`Card`, `Badge`, `Tabs`, `Button`, etc.) from shadcn/ui
- Wire to existing `agents` and `agent_runs` Supabase tables

**Step 3 — Migrate AI calls from OpenRouter to Lovable AI Gateway**
- The current `run-agent` function uses OpenRouter (requires `OPENROUTER_API_KEY` which isn't in your secrets)
- Switch to `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY` (already configured)
- This fixes agent runs that are currently failing due to missing OpenRouter key

**Step 4 — Replace or enhance the existing `AgentsTab`**
- Swap the current basic `AgentsTab` with the new dashboard components
- Keep the same sidebar nav entry ("Agents" tab)
- Add any new sub-views (e.g., run history, performance analytics) as tabs within the agent section

**Step 5 — Add missing DB columns if needed**
- If the dashboard references fields not in the current schema (e.g., `last_run_at`, `success_rate`, `avg_tokens`), add them via migration
- These would be computed/cached fields updated by the `run-agent` function

### Technical Details

- **No new edge functions needed** — the existing `run-agent` and `mcp-agent-server` cover all backend needs
- **AI Gateway fix** is critical — without it, no agent can actually run (OpenRouter key is missing from secrets)
- **Database**: `agents` table has: `id, name, description, icon, prompt_template, schedule_cron, schedule_timezone, model, client_id, connectors, enabled, template_key, created_at, updated_at`
- **Database**: `agent_runs` table has: `id, agent_id, client_id, status, started_at, completed_at, input_summary, output_summary, actions_taken, error, tokens_used`

