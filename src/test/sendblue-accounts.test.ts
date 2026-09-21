import { describe, it, expect } from 'vitest';
import {
  VERIFY_ENDPOINTS,
  classifyProbe,
  connectionSignals,
  extractProviderLines,
  isLineEndpoint,
  planLineImport,
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
