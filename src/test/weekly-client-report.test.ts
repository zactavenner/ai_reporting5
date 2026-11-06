// Synthetic fixtures only — no real client data.
import { describe, it, expect } from 'vitest';
import { completedWeeks, computeWeek, verifiedLeads, liveDeliveryGate, readiness, topCreatives, WEEKLY_REPORT_DISPATCH_ARMED, assertIsolated } from '@/lib/weeklyReport/core';

const cfg = { clientId: 'A', timezone: 'America/Los_Angeles', timezoneConfigured: true, isCapital: true, trackedCalendarIds: ['cal1'], raiseGoal: 1e6, raiseDeadline: null, crmConnected: true };
const week = { from: '2026-11-02', to: '2026-11-08' };
const empty = { leads: [], calls: [], spend: [], formLeads: [], funded: [] };
const lead = (id: string, created_at: string, email: string | null, phone: string | null, extra = {}) => ({ id, client_id: 'A', name: 'Pat Doe', created_at, email, phone, is_spam: false, ...extra });
const fullSpend = Array.from({ length: 7 }, (_, i) => ({ client_id: 'A', date: `2026-11-0${i + 2}`, ad_spend: 100 }));
const ri = { hasMetaAccount: true, spendSyncOk: true, hasGhlLocation: true, crmSyncOk: true, timezoneConfigured: true, trackedCalendars: 1, isCapital: false, hasFundedMapping: false, raiseGoal: null, lastSpendDate: '2026-11-08', lastCrmSync: new Date().toISOString(), weekEnd: '2026-11-08', approvedRecipients: 1 };

describe('weekly client report', () => {
  it('uses last completed Mon–Sun in the client timezone', () => {
    const [cur, prior] = completedWeeks(new Date('2026-11-09T06:00:00Z'), 'America/Los_Angeles', 2);
    expect(cur).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(prior).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(completedWeeks(new Date('2026-11-09T18:00:00Z'), 'America/Los_Angeles', 1)[0]).toEqual(week);
  });
  it('verified lead = name + valid email OR phone, no spam/test, deduped', () => {
    const v = verifiedLeads([
      lead('1', '2026-11-03T18:00:00Z', 'a@x.com', null),
      lead('2', '2026-11-04T18:00:00Z', 'A@X.com', '5559999999'),   // dup email
      lead('3', '2026-11-04T18:00:00Z', null, '5551112222'),        // phone only ok
      lead('4', '2026-11-04T18:00:00Z', 'c@x.com', null, { is_spam: true }),
      lead('5', '2026-11-04T18:00:00Z', 'd@x.com', null, { name: '' }),
      lead('6', '2026-11-04T18:00:00Z', 'e@x.com', null, { name: 'Test Lead' }),
      lead('7', '2026-11-04T18:00:00Z', 'bad-email', '123'),
    ] as any, week, 'America/Los_Angeles');
    expect(v.map((l) => l.id)).toEqual(['1', '3']);
  });
  it('partial spend is flagged, never presented as a full week', () => {
    const m = computeWeek(cfg, week, { ...empty, spend: fullSpend.slice(0, 5) });
    expect(m.spend.value).toBe(500);
    expect(m.spend.partial).toBe(true);
    expect(m.cpl.value === null || m.cpl.partial === true).toBe(true);
    expect(computeWeek(cfg, week, { ...empty, spend: fullSpend }).spend.partial).toBeFalsy();
  });
  it('missing spend, disconnected CRM and untracked shows are unavailable, not zero', () => {
    const m = computeWeek({ ...cfg, crmConnected: false }, week, empty);
    expect(m.spend.value).toBeNull();
    expect(m.verifiedLeads.value).toBeNull();
    expect(m.bookedCalls.value).toBeNull();
    expect(m.funded.value).toBeNull();
    expect(computeWeek({ ...cfg, trackedCalendarIds: [] }, week, empty).shows.value).toBeNull();
  });
  it('commitments are dated by committed_at only; otherwise unavailable', () => {
    const f = (extra: any) => ({ client_id: 'A', commitment_amount: 50000, funded_amount: 0, funded_at: '2026-11-04T18:00:00Z', is_verified_funded: false, ...extra });
    expect(computeWeek(cfg, week, { ...empty, funded: [f({ committed_at: null })] }).committed.value).toBeNull();
    expect(computeWeek(cfg, week, { ...empty, funded: [f({ committed_at: '2026-11-04T18:00:00Z' })] }).committed.value).toBe(50000);
    expect(computeWeek(cfg, week, { ...empty, funded: [f({ committed_at: '2026-10-01T18:00:00Z' })] }).committed.value).toBe(0);
  });
  it('shows count only showed/completed past appointments; bookings dedupe by appointment id', () => {
    const call = (id: string, appt: string, status: string, showed: boolean, at = '2026-11-04T18:00:00Z') => ({ id, client_id: 'A', lead_id: null, scheduled_at: at, booked_at: '2026-11-03T18:00:00Z', showed, appointment_status: status, ghl_appointment_id: appt, ghl_calendar_id: 'cal1', is_reconnect: false });
    const m = computeWeek(cfg, week, { ...empty, spend: fullSpend, calls: [call('1', 'x', 'showed', true), call('2', 'x', 'showed', true), call('3', 'y', 'confirmed', true), call('4', 'z', 'showed', true, '2099-01-01T00:00:00Z')] as any }, new Date('2026-11-10T00:00:00Z'));
    expect(m.bookedCalls.value).toBe(3);
    expect(m.shows.value).toBe(1);
    expect(m.costPerShow.value).toBe(700);
  });
  it('creatives use only the report week from per-ad daily rows', () => {
    const rows = [
      { client_id: 'A', date: '2026-11-03', meta_ad_id: 'ad1', spend: 40, leads: 2 },
      { client_id: 'A', date: '2026-11-04', meta_ad_id: 'ad1', spend: 60, leads: 3 },
      { client_id: 'A', date: '2026-10-20', meta_ad_id: 'ad1', spend: 999, leads: 9 },
    ];
    const [c] = topCreatives(rows, [{ client_id: 'A', meta_ad_id: 'ad1', name: 'Hook A', thumbnail_url: 't', image_url: null }], 'A', week);
    expect(c).toMatchObject({ name: 'Hook A', spend: 100, leads: 5, cpl: 20, image: 't' });
  });
  it('rejects rows from another client', () => {
    expect(() => assertIsolated('A', [{ client_id: 'B' }])).toThrow();
    expect(() => topCreatives([{ client_id: 'B', date: '2026-11-03', meta_ad_id: 'x', spend: 1, leads: 0 }], [], 'A', week)).toThrow();
  });
  it('unknown access is not reported as ok', () => {
    const c = readiness({ ...ri, spendSyncOk: null, crmSyncOk: null });
    expect(c.find((x) => x.key === 'metaToken')?.level).toBe('warn');
    expect(c.find((x) => x.key === 'crm')?.level).toBe('warn');
  });
  it('live delivery ships disarmed and stays blocked even when ready', () => {
    expect(WEEKLY_REPORT_DISPATCH_ARMED).toBe(false);
    expect(liveDeliveryGate(readiness(ri), false).allowed).toBe(false);
    expect(liveDeliveryGate(readiness(ri), true).allowed).toBe(true);
    expect(liveDeliveryGate(readiness({ ...ri, approvedRecipients: 0 }), true).allowed).toBe(false);
  });
});
