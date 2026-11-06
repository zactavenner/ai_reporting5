import { describe, it, expect } from 'vitest';
import {
  dailyToMonthly,
  monthlyToDaily,
  effectiveAdSpendTargets,
  adSpendTargetPatch,
} from '@/lib/huddle/adSpendTargets';

const nov = new Date(2026, 10, 6); // 30 days
const oct = new Date(2026, 9, 6); // 31 days

describe('ad spend targets', () => {
  it('daily $1,000 in November auto-calculates to $30,000 monthly', () => {
    expect(dailyToMonthly(1000, nov)).toBe(30000);
  });

  it('monthly $31,000 in October auto-calculates to $1,000 daily', () => {
    expect(monthlyToDaily(31000, oct)).toBe(1000);
  });

  it('a stored daily target wins over a stored monthly one', () => {
    expect(effectiveAdSpendTargets({ daily_ad_spend_target: 500, monthly_ad_spend_target: 99999 }, nov))
      .toEqual({ daily: 500, monthly: 15000, mode: 'daily' });
  });

  it('editing monthly clears the stored daily so daily stays derived', () => {
    expect(adSpendTargetPatch('monthly', 30000)).toEqual({ daily_ad_spend_target: null, monthly_ad_spend_target: 30000 });
  });
});
