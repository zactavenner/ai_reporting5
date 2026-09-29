import { PilotError, readiness, sameSnapshot, sanitizePacket, sourceSnapshot, validateScope } from '../_shared/pilotReadiness.ts';
import type { Sources } from '../_shared/pilotReadiness.ts';

const clientColumns = 'id,name,status,meta_ad_account_id,meta_ad_account_ids,ghl_location_id';
const offerColumns = 'id,client_id,title,offer_type,status,meta_ad_account_id,ghl_location_id';
const packetColumns = 'client_id,scope,input,version,status,blockers,source_snapshot,updated_at,updated_by,accepted_at,accepted_by';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dashboard-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// Dependencies are injected to exercise the real handler's authorization and write ordering.
export function createPilotHandler(db: any, authorize: (req: Request, body: unknown) => Promise<any>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
    try {
      const raw = await req.text();
      if (raw.length > 150000) throw new PilotError('Request too large', 413);
      let body: any;
      try { body = JSON.parse(raw); } catch { throw new PilotError('Invalid JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PilotError('Invalid request');
      const auth = await authorize(req, body);
      if (!auth.ok) return reply({ error: auth.error, code: auth.code }, auth.status);
      // A named, verified human must own changes; service jobs cannot approve a pilot.
      const actor = auth.memberId ? `member:${auth.memberId}` : auth.userId ? `user:${auth.userId}` : null;
      if (!actor) return reply({ error: 'A named agency operator is required', code: 'not_operator' }, 403);
      if (!['catalog', 'read', 'save', 'accept'].includes(body.action)) throw new PilotError('Unknown action');
      const checked = (result: any) => { if (result.error) throw new PilotError('Pilot data is unavailable. Retry after the deployment is complete.', 503, 'data_unavailable'); return result.data; };
      if (body.action === 'catalog') {
        const [clients, offers, members] = await Promise.all([
          db.from('clients').select(clientColumns).in('status', ['active', 'onboarding']).order('name'),
          db.from('client_offers').select(offerColumns).order('title'),
          db.from('agency_members').select('id,name,role').order('name'),
        ]);
        return reply({ clients: checked(clients), offers: checked(offers), members: checked(members) });
      }
      const scope = validateScope(body.scope);
      if (!uuid(body.client_id)) throw new PilotError('Invalid client');
      const client = checked(await db.from('clients').select(clientColumns).eq('id', body.client_id).maybeSingle());
      if (!client || !['active', 'onboarding'].includes(client.status)) throw new PilotError('Client is not active or onboarding', 404);
      const stored = checked(await db.from('pilot_readiness_packets').select(packetColumns).eq('client_id', body.client_id).eq('scope', scope).maybeSingle());
      const input = sanitizePacket(body.action === 'save' ? body.input : stored?.input || {});
      if (input.offer_id && !uuid(input.offer_id)) throw new PilotError('Invalid offer');
      const members = checked(await db.from('agency_members').select('id,name,role').order('id'));
      const offer = input.offer_id ? checked(await db.from('client_offers').select(offerColumns).eq('id', input.offer_id).maybeSingle()) : null;
      if (offer && offer.client_id !== body.client_id) throw new PilotError('Offer belongs to a different client');
      const sources: Sources = { client, offer, members };
      const blockers = readiness(scope, input, sources);
      const snapshot = sourceSnapshot(sources, input);
      const sourceChanged = stored?.status === 'accepted' && !sameSnapshot(stored.source_snapshot, snapshot);
      const status = !stored ? 'draft' : sourceChanged ? 'needs_input' : blockers.length ? 'needs_input' : stored.status === 'accepted' ? 'accepted' : 'ready_for_review';
      if (body.action === 'read') return reply({ packet: stored, input, blockers, sources, status, source_changed: !!sourceChanged });
      if (!Number.isInteger(body.expected_version) || body.expected_version < 0) throw new PilotError('Expected version is required');
      if ((stored?.version || 0) !== body.expected_version) throw new PilotError('This packet changed. Reload before saving.', 409, 'version_conflict');
      if (body.action === 'accept') {
        if (!stored) throw new PilotError('Save a draft before accepting it');
        if (body.attest !== true) throw new PilotError('Confirm that you reviewed the scope, account identity, and approval evidence');
        if (blockers.length) return reply({ error: 'Resolve all missing inputs before acceptance', blockers }, 422);
        if (stored.status === 'accepted' && !sourceChanged) throw new PilotError('This version is already accepted', 409);
      }
      const result = await db.rpc('write_pilot_readiness', {
        p_client_id: body.client_id, p_scope: scope, p_input: input,
        p_expected_version: body.expected_version, p_accept: body.action === 'accept',
        p_actor: actor, p_sources: snapshot, p_blockers: blockers,
      });
      if (result.error) {
        if (['40001', '23505'].includes(result.error.code)) throw new PilotError('The packet or its sources changed. Reload and review before saving.', 409, 'version_conflict');
        throw new PilotError('Could not save the packet. No acceptance was recorded.', 503, 'write_failed');
      }
      return reply({ packet: result.data, input, blockers, sources, status: result.data.status, source_changed: false });
    } catch (error) {
      return error instanceof PilotError
        ? reply({ error: error.message, code: error.code }, error.status)
        : reply({ error: 'Pilot readiness request failed', code: 'internal_error' }, 500);
    }
  };
}
