# Sendblue messaging tab (agency + every client account)

A new **Sendblue** tab in the main sidebar and inside each client account, for managing client
texting lines, sending and receiving messages in this platform, and mirroring every message into
the client's GoHighLevel conversation as an internal note.

Existing Outreach and Setter screens stay exactly as they are.

## What you get

**1. Line (sub-account) management**
- One registry of Sendblue lines, each tied to a client (or to the agency itself).
- Register a line manually: paste its Sendblue key pair and number, give it a label, pick the
  plan type (inbound-only / outbound-capable), save. Keys are stored in the backend only and
  shown masked afterwards.
- "Create new line" button attempts programmatic creation through Sendblue. If your plan does not
  expose line provisioning, the button reports that plainly and falls back to manual registration
  instead of failing silently.
- Status per line: connected / not connected / credentials rejected, with a "Test connection"
  button that does a harmless read against Sendblue and records the result.

**2. Inbox and conversations**
- Left: conversation list per line (contact name, number, last message, unread, client badge).
- Right: full thread with inbound and outbound bubbles, timestamps, delivery status
  (sending / delivered / failed / replied) and iMessage vs SMS indication.
- Live updates as new inbound messages arrive.

**3. Sending — three levels, each gated**
- Reply to anyone who already texted the line (always available).
- Start a new 1:1 conversation manually, blocked when the contact has opted out and blocked on
  inbound-only lines.
- Campaign / bulk sending, reusing existing Outreach campaigns, only enabled on a line marked
  outbound-capable and only after an explicit send confirmation showing recipient count.
- Every path honours opt-out keywords (STOP and variants) — once a contact opts out, all further
  sending to that number is refused across the platform.

**4. GoHighLevel sync**
- Every Sendblue message (both directions) is mirrored into the matching GHL contact's
  conversation as an **internal note** carrying the message text, direction, line number and a
  marker id. Nothing is ever sent to the lead from GHL, no SMS or email is created there, and no
  contact is created — a message with no exact phone match stays unmatched and is shown as such.
- Matching is exact normalized E.164 only, scoped to that client's CRM location. Ambiguous
  matches are skipped and surfaced, never guessed.
- Each mirror is written at most once (durable idempotency + lease), with bounded retries and a
  visible failure list.

**5. Connection health**
- A panel per client showing: line registered, credentials valid, webhook receiving, GHL mirror
  working, last inbound, last mirror, and any current blocker in plain words.
- The same panel appears in the client account tab and, rolled up for all clients, on the agency tab.

## Placement

- Main sidebar: new top-level **Sendblue** entry (after Connections).
- Client account: new **Sendblue** tab, scoped to that client's line(s) only.
- Both render the same components; the client view is the agency view filtered to one client.

## Technical notes

Data (new tables, backend-only, RLS on, service_role grants; credentials never readable by the browser):
- `sendblue_lines` — client_id (nullable for agency line), label, phone_e164, plan_type
  (`inbound_only` | `outbound`), key id/secret refs, status, last_tested_at, last_error, active.
- `sendblue_conversations` — line_id, client_id, contact_phone, contact_name, ghl_contact_id,
  match_state (`matched` | `unmatched` | `ambiguous`), last_message_at, unread_count.
- `sendblue_messages` — conversation_id, direction, channel (`imessage`/`sms`/`rcs`), body,
  media urls, status, provider_message_id (unique), error, sent/delivered/replied timestamps.
- `sendblue_ghl_mirrors` — message_id, ghl_note_id, marker, status, attempts, lease, last_error
  (unique on message_id; the idempotency ledger).
- `sendblue_optouts` — line_id, phone_e164, source, created_at.

Edge functions:
- `sendblue-admin` — internal-password guarded: register/update/deactivate line, test connection,
  attempt create-line (capability-probed, reports unsupported honestly), health rollup.
- `sendblue-send` — validates line capability, opt-out and consent, inserts the outbound row,
  calls Sendblue v2, records provider id and status; idempotency key per send.
- `sendblue-webhook` — public endpoint for Sendblue inbound + delivery callbacks; verifies the
  configured signing secret, dedupes on provider message id, upserts conversation/message,
  queues the GHL mirror.
- `sendblue-ghl-mirror` — claims queued mirrors under lease, resolves the exact contact via the
  client's GHL credentials, writes one internal note, records note id, bounded retries then
  dead-letters with a visible reason.

Reuse: `standard-connectors`-free direct API (existing `SENDBLUE_API_KEY`/`SENDBLUE_API_SECRET`
secrets are extended to per-line credentials), `_shared/ghlMapping.ts` for client CRM credentials,
the Linq bridge's exact-match / lease / idempotency pattern, existing Outreach campaign tables for
bulk sends, and `integration_status` (`sendblue`) for the health cards.

Frontend: `src/components/sendblue/` (LineManager, ConversationList, MessageThread, HealthPanel,
SendblueTab), `src/hooks/useSendblue.ts`, wired into `AppSidebar.tsx`, the agency tab router and
`ClientDetail.tsx`.

Tests: phone normalization and exact-match rules, ambiguous/unmatched rejection, opt-out
enforcement, inbound-only send refusal, webhook signature + dedupe, mirror idempotency and
retry/dead-letter, capability probe for line creation.

Not touched: Outreach, Setter, WhatsApp, Linq bridge, campaigns, budgets, Meta, billing, existing
CRM workflows or contacts.

## What I need from you

- Sendblue API credentials for the agency account (I'll request them securely when building).
- The webhook signing secret from Sendblue, so inbound callbacks can be verified.
- Which client gets the first line, for the one end-to-end proof (send, receive, note appears).
