

## Plan: Deploy All Agent Templates and Show Active Agents

### Current State
- 8 agent templates defined in code (AI COO, Operations, Sales, Call Analysis, Client Success, Marketing, Data QA, Finance)
- Only 1 agent exists in the database: "New Agent" (enabled, model: openai/gpt-5)
- The AgentsTab UI already shows active/inactive badges and has full CRUD
- The `run-agent` edge function is wired to the Lovable AI Gateway and works

### What This Plan Does

**Step 1 -- Create all 8 template agents in the database**
- Write a migration that inserts all 8 agents from `AGENT_TEMPLATES` (AI COO/JARVIS, OPS, HUNTER, ANALYST, KEEPER, BROOKLYN, Data QA, LEDGER)
- Each gets its predefined prompt, schedule, model, connectors, and icon
- All start with `enabled = true` so they're live immediately
- Use `ON CONFLICT DO NOTHING` on `template_key` to avoid duplicates

**Step 2 -- Add "Active Agents" summary section to the dashboard**
- Add a new prominent section at the top of `AgentsTab` showing all currently active/enabled agents as status cards in a grid
- Each card shows: icon, name, schedule, last run time, last run status (color-coded), and a quick toggle to disable
- This gives an at-a-glance view of the entire live workforce without clicking into each agent

**Step 3 -- Prevent duplicate template creation**
- Update `handleCreateFromTemplate` to check if an agent with the same `template_key` already exists before creating
- Show a toast warning if the template agent already exists

### Technical Details
- Migration: `INSERT INTO agents (name, icon, description, prompt_template, schedule_cron, model, connectors, enabled, template_key)` for all 8 templates
- UI: New grid section filtered to `agents.filter(a => a.enabled)` rendered above the existing agent list
- No new edge functions or tables needed

