# Reporting 5.0 — simple workflow (first pass)

## Goal

**Know what we spent, what it produced, and what needs attention.**

Everything on the dashboard should answer one of those three questions. Anything else is a tool, not reporting.

## Issues actually found in this codebase (before this pass)

1. `src/pages/Index.tsx` built headline totals (`aggregatedMetrics`) from **all** clients in `clientMetrics`
   (database/RPC source), while the client table (`tableMetrics`) overlaid `sheetClientMetrics` on top of the same
   database numbers and rendered only `visibleClients`. Result: headline and rows could disagree in both **source** and
   **client set**, and paused/hidden clients still moved the headline.
2. Sources were silently merged (`{...clientMetrics, ...sheetClientMetrics}`), so a single row could mix sheet and
   database numbers with no label.
3. `useSheetClientMetrics` returned only `{ data, isLoading }`. A client whose sheet failed to load, or had no sheet,
   was indistinguishable from a client with genuinely zero activity.
4. Ratios were computed with `x > 0 ? a / x : 0`, so an undefined denominator rendered as `0` / `0%` rather than "no
   data".
5. `MediaBuyerPage.tsx` described itself as "Autonomous", led with seven legacy run controls that invoke
   `media-buyer-agent`, and carried its own client selector separate from the SOP preview's selector.

## Changes made in this pass

- **New `src/lib/reportingScope.ts`** — single source of truth for a dashboard view: one explicit source
  (`sheet` | `database`), one visible-client set, per-client status (`ok` / `loading` / `error` / `not_configured`),
  aggregate totals summed from included clients only, and ratios that return `null` (rendered as `—`) whenever the
  denominator is missing or zero. Meta platform leads are aggregated separately from CRM leads and never added together.
- **`useSheetClientMetrics`** now also returns `statuses` per client so loading/failed/not-configured clients can be
  excluded and named instead of being counted as zero.
- **`src/pages/Index.tsx`** — headline metrics and the client table now both read `reportingScope`: same source, same
  clients, same dates. Source selection is explicit and persisted (`dashboard.reportingSource`); if no client has a KPI
  sheet configured, the sheet source is not offered.
- **New `src/components/dashboard/ReportingHeadline.tsx`** — goal copy, source selector ("Client sheet" vs "CRM + Meta"),
  coverage label ("N of M clients in view included"), loading/error notices, separate CRM-lead and Meta-lead tiles, and
  an expandable list of clients left out of the totals with the reason. It states plainly that these are stored numbers
  from the selected source and are **not** a live verification against Meta or the CRM.
- **`AppSidebar.tsx`** — reporting-first order (Dashboard, Daily Huddle, Reporting, Creatives, Offers, Tasks) with every
  secondary tool moved under a collapsible **More tools** group. All values, routes, badges and the admin-only Billing /
  Data Audit entries are unchanged; submenu items now support route links so `/setter`, `/whatsapp` and
  `/agent-infrastructure` still work from there.
- **`MediaBuyerPage.tsx`** — one client context for the page, deep-linkable with `?client_id=`, shared with the SOP
  panel (which no longer renders a second selector). The read-only readiness check is the main surface; the seven legacy
  run controls, classifications, creative intel and run history are unchanged but live behind an explicit
  **Advanced / legacy tools** section. The "Autonomous" claim is gone; the page says recommendations require a person.
  The readiness surface still never invokes `media-buyer-agent` and never calls the review endpoint.

## Daily workflow

1. Open **Dashboard**. Pick the date range and the source (client sheet or CRM + Meta).
2. Read the headline: spend, leads (CRM and Meta shown separately), cost per lead, shows, funded.
3. Check the coverage label. If it is not "All N clients in view included", open the list and fix the named client
   (missing sheet, failed load) before trusting comparisons.
4. Scan the client table for the outliers — it uses the same source and the same clients as the headline.
5. For one client that needs work, open **Media Buyer** with that client and read the readiness check and its blockers.

## Definition of done for this pass

- Headline and rows can never use different sources or different client sets.
- No missing, failed or unconfigured client is ever counted as zero.
- Every ratio with an undefined or zero denominator renders `—`.
- Reporting is the first thing in the navigation; every other tool is still reachable at its original destination.
- Media Buyer opens on one client and does not describe itself as autonomous.

## Remaining blockers (NOT fixed — do not claim otherwise)

1. **Source reconciliation** — sheet and CRM/Meta numbers still disagree for the same client and date range; nothing here
   explains or reconciles the difference, it only stops them from being mixed silently.
2. **Multi-account roster consistency** — clients with several Meta ad accounts still depend on `client_ad_accounts`
   rollup flags plus legacy client-level account fields; roster completeness is not verified per client.
3. **Sheets export coupled to sync** — spend reporting to Google Sheets still runs inside `sync-meta-ad-spend`, so a
   sheet write failure or throttle can fail a sync run.
4. **Qualified-lead mapping** — there is no stored qualified-lead definition per client, so CPQL and the SOP's quality
   gates cannot be computed from real data.

## Scope of this pass

Frontend and shared frontend logic only. No schema change, no Edge Function deploy, no live sync or backfill, no
publish, no notification, no ad or budget change, no cron activation.
