/**
 * Daily ↔ monthly ad spend target math. Only ONE of the two is stored on
 * client_settings (daily_ad_spend_target OR monthly_ad_spend_target); the other
 * is always derived from the days in the given month, matching
 * getEffectiveDailyTarget / getEffectiveMonthlyTarget.
 */
export type AdSpendMode = 'daily' | 'monthly';

export function daysInMonth(ref: Date): number {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
}

const cents = (v: number) => Math.round(v * 100) / 100;

export function dailyToMonthly(daily: number, ref: Date): number {
  return cents(daily * daysInMonth(ref));
}

export function monthlyToDaily(monthly: number, ref: Date): number {
  return cents(monthly / daysInMonth(ref));
}

/** Effective pair from stored settings: the stored side wins, the other is derived. */
export function effectiveAdSpendTargets(
  stored: { daily_ad_spend_target?: number | null; monthly_ad_spend_target?: number | null } | null | undefined,
  ref: Date,
): { daily: number; monthly: number; mode: AdSpendMode | null } {
  const d = Number(stored?.daily_ad_spend_target) || 0;
  const m = Number(stored?.monthly_ad_spend_target) || 0;
  if (d > 0) return { daily: d, monthly: dailyToMonthly(d, ref), mode: 'daily' };
  if (m > 0) return { daily: monthlyToDaily(m, ref), monthly: m, mode: 'monthly' };
  return { daily: 0, monthly: 0, mode: null };
}

/** Row to save for the side the user edited; the other side is cleared so it stays derived. */
export function adSpendTargetPatch(mode: AdSpendMode, value: number) {
  const v = value > 0 ? cents(value) : 0;
  return mode === 'daily'
    ? { daily_ad_spend_target: v > 0 ? v : null, monthly_ad_spend_target: 0 }
    : { daily_ad_spend_target: null, monthly_ad_spend_target: v };
}
