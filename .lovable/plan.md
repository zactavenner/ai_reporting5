

# Plan: Connect Google Sheet as a metrics source for Blue Capital

Replace database-derived KPIs with values pulled live from your Google Sheet for **Blue Capital**, with a toggle to flip between **Sheet** and **Database** so you can compare. Defaults to **Sheet** since you trust it more right now.

## What you'll see

On the Blue Capital client view (and its public report), a new **Data Source** toggle in the header:

```text
Data Source:  [ ● Sheet (live) ]   [ ○ Database ]      Last synced: 2m ago
```

- **Sheet (default):** KPI cards, Cost-Per metrics, and the funnel are computed from the Google Sheet.
- **Database:** current behavior (leads/calls/funded tables).
- A small "Last synced" timestamp + manual **Refresh** button next to the toggle.
- Toggle preference is remembered per-browser; defaults to **Sheet** for Blue Capital until you change it.

Only Blue Capital is wired up in this pass (per your request). The architecture is generic so we can attach a sheet to any other client later by just pasting a URL.

## How it works

1. **Link the Google Sheets connector** (`zactavenner.com`) to this project so the backend can read the sheet through Lovable's authenticated gateway.
2. **Store the sheet binding** on the client (new `client_settings` columns):
   - `metrics_sheet_id` — `10ETeNuyi0dxHjCMyymrros1jDKyH6HKMwP4QVSBpZU0`
   - `metrics_sheet_gid` — `825433383`
   - `metrics_sheet_range` — auto-detected, overridable
   - `metrics_source_default` — `'sheet' | 'database'` (set to `'sheet'` for Blue Capital)
3. **New edge function `fetch-sheet-metrics`** reads the tab via the Google Sheets gateway, parses it into a normalized shape (date, ad_spend, leads, spam, calls, showed, reconnects, commitments, funded count, funded $, etc.), and returns daily rows + aggregated totals filtered by the active date range.
4. **New hook `useSheetMetrics(clientId, dateRange)`** calls the function, caches with React Query (5-min stale time), and exposes `{ daily, aggregated, lastSyncedAt, refresh }`.
5. **New `useActiveMetrics(clientId, dateRange)`** wrapper picks Sheet vs Database based on the toggle and returns the same shape `KPIGrid` / `MetricChartsGrid` / funnel components already consume — no changes needed in those components.
6. **Toggle UI** added to `ClientDetail.tsx` and `PublicReport.tsx` headers; preference stored in `localStorage` keyed by client id.

## Column mapping (auto + override)

The function detects headers case-insensitively. Recognized aliases:

| Internal field      | Accepted header names                          |
|---------------------|------------------------------------------------|
| date                | Date, Day                                      |
| ad_spend            | Spend, Ad Spend, Total Spend                   |
| leads               | Leads, Total Leads                             |
| spam_leads          | Spam, Bad Leads                                |
| calls               | Calls, Booked Calls                            |
| showed              | Showed, Shows                                  |
| reconnects          | Reconnects, Reconnect Calls                    |
| commitments         | Commitments, Committed                         |
| commitment_dollars  | Commitment $, Committed $                      |
| funded              | Funded, Funded Investors                       |
| funded_dollars      | Funded $, Capital Raised                       |

Cost-per metrics (CPL, Cost/Call, Cost/Show, CPA, CoC%) are derived from the sheet rows the same way they're derived from DB today, so all KPI cards and sparklines stay consistent.

If the sheet's columns don't match cleanly, an admin "Edit mapping" link opens a small modal to map columns manually (saved to `client_settings.metrics_sheet_mapping`).

## Technical details

- **Migration:** add 5 columns to `client_settings` (`metrics_sheet_id`, `metrics_sheet_gid`, `metrics_sheet_range`, `metrics_source_default`, `metrics_sheet_mapping jsonb`). Seed Blue Capital with the sheet ID/GID above and `metrics_source_default = 'sheet'`.
- **Connector link:** `standard_connectors--connect` for `google_sheets` using `std_01kpv10952e7zv643cb2kkfbzh` (zactavenner.com).
- **Edge function `fetch-sheet-metrics`:** GET `${GATEWAY_URL}/spreadsheets/{id}?fields=sheets(properties(sheetId,title))` to resolve gid → sheet title, then `GET /spreadsheets/{id}/values/{Title}` (no `encodeURIComponent` on range per Sheets connector rules). Normalizes rows, returns `{ daily: DailyMetric[], aggregated: AggregatedMetrics, sheetTitle, fetchedAt }`. CORS + Zod validation on body.
- **Hooks:** `useSheetMetrics.ts` (React Query, key `['sheet-metrics', clientId, start, end]`), `useActiveMetrics.ts` (selects source). `useMetricsSourcePreference(clientId)` for localStorage toggle defaulting to `client_settings.metrics_source_default`.
- **UI:** `<MetricsSourceToggle />` component dropped into the page headers of `ClientDetail.tsx` and `PublicReport.tsx`. KPI/Charts/Funnel components stay as-is — they receive the merged metrics object.
- **No removal** of database-derived metrics; Database mode still works exactly as today, enabling side-by-side comparison.

## Out of scope (flag for later)

- Auto-syncing sheet rows into `daily_metrics` (write-back) — we only read for now.
- Wiring other clients' sheets (drop-in once the binding fields are populated; no code change).
- Sheet-driven leads/calls record tables — only KPI/charts/funnel come from the sheet.

