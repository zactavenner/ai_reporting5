import { describe, it, expect } from 'vitest';
import { scorecardWindows, summarize, parseRaiseAmount } from '@/lib/huddle/scorecardSummary';

describe('huddle scorecard summary', () => {
  const today = new Date(2026, 10, 4); // Nov 4 2026

  it('daily mode is yesterday vs the day before', () => {
    const w = scorecardWindows('daily', today);
    expect(w.current).toMatchObject({ start: '2026-11-03', end: '2026-11-03' });
    expect(w.prior).toMatchObject({ start: '2026-11-02', end: '2026-11-02' });
  });

  it('monthly mode is month-to-date vs same days last month', () => {
    const w = scorecardWindows('monthly', today);
    expect(w.current).toMatchObject({ start: '2026-11-01', end: '2026-11-04' });
    expect(w.prior).toMatchObject({ start: '2026-10-01', end: '2026-10-04' });
  });

  it('recomputes CPL and show % from totals, not averages', () => {
    const rows = [
      { date_account_tz: '2026-11-01', ad_spend: 100, leads: 1, calls: 1, showed_calls: 1 },
      { date_account_tz: '2026-11-02', ad_spend: 300, leads: 9, calls: 3, showed_calls: 0 },
      { date_account_tz: '2026-10-31', ad_spend: 999, leads: 1 },
    ];
    const t = summarize(rows, { start: '2026-11-01', end: '2026-11-04', label: '' });
    expect(t.ad_spend).toBe(400);
    expect(t.cpl).toBe(40);
    expect(t.show_pct).toBe(25);
    expect(t.cost_per_show).toBe(400);
  });

  it('parses loose raise amounts', () => {
    expect(parseRaiseAmount('3,000,000')).toBe(3_000_000);
    expect(parseRaiseAmount('$4M')).toBe(4_000_000);
    expect(parseRaiseAmount('60 days')).toBeNull();
  });
});
