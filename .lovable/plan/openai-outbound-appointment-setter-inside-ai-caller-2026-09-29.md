# OpenAI Outbound Appointment Setter inside AI Caller

## What was found
- AI Caller today: `AICallerTab` (analytics table + filters + CSV), `AICallerDetail` drawer, `useAiCallerCalls` reading `phone_call_records` where `is_ai_caller = true`, and `ai-caller-webhook` (password-in-URL, `HPA1234$`). These stay working unchanged in behavior.
- The `bridge/` service is a Go WhatsApp bridge (whatsmeow). It has no voice/sideband code. The long-lived OpenAI sideband has to be added as a new, separate module in that service (same Docker/Fly/Railway files) rather than reused.
- Agency staff sign in through the dashboard password gate, not user accounts, so "client scoping" cannot rely on `auth.uid()` memberships. Access runs through `authorizeOperator` (signed dashboard session, admin/owner role) at the server, with every new table locked to server-only access.
- `appointment-bridge-*` (Twilio two-leg) and `setter-*` functions exist. They are left untouched.

## What gets built

### 1. Outbound Setter panel in the AI Caller tab
A second tab group above the existing analytics: **Analytics** (current view, unchanged), **Queue**, **Live Console**, **Availability**, **Bookings**, **Settings**. Quiet operational styling with shadcn + Lucide.
- **Queue:** lead, blocked reasons (consent, DNC, hours, attempts, campaign off, active call, already booked), attempts / limit, lead-local window, last result.
- **Live Console:** lead picker, Browser Test / Phone transport, Start/End, mic + connection state, live transcript, current preference revision, tool activity, failures. Phone Start is disabled until every readiness gate passes.
- **Availability:** slots and active holds with expiry.
- **Bookings:** contact, client, service, date/time/timezone, source call, provider ID, status (incl. reconciliation_required).
- **Settings:** business identity, candidate and investor scripts plus approved questions, voice, timezone, calling hours, daily/attempt limits, caller number, readiness chips (OpenAI / SIP / calendar / outbound SIP enabled) shown as ready/missing/invalid only, and a global outbound toggle that is off by default.

### 2. Data (new tables, all client-scoped, server-only)
`ai_setter_settings`, `ai_setter_campaigns`, `ai_setter_queue` (consent evidence, DNC, timezone, window, attempts, status), `ai_setter_sessions` (transport, OpenAI session id, task_revision, confirmation state, finalization, reconciliation, usage), `ai_setter_events` (append-only via trigger), `ai_setter_tool_runs` (unique on session + call id + tool call id), `ai_setter_slots`, `ai_setter_holds`, `ai_setter_bookings` (unique booking claim), `ai_setter_attempt_claims` (unique per queue entry + attempt), and an `is_demo` flag throughout.
- Grants: service_role only. `anon`/`authenticated` revoked. RLS enabled with no browser policies. Reads/writes go through one operator-authorized server function that always filters by the requested client and checks it exists.
- Reuses `phone_call_records`: browser and phone calls upsert there with `is_ai_caller = true`, adding session id, transport, booking and error fields to its existing columns/`raw_payload`. No second analytics source.

### 3. Server functions (new, verified auth, no hardcoded password)
- `ai-setter-api`: settings, queue, slots, holds, bookings, readiness, demo seed/reset. Operator auth required.
- `ai-setter-realtime-session`: mints a short-lived `gpt-realtime-2.1` WebRTC client secret with the setter prompt and tool definitions. The standard key never leaves the server.
- `ai-setter-tools`: the single trusted executor for `check_availability`, `hold_booking`, `release_booking_hold`, `save_booking`, `update_preferences`, `end_call`. Idempotent by tool-run key. Stale revisions return `skipped/stale`. `save_booking` enforces the matching session/client, current revision, exact unexpired hold, final details, and a fresh `confirmed_by_customer` tied to that revision. Any change clears confirmation. The booking claim is taken before any calendar write.
- `ai-setter-place-call`: re-reads all state and checks every gate (consent, not DNC, E.164, allowed country, local hours, attempts, no active call, no confirmed booking, verified caller number, OpenAI + SIP readiness, outbound SIP enabled, campaign active, global toggle on, not demo). Takes the attempt claim, then calls `POST /v1/live/sessions` with `gpt-live-1`, saves `session.id` unchanged, and hands the session to the bridge. Timeouts become `reconciliation_required` and are never retried.
- Delegation: backend work runs through Responses (`openai/gpt-6-astra` per project default, overridable by `OPENAI_RESPONSES_MODEL`), calling the same trusted executor.

### 4. Calendar adapter
Interface `check / hold / release / book / verify`. The **Demo** adapter uses Reporting tables and works now. A **GHL** adapter is only used with a verified per-client calendar mapping; it rechecks free slots right before booking and stores the provider id. Not exercised against a real calendar in this build.

### 5. Bridge sideband (voice module in `bridge/`)
A new `voice` package alongside the WhatsApp code: it attaches to the OpenAI session sideband, streams transcript/lifecycle events to `ai-setter-tools`/events, forwards tool calls, registers `session.closed` before closing, and marks incomplete finalization if the connection drops. Adds `/voice/health` and `/voice/ready`. Deployment is not claimed; it needs a redeploy by you.

### 6. Voice prompt
A short prompt with Personality, Backchannel, Interruption, and Delegation headings. The caller names the business and purpose, asks permission, uses only approved questions, never invents investment facts or eligibility, honors stop/DNC immediately, and always reads back and gets a clear "yes" before saving.

### 7. Demo
Idempotent seed: "Demo Capital Partners (DEMO)", candidate + investor qualification services, three leads marked DEMO with 555 numbers, slots for the next 7 weekdays, one confirmed booking. Demo is browser-only and can never dial. Reset deletes only `is_demo = true` rows.

## Verification
Build/typecheck plus focused Vitest suites on pure gate/tool logic: consent, DNC, hours, attempt limit, inactive campaign, missing credentials, cross-client denial, duplicate call create, duplicate tool event, stale revision, expired hold, changed preferences, confirmation gate, ambiguous timeout with no retry, mic denied, session cleanup, demo reset isolation, and existing analytics KPIs. A bundle grep confirms no secrets or `HPA1234$` in the new code.

## Not done in this build
No publishing, no real dialing, no enabling outbound, no real contacts, no external calendar writes, no bridge deploy.

## Blockers you'll need to clear afterwards
- Secrets: `OPENAI_API_KEY` (plus optional `OPENAI_WEBHOOK_SECRET`), `SIP_PROVIDER_URL` (sips/TLS), `SIP_USERNAME`, `SIP_PASSWORD`, `SIP_CALLER_NUMBER`.
- OpenAI must enable outbound SIP for the org (shown as `outbound_sip_not_enabled` until then).
- Redeploy the bridge with the voice module.
- Per-client verified calendar mapping before any real booking.

## Technical notes
- The existing `ai-caller-webhook` keeps its password gate for now so current integrations don't break. Only new endpoints use verified auth.
- The build is large, so it lands in stages: schema, then server functions + tests, then UI, then the bridge module. Each stage is checked before moving on.
