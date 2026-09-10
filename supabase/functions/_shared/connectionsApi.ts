/**
 * Agent-safe Connections API — pure routing/validation/shaping helpers.
 *
 * Covered by src/test/connections-api.test.ts. Nothing here touches the network
 * or a credential value; response shapers explicitly whitelist safe fields so a
 * token can never leak into an API payload.
 */

export const API_BASE_PATH = '/connections-api';

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS';

export type Route =
  | { name: 'list_clients' }
  | { name: 'list_all_ad_accounts' }
  | { name: 'list_offers'; clientId: string }
  | { name: 'create_offer'; clientId: string }
  | { name: 'patch_offer'; clientId: string; offerId: string }
  | { name: 'list_ad_accounts'; clientId: string }
  | { name: 'create_ad_account'; clientId: string }
  | { name: 'patch_ad_account'; clientId: string; adAccountId: string }
  | { name: 'sync_ad_account'; clientId: string; adAccountId: string }
  | { name: 'list_integrations'; clientId: string }
  | { name: 'test_integration'; clientId: string; integration: string }
  | { name: 'replace_credential'; clientId: string; integration: string };

export interface RouteError {
  status: number;
  code: string;
  message: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function segments(pathname: string): string[] {
  const stripped = pathname.replace(/^\/functions\/v1/, '').replace(API_BASE_PATH, '');
  return stripped.split('/').filter(Boolean);
}

/** Maps method + path to a route, or an error with a stable code. */
export function resolveRoute(method: string, pathname: string): { route: Route } | { error: RouteError } {
  const m = method.toUpperCase() as Method;
  const s = segments(pathname);

  const notFound: RouteError = { status: 404, code: 'route_not_found', message: `No route for ${m} ${pathname}` };
  const wrongMethod = (allowed: string): { error: RouteError } => ({
    error: { status: 405, code: 'method_not_allowed', message: `Use ${allowed} on this path` },
  });

  if (s.length === 0) return { error: notFound };

  if (s[0] === 'ad-accounts' && s.length === 1) {
    if (m !== 'GET') return wrongMethod('GET');
    return { route: { name: 'list_all_ad_accounts' } };
  }

  if (s[0] !== 'clients') return { error: notFound };

  if (s.length === 1) {
    if (m !== 'GET') return wrongMethod('GET');
    return { route: { name: 'list_clients' } };
  }

  const clientId = s[1];
  if (!UUID_RE.test(clientId)) {
    return { error: { status: 400, code: 'invalid_client_id', message: 'client_id must be a UUID' } };
  }

  const rest = s.slice(2);

  if (rest[0] === 'offers') {
    if (rest.length === 1) {
      if (m === 'GET') return { route: { name: 'list_offers', clientId } };
      if (m === 'POST') return { route: { name: 'create_offer', clientId } };
      return wrongMethod('GET or POST');
    }
    if (rest.length === 2) {
      if (m !== 'PATCH') return wrongMethod('PATCH');
      if (!UUID_RE.test(rest[1])) {
        return { error: { status: 400, code: 'invalid_offer_id', message: 'offer id must be a UUID' } };
      }
      return { route: { name: 'patch_offer', clientId, offerId: rest[1] } };
    }
    return { error: notFound };
  }

  if (rest[0] === 'ad-accounts') {
    if (rest.length === 1) {
      if (m === 'GET') return { route: { name: 'list_ad_accounts', clientId } };
      if (m === 'POST') return { route: { name: 'create_ad_account', clientId } };
      return wrongMethod('GET or POST');
    }
    if (!UUID_RE.test(rest[1])) {
      return { error: { status: 400, code: 'invalid_ad_account_id', message: 'ad account id must be a UUID' } };
    }
    if (rest.length === 2) {
      if (m !== 'PATCH') return wrongMethod('PATCH');
      return { route: { name: 'patch_ad_account', clientId, adAccountId: rest[1] } };
    }
    if (rest.length === 3 && rest[2] === 'sync') {
      if (m !== 'POST') return wrongMethod('POST');
      return { route: { name: 'sync_ad_account', clientId, adAccountId: rest[1] } };
    }
    return { error: notFound };
  }

  if (rest[0] === 'integrations') {
    if (rest.length === 1) {
      if (m !== 'GET') return wrongMethod('GET');
      return { route: { name: 'list_integrations', clientId } };
    }
    const integration = rest[1].toLowerCase();
    if (integration !== 'meta' && integration !== 'ghl') {
      return { error: { status: 400, code: 'unsupported_integration', message: 'integration must be meta or ghl' } };
    }
    if (rest.length === 3 && rest[2] === 'test') {
      if (m !== 'POST') return wrongMethod('POST');
      return { route: { name: 'test_integration', clientId, integration } };
    }
    if (rest.length === 3 && rest[2] === 'credential') {
      if (m !== 'PUT') return wrongMethod('PUT');
      return { route: { name: 'replace_credential', clientId, integration } };
    }
    return { error: notFound };
  }

  return { error: notFound };
}

/* ───────────────────────────── Pagination ───────────────────────────────── */

export interface Page {
  limit: number;
  offset: number;
}

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;

export function parsePagination(params: URLSearchParams | Record<string, string>): Page | { error: RouteError } {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.get(k) : (params as Record<string, string>)[k] ?? null;
  const rawLimit = get('limit');
  const rawOffset = get('offset');

  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit !== '') {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return { error: { status: 400, code: 'invalid_limit', message: `limit must be an integer between 1 and ${MAX_LIMIT}` } };
    }
    limit = n;
  }
  let offset = 0;
  if (rawOffset !== null && rawOffset !== '') {
    const n = Number(rawOffset);
    if (!Number.isInteger(n) || n < 0) {
      return { error: { status: 400, code: 'invalid_offset', message: 'offset must be an integer of 0 or more' } };
    }
    offset = n;
  }
  return { limit, offset };
}

export function pageMeta(page: Page, returned: number, total: number | null) {
  return {
    limit: page.limit,
    offset: page.offset,
    returned,
    total,
    has_more: total === null ? returned === page.limit : page.offset + returned < total,
    next_offset: (total === null ? returned === page.limit : page.offset + returned < total)
      ? page.offset + returned
      : null,
  };
}

/* ───────────────────────── Safe response shaping ────────────────────────── */

const AD_ACCOUNT_FIELDS = [
  'id',
  'client_id',
  'provider',
  'provider_account_id',
  'account_name',
  'business_id',
  'status',
  'is_primary',
  'rollup_enabled',
  'currency',
  'timezone_name',
  'token_source',
  'connection_state',
  'last_verified_at',
  'last_sync_at',
  'last_sync_status',
  'last_sync_error',
  'campaigns_count',
  'adsets_count',
  'ads_total',
  'ads_active',
  'ads_paused',
  'counts_updated_at',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
] as const;

const OFFER_FIELDS = [
  'id',
  'client_id',
  'title',
  'offer_type',
  'status',
  'is_primary',
  'notes',
  'created_at',
  'updated_at',
  'updated_by',
] as const;

function pick<T extends Record<string, unknown>>(row: T, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row?.[f] ?? null;
  return out;
}

/** Ad account payload — structurally cannot carry a credential. */
export function shapeAdAccount(row: Record<string, unknown>) {
  return pick(row, AD_ACCOUNT_FIELDS);
}

export function shapeOffer(row: Record<string, unknown>) {
  return pick(row, OFFER_FIELDS);
}

export function shapeClientSummary(
  client: Record<string, unknown>,
  accounts: Record<string, unknown>[],
  rollup: Record<string, unknown>,
) {
  return {
    client_id: client.id,
    name: client.name,
    status: client.status,
    slug: client.slug ?? null,
    connections: {
      meta_ad_accounts: accounts.length,
      meta_credential_present: !!client.meta_access_token || !!client.meta_system_user_token,
      ghl_location_id: client.ghl_location_id ?? null,
      ghl_credential_present: !!client.ghl_api_key,
      rollup,
    },
  };
}

/* ─────────────────────────── Idempotency helper ─────────────────────────── */

export function fingerprint(body: unknown): string {
  const stable = JSON.stringify(body, Object.keys((body as object) || {}).sort());
  let hash = 0;
  for (let i = 0; i < stable.length; i++) {
    hash = (hash * 31 + stable.charCodeAt(i)) | 0;
  }
  return `${stable.length}:${hash}`;
}

export const ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'route_not_found',
  'method_not_allowed',
  'invalid_client_id',
  'invalid_offer_id',
  'invalid_ad_account_id',
  'unsupported_integration',
  'invalid_limit',
  'invalid_offset',
  'invalid_json',
  'validation_failed',
  'client_not_found',
  'ad_account_owned_by_other_client',
  'idempotency_key_reused_with_different_body',
  'internal_error',
] as const;
