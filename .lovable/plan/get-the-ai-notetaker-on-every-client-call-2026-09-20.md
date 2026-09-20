# Get the AI notetaker on every client call

Goal: `theainotetaker@gmail.com` is added as a guest to every client booking that has a video link, and bookings without a link get a recorded, transcribed phone call instead — with a coverage report that proves it.

## What I found (read-only checks)

- The notetaker is already configured for 35 of 44 clients, all using `theainotetaker@gmail.com`. 29 are enabled and validated, 6 are marked blocked.
- 9 clients have no notetaker setup at all.
- The automatic job that adds the notetaker to new bookings has been switched **off** since the Sep 14 cleanup. That is why nothing has been added since then — the last invite was Sep 14.
- History: 363 bookings were invited successfully; 513 bookings could not be covered because they had no meeting link; 2 failed on the email sender.

## Plan

1. **Restart the automatic invites.** Turn the every-10-minute booking check back on for all 29 validated clients, and confirm the first cycle produces new invites (not errors). It stays off for the 6 blocked clients until step 3 clears them.
2. **Prove it end to end once.** On the next real booking, confirm: notetaker appears as a guest, the organizer and appointment owner are unchanged, the notetaker joins, and the transcript lands on the correct client. If any step fails, stop and report instead of widening.
3. **Finish the 15 missing clients.** For each of the 9 with no setup and 6 blocked, map its booking calendar and organizer calendar, save the notetaker guest email, run validation, and enable only the ones that pass. Anything that cannot pass gets listed with exactly what it is waiting on (usually a calendar connection or an unmapped booking calendar).
4. **Cover calls with no video link.** Bookings that only have a phone number get routed to CRM call recording and transcription rather than being left uncovered, so they still produce a transcript and still appear as covered in the ledger.
5. **Make gaps loud.** The coverage panel shows, per client, how many bookings were captured and which ones failed and why, so a silent gap is impossible.

## Guardrails

- The notetaker is only ever a guest. It is never an event organizer, appointment owner, assigned user, or linked calendar.
- No historical replay, no bulk re-sending of old invites, and no messages to any lead or contact.
- Transcripts only attach to a client when the booking identity matches exactly — the time-only matching that caused the earlier cross-client mix-up stays removed.

## Technical notes

- Re-activate `cron.job` 111 (`meetgeek-guest-poll`, `*/10 * * * *`); it is currently `active = false`. Ten minutes is needed because the invite must land before a booking starts; the window is bounded by `INVITE_LEAD_MINUTES`.
- Per-client rows live in `client_meetgeek_guest_configs` (`bot_guest_email`, `ghl_calendar_id`, `organizer_calendar_id`, `enabled`, `validation_status`). Note `calendar_connection_id` is null on every row today, so the invite currently relies on the ICS/SMTP shadow-invite path in `_shared/shadowInviteSender.ts` (Gmail SMTP, port 465) — I will verify which path is actually delivering before enabling more clients.
- Link-less coverage uses the existing `classifyExpectedProvider` → `ghl_phone` branch in `_shared/notetakerCoverage.ts`; the work is making those bookings reliably produce a transcribed `phone_call_records` row, not new classification logic.
- The `no_email_sender` failures and `MEETGEEK_ALLOW_BULK` kill switch get checked before re-enabling; no secrets are created or printed.
