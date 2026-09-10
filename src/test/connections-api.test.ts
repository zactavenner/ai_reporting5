import { describe, expect, it } from 'vitest';
import {
  fingerprint,
  pageMeta,
  parsePagination,
  resolveRoute,
  shapeAdAccount,
  shapeClientSummary,
  shapeOffer,
} from '../../supabase/functions/_shared/connectionsApi.ts';

const ok = (r: any) => {
  expect(r.error, JSON.stringify(r.error)).toBeUndefined();
  return r.route;
};

describe('routing', () => {
  const c = '11111111-2222-4333-8444-555555555555';
  const a = '99999999-2222-4333-8444-555555555555';

  it('resolves the documented routes', () => {
    expect(ok(resolveRoute('GET', '/connections-api/clients')).name).toBe('list_clients');
    expect(ok(resolveRoute('GET', '/connections-api/ad-accounts')).name).toBe('list_all_ad_accounts');
    expect(ok(resolveRoute('GET', `/connections-api/clients/${c}/offers`)).name).toBe('list_offers');
    expect(ok(resolveRoute('POST', `/connections-api/clients/${c}/offers`)).name).toBe('create_offer');
    expect(ok(resolveRoute('PATCH', `/connections-api/clients/${c}/offers/${a}`)).name).toBe('patch_offer');
    expect(ok(resolveRoute('GET', `/connections-api/clients/${c}/ad-accounts`)).name).toBe('list_ad_accounts');
    expect(ok(resolveRoute('POST', `/connections-api/clients/${c}/ad-accounts`)).name).toBe('create_ad_account');
    expect(ok(resolveRoute('PATCH', `/connections-api/clients/${c}/ad-accounts/${a}`)).name).toBe('patch_ad_account');
    expect(ok(resolveRoute('POST', `/connections-api/clients/${c}/ad-accounts/${a}/sync`)).name).toBe('sync_ad_account');
    expect(ok(resolveRoute('GET', `/connections-api/clients/${c}/integrations`)).name).toBe('list_integrations');
    expect(ok(resolveRoute('POST', `/connections-api/clients/${c}/integrations/meta/test`)).name).toBe('test_integration');
    expect(ok(resolveRoute('PUT', `/connections-api/clients/${c}/integrations/ghl/credential`)).name).toBe('replace_credential');
  });

  it('tolerates the /functions/v1 prefix', () => {
    expect(ok(resolveRoute('GET', '/functions/v1/connections-api/clients')).name).toBe('list_clients');
  });

  it('rejects wrong methods, bad ids and unknown paths', () => {
    expect((resolveRoute('DELETE', '/connections-api/clients') as any).error.code).toBe('method_not_allowed');
    expect((resolveRoute('GET', '/connections-api/clients/not-a-uuid/offers') as any).error.code).toBe('invalid_client_id');
    expect((resolveRoute('GET', `/connections-api/clients/${c}/integrations/hubspot/test`) as any).error.code).toBe('unsupported_integration');
    expect((resolveRoute('GET', '/connections-api/nope') as any).error.code).toBe('route_not_found');
    expect((resolveRoute('GET', '/connections-api') as any).error.code).toBe('route_not_found');
  });
});

describe('pagination', () => {
  it('defaults and validates', () => {
    expect(parsePagination(new URLSearchParams(''))).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination(new URLSearchParams('limit=10&offset=20'))).toEqual({ limit: 10, offset: 20 });
    expect((parsePagination(new URLSearchParams('limit=0')) as any).error.code).toBe('invalid_limit');
    expect((parsePagination(new URLSearchParams('limit=500')) as any).error.code).toBe('invalid_limit');
    expect((parsePagination(new URLSearchParams('offset=-1')) as any).error.code).toBe('invalid_offset');
  });

  it('computes page meta with and without a total', () => {
    expect(pageMeta({ limit: 2, offset: 0 }, 2, 5)).toMatchObject({ has_more: true, next_offset: 2, total: 5 });
    expect(pageMeta({ limit: 2, offset: 4 }, 1, 5)).toMatchObject({ has_more: false, next_offset: null });
    expect(pageMeta({ limit: 2, offset: 0 }, 2, null)).toMatchObject({ has_more: true, next_offset: 2 });
  });
});

describe('response shaping never leaks credentials', () => {
  it('whitelists ad account fields', () => {
    const shaped = shapeAdAccount({
      id: 'a', client_id: 'c', provider: 'meta', provider_account_id: '123456', ads_total: 4,
      meta_access_token: 'EAAsecret', ghl_api_key: 'pit-secret',
    });
    expect(shaped.provider_account_id).toBe('123456');
    expect(shaped.ads_total).toBe(4);
    expect('meta_access_token' in shaped).toBe(false);
    expect(JSON.stringify(shaped)).not.toContain('secret');
  });

  it('whitelists offer fields', () => {
    const shaped = shapeOffer({ id: 'o', title: 'Fund II', status: 'active', secret_key: 'nope' });
    expect('secret_key' in shaped).toBe(false);
    expect(shaped.title).toBe('Fund II');
  });

  it('reports credential presence only in the client summary', () => {
    const s = shapeClientSummary(
      { id: 'c1', name: 'Client', status: 'active', meta_access_token: 'EAAsecret', ghl_api_key: 'pit-secret', ghl_location_id: 'loc1' },
      [{ id: 'a1' }],
      { health: 'partial' },
    );
    expect(s.connections.meta_credential_present).toBe(true);
    expect(s.connections.ghl_credential_present).toBe(true);
    expect(JSON.stringify(s)).not.toContain('EAAsecret');
    expect(JSON.stringify(s)).not.toContain('pit-secret');
  });
});

describe('idempotency fingerprint', () => {
  it('matches identical retries and differs on changed bodies', () => {
    expect(fingerprint({ provider_account_id: '123456', is_primary: true })).toBe(
      fingerprint({ is_primary: true, provider_account_id: '123456' }),
    );
    expect(fingerprint({ provider_account_id: '123456' })).not.toBe(fingerprint({ provider_account_id: '654321' }));
  });
});
