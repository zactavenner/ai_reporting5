# Roadmap — MeetGeek containment (urgent)

## Containment (in progress)
- [ ] Stop all historical replay + sheet delivery processing (no broad replay, no auto poll).
- [ ] Keep every `client_meetgeek_settings` disabled until verified safe. Restore list held by user.
- [ ] Quarantine misattributed `meeting_records`, `meeting_call_activity`, pending `meeting_sheet_deliveries`.
- [ ] Audit + redact ONLY the erroneous Legacy Capital note (contact bTk65RCsL8biBl9NwahQ, appointment 0hN6rgO1xUP5lxVX9A0J); keep internal audit trail; contact nobody.

## Resolution correctness (must land before any re-enable)
- [ ] Remove EVERY time-only and attendee-only tenant authority.
- [ ] Require exact stable appointment identity, or identical original join URL + time window, plus one unambiguous external contact/client.
- [ ] Ledger fallback must not synthesize appointment authority from time alone.
- [ ] Internal-only HPA meetings classified internal; never written to client leads.
- [ ] Validate attribution BEFORE the GHL note write; persist exact attribution first.
- [ ] Fix `bot_guest_email` vs `guest_email` column query.
- [ ] Reject partial/missing transcripts instead of persisting them.

## Regression tests
- [ ] This exact internal meeting (fae18b69…, host zac@zactavenner.com, staff-only, meet.google.com/cgz-samp-pxe) → internal, no client note.
- [ ] Two different clients meeting simultaneously.
- [ ] Mismatched join URLs.
- [ ] Host email present as a lead under many clients.
- [ ] Successful exact HRT appointment pilot.

## After containment
- [ ] Verification report (`docs/meetgeek-end-to-end-verification.md`).
- [ ] Earlier calendar mirror / phone-coverage tasks.
