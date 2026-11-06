// Synthetic fixtures only — no real client data, no network.
import { describe, it, expect } from 'vitest';
import { buildReportModel, type RosterEntry } from '../../supabase/functions/_shared/weeklyReport/model.ts';
import { buildReportDoc } from '../../supabase/functions/_shared/weeklyReport/layout.ts';
import { planClientDeliveries, executePlan, disabledSender, MAX_ATTEMPTS, type DeliveryStore, type LedgerRow, type WeeklySender } from '../../supabase/functions/_shared/weeklyReport/delivery.ts';
import { readiness, sendKey } from '../../supabase/functions/_shared/weeklyReport/core.ts';

const A = 'aaaaaaaa-0000-0000-0000-000000000001', B = 'bbbbbbbb-0000-0000-0000-000000000002';
const NOW = new Date('2026-11-09T18:00:00Z'); // Monday; report week Nov 2–8 (Pacific)
const okChecks = readiness({ hasMetaAccount: true, spendSyncOk: true, hasGhlLocation: true, crmSyncOk: true, timezoneConfigured: true, trackedCalendars: 1, isCapital: true, hasFundedMapping: true, raiseGoal: 1e6, lastSpendDate: '2026-11-08', lastCrmSync: NOW.toISOString(), weekEnd: '2026-11-08', approvedRecipients: 1 }, NOW);
const entry: RosterEntry = {
  id: A, name: 'Synthetic Capital Fund', status: 'active', industry: 'Capital Raising', checks: okChecks, gate: { allowed: false, reasons: [] },
  config: { clientId: A, timezone: 'America/Los_Angeles', timezoneConfigured: true, isCapital: true, trackedCalendarIds: ['cal1'], raiseGoal: 1_000_000, raiseDeadline: '2027-03-31', crmConnected: true },
};
const rows = () => ({
  leads: [
    { id: 'l1', client_id: A, name: 'Jordan Investor', created_at: '2026-11-03T18:00:00Z', email: 'jordan@example.com', phone: '5551112222', is_spam: false },
    { id: 'l2', client_id: A, name: 'Spam Bot', created_at: '2026-11-04T18:00:00Z', email: 'x@example.com', phone: null, is_spam: true },
  ],
  calls: [], formLeads: [], funded: [],
  spend: Array.from({ length: 7 }, (_, i) => ({ client_id: A, date: `2026-11-0${i + 2}`, ad_spend: 100 })),
  adDaily: [{ client_id: A, date: '2026-11-03', meta_ad_id: 'ad1', spend: 300, leads: 3 }],
  adMeta: [{ client_id: A, meta_ad_id: 'ad1', name: 'Hook A', thumbnail_url: null, image_url: null }],
});
const recip = (id: string, client_id = A, extra = {}) => ({ id, client_id, active: true, unsubscribed_at: null, cadences: ['weekly'], channels: ['email'], ...extra });
const plan = (over: Partial<Parameters<typeof planClientDeliveries>[0]> = {}) => planClientDeliveries({
  clientId: A, weekStart: '2026-11-02', weekEnd: '2026-11-08', checks: okChecks, recipients: [recip('r1')], ledger: [], authOk: true, armed: true, pdfOk: true, ...over,
});

function memStore(seed: LedgerRow[] = []): DeliveryStore & { rows: Map<string, LedgerRow> } {
  const rows = new Map(seed.map((r) => [r.delivery_key, { ...r }]));
  return {
    rows,
    async claimNew(r) { await Promise.resolve(); if (rows.has(r.delivery_key)) return false; rows.set(r.delivery_key, { delivery_key: r.delivery_key, client_id: r.client_id, week_start: r.week_start, status: 'claimed', attempts: 0 }); return true; },
    async claimRetry(k, n) { await Promise.resolve(); const r = rows.get(k); if (!r || r.status !== 'failed_retryable' || r.attempts !== n) return false; r.status = 'claimed'; return true; },
    async mark(k, status) { const r = rows.get(k)!; if (['failed_retryable', 'failed_permanent', 'unknown'].includes(status)) r.attempts++; r.status = status; },
  };
}
const countingSender = () => { const s = { n: 0, send: async () => { s.n++; return { ok: true as const, messageId: 'm' }; } }; return s; };

describe('weekly report document (client-safe)', () => {
  it('has three pages and never includes internal exceptions or lead PII', () => {
    const model = buildReportModel({ ...entry, checks: readiness({ hasMetaAccount: false, spendSyncOk: null, hasGhlLocation: true, crmSyncOk: true, timezoneConfigured: true, trackedCalendars: 1, isCapital: true, hasFundedMapping: true, raiseGoal: 1e6, lastSpendDate: '2026-11-08', lastCrmSync: NOW.toISOString(), weekEnd: '2026-11-08', approvedRecipients: 1 }, NOW) }, rows(), NOW);
    expect(model.exceptions.length).toBeGreaterThan(0);
    const doc = buildReportDoc(model);
    expect(doc.pages).toHaveLength(3);
    const text = JSON.stringify(doc);
    for (const e of model.exceptions) expect(text).not.toContain(e);
    expect(text).not.toContain('Jordan');
    expect(text).not.toContain('jordan@example.com');
    expect(text).not.toContain('5551112222');
  });
  it('rejects rows from another client when building the model', () => {
    const r = rows(); r.adDaily.push({ client_id: B, date: '2026-11-03', meta_ad_id: 'ad9', spend: 1, leads: 0 });
    expect(() => buildReportModel(entry, r, NOW)).toThrow();
  });
  it('labels partial spend in the client copy and blanks the change column', () => {
    const r = rows(); r.spend = r.spend.slice(0, 4);
    const doc = buildReportDoc(buildReportModel(entry, r, NOW));
    const spendRow = (doc.pages[0][1] as any).rows[0];
    expect(spendRow[1]).toContain('(partial)');
    expect(spendRow[3]).toBe('—');
  });
});

describe('weekly report delivery gates (fail closed)', () => {
  it('blocks everything when not armed, unauthenticated, ledger missing or PDF failed', () => {
    expect(plan({ armed: false }).blockers.join()).toMatch(/not armed/);
    expect(plan({ authOk: false }).blockers.join()).toMatch(/authorization/);
    expect(plan({ ledger: null }).blockers.join()).toMatch(/ledger not installed/);
    expect(plan({ pdfOk: false }).blockers.join()).toMatch(/PDF/);
    for (const p of [plan({ armed: false }), plan({ ledger: null })]) expect(p.deliveries.every((d) => d.action === 'blocked')).toBe(true);
  });
  it('blocks on unhealthy sources or stale spend', () => {
    const bad = readiness({ hasMetaAccount: true, spendSyncOk: false, hasGhlLocation: true, crmSyncOk: true, timezoneConfigured: true, trackedCalendars: 1, isCapital: false, hasFundedMapping: false, raiseGoal: null, lastSpendDate: '2026-11-06', lastCrmSync: NOW.toISOString(), weekEnd: '2026-11-08', approvedRecipients: 1 }, NOW);
    const p = plan({ checks: bad });
    expect(p.blockers.join()).toMatch(/spend sync failed/i);
    expect(p.blockers.join()).toMatch(/Spend data/);
  });
  it('only approved same-client weekly email recipients; another client’s recipient blocks the batch', () => {
    const p = plan({ recipients: [recip('r1'), recip('r2', A, { unsubscribed_at: '2026-01-01' }), recip('r3', A, { cadences: ['monthly'] }), recip('r4', A, { channels: ['sms'] })] });
    expect(p.deliveries.map((d) => d.recipientId)).toEqual(['r1']);
    expect(p.blockers).toEqual([]);
    expect(plan({ recipients: [recip('r1'), recip('rx', B)] }).blockers.join()).toMatch(/another client/);
    expect(plan({ recipients: [] }).blockers.join()).toMatch(/No approved/);
  });
  it('unresolved or ambiguous sends block the client week; sent ones are skipped', () => {
    const k = sendKey(A, '2026-11-02', 'r1', 'email');
    expect(plan({ ledger: [{ delivery_key: k, client_id: A, week_start: '2026-11-02', status: 'unknown', attempts: 1 }] }).blockers.join()).toMatch(/unresolved/);
    expect(plan({ ledger: [{ delivery_key: k, client_id: A, week_start: '2026-11-02', status: 'sent', attempts: 0 }] }).deliveries[0].action).toBe('skip_already_sent');
    expect(plan({ ledger: [{ delivery_key: k, client_id: A, week_start: '2026-11-02', status: 'failed_retryable', attempts: MAX_ATTEMPTS }] }).deliveries[0].action).toBe('blocked');
  });
  it('the shipped sender is disabled', async () => {
    await expect(disabledSender.send({} as any, A)).rejects.toThrow(/disabled/);
  });
});

describe('weekly report delivery execution', () => {
  it('concurrent runs of the same plan send exactly once', async () => {
    const store = memStore(); const s = countingSender();
    const p = plan();
    const [a, b] = await Promise.all([executePlan(p, store, s), executePlan(p, store, s)]);
    expect(s.n).toBe(1);
    expect([...a, ...b].map((r) => r.result).sort()).toEqual(['sent', 'skipped_concurrent']);
  });
  it('re-planning after a successful send does not resend', async () => {
    const store = memStore(); const s = countingSender();
    await executePlan(plan(), store, s);
    const again = plan({ ledger: [...store.rows.values()] });
    await executePlan(again, store, s);
    expect(s.n).toBe(1);
  });
  it('ambiguous provider result is parked as unknown and then blocks', async () => {
    const store = memStore();
    const amb: WeeklySender = { send: async () => ({ ok: false, ambiguous: true, error: 'timeout' }) };
    await executePlan(plan(), store, amb);
    expect([...store.rows.values()][0].status).toBe('unknown');
    expect(plan({ ledger: [...store.rows.values()] }).blockers.join()).toMatch(/unresolved/);
  });
  it('definite failure retries with compare-and-set, then stops at the limit', async () => {
    const store = memStore(); const fail: WeeklySender = { send: async () => ({ ok: false, ambiguous: false, error: '400' }) };
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await executePlan(plan({ ledger: [...store.rows.values()] }), store, fail);
    const row = [...store.rows.values()][0];
    expect(row.status).toBe('failed_permanent');
    expect(row.attempts).toBe(MAX_ATTEMPTS);
  });
  it('a blocked plan touches nothing', async () => {
    const store = memStore(); const s = countingSender();
    await executePlan(plan({ armed: false }), store, s);
    expect(s.n).toBe(0); expect(store.rows.size).toBe(0);
  });
});
