export type ClientStatusGroupKey = 'onboarding' | 'active' | 'paused';

export const CLIENT_STATUS_GROUPS: { key: ClientStatusGroupKey; label: string }[] = [
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

/** Billing problems stay with Active (they're live clients); everything not live or onboarding is Paused. */
export function statusGroupOf(status: string | null | undefined): ClientStatusGroupKey {
  const s = (status || '').toLowerCase();
  if (s === 'onboarding') return 'onboarding';
  if (s === 'active' || s === 'cc_error' || s === 'billing_error') return 'active';
  return 'paused';
}

/** Splits rows into Onboarding → Active → Paused, keeping each group's existing order. Empty groups are dropped. */
export function groupByClientStatus<T>(rows: T[], getStatus: (row: T) => string | null | undefined) {
  return CLIENT_STATUS_GROUPS.map((g) => ({
    ...g,
    rows: rows.filter((r) => statusGroupOf(getStatus(r)) === g.key),
  })).filter((g) => g.rows.length > 0);
}
