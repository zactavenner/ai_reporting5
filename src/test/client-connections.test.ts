import { describe, expect, it } from 'vitest';
import {
  buildReportingRoster,
  classifyExistingAccount,
  computeRollup,
  maskSecret,
  normalizeAdAccountId,
  normalizeAuditSource,
  redactForAudit,
  secretMeta,
  validateAdAccountPatch,
  validateOfferInput,
} from '../../supabase/functions/_shared/clientConnections.ts';

describe('ad account normalization', () => {
  it('accepts act_ prefixed and bare IDs identically', () => {
    expect(normalizeAdAccountId('act_1234567890')).toEqual({ ok: true, value: '1234567890' });
    expect(normalizeAdAccountId(' 1234567890 ')).toEqual({ ok: true, value: '1234567890' });
  });

  it('rejects empty and malformed IDs', () => {
    expect(normalizeAdAccountId('').ok).toBe(false);
    expect(normalizeAdAccountId('act_abc').ok).toBe(false);
    expect(normalizeAdAccountId('123').ok).toBe(false);
  });
});

describe('duplicate and cross-client conflicts', () => {
  it('flags a same-client add as an idempotent duplicate', () => {
    expect(classifyExistingAccount({ id: 'a1', client_id: 'c1' }, 'c1')).toEqual({
      kind: 'duplicate',
      existingId: 'a1',
    });
  });

  it('never silently moves an account owned by another client', () => {
    expect(classifyExistingAccount({ id: 'a1', client_id: 'c2' }, 'c1')).toEqual({
      kind: 'other_client',
      clientId: 'c2',
    });
  });

  it('treats an unseen account as addable', () => {
    expect(classifyExistingAccount(null, 'c1')).toBeNull();
  });
});

describe('credential masking and audit redaction', () => {
  it('exposes only presence and last four', () => {
    expect(secretMeta('EAAB-super-secret-9821')).toEqual({ secret_present: true, last4: '9821' });
    expect(secretMeta('')).toEqual({ secret_present: false, last4: null });
    expect(maskSecret('pit-abcdefgh4321')).toBe('••••4321');
    expect(maskSecret(null)).toBeNull();
  });

  it('redacts credential-ish keys anywhere in the audit payload', () => {
    const redacted = redactForAudit({
      account_name: 'Ad account v2',
      meta_access_token: 'EAAsecret',
      nested: { ghl_api_key: 'pit-secret', label: 'ok', list: [{ api_key: 'x' }] },
    }) as any;
    expect(redacted.account_name).toBe('Ad account v2');
    expect(redacted.meta_access_token).toBe('[redacted]');
    expect(redacted.nested.ghl_api_key).toBe('[redacted]');
    expect(redacted.nested.label).toBe('ok');
    expect(redacted.nested.list[0].api_key).toBe('[redacted]');
    expect(JSON.stringify(redacted)).not.toContain('secret');
  });

  it('normalizes the audit source to a known surface', () => {
    expect(normalizeAuditSource('huddle')).toBe('huddle');
    expect(normalizeAuditSource('agent_api')).toBe('agent_api');
    expect(normalizeAuditSource('somewhere-else')).toBe('client_settings');
  });
});

describe('offer validation', () => {
  it('requires a name on create and allows partial edits', () => {
    expect(validateOfferInput({ title: '  ' }).ok).toBe(false);
    expect(validateOfferInput({ title: 'Fund II', status: 'active' }).ok).toBe(true);
    expect(validateOfferInput({ status: 'archived' }, { partial: true })).toEqual({
      ok: true,
      value: { status: 'archived' },
    });
    expect(validateOfferInput({ status: 'deleted' }, { partial: true }).ok).toBe(false);
    expect(validateOfferInput({}, { partial: true }).ok).toBe(false);
  });
});

describe('ad account patch validation', () => {
  it('accepts label, primary, roll-up and status changes only', () => {
    expect(validateAdAccountPatch({ rollup_enabled: false })).toEqual({
      ok: true,
      value: { rollup_enabled: false },
    });
    expect(validateAdAccountPatch({ status: 'nope' }).ok).toBe(false);
    expect(validateAdAccountPatch({}).ok).toBe(false);
  });
});

describe('roll-up summary', () => {
  const now = new Date('2026-09-10T12:00:00Z').getTime();
  const base = { provider: 'meta', rollup_enabled: true, status: 'active', last_sync_status: 'success' };

  it('aggregates only roll-up enabled accounts', () => {
    const r = computeRollup(
      [
        { ...base, provider_account_id: '111', ads_total: 10, ads_active: 6, ads_paused: 4, campaigns_count: 2, last_sync_at: '2026-09-10T10:00:00Z' },
        { ...base, provider_account_id: '222', rollup_enabled: false, ads_total: 99, ads_active: 99, ads_paused: 0, campaigns_count: 9, last_sync_at: '2026-09-10T11:00:00Z' },
      ],
      now,
    );
    expect(r.accounts_connected).toBe(2);
    expect(r.accounts_in_rollup).toBe(1);
    expect(r.ads_total).toBe(10);
    expect(r.health).toBe('healthy');
  });

  it('never double counts the same provider account id', () => {
    const r = computeRollup(
      [
        { ...base, provider_account_id: '111', ads_total: 10, campaigns_count: 1, last_sync_at: '2026-09-10T10:00:00Z' },
        { ...base, provider_account_id: '111', ads_total: 10, campaigns_count: 1, last_sync_at: '2026-09-10T10:00:00Z' },
      ],
      now,
    );
    expect(r.accounts_in_rollup).toBe(1);
    expect(r.ads_total).toBe(10);
  });

  it('reports missing counts as partial, not zero', () => {
    const r = computeRollup(
      [
        { ...base, provider_account_id: '111', ads_total: 10, campaigns_count: 1, last_sync_at: '2026-09-10T10:00:00Z' },
        { ...base, provider_account_id: '222', last_sync_at: '2026-09-10T10:00:00Z' },
      ],
      now,
    );
    expect(r.ads_total).toBe(10);
    expect(r.accounts_missing_counts).toBe(1);
    expect(r.health).toBe('partial');
  });

  it('returns null totals and unknown health when nothing has counts', () => {
    const r = computeRollup([{ ...base, provider_account_id: '111', last_sync_at: '2026-09-10T10:00:00Z' }], now);
    expect(r.ads_total).toBeNull();
    expect(r.ads_active).toBeNull();
    expect(r.health).toBe('unknown');
  });

  it('flags errors and staleness', () => {
    expect(
      computeRollup(
        [{ ...base, provider_account_id: '111', ads_total: 1, campaigns_count: 1, last_sync_status: 'failed', last_sync_error: 'token expired' }],
        now,
      ).health,
    ).toBe('error');
    expect(
      computeRollup(
        [{ ...base, provider_account_id: '111', ads_total: 1, campaigns_count: 1, last_sync_at: '2026-09-05T10:00:00Z' }],
        now,
      ).health,
    ).toBe('stale');
  });

  it('excludes disconnected accounts from the roll-up', () => {
    const r = computeRollup(
      [{ ...base, provider_account_id: '111', status: 'disconnected', ads_total: 50, campaigns_count: 5 }],
      now,
    );
    expect(r.accounts_connected).toBe(0);
    expect(r.ads_total).toBeNull();
  });
});

describe('reporting roster write-through', () => {
  it('keeps the existing primary and appends new accounts', () => {
    expect(
      buildReportingRoster(
        [
          { provider_account_id: '111', status: 'active' },
          { provider_account_id: '222', status: 'active' },
        ],
        'act_111',
      ),
    ).toEqual({ primary: '111', all: ['111', '222'] });
  });

  it('drops disconnected accounts and repoints an orphaned primary', () => {
    expect(
      buildReportingRoster(
        [
          { provider_account_id: '111', status: 'disconnected' },
          { provider_account_id: '222', status: 'active' },
        ],
        '111',
      ),
    ).toEqual({ primary: '222', all: ['222'] });
  });

  it('honours an explicit primary selection', () => {
    expect(
      buildReportingRoster(
        [
          { provider_account_id: '111', status: 'active' },
          { provider_account_id: '222', status: 'active' },
        ],
        '111',
        '222',
      ).primary,
    ).toBe('222');
  });
});
