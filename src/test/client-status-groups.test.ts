import { describe, it, expect } from 'vitest';
import { groupByClientStatus, statusGroupOf } from '@/lib/clientStatusGroups';

describe('client status groups', () => {
  it('orders groups Onboarding, Active, Paused', () => {
    const rows = [
      { n: 'A', s: 'paused' },
      { n: 'B', s: 'active' },
      { n: 'C', s: 'onboarding' },
    ];
    expect(groupByClientStatus(rows, (r) => r.s).map((g) => g.label)).toEqual(['Onboarding', 'Active', 'Paused']);
  });

  it('keeps existing order inside a group', () => {
    const rows = [
      { n: 'X', s: 'active' },
      { n: 'Y', s: 'paused' },
      { n: 'Z', s: 'active' },
    ];
    const active = groupByClientStatus(rows, (r) => r.s).find((g) => g.key === 'active')!;
    expect(active.rows.map((r) => r.n)).toEqual(['X', 'Z']);
  });

  it('puts billing problems under Active and on hold/inactive under Paused', () => {
    expect(statusGroupOf('cc_error')).toBe('active');
    expect(statusGroupOf('billing_error')).toBe('active');
    expect(statusGroupOf('on_hold')).toBe('paused');
    expect(statusGroupOf('inactive')).toBe('paused');
  });
});
