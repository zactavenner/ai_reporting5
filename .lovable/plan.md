# Capture call recordings so sales calls actually get transcribed

## What's broken today

- Every one of the 719 phone call records came from a CRM workflow form (appointment outcome, call notes typed by a human). None of them contains a recording link of any kind, so the transcription step correctly parks them as "waiting for recording". Nothing can be transcribed from these.
- Recordings *do* exist in the CRM. The contact sync already reads call conversations and stores a recording link when the CRM returns one: 129 of 9,252 call rows have a recording, and those 129 all have transcripts. So the pipeline works — the capture is just thin and unreliable.
- Why it's thin: that sync only looks at each conversation's *last* call, stops after 10 pages, and only runs as a side effect of contact syncing. Calls in the middle of a conversation, and anything older than the page window, are never seen.

## Goal

Every completed sales call with an available recording lands as one record with audio, gets transcribed once, and is attached to the correct client and contact — with clear reporting of calls that genuinely have no recording available.

## Plan

### Phase 1 — Confirm recording availability per client (read-only)
For each active client, check the CRM for recorded calls in the last 30 days and produce a table: calls found, calls with a recording link, recording link reachable yes/no. This separates "the CRM has no recording" from "we never asked for it". No writes, no transcription spend.

Outcome: a per-client list of clients where recording capture is worth turning on, and the ones blocked on CRM settings or call-recording being switched off.

### Phase 2 — A real recording feed
Add a dedicated recording-capture job that walks each client's call messages (not just the conversation's last call), pages through properly with a moving cursor, and records the recording link plus call metadata for each individual call. It runs on a schedule and on demand per client, and is safe to re-run: one record per call, matched on the CRM call id.

Also accept a direct call/recording webhook from the CRM so new calls arrive within minutes instead of waiting for the next sweep.

### Phase 3 — One transcription path
Point both sources (recording feed and webhook) at the existing transcription step. Rules:
- Only calls with a reachable recording and a minimum duration are submitted, so we never pay for empty audio.
- Each recording is transcribed once; re-runs reuse the stored transcript.
- Failures record the reason and retry a bounded number of times, then stop and show as "recording unavailable" instead of retrying forever.
- The human-typed call notes already in those 719 records stay as they are — they are notes, not transcripts, and are never presented as one.

### Phase 4 — Attribution and QA
Attach each transcribed call to the client and contact using the CRM ids on the call itself, never by time proximity. Then run the existing call scoring/QA on the transcript and surface the result in reporting.

### Phase 5 — Make gaps visible
A coverage view per client: calls in period, recorded, transcribed, scored, and the exact reason for each gap (no recording in CRM, recording expired, too short, transcription failed). Stale or missing data reads as its own state, never as zero.

## Decisions needed from you

1. **Recording rights and consent** — is call recording on and disclosed for each pilot client? I won't transcribe a client's calls until you confirm this per client.
2. **Retention** — how long do we keep the transcript and whether we store the audio at all or only link to the CRM copy.
3. **Pilot client** — which one client to prove this on before wider rollout.
4. **Backfill window** — how far back to pull existing recordings (default proposal: 30 days), since older transcription costs money for calls nobody will review.

## Technical notes

- Reuse: `supabase/functions/call-transcription` (transcription + analysis + CRM push), the `calls` table's existing `recording_url` / `transcript` columns, `phone_call_records` for webhook-sourced rows, `_shared/transcription.ts` chunked transcription, and the existing client CRM credentials resolution.
- Change: extract conversation/call fetching out of `sync-ghl-contacts` into a dedicated recording-capture function using the CRM call-message endpoints with cursor pagination and no 10-page cap; add a call/recording webhook route alongside the existing conversation webhook.
- Keep tenant isolation (client id on every row, service-role-only writes, RLS unchanged), idempotency on CRM call id, bounded retries with recorded terminal reasons, and no outbound messages to any lead or contact at any point.
- Tests: pagination cursor and dedupe, recording-missing vs recording-unreachable classification, duration floor, single-transcription guarantee, exact contact/client attribution, retry exhaustion state.

## Out of scope

No outbound messages, no CRM stage changes, no paid media, no schedule activation until Phase 1 evidence and your consent answers are in.
