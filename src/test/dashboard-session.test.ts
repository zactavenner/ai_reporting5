import { describe, it, expect } from 'vitest';
import { isDashboardTokenValid } from '@/lib/dashboardSession';

const make = (exp: number) =>
  btoa(JSON.stringify({ memberId: 'm1', exp })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.sig';

describe('dashboard session expiry', () => {
  it('rejects an expired token so the sign-in screen shows', () => {
    expect(isDashboardTokenValid(make(1_000), 2_000)).toBe(false);
  });
  it('accepts a token that has not expired', () => {
    expect(isDashboardTokenValid(make(5_000), 2_000)).toBe(true);
  });
  it('rejects malformed tokens', () => {
    expect(isDashboardTokenValid('garbage', 0)).toBe(false);
  });
});
