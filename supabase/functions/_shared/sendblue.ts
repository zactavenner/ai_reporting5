/**
 * Sendblue shared helpers — pure, testable, server-only.
 *
 * Hard rules encoded here:
 *  - Outbound sending is refused on inbound-only lines unless it is a reply to a
 *    conversation the contact started, and always refused after an opt-out.
 *  - CRM mirroring only ever produces an InternalComment body. Nothing here can
 *    build a deliverable CRM message.
 *  - Webhook payloads are only trusted after the configured signing secret
 *    verifies. No secret configured => fail closed (callers enforce).
 */

/**
 * Documented API base (https://docs.sendblue.com/api-v2). The Sendblue dashboard
 * also lists api.sendblue.co; SENDBLUE_API_BASE can override this if an account
 * is served from that host.
 */
const envBase =
  typeof Deno !== 'undefined' && Deno?.env ? Deno.env.get('SENDBLUE_API_BASE') : undefined;
export const SENDBLUE_BASE = (envBase || 'https://api.sendblue.com').replace(/\/+$/, '');

export interface SendblueCredentials {
  keyId: string;
  secret: string;
}

export function sendblueHeaders(creds: SendblueCredentials): Record<string, string> {
  return {
    'sb-api-key-id': creds.keyId,
    'sb-api-secret-key': creds.secret,
    'Content-Type': 'application/json',
  };
}

/** Resolve credentials for a line, falling back to the agency-level secrets. */
export function credentialsFor(
  line: { api_key_id?: string | null; api_secret?: string | null } | null,
  env: { keyId?: string | null; secret?: string | null },
): SendblueCredentials | null {
  const keyId = line?.api_key_id || env.keyId || '';
  const secret = line?.api_secret || env.secret || '';
  if (!keyId || !secret) return null;
  return { keyId, secret };
}

/** Strict US/E.164 normalization. Returns null when the input cannot be trusted. */
export function normalizeE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export const OPT_OUT_KEYWORDS = [
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'opt out',
  'optout',
  'revoke',
];

export function isOptOutMessage(body: unknown): boolean {
  if (typeof body !== 'string') return false;
  const cleaned = body.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  if (OPT_OUT_KEYWORDS.includes(cleaned)) return true;
  // Short messages such as "stop please" still count; long prose does not.
  const words = cleaned.split(' ');
  if (words.length <= 3 && OPT_OUT_KEYWORDS.includes(words[0])) return true;
  return false;
}

export function maskSecret(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

/** Sendblue message status -> our stored status. */
export function mapProviderStatus(status: unknown): string {
  const s = String(status || '').toUpperCase();
  if (s === 'DELIVERED') return 'delivered';
  if (s === 'SENT') return 'sent';
  if (s === 'ERROR' || s === 'DECLINED') return 'failed';
  if (s === 'REGISTERED' || s === 'PENDING' || s === 'QUEUED' || s === 'ACCEPTED') return 'sending';
  return s ? s.toLowerCase() : 'queued';
}

export function channelFromService(service: unknown): 'imessage' | 'sms' | 'rcs' {
  const s = String(service || '').toLowerCase();
  if (s === 'imessage') return 'imessage';
  if (s === 'rcs') return 'rcs';
  return 'sms';
}

export type SendKind = 'reply' | 'new_conversation' | 'campaign';

export interface SendGuardInput {
  line: { plan_type?: string | null; status?: string | null; active?: boolean | null } | null;
  kind: SendKind;
  optedOut: boolean;
  hasInbound: boolean;
}

export interface SendGuardResult {
  allowed: boolean;
  reason?:
    | 'line_missing'
    | 'line_inactive'
    | 'line_not_connected'
    | 'opted_out'
    | 'inbound_only_line'
    | 'no_inbound_history';
}

/** The single gate every outbound path must pass through. */
export function sendGuard({ line, kind, optedOut, hasInbound }: SendGuardInput): SendGuardResult {
  if (!line) return { allowed: false, reason: 'line_missing' };
  if (line.active === false) return { allowed: false, reason: 'line_inactive' };
  if (line.status !== 'connected') return { allowed: false, reason: 'line_not_connected' };
  if (optedOut) return { allowed: false, reason: 'opted_out' };

  const outboundCapable = line.plan_type === 'outbound';
  if (kind === 'reply') {
    if (!hasInbound) return { allowed: false, reason: 'no_inbound_history' };
    return { allowed: true };
  }
  if (!outboundCapable) return { allowed: false, reason: 'inbound_only_line' };
  return { allowed: true };
}

export function sendGuardMessage(reason: SendGuardResult['reason']): string {
  switch (reason) {
    case 'line_missing':
      return 'No Sendblue line is set up for this conversation.';
    case 'line_inactive':
      return 'This Sendblue line is switched off.';
    case 'line_not_connected':
      return 'This Sendblue line is not connected yet — test its credentials first.';
    case 'opted_out':
      return 'This contact asked to stop receiving messages.';
    case 'inbound_only_line':
      return 'This line can only reply to people who texted it first.';
    case 'no_inbound_history':
      return 'This contact has not texted this line yet, so a reply cannot be sent.';
    default:
      return 'Sending is not allowed for this conversation.';
  }
}

export function mirrorMarker(messageId: string): string {
  return `[sendblue:${messageId}]`;
}

export interface MirrorNoteInput {
  direction: 'inbound' | 'outbound';
  channel: string;
  linePhone: string;
  contactPhone: string;
  body?: string | null;
  mediaCount?: number;
  occurredAt?: string | null;
  marker: string;
}

/** InternalComment body only. Never a deliverable CRM message. */
export function buildInternalComment(input: MirrorNoteInput): string {
  const label = input.direction === 'inbound' ? 'Received' : 'Sent';
  const channel = input.channel === 'imessage' ? 'iMessage' : input.channel.toUpperCase();
  const when = input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString();
  const lines = [
    `Sendblue ${channel} ${label.toLowerCase()}`,
    `${label}: ${input.direction === 'inbound' ? input.contactPhone : input.linePhone} -> ${
      input.direction === 'inbound' ? input.linePhone : input.contactPhone
    }`,
    `Time: ${when}`,
    '',
    input.body?.trim() || '(no text)',
  ];
  if (input.mediaCount && input.mediaCount > 0) {
    lines.push('', `Attachments: ${input.mediaCount}`);
  }
  lines.push('', input.marker);
  return lines.join('\n');
}

async function hmacHex(secret: string, body: string): Promise<{ hex: string; base64: string }> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const bytes = new Uint8Array(sig);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const base64 = btoa(String.fromCharCode(...bytes));
  return { hex, base64 };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies a Sendblue webhook. Accepts either the shared signing secret sent
 * verbatim in a signature header, or an HMAC-SHA256 (hex or base64) of the raw
 * body. Missing secret or missing header => false (fail closed).
 */
export async function verifyWebhookSignature(
  secret: string | null | undefined,
  rawBody: string,
  headers: Headers,
): Promise<boolean> {
  if (!secret) return false;
  const candidates = [
    headers.get('sb-signing-secret'),
    headers.get('sb-signature'),
    headers.get('x-sendblue-signature'),
    headers.get('sendblue-signature'),
    headers.get('x-signature'),
  ].filter((v): v is string => !!v);
  if (candidates.length === 0) return false;

  const { hex, base64 } = await hmacHex(secret, rawBody);
  for (const raw of candidates) {
    const value = raw.trim().replace(/^sha256=/i, '');
    if (timingSafeEqual(value, secret)) return true;
    if (timingSafeEqual(value.toLowerCase(), hex)) return true;
    if (timingSafeEqual(value, base64)) return true;
  }
  return false;
}

export interface NormalizedInbound {
  kind: 'message' | 'status' | 'ignored';
  providerMessageId: string | null;
  messageHandle: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  body: string | null;
  mediaUrls: string[];
  channel: 'imessage' | 'sms' | 'rcs';
  status: string | null;
  isOutbound: boolean;
}

/** Shapes a Sendblue `receive`/`outbound` webhook payload into our columns. */
export function normalizeWebhookEvent(payload: any): NormalizedInbound {
  const media = payload?.media_url
    ? Array.isArray(payload.media_url)
      ? payload.media_url.map(String)
      : [String(payload.media_url)]
    : [];
  const providerMessageId = payload?.message_handle || payload?.message_id || payload?.id || null;
  const isOutbound = Boolean(payload?.is_outbound);
  const hasContent = typeof payload?.content === 'string' || media.length > 0;
  const statusRaw = payload?.status ?? null;

  let kind: NormalizedInbound['kind'] = 'ignored';
  if (!isOutbound && hasContent && payload?.from_number) kind = 'message';
  else if (statusRaw && providerMessageId) kind = 'status';

  return {
    kind,
    providerMessageId: providerMessageId ? String(providerMessageId) : null,
    messageHandle: payload?.message_handle ? String(payload.message_handle) : null,
    fromNumber: normalizeE164(payload?.from_number),
    toNumber: normalizeE164(payload?.to_number ?? payload?.number),
    body: typeof payload?.content === 'string' ? payload.content : null,
    mediaUrls: media,
    channel: channelFromService(payload?.service),
    status: statusRaw ? String(statusRaw) : null,
    isOutbound,
  };
}

export const MIRROR_MAX_ATTEMPTS = 4;

export function shouldRetryMirror(attempts: number): boolean {
  return attempts < MIRROR_MAX_ATTEMPTS;
}
