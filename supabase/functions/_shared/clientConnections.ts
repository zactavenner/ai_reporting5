/**
 * Canonical Client Connections & Settings logic (pure, no I/O).
 *
 * Shared by the `client-connections` edge function and covered directly by
 * src/test/client-connections.test.ts. Nothing here ever returns a raw
 * credential: callers may only receive `secret_present` / `last4` / status.
 */

export type AuditSource = 'huddle' | 'client_settings' | 'agent_api';

export const AUDIT_SOURCES: AuditSource[] = ['huddle', 'client_settings', 'agent_api'];

export function normalizeAuditSource(raw: unknown): AuditSource {
  const v = String(raw ?? '').toLowerCase();
  return (AUDIT_SOURCES as string[]).includes(v) ? (v as AuditSource) : 'client_settings';
}

/* ─────────────────────────── Ad account identity ─────────────────────────── */

export type Normalized<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Meta ad account IDs are stored WITHOUT the `act_` prefix everywhere in this
 * project (clients.meta_ad_account_id, sync-meta-ads, meta_ad_accounts), so the
 * optional prefix is accepted on input and stripped on save.
 */
export function normalizeAdAccountId(raw: unknown): Normalized<string> {
  const trimmed = String(raw ?? '').trim().replace(/^act_/i, '').replace(/\s+/g, '');
  if (!trimmed) return { ok: false, error: 'Ad account ID is required' };
  if (!/^\d{6,20}$/.test(trimmed)) {
    return { ok: false, error: 'Ad account ID must be 6–20 digits, with or without the act_ prefix' };
  }
  return { ok: true, value: trimmed };
}

export function withActPrefix(id: string): string {
  return `act_${id}`;
}

/* ───────────────────────────── Secret handling ───────────────────────────── */

const SECRET_KEY_RE = /(token|secret|key|password|credential|api_?key)/i;

export function last4(secret: unknown): string | null {
  const s = String(secret ?? '').trim();
  if (s.length < 4) return null;
  return s.slice(-4);
}

/** Browser-safe descriptor for a stored credential. Never includes the value. */
export function secretMeta(secret: unknown): { secret_present: boolean; last4: string | null } {
  const s = String(secret ?? '').trim();
  return { secret_present: !!s, last4: s ? last4(s) : null };
}

export function maskSecret(secret: unknown): string | null {
  const tail = last4(secret);
  return tail ? `••••${tail}` : null;
}

/**
 * Strips credential-ish values out of any object destined for the audit log.
 * Keys are preserved (so "meta_access_token changed" is still auditable) but
 * values become `[redacted]`. Recurses through nested objects and arrays.
 */
export function redactForAudit(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(input)) return input.map((v) => redactForAudit(v, depth + 1));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : redactForAudit(v, depth + 1);
    }
    return out;
  }
  return input;
}

/* ──────────────────────────────── Offers ─────────────────────────────────── */

export const OFFER_STATUSES = ['active', 'paused', 'archived'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export interface OfferInput {
  title?: unknown;
  offer_type?: unknown;
  status?: unknown;
  notes?: unknown;
  is_primary?: unknown;
}

export function validateOfferInput(
  input: OfferInput,
  { partial = false }: { partial?: boolean } = {},
): Normalized<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  if (input.title !== undefined || !partial) {
    const title = String(input.title ?? '').trim();
    if (!title) return { ok: false, error: 'Offer name is required' };
    if (title.length > 200) return { ok: false, error: 'Offer name must be 200 characters or fewer' };
    out.title = title;
  }
  if (input.offer_type !== undefined) {
    const t = String(input.offer_type ?? '').trim();
    out.offer_type = t || 'offer';
  }
  if (input.status !== undefined) {
    const s = String(input.status ?? '').trim().toLowerCase();
    if (!(OFFER_STATUSES as readonly string[]).includes(s)) {
      return { ok: false, error: `Status must be one of: ${OFFER_STATUSES.join(', ')}` };
    }
    out.status = s;
  }
  if (input.notes !== undefined) {
    const n = String(input.notes ?? '').trim();
    out.notes = n || null;
  }
  if (input.is_primary !== undefined) out.is_primary = !!input.is_primary;

  if (partial && Object.keys(out).length === 0) return { ok: false, error: 'No changes supplied' };
  return { ok: true, value: out };
}

/* ─────────────────────────── Connection lifecycle ────────────────────────── */

/**
 * A saved connection is NOT synced reporting. These states are surfaced
 * verbatim in both the Huddle and the client Settings tab.
 */
export const CONNECTION_STATES = [
  'saved',
  'verification_pending',
  'verified',
  'sync_queued',
  'sync_running',
  'reporting_current',
  'partial',
  'failed',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const AD_ACCOUNT_STATUSES = ['active', 'paused', 'disconnected', 'unknown'] as const;

export function validateAdAccountPatch(input: Record<string, unknown>): Normalized<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (input.account_name !== undefined) {
    const n = String(input.account_name ?? '').trim();
    if (n.length > 200) return { ok: false, error: 'Account label must be 200 characters or fewer' };
    out.account_name = n || null;
  }
  if (input.is_primary !== undefined) out.is_primary = !!input.is_primary;
  if (input.rollup_enabled !== undefined) out.rollup_enabled = !!input.rollup_enabled;
  if (input.status !== undefined) {
    const s = String(input.status ?? '').trim().toLowerCase();
    if (!(AD_ACCOUNT_STATUSES as readonly string[]).includes(s)) {
      return { ok: false, error: `Status must be one of: ${AD_ACCOUNT_STATUSES.join(', ')}` };
    }
    out.status = s;
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'No changes supplied' };
  return { ok: true, value: out };
}

/* ──────────────────────────── Roll-up summary ───────────────────────────── */

export interface RollupAccount {
  provider?: string | null;
  provider_account_id: string;
  rollup_enabled?: boolean | null;
  status?: string | null;
  ads_total?: number | null;
  ads_active?: number | null;
  ads_paused?: number | null;
  campaigns_count?: number | null;
  adsets_count?: number | null;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
}

export interface RollupSummary {
  accounts_connected: number;
  accounts_in_rollup: number;
  campaigns_count: number | null;
  adsets_count: number | null;
  ads_total: number | null;
  ads_active: number | null;
  ads_paused: number | null;
  last_successful_sync: string | null;
  /** Number of rolled-up accounts with no count data at all. */
  accounts_missing_counts: number;
  accounts_with_errors: number;
  health: 'healthy' | 'partial' | 'stale' | 'error' | 'unknown';
}

const STALE_MS = 36 * 60 * 60 * 1000;

/**
 * Aggregates only accounts enabled for roll-up, deduplicated by
 * provider + provider_account_id so an account listed twice cannot double count.
 * Missing counts stay `null` — they are never reported as zero.
 */
export function computeRollup(accounts: RollupAccount[], now: number = Date.now()): RollupSummary {
  const live = accounts.filter((a) => (a.status ?? 'unknown') !== 'disconnected');
  const seen = new Set<string>();
  const rolled: RollupAccount[] = [];
  for (const a of live) {
    if (a.rollup_enabled === false) continue;
    const key = `${(a.provider || 'meta').toLowerCase()}:${a.provider_account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rolled.push(a);
  }

  const sum = (field: keyof RollupAccount): number | null => {
    const known = rolled.map((a) => a[field]).filter((v): v is number => typeof v === 'number');
    return known.length ? known.reduce((t, v) => t + v, 0) : null;
  };

  const missing = rolled.filter(
    (a) => typeof a.ads_total !== 'number' && typeof a.campaigns_count !== 'number',
  ).length;
  const errored = rolled.filter((a) => a.last_sync_status === 'failed' || !!a.last_sync_error).length;

  const syncTimes = rolled
    .filter((a) => a.last_sync_at && a.last_sync_status !== 'failed')
    .map((a) => new Date(a.last_sync_at as string).getTime())
    .filter((t) => Number.isFinite(t));
  const lastSuccess = syncTimes.length ? new Date(Math.max(...syncTimes)).toISOString() : null;

  let health: RollupSummary['health'] = 'healthy';
  if (rolled.length === 0) health = 'unknown';
  else if (errored > 0) health = 'error';
  else if (missing > 0) health = missing === rolled.length ? 'unknown' : 'partial';
  else if (!lastSuccess) health = 'unknown';
  else if (now - new Date(lastSuccess).getTime() > STALE_MS) health = 'stale';

  return {
    accounts_connected: live.length,
    accounts_in_rollup: rolled.length,
    campaigns_count: sum('campaigns_count'),
    adsets_count: sum('adsets_count'),
    ads_total: sum('ads_total'),
    ads_active: sum('ads_active'),
    ads_paused: sum('ads_paused'),
    last_successful_sync: lastSuccess,
    accounts_missing_counts: missing,
    accounts_with_errors: errored,
    health,
  };
}

/* ──────────────────── Reporting roster (clients table) ───────────────────── */

/**
 * Every reporting query, scorecard, Creative Library run and sync fan-out reads
 * the roster off `clients.meta_ad_account_id` (primary) plus
 * `clients.meta_ad_account_ids` (all). The normalized roster stays the source of
 * truth and is written through to those columns so no reporting path is missed.
 */
export function buildReportingRoster(
  accounts: Pick<RollupAccount, 'provider_account_id' | 'status' | 'provider'>[],
  currentPrimary: string | null | undefined,
  explicitPrimary?: string | null,
): { primary: string | null; all: string[] } {
  const ids: string[] = [];
  for (const a of accounts) {
    if ((a.provider || 'meta').toLowerCase() !== 'meta') continue;
    if ((a.status ?? 'unknown') === 'disconnected') continue;
    if (!ids.includes(a.provider_account_id)) ids.push(a.provider_account_id);
  }
  const current = String(currentPrimary ?? '').replace(/^act_/i, '');
  const primary =
    (explicitPrimary && ids.includes(explicitPrimary) && explicitPrimary) ||
    (ids.includes(current) ? current : null) ||
    ids[0] ||
    null;
  return { primary, all: ids };
}

/* ─────────────────────────── Duplicate detection ─────────────────────────── */

export type AddConflict =
  | { kind: 'duplicate'; existingId: string }
  | { kind: 'other_client'; clientId: string; clientName?: string | null }
  | null;

export function classifyExistingAccount(
  existing: { id: string; client_id: string; status?: string | null } | null | undefined,
  targetClientId: string,
): AddConflict {
  if (!existing) return null;
  if (existing.client_id === targetClientId) return { kind: 'duplicate', existingId: existing.id };
  return { kind: 'other_client', clientId: existing.client_id };
}
