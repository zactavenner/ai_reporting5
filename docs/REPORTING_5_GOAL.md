# Reporting 5.0 — goal and current state

## Goal

Zac or a media buyer opens a client, understands whether the numbers can be trusted, and
decides the next action in under five minutes.

Screen copy: **Know what we spent, what it produced, and what needs attention.**

## What this pass changed

- **Five everyday choices** in the sidebar: Clients, Tasks, AI Review, Top Creatives,
  Connections. Everything else stays available under **More tools** / **Settings** with the
  same routes and the same permission checks.
- **One source, one client population.** Headline totals, the client rows, the CSV export
  and the AI context all read the single explicitly selected source (client KPI sheet, or
  stored CRM + Meta) for the selected dates and the same visible clients. No silent merge,
  no silent fallback to the other source when the selected one fails.
- **Errors are not zero.** A client that is still loading, failed, or has no data for the
  selected source is excluded and named, never counted as 0. The CSV marks it `excluded`.
- **Core KPIs first.** A short set of core tiles is always visible; the wider diagnostic
  and ad-platform metrics sit behind an expandable section.
- **AI is blocked, not merely warned, on incomplete data.** AI Review withholds the whole
  tab and states the reason while any visible client is loading, failed, or has no data for
  the selected source. When it does run, it receives only the included clients plus the
  selected source and dates. The all-clients "AI Summary" button was removed from this
  screen: its backend picks its own sheet-based client set (capped at 25) and cannot honour
  the selected source, the paused-client toggle or the excluded clients. The per-client
  summary on the client page is unaffected.
- **Failed database reads are visible.** `useAllDailyMetrics` and `useClientSourceMetrics`
  now reject instead of resolving to an empty array, so a failure (including a failed
  refetch over a stale cache) marks every visible client `error`. A client with no row in
  the CRM aggregate is marked `not_configured`, never zero-filled.
- **Refresh means reload.** The button is labelled *Reload saved data* and its message says
  no sync ran. Pulling new numbers from Meta / CRM is still the separate *Sync Yesterday*.
- **Date presets** Last 7 / 14 / 30 / 90 Days are recognised on inclusive spans (6/13/29/89
  days back from yesterday), so the active preset no longer fails to highlight.
- **Received funding excludes commitments** in the shared `get_client_source_metrics` RPC,
  in the production client-side aggregator (`aggregateFromSourceData`) — including funded
  counts and the time/calls-to-fund averages — and in the agent's context. Commitment dollars remain a separate figure.
- **Agent runner**: core reporting queries now fail loudly instead of defaulting to zero;
  the non-existent `daily_metrics.funded` column was replaced with `funded_investors` /
  `funded_dollars`; model-proposed metric corrections are queued in `approval_queue` as
  review proposals and are never written into `daily_metrics`. Shadow mode, monthly budget
  checks and the OpenRouter configuration are unchanged.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Ad spend | Spend recorded in the selected source for the selected dates. |
| Contactable CRM leads | Non-spam CRM records that have **both** an email and a phone. Not Meta leads, not qualified, not accredited. |
| Meta leads | Only a count attributed by the Meta API. **No tile on the dashboard shows one.** The stored `daily_metrics.leads` column is written by `recalculate-daily-metrics` from CRM data, so it is labelled *Stored daily leads (CRM-derived)* and is only shown when the CRM + Meta source is selected. |
| Leads (as mapped in sheet) | Whatever column the client's sheet mapping points at. It does not claim the contactable email+phone definition. |
| Ad-platform spend / impressions / clicks | From the Meta ad-spend sync. |
| Cost per contactable CRM lead | Ad spend ÷ contactable CRM leads. |
| Received funding | Sum of positive `funded_amount` only. |
| Funded investors | Investors with a positive `funded_amount`. |
| Commitments | Pledged `commitment_amount`. Never counted as received funding. |
| Ratios | Computed from summed numerators and denominators. No denominator shows an em dash; genuine zero spend with outcomes shows 0. |

## Still required (not fixed by this pass)

1. **Live source reconciliation** — stored numbers have not been proven equal to Meta / the
   CRM. Nothing on screen claims verified API accuracy; a fetch timestamp is not proof.
2. **Multi-account Meta roster consistency** — a client with several ad accounts still
   depends on the rollup flags being right per account.
3. **Sheets export is coupled to sync** — exporting to a client sheet still happens inside
   the spend sync rather than as its own step.
4. **Qualified-lead mapping** — there is no stored qualified/accredited definition, so no
   qualified-lead KPI or cost-per-qualified-lead can be shown honestly yet.

## Verification status of this pass

- Applied: one minimal migration replacing `get_client_source_metrics` on this project's
  own Cloud database. `ORIGINAL_SUPABASE_URL` / `ORIGINAL_SUPABASE_SERVICE_ROLE_KEY` are
  not set, so there is no alternate SQL target and no ambiguity. No raw source records
  were changed.
- Applied: the patched `run-agent` Edge Function was deployed. Deployment was verified by
  a reachability probe only (a bodyless request is rejected before any agent work); no
  production agent run was invoked.
- Not done: frontend is unpublished, no production sync, agent run, notification, campaign
  or budget change was performed.
- Checks run: app and edge typechecks pass; `reporting-scope` and `connections-display`
  suites pass (35 tests); production build succeeds.

## Scope enforcement in AI Review and the table (latest pass)

- Any EXPLICIT per-client status other than `ok` (including `not_configured`) is
  authoritative: a cached or stale value can never re-include that client, and AI stays
  blocked while the scope is incomplete.
- Cost/ratio cells are denominator-aware: unknown or zero denominator renders an em dash;
  a positive denominator with zero spend renders a real 0.
- AI Review passes the explicit reporting scope (source, dates, included client IDs) into
  the chat. In this scoped mode the full-portfolio context endpoint — which refetches its
  own portfolio and dates — is disabled; the request goes to `ai-analysis`, which uses only
  the context supplied to it. The chat resets when the scope changes, so answers about
  older clients or dates cannot carry over. Full-portfolio context remains available in the
  legacy (unscoped) AI tools.
- CSV: sheet-sourced leads export as `leads_as_reported_in_sheet`; only stored CRM counts
  export as `contactable_crm_leads`.
