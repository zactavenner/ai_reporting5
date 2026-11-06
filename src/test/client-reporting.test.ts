// Synthetic fixtures only — no real client data.
import { describe, it, expect } from 'vitest';
import { computeWeek, dailyRows, priorRange, rangeDays, capitalEvents } from '@/lib/weeklyReport/core';
import { buildRangeReport, reportFacts, type RosterEntry } from '../../supabase/functions/_shared/weeklyReport/model.ts';

const cfg = { clientId: 'A', timezone: 'America/Los_Angeles', timezoneConfigured: true, isCapital: true, trackedCalendarIds: ['cal1'], raiseGoal: 1e6, raiseDeadline: null, crmConnected: true };
const range = { from: '2026-10-30', to: '2026-11-05' }; // Fri–Thu, like a rolling 7-day report
const now = new Date('2026-11-06T20:00:00Z');
const lead = (id: string, at: string, email: string | null, phone: string | null) => ({ id, client_id: 'A', name: 'Pat Doe', created_at: at, email, phone, is_spam: false });
const call = (id: string, booked_at: string, scheduled_at: string, showed: boolean, status: string) => ({ id, client_id: 'A', lead_id: null, booked_at, scheduled_at, showed, appointment_status: status, ghl_appointment_id: id, ghl_calendar_id: 'cal1', is_reconnect: false });
const data = {
  leads: [lead('1', '2026-10-30T18:00:00Z', 'a@x.com', null), lead('2', '2026-11-02T18:00:00Z', 'b@x.com', null), lead('3', '2026-11-03T18:00:00Z', 'A@x.com', null)],
  calls: [call('c1', '2026-10-31T18:00:00Z', '2026-11-02T18:00:00Z', true, 'showed'), call('c2', '2026-11-02T18:00:00Z', '2026-11-04T18:00:00Z', true, 'confirmed')],
  spend: [{ client_id: 'A', date: '2026-10-30', ad_spend: 100 }, { client_id: 'A', date: '2026-11-02', ad_spend: 50 }],
  formLeads: [],
  funded: [
    { client_id: 'A', name: 'Investor One', commitment_amount: 100000, committed_at: '2026-11-03T18:00:00Z', funded_amount: 0, funded_at: null, is_verified_funded: false },
    { client_id: 'A', name: 'Investor Two', commitment_amount: 25000, committed_at: '2026-10-01T18:00:00Z', funded_amount: 25000, funded_at: '2026-11-04T18:00:00Z', is_verified_funded: true },
  ],
};
const entry: RosterEntry = {
  id: 'A', name: 'Synthetic Capital', status: 'active', industry: 'capital', config: cfg as any, gate: { allowed: false, reasons: [] },
  checks: [{ key: 'meta', label: 'Ad account', level: 'ok', detail: '' }, { key: 'metaToken', label: 'Ads access', level: 'block', detail: 'failed' }],
};

describe('client reporting (custom range)', () => {
  it('prior period is the same length immediately before', () => {
    expect(rangeDays(range)).toBe(7);
    expect(priorRange(range)).toEqual({ from: '2026-10-23', to: '2026-10-29' });
  });

  it('daily rows add up to the period totals', () => {
    const rows = dailyRows(cfg, range, data as any, now);
    const w = computeWeek(cfg, range, data as any, now);
    expect(rows).toHaveLength(7);
    expect(rows.reduce((a, d) => a + (d.leads || 0), 0)).toBe(w.verifiedLeads.value); // duplicate email removed → 2
    expect(w.verifiedLeads.value).toBe(2);
    expect(rows.reduce((a, d) => a + (d.booked || 0), 0)).toBe(w.bookedCalls.value);
    expect(rows.reduce((a, d) => a + (d.showed || 0), 0)).toBe(1); // 'confirmed' never counts as showed
  });

  it('days with no synced spend are null, not $0', () => {
    const rows = dailyRows(cfg, range, data as any, now);
    expect(rows.find((d) => d.date === '2026-10-31')!.spend).toBeNull();
    expect(rows.find((d) => d.date === '2026-10-30')!.spend).toBe(100);
    expect(computeWeek(cfg, range, data as any, now).spend.partial).toBe(true);
  });

  it('commit dated by committed_at, funded only when verified and dated by funded_at', () => {
    const ev = capitalEvents(cfg, data.funded as any, range);
    expect(ev).toEqual([
      { kind: 'commit', date: '2026-11-03', amount: 100000, name: 'Investor One' },
      { kind: 'funded', date: '2026-11-04', amount: 25000, name: 'Investor Two' },
    ]);
  });

  it('raise: verbal commitments are kept separate from funded', () => {
    const r = buildRangeReport(entry, { ...data, adDaily: [], adMeta: [] } as any, range, now);
    expect(r.raise.fundedToDate).toBe(25000);
    expect(r.raise.fundedInvestors).toBe(1);
    expect(r.raise.verbalAmount).toBe(100000);
    expect(r.raise.remaining).toBe(975000);
  });

  it('failing ad access and partial spend are flagged for attention', () => {
    const r = buildRangeReport(entry, { ...data, adDaily: [], adMeta: [] } as any, range, now);
    expect(r.attention.some((a) => a.tone === 'alert' && /access failing/i.test(a.title))).toBe(true);
    expect(r.attention.some((a) => /2\/7 days/.test(a.title))).toBe(true);
  });

  it('facts sent to AI and agents contain no investor names or contact details', () => {
    const r = buildRangeReport(entry, { ...data, adDaily: [], adMeta: [] } as any, range, now);
    const s = JSON.stringify(reportFacts(r));
    expect(s).not.toContain('Investor One');
    expect(s).not.toContain('a@x.com');
    expect(s).not.toContain('Pat Doe');
  });

  it('rejects rows from another client', () => {
    expect(() => buildRangeReport(entry, { ...data, leads: [{ ...data.leads[0], client_id: 'B' }], adDaily: [], adMeta: [] } as any, range, now)).toThrow();
  });
});
