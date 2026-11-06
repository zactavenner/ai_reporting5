// Synthetic fixtures only — no real client data.
import { describe, it, expect } from 'vitest';
import { completedWeeks, computeWeek, verifiedLeads, liveDeliveryGate, readiness, WEEKLY_REPORT_DISPATCH_ARMED, assertIsolated } from '@/lib/weeklyReport/core';

const cfg = { clientId: 'A', timezone: 'America/Los_Angeles', timezoneConfigured: true, isCapital: true, trackedCalendarIds: ['cal1'], raiseGoal: 1e6, raiseDeadline: null };
const week = { from: '2026-11-02', to: '2026-11-08' };
const lead = (id: string, created_at: string, email: string | null, phone: string | null, extra = {}) => ({ id, client_id: 'A', created_at, email, phone, is_spam: false, ...extra });

describe('weekly client report', () => {
  it('uses last completed Mon–Sun in the client timezone', () => {
    // Mon Nov 9 2026 06:00 UTC is still Sunday Nov 8 in Los Angeles
    const [cur, prior] = completedWeeks(new Date('2026-11-09T06:00:00Z'), 'America/Los_Angeles', 2);
    expect(cur).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(prior).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(completedWeeks(new Date('2026-11-09T18:00:00Z'), 'America/Los_Angeles', 1)[0]).toEqual(week);
  });
  it('verified leads need email AND phone, exclude spam, dedupe', () => {
    const v = verifiedLeads([
      lead('1', '2026-11-03T18:00:00Z', 'a@x.com', '5551234567'),
      lead('2', '2026-11-04T18:00:00Z', 'A@X.com', '5559999999'),
      lead('3', '2026-11-04T18:00:00Z', 'b@x.com', null),
      lead('4', '2026-11-04T18:00:00Z', 'c@x.com', '5550000000', { is_spam: true }),
    ] as any, week, 'America/Los_Angeles');
    expect(v.map((l) => l.id)).toEqual(['1']);
  });
  it('missing spend and untracked shows are unavailable, not zero', () => {
    const m = computeWeek({ ...cfg, trackedCalendarIds: [] }, week, { leads: [], calls: [], spend: [], formLeads: [], funded: [] });
    expect(m.spend.value).toBeNull();
    expect(m.cpl.value).toBeNull();
    expect(m.shows.value).toBeNull();
  });
  it('shows count only showed/completed past appointments; bookings dedupe by appointment id', () => {
    const call = (id: string, appt: string, status: string, showed: boolean, at = '2026-11-04T18:00:00Z') => ({ id, client_id: 'A', lead_id: null, scheduled_at: at, booked_at: '2026-11-03T18:00:00Z', showed, appointment_status: status, ghl_appointment_id: appt, ghl_calendar_id: 'cal1', is_reconnect: false });
    const m = computeWeek(cfg, week, { leads: [], spend: [{ client_id: 'A', date: '2026-11-03', ad_spend: 300 }], formLeads: [], funded: [], calls: [call('1', 'x', 'showed', true), call('2', 'x', 'showed', true), call('3', 'y', 'confirmed', true), call('4', 'z', 'showed', true, '2099-01-01T00:00:00Z')] as any }, new Date('2026-11-10T00:00:00Z'));
    expect(m.bookedCalls.value).toBe(3);
    expect(m.shows.value).toBe(1);
    expect(m.costPerShow.value).toBe(300);
  });
  it('rejects rows from another client', () => {
    expect(() => assertIsolated('A', [{ client_id: 'B' }])).toThrow();
    expect(() => computeWeek(cfg, week, { leads: [{ ...lead('1', '2026-11-03T18:00:00Z', 'a@x.com', '5551234567'), client_id: 'B' }] as any, calls: [], spend: [], formLeads: [], funded: [] })).toThrow();
  });
  it('live delivery ships disarmed and stays blocked even when ready', () => {
    expect(WEEKLY_REPORT_DISPATCH_ARMED).toBe(false);
    const checks = readiness({ hasMetaAccount: true, hasMetaToken: true, hasGhlLocation: true, hasCrmCredential: true, timezoneConfigured: true, trackedCalendars: 1, isCapital: false, hasFundedMapping: false, raiseGoal: null, lastSpendDate: '2026-11-08', lastCrmSync: new Date().toISOString(), weekEnd: '2026-11-08', approvedRecipients: 1 });
    expect(liveDeliveryGate(checks, false).allowed).toBe(false);
    expect(liveDeliveryGate(checks, true).allowed).toBe(true);
    const noRecip = readiness({ hasMetaAccount: true, hasMetaToken: true, hasGhlLocation: true, hasCrmCredential: true, timezoneConfigured: true, trackedCalendars: 1, isCapital: false, hasFundedMapping: false, raiseGoal: null, lastSpendDate: '2026-11-08', lastCrmSync: new Date().toISOString(), weekEnd: '2026-11-08', approvedRecipients: 0 });
    expect(liveDeliveryGate(noRecip, true).allowed).toBe(false);
  });
});
