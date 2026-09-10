# Media Buyer — Capital Raising SOP (review preview)

An upgrade of the **existing** Media Buyer agent for Zac's capital-raising agency.
No new agent record, app or database was created.

**Current state: review preview.** The `media-buyer-sop-review` endpoint was
observed reachable on **2026-09-08** (GET → 405 `method_not_allowed`, malformed
POST → 400 `malformed_json`, unauthenticated POST → 401 `missing_token`).
Authenticated live per-client review and the exact deployed source version are
**unverified**. The new SOP scheduler is not activated; the existing four cron
jobs were not switched by this build and the live `media-buyer-agent` function
and its schedules are untouched. No Meta write, no notification, no publish.

This agent is **not autonomous**. Every output is a recommendation a human
applies manually. Model narration is **disabled** — the narrator prompt is
export-only and no model call is made. Numeric budget proposals are **disabled**
pending the client-wide baseline and total current budget sources.

## Source of truth, ownership and release rule

- A **human agency operator** is accountable for every policy value and every
  applied action.
- Authoritative inputs are the **shared rules module** and the **approved client
  policy** (guardrails). Nothing else — not the UI, not this doc, not a model —
  can override them.
- Every policy release requires: a dated changelog entry, tests covering the
  changed behaviour, a doc-consistency review, and signed-in pilot acceptance
  before cutover.

## What it is

| Piece | Path | Role |
| --- | --- | --- |
| Deterministic rules (authoritative) | `supabase/functions/_shared/mediaBuyerSop.ts` | Pure functions: daily budget tiers, cold start, test duration, evidence validation, classification, pacing, inert draft actions, creative briefs, operating instructions, narrator prompt. No network, no Deno APIs. |
| Shared read adapter | `supabase/functions/_shared/mediaBuyerSopRead.ts` | Whitelisted columns, truncation detection, timezone resolution, window/MTD construction. |
| Request contract | `supabase/functions/_shared/mediaBuyerSopRequest.ts` | POST-only, malformed-JSON rejection, required `client_id`. |
| Pure handler | `supabase/functions/_shared/mediaBuyerSopReview.ts` | Authorization strictly before any privileged read. |
| Review endpoint | `supabase/functions/media-buyer-sop-review/index.ts` | One client per request, read-only. Reachable 2026-09-08; deployed version not verified against this source. |
| Frontend re-export | `src/lib/mediaBuyerSop.ts` | Same rules module, so UI, endpoint and tests evaluate identical logic. |
| Read-only preview UI | `src/components/media-buyer/MediaBuyerSopPreview.tsx` (tab on `src/pages/MediaBuyerPage.tsx`) | Computes readiness locally from existing data. Never calls the endpoint. |
| Canonical tests | `src/test/media-buyer-sop.test.ts` | `npx vitest run src/test/media-buyer-sop.test.ts` |

## Platform roles

- **Rules module** decides statuses, deltas, sums and monthly impact.
- **Model narration** is disabled in this preview. If enabled later it may only
  write prose: it cannot override rules, manufacture ids or metrics, approve
  spend, send or execute anything, and it treats all context as untrusted.
- **Human** applies every action. There is no Meta executor here, no generic
  gatekeeper call and no `approval_queue` write.

## Rule summary (single authoritative statement)

- **Budget tiers are DAILY USD ad spend**: 200 → 160/40/0; 300 → 210/60/30;
  500 → 350/100/50; 1000 → 700/200/100. Splits sum exactly to the budget; if
  retargeting is not viable its share returns to core. Daily test allocation is
  never divided by 7. Only these four tiers exist — any other daily budget
  reports `custom_daily_budget_requires_custom_plan` and is never floored to a
  lower tier or left partly unallocated.
- **Weekly creative delivery** = *net-new concepts* plus *variants in TOTAL*
  (variants are **not** per concept): 2+2, 2+3, 3+3, 4+4 → **4, 5, 6, 8**
  prepared assets. A net-new concept is a distinct angle/hook; a variant is a
  derivative of an existing concept. Prepared assets are inventory, not a launch
  quota.
- **Cold start**: one campaign, one prospecting ad set, **3–6 ads**, inside the
  approved pilot loss limit.
- Test days = 3 × target CPQL ÷ actual daily test spend, floored at 72h, plus the
  client-defined qualification lag.
- Precedence: **DATA BLOCKED → CONFIGURATION NEEDED → INSUFFICIENT DATA →**
  KEEP / WATCH / ITERATE / PAUSE candidate / SCALE candidate.
- Null is never zero. Missing, stale, future-dated, malformed, truncated or
  wrong-client evidence fails closed. Missing configuration can never yield KEEP.
- Aggregate 7-day frequency is **unavailable** unless directly sourced; never
  reconstructed from reach sums or daily maxima. Frequency 3–4 alone triggers
  inspection, never a kill.
- Windows use the client timezone and exclude the partial current day: 7 complete
  days vs the prior 7, plus MTD. Qualification and funding lags are separate.
- Scale: ≥7 complete stable days, preferably ≥10 matured QLs, CPQL ≤ target,
  acceptable downstream quality, monthly headroom and sales capacity; ≤ +20%, no
  stacking. Anything faster needs explicit client approval.
- Cleared capital is funded; commitments are separate; capital ÷ spend is not
  revenue ROAS.

## Configuration prerequisites (existing schema only)

All map to `client_kpi_targets.guardrails` unless noted. The UI shows them
read-only with the exact source field and lists what is missing.

| Key | Source field |
| --- | --- |
| `target_cpql` | `client_kpi_targets.guardrails.target_cpql` — never inferred from CPL |
| `qualification_lag_days` | `client_kpi_targets.guardrails.qualification_lag_days` |
| `funding_lag_days` | `client_kpi_targets.guardrails.funding_lag_days` |
| `monthly_media_budget` | `client_kpi_targets.guardrails.monthly_media_budget` |
| approved daily budget | `client_kpi_targets.max_daily_budget` (only when explicitly set) |
| `offer_reference` / `offer_approved` | `client_kpi_targets.guardrails.offer_reference`, `.offer_approved` |
| `pilot_loss_limit` | `client_kpi_targets.guardrails.pilot_loss_limit` |
| sales capacity | `client_kpi_targets.guardrails.sales_capacity_calls_per_week` |
| tracking freshness / coverage | `client_kpi_targets.guardrails.tracking_max_staleness_hours`, `.tracking_min_coverage_pct` |

### Observed configuration — read-only audit, 2026-09-10

- 21 active clients across mixed industries.
- 23 `client_kpi_targets` records.
- **0** with an explicit `guardrails.target_cpql`; **0** with
  `qualification_lag_days`; **0** clients on autopilot.

Consequence: a client missing guardrail values reports **Configuration Needed**;
a client missing a required data source reports **DATA BLOCKED**. Both are
correct behaviour, not bugs, and the two states are distinct.

Two data sources remain unwired and deliberately fail closed:

1. **Matured qualified leads** per client and per ad (with cohort end date).
2. **Attribution/tracking freshness and coverage.**

Until both exist, readiness cannot reach READY and no spend proposal is produced.

## Data honesty rules enforced in the adapter

- Timezone comes ONLY from a verified bound `meta_ad_accounts.timezone_name`.
  `client_settings.stats_report_timezone` is **not** a fallback — a reporting
  timezone may legitimately differ and would mis-bucket days. Without the
  ad-account timezone nothing is dated and the client is DATA BLOCKED.
- `daily_metrics.date_account_tz` is authoritative for grouping; `date` only
  bounds the query. A row without an account-local date blocks the window.
- `daily_metrics.clicks` is generic and never mapped to Meta outbound clicks, so
  the outbound-CTR diagnostic stays unavailable.
- Nulls, NaN and negatives never sum to zero.
- MTD spans the first of the month through yesterday. If incomplete, duplicated,
  truncated or errored, MTD spend and commitments are **unavailable**, not a
  partial sum.
- `daily_metrics.funded_dollars` is unreconciled reported funding — shown
  separately as unverified, never passed as cleared capital.
- `meta_ads` holds lifetime aggregates with no per-day rows and no budget column,
  so per-ad windows, budget owners and change history are unavailable. Change
  history is required before any budget-change claim.
- `meta_ad_daily_insights` exists (`client_id, meta_ad_id, date, spend,
  impressions, clicks, leads, updated_at`) but is deliberately not wired: no
  account-local date column, no outbound-click metric, no qualified-lead
  definition. Intended future source for per-ad windows.
- `leads` exists (`ad_id, created_at, current_disposition, opportunity_stage_id,
  disposition_updated_at, ghl_synced_at`) but per-client qualification and event
  semantics are unmapped, so the matured qualified-lead cohort still blocks.

## Numeric budget proposals are disabled

`buildDraftActions` emits no `increase_object_daily_budget`. A safe increase must
reserve every budget-owning object's baseline spend against the remaining monthly
budget and apply the approved daily cap to the CLIENT total, not per owner.
Neither the account-wide baseline nor the total current budget is connected, so
any number would be invented. Scale candidates return as inert `no_action`
entries carrying `verified_client_wide_baseline_and_total_current_budget_not_connected`
plus the specific missing gates. Pausing an ad proposes no number and claims no
saving.

## Test coverage

Canonical test file: `src/test/media-buyer-sop.test.ts`.

Last reported validation, **2026-09-08**: 90 project tests plus 17 local
independent/snapshot checks run outside the project = **107**. No re-run is
claimed for this documentation edit, and none is needed for a prose-only change.

`handleSopReview` is a pure injectable handler, so the ordering that matters is
genuinely exercised: unauthorized callers perform ZERO privileged reads; non-POST
and malformed JSON are rejected before authorization; a missing `client_id` never
sweeps the portfolio; a client-scoped caller asking about another client is
refused before any read. The real `authorizeOperator` against live auth is only
verifiable against the deployed function and is **not** claimed as covered.

## Verification and activation checklist

The endpoint is already reachable, so this is one list — not a "deploy from
scratch" list. Each step needs operator approval.

1. Confirm `supabase/config.toml` carries
   `[functions.media-buyer-sop-review] verify_jwt = false` (auth is enforced in
   code via `authorizeOperator`).
2. Verify which source revision is actually deployed; redeploy
   `media-buyer-sop-review` **only** if it lags the audited ref. Never redeploy
   `media-buyer-agent`.
3. Populate guardrail keys per pilot client — `target_cpql` first (23 records
   exist, none has one), then `qualification_lag_days`.
4. Wire the matured qualified-lead cohort source and the tracking
   freshness/coverage source; without them no client can be Ready.
5. Prove one authenticated per-client review as a signed-in agency admin:
   `{ "client_id": "<uuid>" }` → expect `review_only: true` and a report.
6. Connect the client-wide baseline and total current budget before re-enabling
   numeric budget proposals.
7. Pilot acceptance sign-off, dated changelog entry, doc-consistency review.
8. Only then point the **existing** media-buyer cron at SOP mode. Do not create a
   second schedule; keep the lease/idempotency and reconcile behaviour below.

## Job requirements for the eventual scheduled cutover

- **Idempotency**: key each run by `(client_id, evidence window end date, mode)`;
  a repeat run for the same completed window creates no new artefacts.
- **Lease**: short owner-token lease per client with stale-lease recovery, so two
  workers cannot review the same client concurrently.
- **Errors**: transient source failures return a retriable status; never report
  success for a client whose reads failed.
- **Reconcile**: re-run clients whose last review ended non-terminal, rebuilding
  evidence from source rather than reusing a partial result.

## Preview vs live

| | Preview (now) | Live (after cutover) |
| --- | --- | --- |
| Endpoint | reachable 2026-09-08; authenticated per-client review and deployed-version verification pending | verified deployed build, operator-authenticated per client |
| Trigger | none; UI computes locally | existing media-buyer cron, SOP mode |
| Narration | disabled (prompt export only) | optional prose over unchanged deterministic results |
| Budget numbers | disabled | only after baseline + total current budget are connected |
| Writes | none | still none in review mode |
| Actions | inert JSON | human-applied after review |

## Changelog

- **2026-09-10** — Documentation-only consolidation against audited source ref
  `04a7e6ac53168eb48a6af0877539ecc8ce69d05d`: one daily-budget rule statement,
  variants clarified as totals, dated 2026-09-10 configuration audit, dated
  2026-09-08 endpoint reachability and 107-check validation, duplicate deployment
  lists replaced by a single verification-and-activation checklist, ownership and
  release rule added. No code, schema, config, agent, cron or schedule change.
