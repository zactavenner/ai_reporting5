/* connections-api */
/**
 * Agent-safe Connections API for internal automation.
 *
 * Authorization reuses the SAME boundary as every other operator surface
 * (`authorizeOperator`: dashboard session token, provisioned operator JWT, or a
 * trusted server-side caller). There is no separate API key and no
 * user_metadata check.
 *
 * Reads come straight from the canonical Pass 1 tables. Every WRITE is delegated
 * to the guarded `client-connections` function with source = "agent_api", so the
 * agent API, the Huddle and the client Settings tab all share one write path,
 * one validation set and one audit trail.
 *
 * Credential values are never accepted in a response path and never returned:
 * payloads are built by field whitelists in _shared/connectionsApi.ts.
 *
 * NAMING: POST /clients/:id/ad-accounts creates/links a Reporting 5.0 ad-account
 * CONNECTION for the client. It does NOT create a new ad account inside Meta
 * Business Manager, and it never changes billing.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.115.0/cors';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import { computeRollup, secretMeta } from '../_shared/clientConnections.ts';
import {
  fingerprint,
  pageMeta,
  parsePagination,
  resolveRoute,
  shapeAdAccount,
  shapeClientSummary,
  shapeOffer,
  type Page,
  type RouteError,
} from '../_shared/connectionsApi.ts';

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });

const fail = (e: RouteError) => json({ error: { code: e.code, message: e.message } }, e.status);

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

/** Delegates a mutation to the single guarded write path. */
async function delegate(
  supabase: any,
  payload: Record<string, unknown>,
  actorLabel: string,
): Promise<{ status: number; body: any }> {
  const { data, error } = await supabase.functions.invoke('client-connections', {
    body: { ...payload, source: 'agent_api', actor_label: actorLabel },
  });
  if (error) {
    let body: any = { error: { code: 'internal_error', message: error.message } };
    let status = 500;
    try {
      const parsed = await error.context?.json?.();
      if (parsed?.error) {
        status = error.context?.status ?? 400;
        body = { error: { code: parsed.error, message: parsed.message || parsed.error } };
      }
    } catch { /* keep generic */ }
    return { status, body };
  }
  return { status: 200, body: data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const resolved = resolveRoute(req.method, url.pathname);
  if ('error' in resolved) return fail(resolved.error);
  const route = resolved.route;

  let body: any = {};
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return fail({ status: 400, code: 'invalid_json', message: 'Request body must be valid JSON' });
    }
  }

  const supabase = admin();
  const auth = await authorizeOperator(req, supabase, createClient, body);
  if (!auth.ok) {
    return json(
      { error: { code: auth.status === 401 ? 'unauthorized' : 'forbidden', message: auth.error, reason: auth.code } },
      auth.status,
    );
  }
  const actorLabel = auth.memberName || (auth.via === 'service_role' ? 'agent:service' : auth.userId || `agent:${auth.via}`);

  const paged = parsePagination(url.searchParams);
  if ('error' in paged) return fail(paged.error);
  const page = paged as Page;

  try {
    /* ─── Client-scoped routes verify the client exists first ─── */
    let client: any = null;
    if ('clientId' in route) {
      const { data } = await supabase
        .from('clients')
        .select('id, name, status, slug, ghl_location_id, ghl_api_key, meta_access_token, meta_system_user_token')
        .eq('id', (route as any).clientId)
        .maybeSingle();
      if (!data) return fail({ status: 404, code: 'client_not_found', message: 'No such client, or it is not authorized for this caller' });
      client = data;
    }

    switch (route.name) {
      /* ───────────────────────────── Clients ───────────────────────────── */
      case 'list_clients': {
        const search = (url.searchParams.get('search') || '').trim();
        const status = (url.searchParams.get('status') || '').trim();
        let q = supabase
          .from('clients')
          .select(
            'id, name, status, slug, ghl_location_id, ghl_api_key, meta_access_token, meta_system_user_token',
            { count: 'exact' },
          )
          .order('name');
        if (search) q = q.ilike('name', `%${search}%`);
        if (status) q = q.eq('status', status);
        const { data: clients, count, error } = await q.range(page.offset, page.offset + page.limit - 1);
        if (error) throw error;

        const ids = (clients || []).map((c: any) => c.id);
        const { data: accounts } = ids.length
          ? await supabase.from('client_ad_accounts').select('*').in('client_id', ids)
          : { data: [] as any[] };

        const items = (clients || []).map((c: any) => {
          const mine = (accounts || []).filter((a: any) => a.client_id === c.id);
          return shapeClientSummary(c, mine, computeRollup(mine as any) as any);
        });
        return json({ data: items, page: pageMeta(page, items.length, count ?? null) });
      }

      /* ─────────────────────── Agency-wide ad accounts ─────────────────── */
      case 'list_all_ad_accounts': {
        const clientId = url.searchParams.get('client_id');
        const rollupOnly = url.searchParams.get('rollup_enabled');
        let q = supabase
          .from('client_ad_accounts')
          .select('*', { count: 'exact' })
          .order('client_id')
          .order('created_at');
        if (clientId) q = q.eq('client_id', clientId);
        if (rollupOnly === 'true') q = q.eq('rollup_enabled', true);
        const { data, count, error } = await q.range(page.offset, page.offset + page.limit - 1);
        if (error) throw error;
        return json({
          data: (data || []).map(shapeAdAccount),
          page: pageMeta(page, (data || []).length, count ?? null),
          note: 'Lists only ad accounts authorized for this caller. Credential fields are never included.',
        });
      }

      /* ───────────────────────────── Offers ────────────────────────────── */
      case 'list_offers': {
        const includeArchived = url.searchParams.get('include_archived') === 'true';
        let q = supabase
          .from('client_offers')
          .select('id, client_id, title, offer_type, status, is_primary, notes, created_at, updated_at, updated_by', { count: 'exact' })
          .eq('client_id', route.clientId)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: false });
        if (!includeArchived) q = q.neq('status', 'archived');
        const { data, count, error } = await q.range(page.offset, page.offset + page.limit - 1);
        if (error) throw error;
        return json({ data: (data || []).map(shapeOffer), page: pageMeta(page, (data || []).length, count ?? null) });
      }

      case 'create_offer': {
        const res = await delegate(supabase, { action: 'create_offer', client_id: route.clientId, offer: body }, actorLabel);
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);
        return json({ data: shapeOffer(res.body.offer) }, 201);
      }

      case 'patch_offer': {
        const res = await delegate(
          supabase,
          { action: 'update_offer', client_id: route.clientId, offer_id: route.offerId, offer: body },
          actorLabel,
        );
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);
        return json({ data: shapeOffer(res.body.offer) });
      }

      /* ─────────────────────────── Ad accounts ─────────────────────────── */
      case 'list_ad_accounts': {
        const { data, count, error } = await supabase
          .from('client_ad_accounts')
          .select('*', { count: 'exact' })
          .eq('client_id', route.clientId)
          .order('is_primary', { ascending: false })
          .order('created_at')
          .range(page.offset, page.offset + page.limit - 1);
        if (error) throw error;
        const shaped = (data || []).map(shapeAdAccount);
        return json({
          data: shaped,
          rollup: computeRollup((data || []) as any),
          page: pageMeta(page, shaped.length, count ?? null),
        });
      }

      case 'create_ad_account': {
        const key = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key') || '';
        const endpoint = `POST /clients/${route.clientId}/ad-accounts`;
        const print = fingerprint(body);

        if (key) {
          const { data: prior } = await supabase
            .from('agent_api_idempotency')
            .select('request_fingerprint, response_status, response_body')
            .eq('endpoint', endpoint)
            .eq('idempotency_key', key)
            .maybeSingle();
          if (prior) {
            if (prior.request_fingerprint !== print) {
              return fail({
                status: 409,
                code: 'idempotency_key_reused_with_different_body',
                message: 'This Idempotency-Key was already used with a different request body',
              });
            }
            return json(prior.response_body, prior.response_status, { 'Idempotency-Replayed': 'true' });
          }
        }

        const res = await delegate(
          supabase,
          {
            action: 'add_ad_account',
            client_id: route.clientId,
            provider: body.provider || 'meta',
            provider_account_id: body.provider_account_id,
            account_name: body.account_name,
            is_primary: body.is_primary,
            rollup_enabled: body.rollup_enabled,
          },
          actorLabel,
        );
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);

        const payload = {
          data: shapeAdAccount(res.body.ad_account || {}),
          idempotent: !!res.body.idempotent,
          propagation: res.body.propagation,
          note: 'Links an existing Meta ad account to this client for Reporting 5.0. No ad account is created in Meta Business Manager and no billing is changed.',
        };
        const status = res.body.idempotent ? 200 : 201;
        if (key) {
          await supabase.from('agent_api_idempotency').insert({
            idempotency_key: key,
            endpoint,
            client_id: route.clientId,
            request_fingerprint: print,
            response_status: status,
            response_body: payload,
          });
        }
        return json(payload, status);
      }

      case 'patch_ad_account': {
        const res = await delegate(
          supabase,
          { action: 'patch_ad_account', client_id: route.clientId, ad_account_id: route.adAccountId, updates: body },
          actorLabel,
        );
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);
        return json({ data: shapeAdAccount(res.body.ad_account), propagation: res.body.propagation });
      }

      case 'sync_ad_account': {
        const { data: row } = await supabase
          .from('client_ad_accounts')
          .select('provider_account_id, client_id')
          .eq('id', route.adAccountId)
          .maybeSingle();
        if (!row || row.client_id !== route.clientId) {
          return fail({ status: 404, code: 'invalid_ad_account_id', message: 'That ad account does not belong to this client' });
        }
        const res = await delegate(
          supabase,
          { action: 'sync_ad_account', client_id: route.clientId, provider_account_id: row.provider_account_id },
          actorLabel,
        );
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);
        return json({ data: res.body });
      }

      /* ───────────────────────── Integrations ──────────────────────────── */
      case 'list_integrations': {
        const { data: accounts } = await supabase.from('client_ad_accounts').select('*').eq('client_id', route.clientId);
        return json({
          data: {
            client_id: client.id,
            meta: {
              status: client.meta_system_user_token || client.meta_access_token ? 'connected' : 'disconnected',
              ...secretMeta(client.meta_system_user_token || client.meta_access_token),
              scopes: null,
              ad_accounts: (accounts || []).length,
            },
            ghl: {
              status: client.ghl_api_key && client.ghl_location_id ? 'connected' : 'disconnected',
              location_id: client.ghl_location_id ?? null,
              ...secretMeta(client.ghl_api_key),
              scopes: null,
            },
            rollup: computeRollup((accounts || []) as any),
          },
          note: 'Safe metadata only: presence, last four, status and timestamps. Credential values are never returned.',
        });
      }

      case 'test_integration': {
        const res = await delegate(
          supabase,
          { action: 'test_connection', client_id: route.clientId, integration: route.integration, ad_account_id: body?.ad_account_id },
          actorLabel,
        );
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);
        return json({ data: res.body });
      }

      case 'replace_credential': {
        const res = await delegate(
          supabase,
          { action: 'replace_credential', client_id: route.clientId, integration: route.integration, value: body?.value, location_id: body?.location_id },
          actorLabel,
        );
        if (res.status !== 200 || res.body?.error) return json(res.body, res.status === 200 ? 400 : res.status);
        // Echo presence + last four only.
        return json({ data: { integration: res.body.integration, secret_present: res.body.secret_present, last4: res.body.last4, status: res.body.status } });
      }

      default:
        return fail({ status: 404, code: 'route_not_found', message: 'Unhandled route' });
    }
  } catch (e) {
    console.error('[connections-api] failed', route.name, e instanceof Error ? e.message : 'unknown');
    return json({ error: { code: 'internal_error', message: e instanceof Error ? e.message : 'unknown' } }, 500);
  }
});
