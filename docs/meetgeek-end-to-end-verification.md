# MeetGeek capture — incident containment and verification report

Last updated: 2026-09-14

## 1. Incident

An internal HPA executive meeting was attributed to a client and written as a note
onto that client's contact record.

| Item | Value |
| --- | --- |
| Provider meeting | `fae18b69-086f-4942-bbb4-1a763ee6e819` — "[Important] Executive Meeting", 2026-08-10 15:04Z |
| Host / participants | `zac@zactavenner.com` + HPA staff only (no external attendee) |
| Join URL | `https://meet.google.com/cgz-samp-pxe` |
| Wrongly written to | Legacy Capital (`3457607d-0f1b-4ef8-b20f-65bdf4f3c82d`), contact `bTk65RCsL8biBl9NwahQ`, appointment `0hN6rgO1xUP5lxVX9A0J` |
| Activity row | `b551be4b-1507-4664-b08b-4e6f1767dd96` (`crm_sync_status=written`) |

Root cause: tenant/appointment resolution accepted **time proximity** and **attendee
presence** as authority. Because HPA staff attend every client's calls — and the
notetaker address was never recognised as internal (the code selected a
non-existent `guest_email` column instead of `bot_guest_email`) — a staff-only
meeting matched a client booking that merely overlapped in time.

## 2. Containment (all verified in the database)

| Control | State |
| --- | --- |
| `client_meetgeek_settings` enabled | 0 (all disabled; restore list held by the operator) |
| `meetgeek-guest-poll-10m` cron job | inactive |
| Bulk replay / attribution sweep | blocked unless `MEETGEEK_ALLOW_BULK=true` (unset) → HTTP 423 |
| `meeting_sheet_deliveries` not quarantined | 0 |
| `meeting_call_activity` with a contact link | 0 |
| `meeting_call_activity` with `crm_sync_status=written` | 0 |
| `meeting_records` | 3, all quarantined (1 internal, 2 with no usable transcript) |
| Outbound contact | none — no SMS, email or call to any lead |

### Erroneous note
Read back through the client's own mapped HighLevel credentials. The note body no
longer contains any HPA meeting content; it holds only a correction notice
(`ummF9NbBIAvDLJgiG3vV`). The unrelated pre-existing note was left intact. An
internal audit entry was recorded in `autonomous_audit_log` (type `escalation`)
covering the meeting, activity, appointment, redaction, poll shutdown and replay
shutdown.

## 3. Corrected resolution rules

Attribution now requires **all** of the following, evaluated *before* any CRM write:

1. **Tenant** — the client is derived from the guest-invite ledger's exact
   `meeting_url`, or from an invited external `contact_email`. Time windows and
   lead-table matches are no longer authority for anything.
2. **Same-meeting identity** (`verifyMeetingIdentity`) — either the booking's
   `invite_uid` appears in the recording metadata, or the booking's join URL is
   *identical* to the recording's join URL after canonicalisation
   (scheme/host-case/trailing-slash insensitive). Nothing else proves identity.
3. **External counterparty** — at least one attendee who is not agency staff or
   the notetaker. Internal addresses come from `agency_members.email`,
   `client_meetgeek_guest_configs.bot_guest_email` and agency settings; a failure
   loading them throws (fail-closed).
4. **Booking attendee present** — when the booking carries an attendee email, that
   address must actually appear on the call.
5. **Usable transcript** — at least 200 characters; otherwise
   `transcript_incomplete` and nothing is persisted as attributed or written.
6. **Lead matching uses the verified external address only** — a staff address
   that exists as a lead can never select a contact.

Staff-only meetings are classified `internal_meeting` and never touch a client
record. Rejected rows are recorded with `ghl_contact_id = null`, so a refused
meeting is never linked to the booking it could not be proven to be.

The ledger fallback in `findAppointments` may only *retrieve candidates*; the
synthesised appointment must still carry a matching join URL or invite UID, and
the identity gate remains mandatory.

## 4. Tests

`src/test/meetgeek-attribution-containment.test.ts` (new) plus the existing
MeetGeek suites — **132 passing**:

- the exact incident meeting → `internal_meeting`, zero notes, null contact link;
- mismatched join URLs → `identity_unverified`, zero notes;
- time-only match with no link and no invite id → `identity_unverified`;
- a staff host that exists as a lead under many clients → never selects a contact;
- two clients meeting simultaneously → each note lands on its own booking's contact;
- missing/partial transcript → `transcript_incomplete`, zero notes;
- a verified pilot-style appointment → exactly one note on the correct contact;
- join-URL canonicalisation (case, trailing slash, link embedded in booking text).

`deno check` passes for `meetgeek-webhook` and `meeting-sheet-delivery`.
Deployed: `meetgeek-webhook`, `meeting-sheet-delivery`, `meetgeek-guest-poll`
(code only — ingestion and polling remain off).

## 5. Re-enable checklist (not yet performed)

1. Set the notetaker/bot addresses in agency settings and confirm
   `client_meetgeek_guest_configs.bot_guest_email` is populated per client.
2. Enable **one** pilot client only; leave the remaining clients disabled.
3. Book one real discovery call with a genuine external attendee through the
   mapped calendar, so a `meetgeek_guest_invite_jobs` row with `invite_uid` and
   `meeting_url` exists.
4. After the call, confirm: one `meeting_records` row with a transcript, one
   `meeting_call_activity` row with `attribution_method` = `invite_uid` or
   `join_url`, the correct contact id, exactly one note read back from HighLevel,
   and one sheet delivery that completes with readback.
5. Only then re-enable the poll cron job, then remaining clients in small batches.

## 6. Not claimed

No end-to-end success is claimed. No live meeting has been captured under the
corrected rules; all three stored records are quarantined. Bulk replay stays
disabled and no historical note will be regenerated.
