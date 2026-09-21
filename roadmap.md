# Roadmap — MeetGeek containment (urgent)

## Containment (done)
- [x] Stop all historical replay + sheet delivery processing (poll cron disabled, bulk actions behind `MEETGEEK_ALLOW_BULK`).
- [x] Keep every `client_meetgeek_settings` disabled (enabled = 0). Restore list held by user.
- [x] Quarantine misattributed `meeting_records`, `meeting_call_activity`, pending `meeting_sheet_deliveries`.
- [x] Audit + redact ONLY the erroneous Legacy Capital note; internal audit entry recorded; nobody contacted.

## Resolution correctness (done)
- [x] Removed every time-only and attendee-only tenant authority.
- [x] Require stable invite UID or identical join URL + unambiguous external attendee.
- [x] Ledger fallback no longer synthesizes appointment authority from time.
- [x] Internal-only HPA meetings classified internal; never written to client leads.
- [x] Attribution validated and persisted BEFORE any GHL note write.
- [x] Fixed `bot_guest_email` column query (fail-closed on error).
- [x] Reject partial/missing transcripts (`transcript_incomplete`, min 200 chars).

## Regression tests (done — 132 passing)
- [x] The exact internal meeting fae18b69… → internal, no client note.
- [x] Two different clients meeting simultaneously.
- [x] Mismatched join URLs.
- [x] Host email present as a lead under many clients.
- [x] Verified exact-appointment pilot writes exactly one note.

## Remaining (blocked / next)
- [ ] Pilot re-enable of ONE client per the checklist in `docs/meetgeek-end-to-end-verification.md` — needs operator go-ahead.
- [ ] Earlier calendar mirror / phone-coverage tasks.

# Master AI Video (AI Studio)
- [x] Six-step workflow, approval gates, guarded render route, contract tests.
- [x] QA blocker: portal (password/name) sessions have no Supabase auth user →
      identity now resolves auth uid → verified dashboard member; draft load/save
      goes through the guarded edge route; errors are visible, never a spinner.
- [ ] Verify through a real dashboard sign-in in the preview (needs the dashboard password).

# Week 4 AI marketing (plan approved 2026-09-21)
Plan: `.lovable/plan/week-4-ai-marketing-inside-reporting-5-0-2026-09-21.md`

## Phase 1 — foundation (in progress)
- [x] Refresh evidence counts (21 active clients; 23 KPI rows, 0 target_cpql / 0 qualification_lag_days; 719 phone rows all `awaiting_recording`; 3 meeting records all quarantined; 294 creative intel findings; 44 offers / 9 offer files; knowledge_base_documents, client_brain, content_queue empty).
- [x] Diagnose the call-recording gap: every `phone_call_records` row (provider `webhook`) carries a GHL **workflow form** payload (appointment outcome, call-notes custom fields) with **no recording URL of any kind**. `call-transcription` therefore parks them as `awaiting_recording` — correct behaviour, not a transcription bug. Fixing capture means sending a call/recording webhook (or pulling recordings from the CRM/dialer), not changing the transcriber.
- [ ] Map each agency role to its actual runner → ledger → artifact (agent_task_runs: 264 completed / 10,876 failed; agent_runs last activity Sep 14) and record which roles have a real completed artifact.
- [ ] Per-workflow completion contract (received → validated → processed → reviewed → approved → dispatched → readback → outcome reconciled).
- [ ] Approved-pack schema/permission review before any build.

## Blocked on owner/client decisions
- [ ] Pilot fund + agency ICP selection; recording rights/retention and CRM recording access.
- [ ] Approved claims/disclosures, qualification criteria, CPQL and lag values per pilot client.
- [ ] Channel/consent/handoff rules and recipient roles for reports and nurture.
- [ ] Per-client cost and media caps; labor/vendor costs for margin.
- [x] Runner→artifact map: account_manager 0 completed / 7,879 failed, copywriter / video_ads / static_ads 0 completed — all pointed at an AI model name the provider rejects (400 invalid model id, 1,292 failures in 7 days). Corrected to the working model in the agent records and in the app/backends; `ai-studio` and `test-agent` redeployed. media_buyer / reporting / sales_agent / jeremy_ai do produce completed runs.
- [ ] Remaining 963 provider "user not found" (401) failures in the last 7 days — needs the AI provider account/key checked by the owner; no key was touched.
