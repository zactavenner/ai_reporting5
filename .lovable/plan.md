

# Daily Accuracy Assurance System

## Summary

Build a standalone metrics reconciliation system that runs independently of the sync pipeline, ensuring `daily_metrics` always matches source-of-truth tables (`leads`, `calls`, `funded_investors`) while preserving Meta Ads data. This addresses 6 identified accuracy gaps including a critical bug where the current recalculation deletes ad spend data on days with zero CRM activity.

---

## Critical Bug Found

The existing `recalculateRecentMetrics` function (line 2751-2886 of `sync-ghl-contacts`) **deletes** all `daily_metrics` rows for the last 7 days, then only re-inserts rows where CRM activity exists. Any day with Meta ad spend but zero leads/calls/funded loses its ad_spend, impressions, and clicks data permanently. This must be fixed as part of this work.

---

## What Gets Built

### 1. New `recalculate-daily-metrics` Edge Function (Highest Priority)

A standalone function that recalculates CRM-sourced columns in `daily_metrics` for all active clients across a configurable date range, **without touching ad spend columns**.

Logic per client per date:
- Count non-spam leads from `leads` where `created_at` falls on that date
- Count spam leads separately
- Count booked calls (non-reconnect) from `calls` where `booked_at` falls on that date
- Count showed calls (non-reconnect) where `showed = true`
- Count reconnect calls and reconnect showed
- Sum funded investors and funded dollars from `funded_investors` where `funded_at` falls on that date
- **UPSERT** into `daily_metrics` using `ON CONFLICT (client_id, date)` -- only updating CRM columns, never overwriting `ad_spend`, `impressions`, `clicks`, or `ctr`

The function accepts optional `startDate`, `endDate`, and `clientId` parameters. Defaults to yesterday + today for all active clients.

### 2. New `daily-accuracy-check` Edge Function

A validation function that compares `daily_metrics` against live source table counts for yesterday across all clients. For each discrepancy found:
- Logs it to a new `sync_accuracy_log` table
- Triggers recalculation for that specific client/date
- Returns a summary of discrepancies found and auto-fixed

### 3. New `sync_accuracy_log` Database Table

```text
Columns:
- id (uuid, PK)
- client_id (uuid)
- check_date (date) -- the date being validated
- metric_type (text) -- 'leads', 'calls', 'showed_calls', 'funded_investors', etc.
- expected_count (integer) -- from source tables
- actual_count (integer) -- from daily_metrics
- discrepancy (integer) -- difference
- auto_fixed (boolean)
- created_at (timestamptz)
```

### 4. Fix `recalculateRecentMetrics` in Both Sync Functions

Change the DELETE + INSERT pattern to an UPSERT pattern that preserves ad spend columns. Instead of deleting rows and re-inserting, it will upsert only CRM columns (leads, calls, showed, funded, etc.) while leaving ad_spend/impressions/clicks/ctr untouched.

This fix applies to:
- `supabase/functions/sync-ghl-contacts/index.ts` (lines 2751-2893)
- `supabase/functions/sync-hubspot-contacts/index.ts` (same pattern)

### 5. New Cron Jobs

| Job | Schedule | What it does |
|-----|----------|--------------|
| `daily-metrics-recalculate` | `0 13 * * *` (5 AM PST) | Runs `recalculate-daily-metrics` for yesterday + today |
| `daily-accuracy-check` | `0 14 * * *` (6 AM PST) | Runs `daily-accuracy-check` to validate and auto-fix |

### 6. Fix Pipeline Funded Investor External ID

Normalize the `external_id` in the pipeline-based funded investor creation path to always use `contactId` (not `opp.contactId + opp.id`), consistent with the tag-based path. The existing unique constraint on `(client_id, external_id)` will then properly prevent duplicates across both paths.

### 7. Accuracy Health in Agency Sync Panel

Add a small accuracy indicator to `AgencySyncStatusPanel.tsx`:
- Show last accuracy check timestamp
- Show discrepancy count from yesterday
- Green if 0 discrepancies, yellow if auto-fixed, red if unfixed

---

## Files to Create

1. `supabase/functions/recalculate-daily-metrics/index.ts`
2. `supabase/functions/daily-accuracy-check/index.ts`

## Files to Modify

1. `supabase/functions/sync-ghl-contacts/index.ts` -- Fix `recalculateRecentMetrics` to use upsert instead of delete+insert; fix pipeline funded investor external_id
2. `supabase/functions/sync-hubspot-contacts/index.ts` -- Same upsert fix for its copy of `recalculateRecentMetrics`
3. `supabase/config.toml` -- Register 2 new functions with `verify_jwt = false`
4. `src/components/dashboard/AgencySyncStatusPanel.tsx` -- Add accuracy health indicator

## Database Changes

1. Create `sync_accuracy_log` table (via migration)
2. Add 2 new cron jobs (via insert tool, not migration)

## Existing Cron Jobs to Keep

The existing hourly sync jobs (GHL contacts, calendar, pipelines, HubSpot) and the 6-hour orchestrators remain unchanged. The new daily recalculation runs *after* all syncs complete, acting as a safety net.

---

## Implementation Order

1. Fix the critical `recalculateRecentMetrics` bug (upsert pattern) in both sync functions
2. Create `sync_accuracy_log` table
3. Build `recalculate-daily-metrics` edge function
4. Build `daily-accuracy-check` edge function
5. Register functions in config.toml
6. Add cron jobs
7. Fix pipeline funded investor dedup
8. Add accuracy health to sync panel

