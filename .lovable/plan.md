

# Meta Leads + CRM Leads: Best Strategy for Accurate Data Pull

## Current Architecture (What You Have)

```text
┌────────────────────────┐     ┌────────────────────────┐
│   META ADS API         │     │   GHL CRM API          │
│  (spend, impressions)  │     │  (contacts, calls)     │
└──────────┬─────────────┘     └──────────┬─────────────┘
           │                              │
     ┌─────▼──────┐              ┌────────▼─────────┐
     │ sync-meta- │              │ sync-ghl-contacts│
     │ ads (cron) │              │ (cron + webhook) │
     └─────┬──────┘              └────────┬─────────┘
           │                              │
     ┌─────▼──────┐              ┌────────▼─────────┐
     │daily_metrics│◄────────────│ leads / calls    │
     │(ad_spend)   │  recalculate│ tables           │
     └─────────────┘  daily      └──────────────────┘
                      metrics
```

## The Problem I Found

Your data is currently flowing through **two separate paths** that aren't always in sync:

1. **Meta Ads sync** → writes `ad_spend` to `daily_metrics` ✅ Working (11 completed today)
2. **GHL sync** → writes to `leads` table ✅ Working (48 leads today across 5 clients)
3. **`recalculate-daily-metrics`** → reads from `leads` table and writes `leads` count to `daily_metrics` ⚠️ **Timing gap**: many clients show `leads: 0` but `leads_created: 5` (JJ Dental, LSCRE, Titan)

The recalculation runs but the `leads` column isn't matching `leads_created` — both should be the same value. Also, 89 GHL sync runs are stuck in "running" status.

## Recommended Strategy: Webhooks + API (Hybrid)

**Answer: Yes, use both.** Here's the plan:

### What To Fix

1. **Fix the `leads` vs `leads_created` mismatch** — Both columns currently get the same value in `recalculate-daily-metrics` (line 188 and 198 both set to `totalValidLeads`), but `leads` is showing 0 for clients where `leads_created` shows correct counts. This suggests the upsert is being overwritten by another process or there's a column-ownership conflict.

2. **Add webhook-triggered metric refresh** — When `webhook-ingest` receives a contact webhook and triggers a single-contact sync, it should also trigger a quick `recalculate-daily-metrics` for just that client + today's date. This gives near-real-time lead counts.

3. **Clean up stuck sync runs** — 89 GHL sync runs stuck as "running" from the last 48 hours, plus 2 `sync-ghl-all-clients` and 2 `sync-meta-ads-daily` also stuck.

4. **Add a safety net** — After the daily master sync completes, automatically run `recalculate-daily-metrics` for the last 3 days to catch any stragglers.

### Implementation Steps

**Step 1: Fix webhook-ingest to trigger metric refresh**
- After the single-contact sync completes in `webhook-ingest`, fire a follow-up call to `recalculate-daily-metrics` for that client + today
- This ensures every new lead from a webhook immediately updates the dashboard

**Step 2: Debug and fix the leads column overwrite**
- Investigate if `sync-meta-ads` or another process is zeroing out the `leads` column when it writes `ad_spend`
- Add explicit column-level guards so Meta sync never touches CRM columns

**Step 3: Auto-close stale sync runs**
- Add a cleanup step in `daily-master-sync` that marks any sync_run older than 2 hours as "timed_out"

**Step 4: Add retry + error logging to recalculate-daily-metrics**
- Wrap each client's recalculation in a try/catch with retry
- Log failures to `sync_errors` table for visibility in the Sync Health dashboard

### Technical Details

- **Webhook path** (real-time): GHL webhook → `webhook-ingest` → `sync-ghl-contacts` (single) → `recalculate-daily-metrics` (single client, today)
- **API path** (scheduled): `daily-master-sync` → `sync-ghl-all-clients` → `recalculate-daily-metrics` (all clients, last 3 days)
- **Meta path** (unchanged): `sync-meta-ads-daily` → writes `ad_spend` directly to `daily_metrics`
- Column ownership enforced: Meta sync only writes spend columns, CRM sync only writes lead/call columns

