/**
 * Pure helpers for CRM (GoHighLevel) call-recording capture.
 *
 * Kept free of network/database access so the classification, duration-floor and
 * cursor rules are unit-testable. The edge function `ghl-call-recordings` owns
 * all IO; this file owns the decisions.
 */

export const GHL_BASE = "https://services.leadconnectorhq.com";
export const GHL_VERSION = "2021-07-28";

/** Calls shorter than this are never submitted for paid transcription. */
export const DEFAULT_MIN_DURATION_SECONDS = 30;

export type RecordingAvailability =
  | "available"
  | "no_recording_in_crm"
  | "recording_expired"
  | "recording_unreachable"
  | "too_short";

export interface CallMessage {
  id: string;
  conversationId?: string | null;
  contactId?: string | null;
  messageType?: string | null;
  type?: number | string | null;
  direction?: string | null;
  status?: string | null;
  dateAdded?: string | null;
  meta?: { call?: { duration?: number | null; status?: string | null } | null } | null;
  attachments?: unknown[] | null;
}

/** GHL marks phone calls with messageType TYPE_CALL (numeric type 25/26 on older payloads). */
export function isCallMessage(msg: CallMessage): boolean {
  const t = String(msg.messageType || "").toUpperCase();
  if (t === "TYPE_CALL") return true;
  return msg.type === 25 || msg.type === 26 || String(msg.type) === "TYPE_CALL";
}

export function callDurationSeconds(msg: CallMessage): number | null {
  const d = msg.meta?.call?.duration;
  return typeof d === "number" && Number.isFinite(d) && d >= 0 ? d : null;
}

export function callStatus(msg: CallMessage): string | null {
  return (msg.meta?.call?.status || msg.status || null) as string | null;
}

/** A call is worth capturing once it has ended — voicemail included, ringing excluded. */
export function isCompletedCall(msg: CallMessage): boolean {
  const s = String(callStatus(msg) || "").toLowerCase();
  if (!s) return true;
  if (["ringing", "connecting", "queued", "pending", "in-progress", "inprogress"].includes(s)) return false;
  return true;
}

/**
 * The authenticated CRM recording endpoint. `call-transcription` already attaches
 * the client's CRM bearer token for leadconnectorhq.com URLs, so this URL is stored
 * as-is and no audio is copied into our own storage.
 */
export function recordingUrlFor(locationId: string, messageId: string): string {
  return `${GHL_BASE}/conversations/messages/${encodeURIComponent(messageId)}/locations/${encodeURIComponent(locationId)}/recording`;
}

/** Stable, tenant-scoped id so repeated runs update one row per CRM call. */
export function callRecordKey(locationId: string, messageId: string): string {
  return `ghl:${locationId}:${messageId}`;
}

export interface ProbeResult {
  status: number;
  contentType?: string | null;
  contentLength?: number | null;
}

/** Turn an HTTP probe of the recording endpoint into a single reason code. */
export function classifyProbe(probe: ProbeResult): RecordingAvailability {
  const { status } = probe;
  const type = String(probe.contentType || "").toLowerCase();
  const len = probe.contentLength;

  if (status === 404) return "no_recording_in_crm";
  if (status === 410) return "recording_expired";
  if (status < 200 || status >= 300) return "recording_unreachable";
  if (type.includes("json") || type.includes("html")) return "recording_unreachable";
  if (typeof len === "number" && len > 0 && len < 2048) return "no_recording_in_crm";
  return "available";
}

export interface EligibilityInput {
  availability: RecordingAvailability;
  durationSeconds: number | null;
  minDurationSeconds?: number;
}

/** Final gate before any paid transcription. */
export function recordingEligibility(input: EligibilityInput): RecordingAvailability {
  if (input.availability !== "available") return input.availability;
  const min = input.minDurationSeconds ?? DEFAULT_MIN_DURATION_SECONDS;
  const d = input.durationSeconds;
  if (typeof d === "number" && d < min) return "too_short";
  return "available";
}

export function isTerminalReason(reason: RecordingAvailability): boolean {
  return reason === "no_recording_in_crm" || reason === "recording_expired" || reason === "too_short";
}

/** Bounded retries: only transient reasons retry, and only while attempts remain. */
export function shouldRetry(reason: RecordingAvailability, attempts: number, maxAttempts = 3): boolean {
  if (isTerminalReason(reason)) return false;
  return attempts < maxAttempts;
}

/**
 * Cursor for message paging. GHL returns messages newest-first per conversation and
 * accepts `lastMessageId` to continue. Returns null when the page is empty or the
 * page did not advance (guards against an endless loop on a repeated page).
 */
export function nextMessageCursor(messages: CallMessage[], previousCursor?: string | null): string | null {
  if (!messages.length) return null;
  const last = messages[messages.length - 1]?.id;
  if (!last || last === previousCursor) return null;
  return last;
}

/** Conversation paging cursor (conversations/search uses startAfterDate + startAfterId). */
export function nextConversationCursor(
  conversations: { id?: string | null; lastMessageDate?: string | null }[],
  previous?: { id?: string | null; date?: string | null } | null,
): { id: string; date: string | null } | null {
  if (!conversations.length) return null;
  const last = conversations[conversations.length - 1];
  if (!last?.id || last.id === previous?.id) return null;
  return { id: last.id, date: last.lastMessageDate || null };
}

/** Work bound per invocation — every run ends even with work remaining. */
export interface RunBudget {
  maxClients: number;
  maxConversationsPerClient: number;
  maxCallsPerClient: number;
  maxApiCalls: number;
}

export const DEFAULT_BUDGET: RunBudget = {
  maxClients: 5,
  maxConversationsPerClient: 200,
  maxCallsPerClient: 300,
  maxApiCalls: 400,
};

export function clampBudget(input: Partial<RunBudget> | undefined): RunBudget {
  const b = { ...DEFAULT_BUDGET, ...(input || {}) };
  return {
    maxClients: Math.max(1, Math.min(Number(b.maxClients) || 1, 25)),
    maxConversationsPerClient: Math.max(1, Math.min(Number(b.maxConversationsPerClient) || 1, 500)),
    maxCallsPerClient: Math.max(1, Math.min(Number(b.maxCallsPerClient) || 1, 1000)),
    maxApiCalls: Math.max(10, Math.min(Number(b.maxApiCalls) || 10, 1500)),
  };
}
