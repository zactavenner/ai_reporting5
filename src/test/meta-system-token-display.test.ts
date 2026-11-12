import { describe, it, expect } from 'vitest';
import { tokenDetailLines, tokenNeedsAttention, tokenRowState, type MetaSystemTokenStatus } from '@/lib/metaSystemTokenDisplay';

const base: MetaSystemTokenStatus = {
  client_id: 'c', status: 'active', using: 'system_user', system_user_id: '61580000000001', system_user_name: 'HPA',
  token_last4: 'ABCD', scopes: ['ads_read', 'ads_management'], expires_at: null, data_access_expires_at: null,
  ad_account_access: {}, saved_at: '2026-11-10T12:00:00Z', saved_by: 'Zac', last_validated_at: '2026-11-10T12:00:00Z',
  last_used_at: null, last_error: null,
};

describe('Meta system user token row', () => {
  it('counts Invalid and Needs attention toward "need attention"; Not set and Active do not', () => {
    expect(tokenNeedsAttention('invalid')).toBe(true);
    expect(tokenNeedsAttention('needs_attention')).toBe(true);
    expect(tokenNeedsAttention('active')).toBe(false);
    expect(tokenNeedsAttention('not_set')).toBe(false);
    expect([tokenRowState('active'), tokenRowState('invalid'), tokenRowState('not_set')]).toEqual(['ok', 'warn', 'neutral']);
  });

  it('shows which token pulls use, masked id/last4, scopes and Never expiry', () => {
    expect(tokenDetailLines(base)).toEqual([
      'Using: System user',
      'System user ID 6158… · ••••ABCD',
      'Saved Nov 10, 2026 · Last validated Nov 10, 2026',
      'Scopes: ads_read, ads_management',
      'Expires: Never',
    ]);
    expect(tokenDetailLines({ ...base, status: 'not_set', using: 'user_token' })).toEqual(['Using: User token']);
  });
});
