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
- **AI is blocked on incomplete data.** The AI summary button is replaced by the reason it
  is paused, and AI Review shows a banner naming what did not load.
- **Refresh means reload.** The button is labelled *Reload saved data* and its message says
  no sync ran. Pulling new numbers from Meta / CRM is still the separate *Sync Yesterday*.
- **Date presets** Last 7 / 14 / 30 / 90 Days are recognised on inclusive spans (6/13/29/89
  days back from yesterday), so the active preset no longer fails to highlight.
- **Received funding excludes commitments** in the shared `get_client_source_metrics` RPC
  and in the agent's context. Commitment dollars remain a separate figure.
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
| Meta leads | Only counts attributed by the Meta API. |
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
