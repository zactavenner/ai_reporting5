# Media Buyer — Capital Raising SOP (preview state)

This document describes an upgrade of the **existing** Media Buyer agent for Zac's
capital-raising agency. No new agent record, app or database was created.

**Current state: PREVIEW.** The rules module and the review endpoint exist in
source only. `media-buyer-sop-review` is **not deployed**, no migration was
applied, no agent/cron/config record was changed, no notification was sent, no
Meta write was made and the frontend was not published. The live
`media-buyer-agent` function and its existing schedules are untouched.

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
