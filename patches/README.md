# Patches for Large File Changes

These patches contain changes to two large files that couldn't be pushed via git due to proxy issues.

## How to Apply

```bash
git apply patches/sync-meta-ads.patch
git apply patches/audit-panel.patch
```

## What They Change

### sync-meta-ads.patch
- Adds `action_attribution_windows=["7d_click","1d_view"]` to ALL Meta insights API calls
- Adds `actions` + `action_values` fields to daily/campaign/adset/ad insights
- Adds `getAdAccountTimezone()` helper with 24h cache in `meta_ad_accounts` table
- Adds `getDateInTimezone()` for timezone-aware date math
- Logs every Meta API call to `meta_api_calls` table (fire-and-forget)
- Writes `sync_runs` row on success/failure for observability
- Writes `reach` + `frequency` + `date_account_tz` to `daily_metrics`

### audit-panel.patch
- Wires refresh button to actually call `daily-accuracy-check` edge function
- Fetches live data from `sync_accuracy_log` table via TanStack Query
- Shows live discrepancy and auto-fix counts alongside baseline data
