

# Comprehensive Sync Overhaul: Meta Ads Daily + GHL/HubSpot Every 6 Hours + Sync Panel Upgrade

## Current State

- **16 active/onboarding clients**, all have GHL API keys
- **Only 3 clients** (Blue Capital, HRT, LSCRE) have their own Meta access token; the rest need the shared token
- **1 client** (Paradyme) uses HubSpot instead of GHL
- **8 clients** have Meta ad account IDs configured but no token -- they are currently skipped
- The `metaApiCallCount` variable is module-level and never resets between warm invocations (bug)
- No `META_SHARED_ACCESS_TOKEN` secret exists yet

---

## Part 1: Meta Ads -- Shared Token + Daily 4 AM PST Sync

### 1a. Add `META_SHARED_ACCESS_TOKEN` Secret
- Prompt you to securely store the shared Graph API token as a backend secret

### 1b. Fix `sync-meta-ads` Edge Function
- Reset `metaApiCallCount = 0` at the top of every request (fixes warm isolate bug)
- Add fallback logic: if a client has no `meta_access_token`, use the `META_SHARED_ACCESS_TOKEN` secret
- Only error if BOTH are missing

### 1c. New `sync-meta-ads-daily` Orchestrator Edge Function
- Queries all active clients with a `meta_ad_account_id`
- Loops through them sequentially with a 30-second delay between each client
- Calls `sync-meta-ads` for each with yesterday's date as start and end
- Returns a summary of successes/failures
- Estimated runtime: ~8 minutes for 10 clients (well within Edge Function limits using `waitUntil`)

### 1d. Cron Job: Daily at 4 AM PST (12:00 UTC)
- Schedule `sync-meta-ads-daily` via `pg_cron` + `pg_net`
- Replaces the current staggered 4-hour Meta sync approach

### 1e. Enable Sync for All Clients with Ad Accounts
- Set `meta_ads_sync_enabled = true` for all clients that have a `meta_ad_account_id`

---

## Part 2: GHL Sync Every 6 Hours (Leads, Calls, Pipelines)

### 2a. New `sync-ghl-all-clients` Orchestrator Edge Function
- Queries all active clients with `ghl_api_key` and `ghl_location_id`
- Skips HubSpot clients (those with `hubspot_portal_id`)
- For each GHL client (sequentially, 15-second delay):
  - Invokes `sync-ghl-contacts` for leads (recent contacts)
  - Invokes `sync-calendar-appointments` for calls/calendar
  - Invokes `sync-ghl-pipelines` for pipeline opportunities
- Logs results per client

### 2b. New `sync-hubspot-all-clients` Orchestrator Edge Function
- Same pattern but for HubSpot clients (currently just Paradyme)
- Invokes `sync-hubspot-contacts` for each

### 2c. Cron Jobs: Every 6 Hours
- GHL orchestrator: `0 0,6,12,18 * * *` (midnight, 6am, noon, 6pm UTC)
- HubSpot orchestrator: `30 0,6,12,18 * * *` (offset by 30 min to avoid overlap)

---

## Part 3: Agency Sync Status Panel Overhaul

### 3a. Add CRM Type Column
- Show "GHL" or "HubSpot" badge per client so it's immediately clear which system is in use
- For HubSpot clients, Calendar and Pipeline columns should reflect HubSpot sync dates (not GHL)

### 3b. Add Missing Integration Columns
- **CRM Contacts**: Already exists (Leads column) -- ensure it shows the correct source
- **Calls/Calendar**: Already exists -- ensure HubSpot clients show their meeting sync status
- **Pipeline**: Already exists -- ensure HubSpot clients show deal sync status
- **Meta Ads**: Already exists
- Add a **"Last Full Sync"** timestamp showing the most recent orchestrator run

### 3c. Health Thresholds Update
- Meta Ads: Healthy if synced within 26 hours (daily sync + buffer), Stale if within 48h, Error if older
- GHL/HubSpot: Keep current thresholds (Healthy <=6h, Stale <=24h, Error >24h)

### 3d. CRM Source Badge
- Each client row shows a small colored badge: "GHL" (blue) or "HS" (purple) next to the client name
- If both are configured, show both

---

## Technical Details

### Files to Create
1. `supabase/functions/sync-meta-ads-daily/index.ts` -- Meta orchestrator
2. `supabase/functions/sync-ghl-all-clients/index.ts` -- GHL orchestrator
3. `supabase/functions/sync-hubspot-all-clients/index.ts` -- HubSpot orchestrator

### Files to Edit
1. `supabase/functions/sync-meta-ads/index.ts` -- Reset counter + shared token fallback
2. `supabase/config.toml` -- Register new functions with `verify_jwt = false`
3. `src/components/dashboard/AgencySyncStatusPanel.tsx` -- Add CRM type badge, update health thresholds for Meta (26h), ensure HubSpot clients show correct sync dates for Calendar/Pipeline columns

### Database Operations (via insert tool, not migrations)
1. Add `META_SHARED_ACCESS_TOKEN` secret
2. Create 3 cron jobs:
   - `daily-meta-ads-sync`: `0 12 * * *` (4 AM PST) calling `sync-meta-ads-daily`
   - `six-hour-ghl-sync`: `0 0,6,12,18 * * *` calling `sync-ghl-all-clients`
   - `six-hour-hubspot-sync`: `30 0,6,12,18 * * *` calling `sync-hubspot-all-clients`
3. Enable `meta_ads_sync_enabled` for all clients with ad account IDs

### Rate Limit Safety
- Meta: 30s delay between clients, yesterday-only = ~15-20 API calls per client, well within 200/hour/token
- GHL: 15s delay between clients, incremental sync only (recent data), respects existing pagination limits
- HubSpot: 100ms request delay already built into existing function

