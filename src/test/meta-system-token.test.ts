import { describe, it, expect, beforeEach } from 'vitest';
import {
  decryptSystemToken,
  encryptSystemToken,
  isMetaTokenFailure,
  legacyChain,
  redactMetaSecrets,
  resolveClientMetaToken,
  runSystemTokenAction,
  toStatusPayload,
  validateSystemToken,
} from '../../supabase/functions/_shared/metaSystemToken';

const KEY = 'k'.repeat(48);
const CLIENT = '11111111-1111-4111-8111-111111111111';
const SYS = 'EAAsystemTOKEN1234567890abcdefWXYZ';

let sharedEnv: string | undefined;
beforeEach(() => {
  sharedEnv = 'MASTER_TOKEN_abcdefghijklmnop';
  (globalThis as any).Deno = { env: { get: (k: string) => (k === 'META_SHARED_ACCESS_TOKEN' ? sharedEnv : undefined) } };
});

/** Tiny in-memory stand-in for the service-role client. */
function fakeDb(tables: Record<string, any[]>) {
  const writes: Array<{ table: string; op: string; value?: any }> = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let pending: { op: string; value?: any } | null = null;
    const b: any = {
      select: () => b,
      eq: (col: string, val: any) => {
        rows = rows.filter((r) => r[col] === val);
        if (pending?.op === 'update') {
          for (const r of rows) Object.assign(r, pending.value);
          writes.push({ table, op: 'update', value: pending.value });
        }
        if (pending?.op === 'delete') {
          tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r));
          writes.push({ table, op: 'delete' });
        }
        return b;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      insert: async (value: any) => {
        (tables[table] ||= []).push(value);
        writes.push({ table, op: 'insert', value });
        return { error: null };
      },
      upsert: async (value: any) => {
        tables[table] = (tables[table] ?? []).filter((r) => r.client_id !== value.client_id);
        tables[table].push({ ...value });
        writes.push({ table, op: 'upsert', value });
        return { error: null };
      },
      update: (value: any) => { pending = { op: 'update', value }; return b; },
      delete: () => { pending = { op: 'delete' }; return b; },
      then: (ok: any) => Promise.resolve({ data: rows, error: null }).then(ok),
    };
    return b;
  };
  return { from, writes, tables };
}

const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** Meta fake: answers debug_token, /me and /act_<id> per the given map. */
function metaFake(opts: { valid?: boolean; accounts?: Record<string, boolean>; expiresAt?: number } = {}) {
  const urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    if (url.includes('/debug_token')) {
      return jsonRes(200, {
        data: {
          is_valid: opts.valid ?? true,
          type: 'SYSTEM_USER',
          scopes: ['ads_read', 'ads_management', 'business_management'],
          expires_at: opts.expiresAt ?? 0,
          data_access_expires_at: 0,
          user_id: '61580000000001',
        },
      });
    }
    if (url.includes('/me?')) return jsonRes(200, { id: '61580000000001', name: 'HPA Reporting System User' });
    const m = url.match(/\/act_(\d+)\?/);
    if (m) {
      return opts.accounts?.[m[1]] === false
        ? jsonRes(400, { error: { code: 200, message: 'Requires ads_read permission' } })
        : jsonRes(200, { id: `act_${m[1]}`, name: `Acct ${m[1]}`, account_status: 1 });
    }
    return jsonRes(404, {});
  };
  return { fetcher, urls };
}

describe('resolver precedence', () => {
  const client = { id: CLIENT, meta_system_user_token: null, meta_access_token: 'USER_TOKEN_abcdefghijkl' };

  it('without a saved system token, returns exactly the existing token choice', async () => {
    const db = fakeDb({ client_meta_system_tokens: [], meta_token_usage_log: [] });
    const h = await resolveClientMetaToken(db, client, 'sync-meta-ad-spend');
    expect(h.token).toBe('USER_TOKEN_abcdefghijkl');
    expect(h.source).toBe('client');
    expect(h.fallbackReason).toBe('no_system_token');
    expect(db.tables.meta_token_usage_log).toEqual([
      expect.objectContaining({ client_id: CLIENT, function_name: 'sync-meta-ad-spend', source: 'client', fallback_reason: 'no_system_token' }),
    ]);
  });

  it('keeps legacy column → client → shared order when nothing is saved', async () => {
    const db = fakeDb({ client_meta_system_tokens: [] });
    const legacyCol = await resolveClientMetaToken(db, { ...client, meta_system_user_token: 'LEGACY_SYS_abcdefghijk' }, 'f');
    expect([legacyCol.token, legacyCol.source]).toEqual(['LEGACY_SYS_abcdefghijk', 'system_user_legacy_column']);
    const master = await resolveClientMetaToken(db, { id: CLIENT, meta_access_token: null }, 'f');
    expect([master.token, master.source]).toEqual(['MASTER_TOKEN_abcdefghijklmnop', 'master']);
    sharedEnv = undefined;
    const none = await resolveClientMetaToken(db, { id: CLIENT }, 'f');
    expect([none.token, none.source]).toEqual([null, 'none']);
  });

  it("honours a function's own inline chain unchanged", async () => {
    const db = fakeDb({ client_meta_system_tokens: [] });
    const h = await resolveClientMetaToken(db, CLIENT, 'meta-mcp', {
      legacy: legacyChain([['client', ''], ['master', 'SHARED_x']]),
    });
    expect([h.token, h.source]).toEqual(['SHARED_x', 'master']);
  });

  it('uses an active saved system token first', async () => {
    const db = fakeDb({
      client_meta_system_tokens: [{ client_id: CLIENT, status: 'active', expires_at: null, token_ciphertext: await encryptSystemToken(SYS, CLIENT, KEY) }],
    });
    const h = await resolveClientMetaToken(db, client, 'f', { keyMaterial: KEY });
    expect([h.token, h.source]).toEqual([SYS, 'system_user_vault']);
  });

  it.each([
    ['needs_attention', null, 'system_token_needs_attention'],
    ['invalid', null, 'system_token_invalid'],
    ['active', '2020-01-01T00:00:00Z', 'system_token_expired'],
  ])('falls back to the user token when the saved token is %s (expires %s)', async (status, expires, reason) => {
    const db = fakeDb({
      client_meta_system_tokens: [{ client_id: CLIENT, status, expires_at: expires, token_ciphertext: await encryptSystemToken(SYS, CLIENT, KEY) }],
    });
    const h = await resolveClientMetaToken(db, client, 'f', { keyMaterial: KEY });
    expect([h.token, h.source, h.fallbackReason]).toEqual(['USER_TOKEN_abcdefghijkl', 'client', reason]);
  });

  it('retries once with the user token and flags the system token when Meta rejects it', async () => {
    const row = { client_id: CLIENT, status: 'active', expires_at: null, last_error: null as string | null, token_ciphertext: await encryptSystemToken(SYS, CLIENT, KEY) };
    const db = fakeDb({ client_meta_system_tokens: [row] });
    const h = await resolveClientMetaToken(db, client, 'f', { keyMaterial: KEY });
    const used: string[] = [];
    const res = await h.fetch(
      (t) => `https://graph.facebook.com/v21.0/act_1/insights?access_token=${t}`,
      undefined,
      async (u) => {
        used.push(new URL(u).searchParams.get('access_token')!);
        return used.length === 1
          ? jsonRes(400, { error: { code: 190, message: 'Invalid OAuth access token' } })
          : jsonRes(200, { data: [] });
      },
    );
    expect(res.status).toBe(200);
    expect(used).toEqual([SYS, 'USER_TOKEN_abcdefghijkl']);
    expect(row.status).toBe('needs_attention');
    expect(h.source).toBe('client');
  });

  it('does not retry non-token Meta errors', async () => {
    const db = fakeDb({
      client_meta_system_tokens: [{ client_id: CLIENT, status: 'active', expires_at: null, token_ciphertext: await encryptSystemToken(SYS, CLIENT, KEY) }],
    });
    const h = await resolveClientMetaToken(db, client, 'f', { keyMaterial: KEY });
    let calls = 0;
    const res = await h.fetch((t) => `https://x/?access_token=${t}`, undefined, async () => {
      calls++;
      return jsonRes(400, { error: { code: 100, message: 'Invalid parameter' } });
    });
    expect([res.status, calls, h.source]).toEqual([400, 1, 'system_user_vault']);
  });
});

describe('Meta error classification + redaction', () => {
  it('treats 190 / 102 / 10 / 200-299 as token failures only', () => {
    for (const code of [190, 102, 10, 200, 294]) expect(isMetaTokenFailure({ error: { code } })).toBe(true);
    for (const code of [1, 4, 17, 100, 613]) expect(isMetaTokenFailure({ error: { code } })).toBe(false);
  });
  it('removes access_token values and raw EAA tokens', () => {
    const out = redactMetaSecrets(`GET /me?access_token=${SYS}&x=1 failed for ${SYS}`);
    expect(out).not.toContain(SYS);
    expect(out).toContain('access_token=[redacted]');
  });
});

describe('validateSystemToken', () => {
  it('parses debug_token, /me and account access', async () => {
    const m = metaFake({ accounts: { '111': true } });
    const v = await validateSystemToken(SYS, ['act_111'], m.fetcher);
    expect(v).toMatchObject({
      valid: true,
      status: 'active',
      token_type: 'SYSTEM_USER',
      system_user_id: '61580000000001',
      system_user_name: 'HPA Reporting System User',
      scopes: ['ads_read', 'ads_management', 'business_management'],
      expires_at: null,
      ad_account_access: { '111': { ok: true, name: 'Acct 111', account_status: 1 } },
    });
  });
  it('is valid with no linked ad accounts', async () => {
    expect((await validateSystemToken(SYS, [], metaFake().fetcher)).status).toBe('active');
  });
  it('needs attention when only some ad accounts are reachable', async () => {
    const v = await validateSystemToken(SYS, ['111', '222'], metaFake({ accounts: { '111': true, '222': false } }).fetcher);
    expect([v.valid, v.status]).toEqual([true, 'needs_attention']);
    expect(v.ad_account_access['222'].ok).toBe(false);
  });
  it('is invalid when no ad account is reachable or Meta says invalid', async () => {
    expect((await validateSystemToken(SYS, ['222'], metaFake({ accounts: { '222': false } }).fetcher)).status).toBe('invalid');
    expect((await validateSystemToken(SYS, [], metaFake({ valid: false }).fetcher)).valid).toBe(false);
  });
});

describe('set / status / delete actions', () => {
  const actor = { label: 'Zac' };
  const baseTables = () => ({
    clients: [{ id: CLIENT, meta_ad_account_id: '111', meta_ad_account_ids: null }],
    client_ad_accounts: [],
    client_meta_system_tokens: [] as any[],
    client_settings_audit: [] as any[],
  });

  it('rejects an invalid token without storing anything', async () => {
    const db = fakeDb(baseTables());
    const r = await runSystemTokenAction(db, { action: 'set', clientId: CLIENT, token: SYS, actor, source: 'dashboard' }, metaFake({ valid: false }).fetcher, KEY);
    expect([r.saved, r.errorCode, r.data?.status, r.data?.using]).toEqual([false, 'meta_token_invalid', 'invalid', 'user_token']);
    expect(db.tables.client_meta_system_tokens).toHaveLength(0);
  });

  it('stores a valid token encrypted and never returns it', async () => {
    const db = fakeDb(baseTables());
    const r = await runSystemTokenAction(db, { action: 'set', clientId: CLIENT, token: SYS, actor, source: 'agent_api' }, metaFake().fetcher, KEY);
    expect([r.saved, r.data?.status, r.data?.using, r.data?.token_last4]).toEqual([true, 'active', 'system_user', 'WXYZ']);
    const stored = db.tables.client_meta_system_tokens[0];
    expect(stored.token_ciphertext).not.toContain(SYS);
    expect(await decryptSystemToken(stored.token_ciphertext, CLIENT, KEY)).toBe(SYS);
    expect(JSON.stringify(r)).not.toContain(SYS);
    expect(JSON.stringify(db.tables.client_settings_audit)).not.toContain(SYS);
    expect(db.tables.client_settings_audit[0]).toMatchObject({ action: 'set', source: 'agent_api', entity_type: 'meta_system_token' });
  });

  it('a ciphertext cannot be read for a different client', async () => {
    const ct = await encryptSystemToken(SYS, CLIENT, KEY);
    await expect(decryptSystemToken(ct, '22222222-2222-4222-8222-222222222222', KEY)).rejects.toThrow();
  });

  it('delete removes only the saved row and reports not_set', async () => {
    const t = baseTables();
    t.client_meta_system_tokens.push({ client_id: CLIENT, status: 'active', expires_at: null, token_ciphertext: 'v1.x.y', token_last4: 'WXYZ' });
    const db = fakeDb(t);
    const r = await runSystemTokenAction(db, { action: 'delete', clientId: CLIENT, actor, source: 'dashboard' }, undefined, KEY);
    expect([r.data?.status, r.data?.using]).toEqual(['not_set', 'user_token']);
    expect(db.tables.client_meta_system_tokens).toHaveLength(0);
  });

  it('status payload has no token field', () => {
    const p = toStatusPayload(CLIENT, null);
    expect(Object.keys(p)).not.toContain('token');
    expect(p.status).toBe('not_set');
  });
});
