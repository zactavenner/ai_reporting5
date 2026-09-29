# AI-01: Pilot setup and operating ownership

Status: implemented and tested in an isolated branch; not deployed or accepted live.

Target: existing Lovable Reporting 5.0 project `d5c2459b-e4a4-4451-8e06-661057c03e71`, Supabase Cloud backend `jgwwmtuvjlmzapwqiabu`, connected Git branch `lovable-sync`. Base commit: `bf1f18be1ae0624fe3b1b1a3bb2adbf5b2ac7f4d`.

The Onboarding tab now includes a pilot setup panel independent of the existing onboarding pipeline. Active and onboarding clients are eligible. Agency customer acquisition and client investor acquisition have separate records and qualification requirements. Each packet records actual client/offer/account references, deliverables and exclusions, current primary and backup owners, coverage, sales capacity, qualification and funding lag, approved financial limits, and approval evidence. No approved figures or staff assignments are prefilled. Saved client/offer account IDs are displayed as source mappings, not as authenticated provider verification.

Drafts remain saveable with missing inputs. Each blocker identifies an input owner or explicitly remains unassigned. Named agency operators review and attest to evidence before acceptance. Server validation determines readiness. Client-supplied approval fields and cross-client offers are rejected. Stale edits are rejected. Source changes invalidate the displayed acceptance; saving an edit clears acceptance. Every write and its versioned audit snapshot commit together. Acceptance does not start ads, outreach, jobs, or spending.

The private packet and history tables have RLS enabled and no anonymous or ordinary authenticated grants. Only the service role can execute the transactional RPC, through the edge function's existing verified dashboard/operator authentication. A named operator is required; automated service callers cannot approve packets.

## Verification performed

- `npx vitest run --config vitest.pilot.config.ts`: 26 tests passed (21 packet/handler tests plus 5 existing token-signature/expiry tests).
- `npx vitest run --config vitest.ui.config.ts src/test/pilot-readiness.test.tsx`: 3 UI tests passed. Covers active-client eligibility, offer isolation, save then independent read-back, missing-backend error, review attestation, and unsaved-edit handling.
- `npx vite build`: production build passed. Existing bundle-size and Browserslist-age warnings remain.
- Focused edge-function TypeScript check with `strictNullChecks`: passed.
- The migration and lifecycle assertions were executed against the correct Lovable database inside a transaction and rolled back. Verified draft save, stale-version rejection, incomplete-approval rejection, approval, approval invalidation, four audit revisions, source-change rejection, private grants, and RLS. The final query confirmed the new table did not exist after rollback.
- `package-lock.json` now includes the already-declared `@testing-library/user-event` dependency; the previous lock omitted it and prevented `npm ci`.

These checks are component/handler/database evidence, not a live end-to-end acceptance test.

## Deployment and acceptance still required

Lovable rejected the implementation request because the workspace is out of credits. The separately connected Supabase account does not have permission to manage this Lovable Cloud project's edge functions. Do not deploy to the similarly named owned Supabase project instead.

1. Restore Lovable workspace credits or provide an authorized deployment path for this exact backend. Recheck the current project SHA and reconcile concurrent changes before applying the branch.
2. Apply migration `20260922020933_ai01_pilot_readiness.sql` through Lovable, deploy `pilot-readiness` with its shared dependencies and custom dashboard authentication, then publish the frontend. Do not publish the new panel before the backend is available.
3. Confirm anonymous/invalid/expired sessions fail without reading data; confirm a real current admin can load the catalog. Verify packet/history REST access and the transactional RPC remain denied to anon and ordinary authenticated users.
4. In the deployed app, save and reload an incomplete draft; resolve fields using approved source records; verify a stale tab cannot overwrite a newer revision; accept the reviewed packet and confirm actor, timestamp, version, and audit snapshot in the database. Edit it and prove acceptance is cleared. Confirm updated account mappings require review again.
5. Confirm one agency acquisition pilot and the user's selected capital-raising client. Obtain their actual named owners, approved limits and evidence. Accept both scopes only after real account identity verification. No pilot was selected or approved by this implementation.
6. Mark Reporting task `5dd1384b-dfca-44e6-a864-96f17d8e3205` complete only after those live checks and both accepted scopes. Begin AI-02 only then, following the user's one-at-a-time rollout instruction.

## Scope of changes

This release adds only AI-01. It does not modify the other 13 rollout items, existing client status, current ad budgets, account tokens, investor messaging, schedules, or call-analysis/authentication flows. To roll the UI back, revert the panel import and Onboarding wrapper; retain private history for audit. Do not drop production approval history as a rollback shortcut.
