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
