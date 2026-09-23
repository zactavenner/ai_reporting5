import { describe, it, expect } from 'vitest';
import {
  VERIFY_ENDPOINTS,
  classifyProbe,
  connectionSignals,
  extractProviderLines,
  isLineEndpoint,
  planLineImport,
  LINE_ENDPOINTS,
  planWebhookRegistration,
  parseProviderWebhooks,
  parseWebhookResponse,
  buildWebhookAppendBody,
  verifyWebhookReadback,
  webhookHealth,
} from '../../supabase/functions/_shared/sendblueAccounts.ts';
import { resolveSendCredentials } from '../../supabase/functions/_shared/sendblue.ts';

describe('credential verification is truthful', () => {
  it('needs a real success body, not just a 2xx', () => {
    expect(classifyProbe(200, JSON.stringify({ lines: [] }))).toEqual({ ok: true, status: 'connected', detail: null });
    // A bare 2xx with no readable body proves nothing.
    expect(classifyProbe(200).ok).toBe(false);
    expect(classifyProbe(204).ok).toBe(false);
  });
  it('separates rejected credentials from other failures', () => {
    expect(classifyProbe(401).status).toBe('credentials_rejected');
    expect(classifyProbe(403).status).toBe('credentials_rejected');
    expect(classifyProbe(500, 'boom').status).toBe('error');
    expect(classifyProbe(404, 'not found').detail).toContain('404');
  });
  it('probes read-only endpoints only', () => {
    for (const endpoint of VERIFY_ENDPOINTS) expect(endpoint.startsWith('/api/')).toBe(true);
    expect(isLineEndpoint('/api/lines')).toBe(true);
    expect(isLineEndpoint('/api/v2/contacts?limit=1')).toBe(false);
    expect(isLineEndpoint(null)).toBe(false);
  });
});

describe('line discovery from real response shapes', () => {
  it('reads a bare array, data, lines and numbers wrappers', () => {
    expect(extractProviderLines([{ number: '+15551230001' }])).toHaveLength(1);
    expect(extractProviderLines({ data: [{ phone_number: '5551230002' }] })[0].phone_e164).toBe('+15551230002');
    expect(extractProviderLines({ lines: [{ number: '+15551230003', label: 'Main' }] })[0].label).toBe('Main');
    expect(extractProviderLines({ numbers: [{ phone: '+15551230004', id: 'ln_1' }] })[0].provider_line_id).toBe('ln_1');
  });
  it('drops unusable rows and de-duplicates', () => {
    const lines = extractProviderLines({
      data: [{ number: '+15551230005' }, { number: '+15551230005' }, { number: 'nope' }, null, 'x'],
    });
    expect(lines.map((l) => l.phone_e164)).toEqual(['+15551230005']);
  });
  it('returns nothing for an unsupported shape', () => {
    expect(extractProviderLines({ message: 'not available' })).toEqual([]);
    expect(extractProviderLines(null)).toEqual([]);
  });
});

describe('import never duplicates', () => {
  const discovered = extractProviderLines({
    data: [
      { number: '+15551230010', label: 'Client A' },
      { number: '+15551230011' },
    ],
  });

  it('skips numbers already registered', () => {
    const plan = planLineImport(discovered, ['+15551230010', '+15551230011'], ['+15551230010']);
    expect(plan.alreadyImported).toEqual(['+15551230010']);
    expect(plan.toInsert.map((l) => l.phone_e164)).toEqual(['+15551230011']);
  });
  it('rejects numbers that were never discovered', () => {
    const plan = planLineImport(discovered, ['+15559999999'], []);
    expect(plan.toInsert).toEqual([]);
    expect(plan.invalid).toEqual(['+15559999999']);
  });
  it('collapses repeated requests for the same number', () => {
    const plan = planLineImport(discovered, ['+15551230011', '5551230011'], []);
    expect(plan.toInsert).toHaveLength(1);
  });
  it('falls back to a generated label', () => {
    const plan = planLineImport(discovered, ['+15551230011'], []);
    expect(plan.toInsert[0].label).toContain('+15551230011');
  });
});

describe('connection proofs stay separate', () => {
  it('saving credentials alone proves nothing', () => {
    const s = connectionSignals({
      credentialsVerifiedAt: null,
      webhookSecretConfigured: false,
      firstInboundAt: null,
      lastDeliveredAt: null,
    });
    expect(s.credentials_verified).toBe(false);
    expect(s.fully_proven).toBe(false);
  });
  it('verified credentials do not imply webhook or traffic', () => {
    const s = connectionSignals({
      credentialsVerifiedAt: '2026-09-21T10:00:00.000Z',
      webhookSecretConfigured: false,
      firstInboundAt: null,
      lastDeliveredAt: null,
    });
    expect(s.credentials_verified).toBe(true);
    expect(s.webhook_configured).toBe(false);
    expect(s.first_inbound_received).toBe(false);
    expect(s.outbound_delivery_confirmed).toBe(false);
    expect(s.fully_proven).toBe(false);
  });
  it('only all four proofs count as fully proven', () => {
    const s = connectionSignals({
      credentialsVerifiedAt: '2026-09-21T10:00:00.000Z',
      webhookSecretConfigured: true,
      firstInboundAt: '2026-09-21T11:00:00.000Z',
      lastDeliveredAt: '2026-09-21T12:00:00.000Z',
    });
    expect(s.fully_proven).toBe(true);
    expect(s.credentials_verified_at).toBe('2026-09-21T10:00:00.000Z');
  });
});

describe('webhook registration is append-only', () => {
  const RECEIVE = { url: 'https://api.example.com/functions/v1/sendblue-webhook', type: 'receive' as const };
  const OUTBOUND = { url: 'https://api.example.com/functions/v1/sendblue-webhook', type: 'outbound' as const };

  it('reads the provider list out of a wrapper and a bare array alike', () => {
    const wrapped = parseProviderWebhooks({
      webhooks: [
        { url: 'https://client.example.com/hook', type: 'receive', secret: 'abc' },
        { url: 'https://client.example.com/out', type: 'OUTBOUND' },
        { type: 'receive' },
      ],
    });
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0].has_secret).toBe(true);
    expect(wrapped[1].type).toBe('outbound');
    expect(parseProviderWebhooks([{ webhook_url: 'https://a.test/x', event: 'receive' }])).toHaveLength(1);
  });

  it('only appends the hooks that are missing and never rewrites the others', () => {
    const existing = parseProviderWebhooks({
      webhooks: [
        { url: 'https://client-crm.example.com/inbound', type: 'receive', secret: 'theirs' },
        { url: 'https://api.example.com/functions/v1/sendblue-webhook/', type: 'receive' },
      ],
    });
    const plan = planWebhookRegistration(existing, [RECEIVE, OUTBOUND]);
    expect(plan.alreadyPresent.map((p) => p.type)).toEqual(['receive']);
    expect(plan.toAppend.map((p) => p.type)).toEqual(['outbound']);
    expect(plan.preserved.map((p) => p.url)).toEqual(['https://client-crm.example.com/inbound']);
  });

  it('appends both hooks on a fresh account and duplicates nothing when asked twice', () => {
    const fresh = planWebhookRegistration([], [RECEIVE, OUTBOUND, RECEIVE]);
    expect(fresh.toAppend).toHaveLength(2);
    expect(fresh.preserved).toHaveLength(0);
  });

  it('verifies registration only from a readback', () => {
    const after = parseProviderWebhooks({ webhooks: [{ url: RECEIVE.url, type: 'receive' }] });
    const check = verifyWebhookReadback(after, [RECEIVE, OUTBOUND]);
    expect(check.ok).toBe(false);
    expect(check.missing.map((m) => m.type)).toEqual(['outbound']);
    expect(check.registered.map((m) => m.type)).toEqual(['receive']);

    const complete = verifyWebhookReadback(
      parseProviderWebhooks({ webhooks: [{ url: RECEIVE.url, type: 'receive' }, { url: RECEIVE.url, type: 'outbound' }] }),
      [RECEIVE, OUTBOUND],
    );
    expect(complete.ok).toBe(true);
  });

  it('never reports a registered hook as live traffic', () => {
    expect(webhookHealth({ receiveRegisteredAt: null, outboundRegisteredAt: null, firstInboundAt: null, lastDeliveredAt: null }).status)
      .toBe('not_configured');
    const registered = webhookHealth({
      receiveRegisteredAt: '2026-09-21T10:00:00.000Z',
      outboundRegisteredAt: '2026-09-21T10:00:00.000Z',
      firstInboundAt: null,
      lastDeliveredAt: null,
    });
    expect(registered.status).toBe('registered_no_traffic');
    expect(registered.inbound_observed).toBe(false);
    expect(registered.delivery_observed).toBe(false);
    expect(
      webhookHealth({
        receiveRegisteredAt: '2026-09-21T10:00:00.000Z',
        outboundRegisteredAt: null,
        firstInboundAt: null,
        lastDeliveredAt: null,
      }).status,
    ).toBe('partially_registered');
    expect(
      webhookHealth({
        receiveRegisteredAt: '2026-09-21T10:00:00.000Z',
        outboundRegisteredAt: '2026-09-21T10:00:00.000Z',
        firstInboundAt: '2026-09-21T11:00:00.000Z',
        lastDeliveredAt: null,
      }).status,
    ).toBe('live');
  });
});

describe('documented Sendblue API v2 contract', () => {
  it('uses the documented endpoints only', () => {
    // GET /api/lines is the documented assigned-numbers endpoint (not /api/v2/lines).
    expect(LINE_ENDPOINTS).toEqual(['/api/lines']);
    expect(VERIFY_ENDPOINTS).toEqual(['/api/lines', '/api/v2/messages?limit=1', '/api/v2/contacts?limit=1']);
    expect(isLineEndpoint('/api/lines')).toBe(true);
    expect(isLineEndpoint('/api/v2/lines')).toBe(false);
    expect(isLineEndpoint('/api/v2/numbers')).toBe(false);
  });

  it('never treats a 2xx carrying a body-level ERROR as verified', () => {
    const errored = classifyProbe(200, JSON.stringify({ status: 'ERROR', error_message: 'Invalid API key' }));
    expect(errored.ok).toBe(false);
    expect(errored.status).toBe('credentials_rejected');
    expect(errored.detail).toContain('Invalid API key');

    const otherError = classifyProbe(200, JSON.stringify({ status: 'ERROR', error_message: 'Plan does not include lines' }));
    expect(otherError.ok).toBe(false);
    expect(otherError.status).toBe('error');

    expect(classifyProbe(200, JSON.stringify({ success: false, message: 'nope' })).ok).toBe(false);
  });

  it('never treats a non-JSON or empty 2xx as verified', () => {
    expect(classifyProbe(200, '<html>Not Found</html>').ok).toBe(false);
    expect(classifyProbe(200, '').ok).toBe(false);
    expect(classifyProbe(204, '').ok).toBe(false);
  });

  it('accepts a real documented success body', () => {
    expect(classifyProbe(200, JSON.stringify({ lines: ['+15551234567'] })).ok).toBe(true);
    expect(classifyProbe(200, JSON.stringify([])).ok).toBe(true);
    expect(classifyProbe(200, JSON.stringify({ status: 'QUEUED', messages: [] })).ok).toBe(true);
  });

  it('reads numbers from the documented GET /api/lines shapes', () => {
    // Documented shape: plain E.164 strings.
    const plain = extractProviderLines({ lines: ['+15551234567', '+1 (555) 765-4321', '+15551234567'] });
    expect(plain.map((l) => l.phone_e164)).toEqual(['+15551234567', '+15557654321']);
    expect(plain[0].label).toBeNull();

    // Object rows remain supported for accounts that return richer records.
    const objects = extractProviderLines({ lines: [{ number: '+15550001111', label: 'Main' }] });
    expect(objects[0]).toMatchObject({ phone_e164: '+15550001111', label: 'Main' });

    expect(extractProviderLines({ status: 'ERROR', error_message: 'no access' })).toEqual([]);
  });
});

describe('official webhook payload shapes', () => {
  const receiver = 'https://example.supabase.co/functions/v1/sendblue-webhook';

  it('reads the documented keyed webhooks object', () => {
    const parsed = parseWebhookResponse({
      status: 'OK',
      webhooks: {
        receive: [receiver, { url: 'https://client.example.com/in', secret: 'theirs' }],
        outbound: [{ url: receiver, secret: 'ours' }],
        globalSecret: 'account-global',
      },
    });
    expect(parsed.global_secret_present).toBe(true);
    expect(parsed.hooks).toHaveLength(3);
    expect(parsed.hooks.filter((h) => h.type === 'receive')).toHaveLength(2);
    const outbound = parsed.hooks.find((h) => h.type === 'outbound');
    expect(outbound?.secret).toBe('ours');
    // String entries expose no secret, so none is invented.
    expect(parsed.hooks.find((h) => h.type === 'receive' && h.url === receiver)?.secret).toBeNull();
  });

  it('still reads legacy array wrappers and rejects error bodies', () => {
    expect(parseWebhookResponse({ webhooks: [{ url: receiver, type: 'receive' }] }).hooks).toHaveLength(1);
    expect(parseWebhookResponse({ status: 'ERROR', error_message: 'no access' }).hooks).toEqual([]);
    expect(parseWebhookResponse(null).hooks).toEqual([]);
  });

  it('builds the documented append body', () => {
    expect(buildWebhookAppendBody([{ url: receiver }], 's3cret', 'receive')).toEqual({
      webhooks: [{ url: receiver, secret: 's3cret' }],
      type: 'receive',
    });
  });

  it('proves the readback carries our own secret', () => {
    const desired = [
      { url: receiver, type: 'receive' as const },
      { url: receiver, type: 'outbound' as const },
    ];
    const good = verifyWebhookReadback(
      [
        { url: receiver, type: 'receive', has_secret: true, secret: 'ours', raw: {} },
        { url: receiver, type: 'outbound', has_secret: true, secret: 'ours', raw: {} },
      ],
      desired,
      'ours',
    );
    expect(good.ok).toBe(true);
    expect(good.secret_verified.map((h) => h.type)).toEqual(['receive', 'outbound']);

    const wrong = verifyWebhookReadback(
      [
        { url: receiver, type: 'receive', has_secret: true, secret: 'someone-elses', raw: {} },
        { url: receiver, type: 'outbound', has_secret: true, secret: 'ours', raw: {} },
      ],
      desired,
      'ours',
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.secret_mismatch.map((h) => h.type)).toEqual(['receive']);

    // A read that exposes no secret is reported as unverifiable, never as proven.
    const silent = verifyWebhookReadback(
      [
        { url: receiver, type: 'receive', has_secret: false, secret: null, raw: {} },
        { url: receiver, type: 'outbound', has_secret: false, secret: null, raw: {} },
      ],
      desired,
      'ours',
    );
    expect(silent.secret_verified).toEqual([]);
    expect(silent.secret_unknown).toHaveLength(2);

    const absent = verifyWebhookReadback([], desired, 'ours');
    expect(absent.ok).toBe(false);
    expect(absent.missing).toHaveLength(2);
  });
});

describe('send credentials resolve through the linked account', () => {
  const env = { keyId: 'agency-key', secret: 'agency-secret' };
  const account = { id: 'acct', api_key_id: 'acct-key', api_secret: 'acct-secret', active: true, status: 'connected' };

  it('uses the account keys for an imported line that has none of its own', () => {
    const r = resolveSendCredentials({ account_id: 'acct' }, account, env);
    expect(r).toMatchObject({ ok: true, source: 'account', credentials: { keyId: 'acct-key', secret: 'acct-secret' } });
  });

  it('prefers the line\u2019s own keys', () => {
    const r = resolveSendCredentials({ account_id: 'acct', api_key_id: 'line-key', api_secret: 'line-secret' }, account, env);
    expect(r).toMatchObject({ ok: true, source: 'line' });
  });

  it('fails closed and never borrows agency keys when the account is unusable', () => {
    expect(resolveSendCredentials({ account_id: 'acct' }, null, env)).toMatchObject({ ok: false, reason: 'account_missing' });
    expect(resolveSendCredentials({ account_id: 'acct' }, { ...account, active: false }, env)).toMatchObject({ ok: false, reason: 'account_disabled' });
    expect(resolveSendCredentials({ account_id: 'acct' }, { ...account, status: 'credentials_rejected' }, env)).toMatchObject({ ok: false, reason: 'account_rejected' });
    expect(resolveSendCredentials({ account_id: 'acct' }, { ...account, api_secret: null }, env)).toMatchObject({ ok: false, reason: 'account_no_credentials' });
  });

  it('allows the agency keys only for a line with no linked account', () => {
    expect(resolveSendCredentials({}, null, env)).toMatchObject({ ok: true, source: 'agency' });
    expect(resolveSendCredentials({}, null, { keyId: null, secret: null })).toMatchObject({ ok: false, reason: 'no_credentials' });
  });
});
