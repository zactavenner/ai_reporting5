import { describe, it, expect, vi } from 'vitest';
import { emptyPacket, readiness, sanitizePacket, sameSnapshot, sourceSnapshot, validateScope } from '../../supabase/functions/_shared/pilotReadiness';
import { createPilotHandler } from '../../supabase/functions/pilot-readiness/handler';

const cid = '00000000-0000-4000-8000-000000000001';
const oid = '00000000-0000-4000-8000-000000000002';
const primary = '00000000-0000-4000-8000-000000000003';
const backup = '00000000-0000-4000-8000-000000000004';
const sources = {
  client: { id: cid, name: 'Fixture', status: 'active', meta_ad_account_id: 'act_123', meta_ad_account_ids: [], ghl_location_id: 'location-1' },
  offer: { id: oid, client_id: cid, title: 'Offer', offer_type: 'fund', status: 'active', meta_ad_account_id: '123', ghl_location_id: 'location-1' },
  members: [{ id: primary, name: 'Primary', role: 'admin' }, { id: backup, name: 'Backup', role: 'member' }],
};
function complete() {
  return sanitizePacket({ ...emptyPacket(), offer_id: oid, primary_owner_id: primary, backup_owner_id: backup,
    deliverables: 'Ads analysis', exclusions: 'No autonomous spend', coverage_hours: 'Mon-Fri 9-5', timezone: 'America/Los_Angeles',
    qualification_definition: 'Approved definition', sales_capacity_weekly: 20, qualification_lag_days: 0, funding_lag_days: 30,
    target_cpql: 100, daily_limit: 200, monthly_limit: 6000, pilot_limit: 1400, currency: 'USD',
    meta_ad_account_id: '123', ghl_location_id: 'location-1', account_verified_by: primary, account_verified_at: '2026-01-01T00:00:00Z',
    scope_evidence: 'https://example.com/scope', claims_evidence: 'https://example.com/claims', authority_evidence: 'https://example.com/authority',
    account_evidence: 'https://example.com/identity', budget_evidence: 'https://example.com/budget' });
}
describe('pilot approval requirements', () => {
  it('keeps blank distinct from an approved same-day lag', () => {
    expect(sanitizePacket({ qualification_lag_days: '' }).qualification_lag_days).toBeNull();
    expect(readiness('capital_raising', complete(), sources)).toEqual([]);
    expect(readiness('capital_raising', { ...complete(), qualification_lag_days: null }, sources)).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'qualification_lag_days' })]));
  });
  it.each([NaN, Infinity, -1, '200', true])('rejects unsafe numeric input %s', value => {
    expect(() => sanitizePacket({ daily_limit: value })).toThrow();
  });
  it('rejects spoofed approval fields and invalid workflow scopes', () => {
    expect(() => sanitizePacket({ status: 'accepted', accepted_by: primary })).toThrow();
    expect(() => validateScope('medical')).toThrow();
  });
  it('separates agency acquisition from investor funding requirements', () => {
    expect(readiness('agency_acquisition', complete(), sources).some(b => b.field === 'funding_lag_days')).toBe(true);
    expect(readiness('agency_acquisition', { ...complete(), funding_lag_days: null }, sources)).toEqual([]);
    expect(readiness('capital_raising', { ...complete(), funding_lag_days: null }, sources).some(b => b.field === 'funding_lag_days')).toBe(true);
  });
  it('blocks cross-client offers and mismatched or missing mappings', () => {
    expect(readiness('capital_raising', complete(), { ...sources, offer: { ...sources.offer, client_id: oid } }).some(b => b.field === 'offer_id')).toBe(true);
    expect(readiness('capital_raising', complete(), { ...sources, client: { ...sources.client, meta_ad_account_id: null, ghl_location_id: null } }).map(b => b.field)).toEqual(expect.arrayContaining(['meta_ad_account_id', 'ghl_location_id']));
    expect(readiness('capital_raising', complete(), { ...sources, offer: { ...sources.offer, meta_ad_account_id: '456' } }).some(b => b.field === 'meta_ad_account_id')).toBe(true);
  });
  it('requires distinct current owners and assigns missing inputs without inventing people', () => {
    expect(readiness('capital_raising', { ...complete(), backup_owner_id: primary }, sources).some(b => b.field === 'backup_owner_id')).toBe(true);
    const missing = readiness('capital_raising', emptyPacket(), sources);
    expect(missing.every(b => b.owner_id === null)).toBe(true);
    expect(readiness('capital_raising', { ...complete(), budget_evidence: '' }, sources)[0].owner_id).toBe(primary);
  });
  it('requires actual evidence, valid timezone and a nonfuture identity check', () => {
    const p = { ...complete(), scope_evidence: 'not a link', timezone: 'nonsense', account_verified_at: '2999-01-01' };
    expect(readiness('capital_raising', p, sources).map(b => b.field)).toEqual(expect.arrayContaining(['scope_evidence', 'timezone', 'account_verified_at']));
  });
  it('detects relevant source changes despite JSON property order', () => {
    const snap = sourceSnapshot(sources, complete());
    expect(sameSnapshot(snap, { members: snap.members, offer: snap.offer, client: snap.client })).toBe(true);
    expect(sameSnapshot(snap, sourceSnapshot({ ...sources, client: { ...sources.client, ghl_location_id: 'changed' } }, complete()))).toBe(false);
  });
});

const request = (body: unknown) => new Request('https://example.com/pilot', { method: 'POST', body: JSON.stringify(body) });
function dbFor(packet: any = null, overrideOffer: any = sources.offer) {
  const rpc = vi.fn(async () => ({ data: { version: (packet?.version || 0) + 1, status: 'ready_for_review' }, error: null }));
  const from = vi.fn((table: string) => {
    const values: Record<string, unknown> = { clients: sources.client, client_offers: overrideOffer, agency_members: sources.members, pilot_readiness_packets: packet };
    const chain: any = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, maybeSingle: () => chain, then: (resolve: any) => resolve({ data: values[table], error: null }) };
    return chain;
  });
  return { from, rpc };
}
const allowed = async () => ({ ok: true, memberId: primary, via: 'dashboard_admin' });
describe('real handler boundaries', () => {
  it.each([['missing_token', 401], ['invalid_token', 401], ['not_operator', 403]])('denies %s before any data access', async (code, status) => {
    const db = dbFor();
    const handler = createPilotHandler(db, async () => ({ ok: false, status, code, error: 'Denied' }));
    expect((await handler(request({ action: 'catalog', role: 'admin' }))).status).toBe(status);
    expect(db.from).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('denies unowned service jobs even with a valid service identity', async () => {
    const db = dbFor();
    expect((await createPilotHandler(db, async () => ({ ok: true, via: 'service_role' }))(request({ action: 'catalog' }))).status).toBe(403);
    expect(db.from).not.toHaveBeenCalled();
  });
  it('rejects cross-client offers without writing', async () => {
    const db = dbFor(null, { ...sources.offer, client_id: oid });
    const response = await createPilotHandler(db, allowed)(request({ action: 'save', client_id: cid, scope: 'capital_raising', input: complete(), expected_version: 0 }));
    expect(response.status).toBe(400); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('rejects stale versions without overwriting', async () => {
    const db = dbFor({ version: 2, input: complete(), status: 'ready_for_review' });
    const response = await createPilotHandler(db, allowed)(request({ action: 'save', client_id: cid, scope: 'capital_raising', input: complete(), expected_version: 1 }));
    expect(response.status).toBe(409); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('derives the actor from verified identity and ignores caller approval flags', async () => {
    const db = dbFor();
    const response = await createPilotHandler(db, allowed)(request({ action: 'save', client_id: cid, scope: 'capital_raising', input: complete(), expected_version: 0, actor: 'attacker', status: 'accepted' }));
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith('write_pilot_readiness', expect.objectContaining({ p_actor: `member:${primary}`, p_accept: false }));
  });
  it('blocks incomplete acceptance and requires explicit attestation', async () => {
    for (const [input, attest, status] of [[emptyPacket(), true, 422], [complete(), false, 400]] as const) {
      const db = dbFor({ version: 1, input, status: 'needs_input' });
      expect((await createPilotHandler(db, allowed)(request({ action: 'accept', client_id: cid, scope: 'capital_raising', expected_version: 1, attest }))).status).toBe(status);
      expect(db.rpc).not.toHaveBeenCalled();
    }
  });
  it('shows previously accepted packets as needing review when sources change', async () => {
    const db = dbFor({ version: 2, input: complete(), status: 'accepted', source_snapshot: {} });
    const response = await createPilotHandler(db, allowed)(request({ action: 'read', client_id: cid, scope: 'capital_raising' }));
    expect(await response.json()).toMatchObject({ status: 'needs_input', source_changed: true });
  });
});
