// Per-client Meta SYSTEM USER token (encrypted at rest).
//
// - The raw token is stored ONLY as AES-256-GCM ciphertext in the service-role
//   table `client_meta_system_tokens` (bound to the client id). The key comes
//   from the auto-generated runtime secret META_SYSTEM_TOKEN_ENC_KEY, which is
//   never in the database. (Supabase Vault is not available to this project's
//   build tooling, so this replaces it with the same "no manual key" property.)
//   The usage-log source label stays 'system_user_vault' for compatibility.
// - `resolveClientMetaToken` is the one server-side reader. When a client has
//   an `active`, unexpired system token it is used; otherwise the caller's
//   EXISTING token choice is returned unchanged (byte-for-byte), so clients
//   without a system token behave exactly as before.
// - Every resolution writes one `meta_token_usage_log` row (source + reason).
// - If Meta rejects the vault token (OAuth 190 / 102 / 10 / 2xx permission),
//   the row is marked `needs_attention` and the caller retries ONCE with the
//   fallback (user) token — see `MetaTokenHandle.fetch`.
// - Nothing here ever returns, logs or audits the token value.

import { META_GRAPH_BASE, metaFetch, resolveMetaToken, type MetaTokenClient } from './meta.ts';

export type MetaTokenSource =
  | 'system_user_vault'
  | 'system_user_legacy_column'
  | 'client'
  | 'master'
  | 'none';

export type LegacyTokenChoice = {
  token: string | null;
  source: Exclude<MetaTokenSource, 'system_user_vault'>;
};

export type SystemTokenStatus = 'active' | 'invalid' | 'needs_attention';

/* ───────────────────────────── Redaction ───────────────────────────── */

/** Strips anything token-shaped out of a string before it is logged or returned. */
export function redactMetaSecrets(input: unknown): string {
  return String(input ?? '')
    .replace(/((?:access|input)_token=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/\bEAA[A-Za-z0-9]{16,}\b/g, '[redacted]')
    .slice(0, 500);
}

function metaErrorText(err: any, fallback: string): string {
  if (!err) return fallback;
  const code = err.code != null ? `(#${err.code}${err.error_subcode ? `/${err.error_subcode}` : ''}) ` : '';
  return redactMetaSecrets(`${code}${err.message || err.error_user_msg || fallback}`);
}

/** OAuth / permission errors that mean "this token can't do this". */
export function isMetaTokenFailure(body: any): boolean {
  const code = Number(body?.error?.code);
  if (!Number.isFinite(code)) return false;
  return code === 190 || code === 102 || code === 10 || (code >= 200 && code < 300);
}

/* ──────────────────────── Legacy token choice ──────────────────────── */

/** Today's shared precedence (resolveMetaToken in _shared/meta.ts), renamed sources. */
export function legacyFromResolveMetaToken(client: MetaTokenClient | null | undefined): LegacyTokenChoice {
  const r = resolveMetaToken(client);
  return { token: r.token, source: r.source === 'system_user' ? 'system_user_legacy_column' : r.source };
}

/**
 * For functions with their own inline precedence (e.g. `a || b || c`): pass the
 * same values in the same order and get the exact same token back, with a label.
 * The first truthy value wins — identical to the `||` chain it replaces.
 */
export function legacyChain(
  chain: Array<[Exclude<MetaTokenSource, 'system_user_vault' | 'none'>, string | null | undefined]>,
): LegacyTokenChoice {
  for (const [source, value] of chain) {
    if (value) return { token: value, source };
  }
  return { token: null, source: 'none' };
}

/* ─────────────────────────── Encryption ─────────────────────────── */

const ENC_VERSION = 'v1';

function envKey(): string | undefined {
  try { return (globalThis as any).Deno?.env?.get('META_SYSTEM_TOKEN_ENC_KEY'); } catch { return undefined; }
}

async function aesKey(material?: string): Promise<CryptoKey> {
  const raw = material ?? envKey();
  if (!raw || raw.length < 32) throw new Error('encryption_key_missing');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`meta-system-token:${ENC_VERSION}:${raw}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** AES-256-GCM, client id as additional data so a ciphertext can't be moved to another client. */
export async function encryptSystemToken(token: string, clientId: string, material?: string): Promise<string> {
  const key = await aesKey(material);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(clientId) },
      key,
      new TextEncoder().encode(token),
    ),
  );
  return `${ENC_VERSION}.${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptSystemToken(ciphertext: string, clientId: string, material?: string): Promise<string> {
  const [ver, ivB64, ctB64] = String(ciphertext || '').split('.');
  if (ver !== ENC_VERSION || !ivB64 || !ctB64) throw new Error('bad_ciphertext');
  const key = await aesKey(material);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64), additionalData: new TextEncoder().encode(clientId) },
    key,
    fromB64(ctB64),
  );
  return new TextDecoder().decode(pt);
}

/* ─────────────────────────── Validation ─────────────────────────── */

export interface AdAccountAccess {
  ok: boolean;
  name?: string | null;
  account_status?: number | null;
  error?: string;
}

export interface SystemTokenValidation {
  valid: boolean;
  token_valid: boolean;
  status: SystemTokenStatus;
  token_type: string | null;
  system_user_id: string | null;
  system_user_name: string | null;
  scopes: string[];
  expires_at: string | null;
  data_access_expires_at: string | null;
  ad_account_access: Record<string, AdAccountAccess>;
  error: string | null;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const epochToIso = (v: unknown): string | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

const stripAct = (id: string) => String(id).trim().replace(/^act_/i, '');

async function readJson(res: Response): Promise<any> {
  try { return await res.json(); } catch { return {}; }
}

/**
 * Checks a token with Meta: debug_token (self-inspected), /me, and each of the
 * client's ad accounts. Pure apart from the injected fetcher.
 */
export async function validateSystemToken(
  token: string,
  adAccountIds: string[],
  fetcher: Fetcher = (u, i) => metaFetch(u, { ...(i || {}), maxRetries: 2 }),
  now: number = Date.now(),
): Promise<SystemTokenValidation> {
  const t = encodeURIComponent(token);
  const result: SystemTokenValidation = {
    valid: false,
    token_valid: false,
    status: 'invalid',
    token_type: null,
    system_user_id: null,
    system_user_name: null,
    scopes: [],
    expires_at: null,
    data_access_expires_at: null,
    ad_account_access: {},
    error: null,
  };

  try {
    const dbgRes = await fetcher(`${META_GRAPH_BASE}/debug_token?input_token=${t}&access_token=${t}`);
    const dbg = await readJson(dbgRes);
    const d = dbg?.data;
    if (!dbgRes.ok || !d) {
      result.error = metaErrorText(dbg?.error, `Meta returned ${dbgRes.status} for debug_token`);
      return result;
    }
    result.token_type = d.type ? String(d.type) : null;
    result.scopes = Array.isArray(d.scopes) ? d.scopes.map(String) : [];
    result.expires_at = epochToIso(d.expires_at);
    result.data_access_expires_at = epochToIso(d.data_access_expires_at);
    result.system_user_id = d.user_id ? String(d.user_id) : d.profile_id ? String(d.profile_id) : null;
    if (d.is_valid !== true) {
      result.error = metaErrorText(d.error, 'Meta says this token is not valid');
      return result;
    }
    if (result.expires_at && Date.parse(result.expires_at) <= now) {
      result.error = 'Token has expired';
      return result;
    }
    result.token_valid = true;

    const meRes = await fetcher(`${META_GRAPH_BASE}/me?fields=id,name&access_token=${t}`);
    const me = await readJson(meRes);
    if (meRes.ok && me?.id) {
      result.system_user_id = String(me.id);
      result.system_user_name = me.name ? String(me.name) : null;
    }

    const ids = Array.from(new Set(adAccountIds.map(stripAct).filter((x) => /^\d+$/.test(x)))).slice(0, 25);
    for (const id of ids) {
      const r = await fetcher(`${META_GRAPH_BASE}/act_${id}?fields=id,name,account_status&access_token=${t}`);
      const b = await readJson(r);
      result.ad_account_access[id] = r.ok && b?.id
        ? { ok: true, name: b.name ?? null, account_status: typeof b.account_status === 'number' ? b.account_status : null }
        : { ok: false, error: metaErrorText(b?.error, `Meta returned ${r.status}`) };
    }

    const entries = Object.values(result.ad_account_access);
    const okCount = entries.filter((e) => e.ok).length;
    if (entries.length === 0 || okCount === entries.length) {
      result.valid = true;
      result.status = 'active';
    } else if (okCount > 0) {
      result.valid = true;
      result.status = 'needs_attention';
      result.error = `Token cannot access ${entries.length - okCount} of ${entries.length} ad accounts`;
    } else {
      result.valid = false;
      result.status = 'invalid';
      result.error = "Token is valid but cannot access any of this client's ad accounts";
    }
    return result;
  } catch (e) {
    result.error = redactMetaSecrets(e instanceof Error ? e.message : 'Meta validation failed');
    return result;
  }
}

/* ─────────────────────────── Status payload ─────────────────────────── */

export interface SystemTokenRow {
  client_id: string;
  system_user_id: string | null;
  system_user_name: string | null;
  token_last4: string | null;
  scopes: string[] | null;
  expires_at: string | null;
  data_access_expires_at: string | null;
  ad_account_access: Record<string, AdAccountAccess> | null;
  status: SystemTokenStatus;
  last_error: string | null;
  saved_at: string | null;
  saved_by: string | null;
  last_validated_at: string | null;
  last_used_at: string | null;
}

export const STATUS_COLUMNS =
  'client_id, system_user_id, system_user_name, token_last4, scopes, expires_at, data_access_expires_at, ad_account_access, status, last_error, saved_at, saved_by, last_validated_at, last_used_at';

export interface SystemTokenStatusPayload {
  client_id: string;
  status: 'not_set' | SystemTokenStatus;
  using: 'system_user' | 'user_token';
  system_user_id: string | null;
  system_user_name: string | null;
  token_last4: string | null;
  scopes: string[];
  expires_at: string | null;
  data_access_expires_at: string | null;
  ad_account_access: Record<string, AdAccountAccess>;
  saved_at: string | null;
  saved_by: string | null;
  last_validated_at: string | null;
  last_used_at: string | null;
  last_error: string | null;
}

/** True when the resolver would hand this row's token to a Meta pull. */
export function isUsable(row: Pick<SystemTokenRow, 'status' | 'expires_at'> | null, now = Date.now()): boolean {
  if (!row || row.status !== 'active') return false;
  return !row.expires_at || Date.parse(row.expires_at) > now;
}

/** Whitelisted metadata only — there is no token field to leak. */
export function toStatusPayload(clientId: string, row: SystemTokenRow | null, now = Date.now()): SystemTokenStatusPayload {
  return {
    client_id: clientId,
    status: row ? row.status : 'not_set',
    using: isUsable(row, now) ? 'system_user' : 'user_token',
    system_user_id: row?.system_user_id ?? null,
    system_user_name: row?.system_user_name ?? null,
    token_last4: row?.token_last4 ?? null,
    scopes: row?.scopes ?? [],
    expires_at: row?.expires_at ?? null,
    data_access_expires_at: row?.data_access_expires_at ?? null,
    ad_account_access: row?.ad_account_access ?? {},
    saved_at: row?.saved_at ?? null,
    saved_by: row?.saved_by ?? null,
    last_validated_at: row?.last_validated_at ?? null,
    last_used_at: row?.last_used_at ?? null,
    last_error: row?.last_error ?? null,
  };
}

export async function getClientSystemTokenStatus(sb: any, clientId: string): Promise<SystemTokenStatusPayload> {
  const { data } = await sb.from('client_meta_system_tokens').select(STATUS_COLUMNS).eq('client_id', clientId).maybeSingle();
  return toStatusPayload(clientId, (data as SystemTokenRow) ?? null);
}

/* ─────────────────────────── Resolver ─────────────────────────── */

export interface MetaTokenHandle {
  token: string | null;
  source: MetaTokenSource;
  fallbackReason: string | null;
  clientId: string | null;
  /** The pre-existing token choice; used after a vault-token failure. */
  legacy: LegacyTokenChoice;
  /**
   * Meta call with one automatic retry on the fallback token when the vault
   * token is rejected. Pass builders so the token can be swapped.
   */
  fetch(
    url: (token: string) => string,
    init?: RequestInit | ((token: string) => RequestInit),
    fetcher?: Fetcher,
  ): Promise<Response>;
  /** Mark the vault token failed and switch this handle to the fallback token. */
  fallBack(error: unknown): Promise<string | null>;
  /**
   * For functions that make many Meta calls with one token variable: when the
   * vault token is in use, make one cheap read (e.g. /act_<id>?fields=id) and
   * fall back if Meta rejects it. Returns the token to use for the rest of the
   * run. No-op (no network) when the vault token isn't in use.
   */
  preflight(url: (token: string) => string, fetcher?: Fetcher): Promise<string | null>;
}

async function logUsage(sb: any, clientId: string | null, functionName: string, source: MetaTokenSource, reason: string | null) {
  console.log(`[meta-token] fn=${functionName} client=${clientId ?? '-'} source=${source}${reason ? ` reason=${reason}` : ''}`);
  try {
    await sb.from('meta_token_usage_log').insert({
      client_id: clientId,
      function_name: functionName.slice(0, 80),
      source,
      fallback_reason: reason,
    });
  } catch { /* logging must never break a pull */ }
}

/** Marks the stored system token as needing attention (never deletes it). */
export async function markSystemTokenFailed(sb: any, clientId: string, error: unknown): Promise<void> {
  const msg = typeof error === 'object' && error ? metaErrorText(error, 'Meta rejected the system user token') : redactMetaSecrets(error);
  console.warn(`[meta-token] system token failed for client=${clientId}: ${msg}`);
  try {
    await sb
      .from('client_meta_system_tokens')
      .update({ status: 'needs_attention', last_error: msg, updated_at: new Date().toISOString() })
      .eq('client_id', clientId);
  } catch { /* best effort */ }
}

export interface ResolveOptions {
  /** The function's existing token choice. Defaults to resolveMetaToken(client). */
  legacy?: LegacyTokenChoice;
  now?: number;
  /** Test hook; production reads META_SYSTEM_TOKEN_ENC_KEY. */
  keyMaterial?: string;
}

/**
 * Returns the token a Meta pull should use. Vault system token first (when
 * active + unexpired), otherwise exactly the caller's existing choice.
 */
export async function resolveClientMetaToken(
  sb: any,
  client: (MetaTokenClient & { id?: string | null }) | string | null | undefined,
  functionName: string,
  opts: ResolveOptions = {},
): Promise<MetaTokenHandle> {
  const clientRow = typeof client === 'string' ? null : client ?? null;
  const clientId = typeof client === 'string' ? client : client?.id ?? null;
  const legacy = opts.legacy ?? legacyFromResolveMetaToken(clientRow);
  const now = opts.now ?? Date.now();

  let token: string | null = legacy.token;
  let source: MetaTokenSource = legacy.source;
  let reason: string | null = null;

  if (!clientId) {
    reason = 'no_client';
  } else {
    try {
      const { data: row, error } = await sb
        .from('client_meta_system_tokens')
        .select('status, expires_at, token_ciphertext')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) reason = 'system_token_lookup_failed';
      else if (!row) reason = 'no_system_token';
      else if (row.status !== 'active') reason = row.status === 'invalid' ? 'system_token_invalid' : 'system_token_needs_attention';
      else if (row.expires_at && Date.parse(row.expires_at) <= now) reason = 'system_token_expired';
      else {
        const secret = await decryptSystemToken(row.token_ciphertext, clientId, opts.keyMaterial).catch(() => null);
        if (!secret || !secret.trim()) reason = 'system_token_read_failed';
        else {
          token = secret.trim();
          source = 'system_user_vault';
          sb.from('client_meta_system_tokens')
            .update({ last_used_at: new Date(now).toISOString() })
            .eq('client_id', clientId)
            .then(() => {}, () => {});
        }
      }
    } catch {
      reason = 'system_token_lookup_failed';
    }
  }

  await logUsage(sb, clientId, functionName, source, reason);

  const handle: MetaTokenHandle = {
    token,
    source,
    fallbackReason: reason,
    clientId,
    legacy,
    async fallBack(error: unknown) {
      if (handle.source !== 'system_user_vault' || !clientId) return handle.token;
      await markSystemTokenFailed(sb, clientId, error);
      handle.token = legacy.token;
      handle.source = legacy.source;
      handle.fallbackReason = 'system_token_rejected_by_meta';
      await logUsage(sb, clientId, functionName, legacy.source, 'system_token_rejected_by_meta');
      return handle.token;
    },
    async preflight(url, fetcher = fetch) {
      if (handle.source !== 'system_user_vault') return handle.token;
      try {
        const r = await handle.fetch(url, undefined, fetcher);
        await r.body?.cancel().catch(() => {});
      } catch { /* network trouble isn't a token verdict */ }
      return handle.token;
    },
    async fetch(url, init, fetcher = fetch) {
      const build = (t: string): [string, RequestInit | undefined] => [url(t), typeof init === 'function' ? init(t) : init];
      const [u, i] = build(handle.token ?? '');
      const res = await fetcher(u, i);
      if (res.ok || handle.source !== 'system_user_vault') return res;
      const body = await res.clone().json().catch(() => null);
      if (!isMetaTokenFailure(body)) return res;
      const next = await handle.fallBack(body?.error);
      if (!next) return res;
      const [u2, i2] = build(next);
      return fetcher(u2, i2);
    },
  };
  return handle;
}

/* ─────────────────────── Shared actions (UI + agents) ─────────────────────── */

export type SystemTokenAction = 'status' | 'set' | 'delete' | 'revalidate';

export interface SystemTokenActionInput {
  action: SystemTokenAction;
  clientId: string;
  token?: unknown;
  actor: { label: string; userId?: string | null };
  source: 'dashboard' | 'agent_api';
}

export interface SystemTokenActionResult {
  httpStatus: number;
  /** Error code for non-2xx (and for a rejected token). */
  errorCode?: string;
  errorMessage?: string;
  saved?: boolean;
  data: SystemTokenStatusPayload | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the pasted token's shape without ever echoing it. */
export function checkTokenInput(raw: unknown): { ok: true; token: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'token must be a string' };
  const t = raw.trim();
  if (t.length < 20 || t.length > 4096) return { ok: false, error: 'token length looks wrong' };
  if (/\s/.test(t)) return { ok: false, error: 'token must not contain spaces or line breaks' };
  return { ok: true, token: t };
}

async function clientAdAccountIds(sb: any, clientId: string): Promise<string[] | null> {
  const [{ data: client }, { data: accounts }] = await Promise.all([
    sb.from('clients').select('id, meta_ad_account_id, meta_ad_account_ids').eq('id', clientId).maybeSingle(),
    sb.from('client_ad_accounts').select('provider, provider_account_id, status').eq('client_id', clientId),
  ]);
  if (!client) return null;
  const ids: string[] = [];
  if (client.meta_ad_account_id) ids.push(String(client.meta_ad_account_id));
  if (Array.isArray(client.meta_ad_account_ids)) ids.push(...client.meta_ad_account_ids.map(String));
  for (const a of accounts || []) {
    if ((a.provider || 'meta') === 'meta' && a.status !== 'disconnected' && a.provider_account_id) ids.push(String(a.provider_account_id));
  }
  return Array.from(new Set(ids.map(stripAct).filter(Boolean)));
}

async function audit(sb: any, input: SystemTokenActionInput, action: string, changes: Record<string, unknown>) {
  try {
    await sb.from('client_settings_audit').insert({
      client_id: input.clientId,
      entity_type: 'meta_system_token',
      entity_id: null,
      action,
      source: input.source,
      actor_label: input.actor.label.slice(0, 120),
      actor_user_id: input.actor.userId ?? null,
      changes,
    });
  } catch { /* audit is best effort, never blocks */ }
}

function validationRow(v: SystemTokenValidation) {
  return {
    system_user_id: v.system_user_id,
    system_user_name: v.system_user_name,
    scopes: v.scopes,
    expires_at: v.expires_at,
    data_access_expires_at: v.data_access_expires_at,
    ad_account_access: v.ad_account_access,
    status: v.status,
    last_error: v.error,
    last_validated_at: new Date().toISOString(),
  };
}

export async function runSystemTokenAction(
  sb: any,
  input: SystemTokenActionInput,
  fetcher?: Fetcher,
  keyMaterial?: string,
): Promise<SystemTokenActionResult> {
  const { clientId } = input;
  if (!UUID_RE.test(clientId || '')) {
    return { httpStatus: 400, errorCode: 'invalid_client_id', errorMessage: 'client_id must be a UUID', data: null };
  }
  const adIds = await clientAdAccountIds(sb, clientId);
  if (adIds === null) return { httpStatus: 404, errorCode: 'client_not_found', errorMessage: 'No such client', data: null };

  const current = await getClientSystemTokenStatus(sb, clientId);

  switch (input.action) {
    case 'status':
      return { httpStatus: 200, data: current };

    case 'set': {
      const checked = checkTokenInput(input.token);
      if (checked.ok === false) return { httpStatus: 400, errorCode: 'invalid_token_input', errorMessage: checked.error, data: current };
      const v = await validateSystemToken(checked.token, adIds, fetcher);
      if (!v.valid) {
        await audit(sb, input, 'set_rejected', { status: 'invalid', reason: v.error, system_user_id: v.system_user_id });
        // Nothing stored; any existing token is left exactly as it was.
        return {
          httpStatus: 422,
          errorCode: 'meta_token_invalid',
          errorMessage: v.error || 'Meta says this token is invalid',
          saved: false,
          // First upload rejected → show Invalid. Replacement rejected → the saved
          // token's real status is kept (it is still what pulls use).
          data: current.status === 'not_set' ? { ...current, status: 'invalid', last_error: v.error } : current,
        };
      }
      let ciphertext: string;
      try {
        ciphertext = await encryptSystemToken(checked.token, clientId, keyMaterial);
      } catch {
        return { httpStatus: 500, errorCode: 'encryption_unavailable', errorMessage: 'Could not store the token securely', data: current };
      }
      const nowIso = new Date().toISOString();
      const { error: upErr } = await sb.from('client_meta_system_tokens').upsert(
        {
          client_id: clientId,
          token_ciphertext: ciphertext,
          key_version: 1,
          token_last4: checked.token.slice(-4),
          ...validationRow(v),
          saved_at: nowIso,
          saved_by: input.actor.label.slice(0, 120),
          updated_at: nowIso,
        },
        { onConflict: 'client_id' },
      );
      if (upErr) return { httpStatus: 500, errorCode: 'metadata_write_failed', errorMessage: 'Token stored but metadata failed to save', data: current };
      const next = await getClientSystemTokenStatus(sb, clientId);
      await audit(sb, input, current.status === 'not_set' ? 'set' : 'replace', {
        status: next.status,
        system_user_id: next.system_user_id,
        last4: next.token_last4,
        scopes: next.scopes,
      });
      return { httpStatus: 200, saved: true, data: next };
    }

    case 'delete': {
      if (current.status === 'not_set') return { httpStatus: 200, data: current };
      const { error } = await sb.from('client_meta_system_tokens').delete().eq('client_id', clientId);
      if (error) return { httpStatus: 500, errorCode: 'delete_failed', errorMessage: 'Could not remove the token', data: current };
      await audit(sb, input, 'delete', { previous_status: current.status, system_user_id: current.system_user_id, last4: current.token_last4 });
      return { httpStatus: 200, data: toStatusPayload(clientId, null) };
    }

    case 'revalidate': {
      if (current.status === 'not_set') {
        return { httpStatus: 404, errorCode: 'not_set', errorMessage: 'No system user token saved for this client', data: current };
      }
      const { data: enc } = await sb.from('client_meta_system_tokens').select('token_ciphertext').eq('client_id', clientId).maybeSingle();
      const secret = enc?.token_ciphertext ? await decryptSystemToken(enc.token_ciphertext, clientId, keyMaterial).catch(() => null) : null;
      if (!secret) {
        return { httpStatus: 500, errorCode: 'token_read_failed', errorMessage: 'Could not read the stored token', data: current };
      }
      const v = await validateSystemToken(secret, adIds, fetcher);
      await sb.from('client_meta_system_tokens').update({ ...validationRow(v), updated_at: new Date().toISOString() }).eq('client_id', clientId);
      const next = await getClientSystemTokenStatus(sb, clientId);
      await audit(sb, input, 'revalidate', { status: next.status, system_user_id: next.system_user_id, last4: next.token_last4 });
      return { httpStatus: 200, data: next };
    }

    default:
      return { httpStatus: 400, errorCode: 'invalid_action', errorMessage: 'action must be status, set, delete or revalidate', data: null };
  }
}
