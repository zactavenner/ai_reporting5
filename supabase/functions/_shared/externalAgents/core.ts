// Pure logic for external-agent delivery. No I/O, so it is unit-testable.

export type Transport = 'none' | 'push_webhook' | 'pull_mcp' | 'local_worker' | 'remote_mcp';
export type AgentRow = {
  id: string; slug: string; display_name: string; member_id: string | null; transport: Transport;
  endpoint_url: string | null; oauth_user_id: string | null; enabled: boolean; last_test_ok: boolean | null;
  mention_hourly_limit: number;
};
export type ConnectionState = 'missing_connection' | 'pull_only' | 'ready' | 'test_failed' | 'not_tested';

export const CALLBACK_WINDOW_SECONDS = 300;
export const MAX_HOP = 3;
export const MAX_ATTEMPTS = 5;

/** Honest connection status. Pull access alone is never "Ready" — nothing can wake it. */
export function connectionState(
  a: Pick<AgentRow, 'member_id' | 'transport' | 'endpoint_url' | 'oauth_user_id' | 'last_test_ok'> & { mcp_tool_name?: string | null },
  hasSigningSecret: boolean,
): ConnectionState {
  if (!a.member_id) return 'missing_connection';
  const tested = (): ConnectionState => (a.last_test_ok === true ? 'ready' : a.last_test_ok === false ? 'test_failed' : 'not_tested');
  switch (a.transport) {
    case 'pull_mcp': return a.oauth_user_id ? 'pull_only' : 'missing_connection';
    case 'push_webhook': return a.endpoint_url && hasSigningSecret ? tested() : 'missing_connection';
    // Mac worker dials out; "ready" only after the worker answered an end-to-end test.
    case 'local_worker': return hasSigningSecret ? tested() : 'missing_connection';
    case 'remote_mcp': return a.endpoint_url && a.mcp_tool_name ? tested() : 'missing_connection';
    default: return 'missing_connection';
  }
}

/** Pushed transports are woken by Reporting; the others wait for their own worker. */
export const isPushTransport = (t: Transport) => t === 'push_webhook' || t === 'remote_mcp';
export const LOCAL_LEASE_SECONDS = 300;

/** Continuity key: one external CLI session per task, one shared for team chat. */
export const sessionScope = (row: { kind: string; task_id: string | null }) =>
  row.task_id ? `task:${row.task_id}` : 'team';

export function canEnable(state: ConnectionState) {
  return state === 'ready' || state === 'pull_only';
}

export function validateEndpoint(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return 'Endpoint must use https';
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(u.hostname)) return 'Private hosts are not allowed';
    return null;
  } catch {
    return 'Invalid URL';
  }
}

export type SendOutcome =
  | { kind: 'response'; status: number; body: any }
  | { kind: 'timeout' }
  | { kind: 'network'; message: string };

export type Decision =
  | { status: 'accepted'; runId: string }
  | { status: 'failed_retryable'; nextInSeconds: number; error: string }
  | { status: 'failed'; error: string }
  | { status: 'needs_review'; error: string };

export function backoffSeconds(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

/**
 * Decide what a push attempt means. Only an explicit acknowledgement with a run id
 * counts as delivered. Timeouts/transport failures are ambiguous: retried only when
 * the agent honours Idempotency-Key, otherwise parked for review.
 */
export function decide(outcome: SendOutcome, attempt: number, supportsIdempotency: boolean, maxAttempts = MAX_ATTEMPTS): Decision {
  const retry = (error: string): Decision =>
    attempt >= maxAttempts ? { status: 'failed', error: `${error} (max attempts reached)` } : { status: 'failed_retryable', nextInSeconds: backoffSeconds(attempt), error };
  if (outcome.kind !== 'response') {
    const error = outcome.kind === 'timeout' ? 'Timed out waiting for acknowledgement' : `Transport error: ${outcome.message}`;
    return supportsIdempotency ? retry(error) : { status: 'needs_review', error: `${error}; outcome unknown and agent lacks idempotency support` };
  }
  const { status, body } = outcome;
  if (status >= 200 && status < 300) {
    const runId = body && typeof body === 'object' ? (body.run_id ?? body.runId) : null;
    if (body?.accepted === true && typeof runId === 'string' && runId.length > 0 && runId.length <= 200) return { status: 'accepted', runId };
    return { status: 'needs_review', error: 'Endpoint returned 2xx without {accepted:true, run_id}' };
  }
  if (status === 408 || status === 429 || status >= 500) return retry(`HTTP ${status}`);
  return { status: 'failed', error: `HTTP ${status}` };
}

// ---------- signatures ----------
const enc = new TextEncoder();
export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const signingString = (ts: string, nonce: string, body: string) => `${ts}.${nonce}.${body}`;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Signature + freshness only; nonce uniqueness is enforced by the database insert. */
export async function verifyCallback(secret: string, headers: { ts: string | null; nonce: string | null; sig: string | null }, body: string, nowSec: number) {
  const { ts, nonce, sig } = headers;
  if (!ts || !nonce || !sig) return { ok: false as const, reason: 'missing_signature_headers' };
  if (!/^\d{9,11}$/.test(ts) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return { ok: false as const, reason: 'malformed_headers' };
  if (Math.abs(nowSec - Number(ts)) > CALLBACK_WINDOW_SECONDS) return { ok: false as const, reason: 'stale_timestamp' };
  const expected = await hmacHex(secret, signingString(ts, nonce, body));
  if (!safeEqual(expected, sig.toLowerCase())) return { ok: false as const, reason: 'bad_signature' };
  return { ok: true as const };
}

// ---------- mentions ----------
export function parseMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/(^|[^\w@])@([a-z0-9_]{2,32})\b/gi)) out.add(m[2].toLowerCase());
  return [...out];
}

export type MentionCandidate = Pick<AgentRow, 'id' | 'slug' | 'enabled' | 'member_id' | 'transport' | 'mention_hourly_limit'>;
export type RouteResult = { wake: string[]; skipped: { slug: string; reason: string }[] };

/** Bounded mention routing: no self wake, hop cap, per-agent hourly cap, enabled+linked only. */
export function routeMentions(opts: {
  body: string; senderAgentId: string | null; hop: number; agents: MentionCandidate[]; recentWakes: Record<string, number>;
}): RouteResult {
  const res: RouteResult = { wake: [], skipped: [] };
  const slugs = parseMentions(opts.body);
  for (const slug of slugs) {
    const a = opts.agents.find((x) => x.slug === slug);
    if (!a) continue;
    if (a.id === opts.senderAgentId) res.skipped.push({ slug, reason: 'self_mention' });
    else if (opts.hop > MAX_HOP) res.skipped.push({ slug, reason: 'hop_limit' });
    else if (!a.enabled || !a.member_id || a.transport === 'none') res.skipped.push({ slug, reason: 'not_connected' });
    else if ((opts.recentWakes[a.id] ?? 0) >= a.mention_hourly_limit) res.skipped.push({ slug, reason: 'rate_limited' });
    else res.wake.push(a.id);
  }
  return res;
}

export const mentionKey = (messageId: string, agentId: string) => `mention:${messageId}:${agentId}`;
