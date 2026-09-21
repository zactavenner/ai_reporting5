import { describe, it, expect } from 'vitest';
import {
  VERIFY_ENDPOINTS,
  classifyProbe,
  connectionSignals,
  extractProviderLines,
  isLineEndpoint,
  planLineImport,
  planWebhookRegistration,
  parseProviderWebhooks,
  verifyWebhookReadback,
  webhookHealth,
} from '../../supabase/functions/_shared/sendblueAccounts.ts';

describe('credential verification is truthful', () => {
  it('only claims connected on a real 2xx', () => {
    expect(classifyProbe(200)).toEqual({ ok: true, status: 'connected', detail: null });
    expect(classifyProbe(204)).toEqual({ ok: true, status: 'connected', detail: null });
  });
  it('separates rejected credentials from other failures', () => {
    expect(classifyProbe(401).status).toBe('credentials_rejected');
    expect(classifyProbe(403).status).toBe('credentials_rejected');
    expect(classifyProbe(500, 'boom').status).toBe('error');
    expect(classifyProbe(404, 'not found').detail).toContain('404');
  });
  it('probes read-only endpoints only', () => {
    for (const endpoint of VERIFY_ENDPOINTS) expect(endpoint.startsWith('/api/')).toBe(true);
    expect(isLineEndpoint('/api/v2/lines')).toBe(true);
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
