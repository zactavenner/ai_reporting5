# Media Buyer — Capital Raising SOP (preview state)

This document describes an upgrade of the **existing** Media Buyer agent for Zac's
capital-raising agency. No new agent record, app or database was created.

**Current state: Review preview. Endpoint reachable; authenticated client review
and deployed-version verification pending. New SOP scheduler not activated. No
Meta execution.** The `media-buyer-sop-review` endpoint answers requests (GET →
405 `method_not_allowed`, malformed POST → 400 `malformed_json`, unauthenticated
POST → 401 `missing_token`), but it is **not** claimed that the deployed build
matches the latest source, and no authenticated per-client review has been
proven. No migration was applied, no agent/cron/config record was changed, no
notification was sent, no Meta write was made and the frontend was not
published. Build authorization did not include live spend: the existing four
cron jobs remain unchanged and the live `media-buyer-agent` function and its
schedules are untouched.

This agent is **not autonomous**. Every output is a recommendation that a human
applies manually.

## What it is

| Piece | Path | Role |
| --- | --- | --- |
| Deterministic rules (authoritative) | `supabase/functions/_shared/mediaBuyerSop.ts` | Pure functions: budget tiers, cold start, test duration, evidence validation, classification, pacing, draft actions, creative briefs, operating instructions, narrator prompt. No network, no Deno APIs. |
| Frontend re-export | `src/lib/mediaBuyerSop.ts` | Re-exports the same module so UI, edge function and tests evaluate identical logic. |
| Review endpoint (prepared, undeployed) | `supabase/functions/media-buyer-sop-review/index.ts` | One client per request, read-only, authorization before any privileged read. |
| Read-only preview UI | `src/components/media-buyer/MediaBuyerSopPreview.tsx` (tab on `src/pages/MediaBuyerPage.tsx`) | Calculates readiness locally from existing data. Never calls the undeployed endpoint. |
| Tests | `src/test/media-buyer-sop.test.ts` | 46 tests. `npx vitest run src/test/media-buyer-sop.test.ts` |

## Platform roles

- **Rules module** decides everything: statuses, budget deltas, sums, monthly impact.
- **Model (optional narrator)** only writes prose. It cannot override rules,
  manufacture ids, metrics or claims, approve spending, send anything or execute
  anything, and it treats all context as untrusted. If the model is unavailable
  the deterministic result is still returned.
- **Human** applies every action. This endpoint contains no Meta executor, does
  not call the generic gatekeeper (whose autopilot semantics are broader than
  this review) and does not write `approval_queue`.

## Rule summary

- Budget tiers (weekly USD): 200 → 160/40/0, 2 concepts × 2 variants; 300 →
  210/60/30, 2 × 3; 500 → 350/100/50, 3 × 3; 1000 → 700/200/100, 4 × 4. Splits
  always sum exactly to the budget; if retargeting is not viable its share
  returns to core. Prepared assets are inventory, **not** a launch quota.
- Cold start: one campaign, one prospecting ad set, 3–6 ads, inside the approved
  pilot loss limit. Small budgets are not forced to test many ads.
- Test days = 3 × target CPQL ÷ actual daily test spend, floored at 72h, plus the
  client-defined qualification lag.
- Precedence: **DATA BLOCKED → CONFIGURATION NEEDED → INSUFFICIENT DATA →**
  KEEP / WATCH / ITERATE / PAUSE candidate / SCALE candidate.
- Null is never zero. Missing, stale, future-dated, malformed, truncated or
  wrong-client evidence fails closed. Missing configuration can never yield KEEP.
- Aggregate 7-day frequency is reported as **unavailable** unless directly
  sourced; it is never reconstructed by summing reach or taking a daily maximum.
  Frequency 3–4 alone triggers inspection, never a kill.
- Windows use the client timezone and exclude the partial current day; 7 complete
  days versus the prior 7, plus MTD. Qualification and funding lags are separate.
- Scale: ≥7 complete stable days, preferably ≥10 matured QLs, CPQL ≤ target,
  acceptable downstream quality, monthly headroom and sales capacity; ≤ +20%, no
  stacking. Anything faster requires explicit client approval.
- Cleared capital is funded; commitments are separate; capital ÷ spend is not
  revenue ROAS.

## Configuration prerequisites (existing schema only)

All of these map to `client_kpi_targets.guardrails` unless noted. The UI displays
them read-only with the exact source field, and shows what is missing.

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
| tracking freshness / coverage requirements | `client_kpi_targets.guardrails.tracking_max_staleness_hours`, `.tracking_min_coverage_pct` |

Observed today: 23 `client_kpi_targets` rows, **zero** with `guardrails.target_cpql`,
none on autopilot. Every client therefore reports **Configuration Needed** until
these are filled — that is correct behaviour, not a bug.

Two data sources are still unwired and deliberately fail closed:

1. **Matured qualified leads** per client and per ad (with cohort end date).
2. **Attribution/tracking freshness and coverage.**

Until both exist, readiness cannot reach READY and no spend proposal is produced.

## Deployment steps (all still outstanding, each requires approval)

1. Review the source diff and test output.
2. Add `[functions.media-buyer-sop-review] verify_jwt = false` to
   `supabase/config.toml` (auth is enforced in code via `authorizeOperator`).
3. Deploy `media-buyer-sop-review` only. Do not redeploy `media-buyer-agent`.
4. Populate the guardrail keys above for the pilot clients.
5. Wire the matured-qualified-lead and tracking-health sources.
6. Verify per client with an authenticated operator call:
   `{ "client_id": "<uuid>" }` → expect `review_only: true` and a report.
7. Only after sign-off, point the **existing** media-buyer cron at the SOP mode.
   Do not create a second schedule.

## Job requirements for the eventual scheduled cutover

- **Idempotency**: key each run by `(client_id, evidence window end date, mode)`;
  a repeat run for the same completed window must not create new artefacts.
- **Lease**: take a short owner-token lease per client with stale-lease recovery
  so two workers cannot review the same client concurrently.
- **Errors**: transient source failures return a retriable status; never report
  success for a client whose reads failed.
- **Reconcile**: re-run clients whose last review ended non-terminal, rebuilding
  evidence from source rather than reusing a partial result.

## Preview vs live

| | Preview (now) | Live (after cutover) |
| --- | --- | --- |
| Endpoint | source only, undeployed | deployed, operator-authenticated |
| Trigger | none; UI computes locally | existing media-buyer cron, SOP mode |
| Writes | none | still none in review mode |
| Actions | inert JSON | human-applied after review |

## Source files (preview state)

| File | Role | State |
| --- | --- | --- |
| `supabase/functions/_shared/mediaBuyerSop.ts` | Pure SOP rules (daily budget tiers, cold start, evidence validation, classification, pacing, inert draft actions, briefs, exportable instructions) | source only |
| `supabase/functions/_shared/mediaBuyerSopRead.ts` | Shared read adapter — whitelisted columns, truncation detection on every source, timezone resolution, window/MTD construction | source only |
| `supabase/functions/_shared/mediaBuyerSopRequest.ts` | POST-only / malformed-JSON / client_id contract | source only |
| `supabase/functions/media-buyer-sop-review/index.ts` | Review endpoint, authorization before any privileged read, one client per request | **not deployed** |
| `src/components/media-buyer/MediaBuyerSopPreview.tsx` | Read-only preview tab; never calls the endpoint | in app |
| `src/test/media-buyer-sop.test.ts` | 79 tests | passing |

## Budgets are per day

All tier figures are DAILY ad spend: 200 → 160/40/0, 300 → 210/60/30, 500 → 350/100/50, 1000 → 700/200/100. Any other daily
budget reports `custom_daily_budget_requires_custom_plan` — it is never floored to a lower tier. Weekly creative delivery is
N net-new concepts plus M variants **in total** (4/5/6/8 prepared assets), and prepared assets are inventory, not a launch quota.

## Data honesty rules enforced in the adapter

- Timezone comes ONLY from a verified bound `meta_ad_accounts.timezone_name`. `client_settings.stats_report_timezone` is NOT a
  fallback — a reporting timezone may legitimately differ from the ad account's and would mis-bucket days. Without the
  ad-account timezone nothing is dated and the client is DATA BLOCKED.
- `daily_metrics.date_account_tz` is authoritative for grouping. `date` is only used to bound the query; a row without an
  account-local date is undated and blocks the window.
- `daily_metrics.clicks` is a generic click count and is never mapped to Meta outbound clicks, so the outbound-CTR diagnostic
  stays unavailable.
- Rows missing an account-local date block; nulls, NaN and negatives never sum to zero.
- Month-to-date spans the first of the month through yesterday. If that range is incomplete, duplicated, truncated or errored,
  month-to-date spend and commitments are reported **unavailable** rather than as a partial sum.
- `daily_metrics.funded_dollars` is unreconciled reported funding. It is shown separately as unverified and is never passed as
  cleared capital.
- `meta_ads` holds lifetime aggregates with no per-day rows and no budget column, so per-ad windows, budget owners and change
  history are unavailable.
- `meta_ad_daily_insights` EXISTS (`client_id, meta_ad_id, date, spend, impressions, clicks, leads, updated_at`) but is
  deliberately NOT wired in yet: it has no account-local date column, no outbound-click metric and no qualified-lead
  definition. It is the intended future source for per-ad windows once those are verified.
- `leads` EXISTS (`ad_id, created_at, current_disposition, opportunity_stage_id, disposition_updated_at, ghl_synced_at`) but the
  qualification definition and event semantics per client are unmapped, so the matured qualified-lead cohort still blocks.

## Numeric budget proposals are disabled in this preview

`buildDraftActions` emits NO `increase_object_daily_budget` at all. A safe increase must reserve every budget-owning object's
baseline spend against the remaining monthly budget and apply the approved daily cap to the CLIENT total, not separately per
owner. Neither the account-wide baseline nor the total current budget is connected, so any number would be invented. Scale
candidates are still returned as inert `no_action` entries carrying the blocker
`verified_client_wide_baseline_and_total_current_budget_not_connected` plus the specific missing gates. Pausing an ad proposes
no number and claims no saving.

## Test coverage of the endpoint contract

`handleSopReview` in `supabase/functions/_shared/mediaBuyerSopReview.ts` is a pure injectable handler, so the ordering that
matters is genuinely exercised: unauthorized callers perform ZERO privileged reads, non-POST and malformed JSON are rejected
before authorization runs, a missing `client_id` never sweeps the portfolio, and a client-scoped caller asking about another
client is refused before any read. The real `authorizeOperator` implementation against live auth is still only verifiable
after deployment — that remains untested here and is not claimed as covered.

## Remaining deployment steps (none performed)

1. Add `[functions.media-buyer-sop-review] verify_jwt = false` to `supabase/config.toml`.
2. Deploy only `media-buyer-sop-review`.
3. Populate the guardrail keys per client (`target_cpql` first — 23 rows exist and none has one).
4. Connect the matured qualified-lead cohort source and the tracking freshness/coverage source; without them no client can be Ready.
5. Verify per client as a signed-in agency admin.
6. Only then point the EXISTING media-buyer cron at SOP mode. Do not add a second schedule; keep the job's lease/idempotency and
   reconcile behaviour as documented above.
