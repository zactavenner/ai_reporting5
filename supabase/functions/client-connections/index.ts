/* client-connections */
/**
 * Canonical Client Connections & Settings write path.
 *
 * The browser (Huddle section AND client Settings tab) reads the roster
 * straight from `client_ad_accounts` / `client_offers` / `client_settings_audit`
 * (SELECT-only grants) and performs EVERY mutation through this function, so
 * both surfaces provably write the same records.
 *
 * Guarantees:
 *  - Operator authorization via the existing `authorizeOperator` boundary
 *    (dashboard session token or provisioned operator). No user_metadata.
 *  - Credentials are written but NEVER returned: responses carry only
 *    secret_present / last4 / status / timestamps.
 *  - Audit rows are redacted through `redactForAudit`, so no token value can
 *    reach the audit JSON, logs or the browser.
 *  - Adding an ad account is idempotent, rejects cross-client ownership, keeps
 *    the existing account intact, writes through the reporting roster
 *    (clients.meta_ad_account_id / meta_ad_account_ids) and reports real
 *    propagation state instead of a blanket success.
 *  - No Meta campaign/ad writes and no GHL contact/workflow writes happen here.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.115.0/cors';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import { META_GRAPH_BASE, metaFetch, resolveMetaToken } from '../_shared/meta.ts';
import {
  buildReportingRoster,
  classifyExistingAccount,
  computeRollup,
  normalizeAdAccountId,
  normalizeAuditSource,
  redactForAudit,
  secretMeta,
  validateAdAccountPatch,
  validateOfferInput,
  withActPrefix,
} from '../_shared/clientConnections.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

type Actor = { label: string; userId: string | null };

async function writeAudit(
  supabase: any,
  args: {
    clientId: string;
    entityType: string;
    entityId?: string | null;
    action: string;
    source: string;
    actor: Actor;
    changes?: unknown;
  },
) {
  await supabase.from('client_settings_audit').insert({
    client_id: args.clientId,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    action: args.action,
    source: normalizeAuditSource(args.source),
    actor_label: args.actor.label,
    actor_user_id: args.actor.userId,
    changes: redactForAudit(args.changes ?? {}),
  });
}

/** Rewrites clients.meta_ad_account_id(+ids) from the normalized roster. */
async function syncReportingRoster(supabase: any, clientId: string, explicitPrimary?: string | null) {
  const [{ data: accounts }, { data: client }] = await Promise.all([
    supabase.from('client_ad_accounts').select('provider, provider_account_id, status').eq('client_id', clientId),
    supabase.from('clients').select('meta_ad_account_id').eq('id', clientId).maybeSingle(),
  ]);
  const roster = buildReportingRoster(accounts || [], client?.meta_ad_account_id, explicitPrimary);
  await supabase
    .from('clients')
    .update({ meta_ad_account_id: roster.primary, meta_ad_account_ids: roster.all })
    .eq('id', clientId);
  return roster;
}

/* ────────────────────────── Meta read-only probes ───────────────────────── */

async function metaAccountProbe(token: string, accountId: string) {
  const fields = 'name,account_status,currency,timezone_name,business{id,name}';
  const res = await metaFetch(`${META_GRAPH_BASE}/${withActPrefix(accountId)}?fields=${fields}&access_token=${token}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false as const, error: String(body?.error?.message || `Meta returned ${res.status}`) };
  }
  return {
    ok: true as const,
    account_name: body?.name ?? null,
    business_id: body?.business?.id ?? null,
    currency: body?.currency ?? null,
    timezone_name: body?.timezone_name ?? null,
    account_status: body?.account_status ?? null,
  };
}

async function metaCount(token: string, path: string, params = ''): Promise<number | null> {
  const res = await metaFetch(
    `${META_GRAPH_BASE}/${path}?limit=0&summary=total_count${params}&access_token=${token}`,
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const n = body?.summary?.total_count;
  return typeof n === 'number' ? n : null;
}

/** Live counts. Anything Meta will not tell us stays null — never zero. */
async function metaCounts(token: string, accountId: string) {
  const act = withActPrefix(accountId);
  const [campaigns, adsets, ads, active, paused] = await Promise.all([
    metaCount(token, `${act}/campaigns`),
    metaCount(token, `${act}/adsets`),
    metaCount(token, `${act}/ads`),
    metaCount(token, `${act}/ads`, `&effective_status=${encodeURIComponent('["ACTIVE"]')}`),
    metaCount(token, `${act}/ads`, `&effective_status=${encodeURIComponent('["PAUSED"]')}`),
  ]);
  return {
    campaigns_count: campaigns,
    adsets_count: adsets,
    ads_total: ads,
    ads_active: active,
    ads_paused: paused,
    counts_updated_at: new Date().toISOString(),
  };
}

async function ghlProbe(apiKey: string, locationId: string) {
  const res = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28', Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status === 401 || res.status === 403 ? 'expired' : 'disconnected',
      error: String(body?.message || `GoHighLevel returned ${res.status}`),
    };
  }
  return { ok: true as const, status: 'connected', label: body?.location?.name ?? body?.name ?? null };
}

/* ──────────────────────────────── Handler ───────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const supabase = admin();
  const auth = await authorizeOperator(req, supabase, createClient, body);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);

  // A trusted server-side caller (the agent API) may pass through the acting
  // identity for the audit trail. Any other caller's label is ignored.
  const delegatedLabel =
    auth.via === 'service_role' && typeof body?.actor_label === 'string'
      ? String(body.actor_label).slice(0, 120)
      : null;
  const actor: Actor = {
    label: delegatedLabel || auth.memberName || (auth.via === 'service_role' ? 'service' : auth.userId || auth.via),
    userId: auth.userId,
  };

  const source = normalizeAuditSource(body?.source);
  const action = String(body?.action || '');
  const clientId = body?.client_id ? String(body.client_id) : '';

  if (!action) return json({ error: 'action is required' }, 400);
  if (!clientId) return json({ error: 'client_id is required' }, 400);

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select(
      'id, name, ghl_location_id, ghl_api_key, meta_ad_account_id, meta_ad_account_ids, meta_access_token, meta_system_user_token, meta_token_type, last_ghl_sync_at, ghl_sync_status, ghl_sync_error',
    )
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) return json({ error: 'client_lookup_failed' }, 500);
  if (!client) return json({ error: 'client_not_found' }, 404);

  const meta = resolveMetaToken(client);

  try {
    switch (action) {
      /* ───────────── Safe integration metadata (no secret values) ─────────── */
      case 'get_integrations': {
        const { data: accounts } = await supabase
          .from('client_ad_accounts')
          .select('*')
          .eq('client_id', clientId);
        return json({
          client: { id: client.id, name: client.name },
          meta: {
            status: meta.token ? 'connected' : 'disconnected',
            token_source: meta.source,
            ...secretMeta(client.meta_system_user_token || client.meta_access_token),
            token_label: client.meta_token_type || (meta.source === 'master' ? 'agency shared token' : 'client token'),
            scopes: null,
            last_verified_at:
              (accounts || []).map((a: any) => a.last_verified_at).filter(Boolean).sort().slice(-1)[0] ?? null,
          },
          ghl: {
            status: client.ghl_api_key && client.ghl_location_id ? 'connected' : 'disconnected',
            location_id: client.ghl_location_id ?? null,
            ...secretMeta(client.ghl_api_key),
            scopes: null,
            last_verified_at: client.last_ghl_sync_at ?? null,
            last_sync_status: client.ghl_sync_status ?? null,
            last_sync_error: client.ghl_sync_error ?? null,
          },
          rollup: computeRollup(accounts || []),
        });
      }

      /* ─────────────────────────────── Offers ─────────────────────────────── */
      case 'create_offer': {
        const parsed = validateOfferInput(body.offer || {});
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const payload: any = { client_id: clientId, offer_type: 'offer', ...parsed.value, updated_by: actor.label };
        if (payload.is_primary) {
          await supabase.from('client_offers').update({ is_primary: false }).eq('client_id', clientId);
        }
        const { data, error } = await supabase.from('client_offers').insert(payload).select().single();
        if (error) return json({ error: error.message }, 400);
        await writeAudit(supabase, {
          clientId, entityType: 'offer', entityId: data.id, action: 'offer.created', source, actor, changes: parsed.value,
        });
        return json({ offer: data });
      }

      case 'update_offer': {
        const offerId = String(body.offer_id || '');
        if (!offerId) return json({ error: 'offer_id is required' }, 400);
        const parsed = validateOfferInput(body.offer || {}, { partial: true });
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        if ((parsed.value as any).is_primary) {
          await supabase.from('client_offers').update({ is_primary: false }).eq('client_id', clientId);
        }
        const { data, error } = await supabase
          .from('client_offers')
          .update({ ...parsed.value, updated_by: actor.label, updated_at: new Date().toISOString() })
          .eq('id', offerId)
          .eq('client_id', clientId)
          .select()
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!data) return json({ error: 'offer_not_found' }, 404);
        await writeAudit(supabase, {
          clientId, entityType: 'offer', entityId: offerId,
          action: (parsed.value as any).status === 'archived' ? 'offer.archived' : 'offer.updated',
          source, actor, changes: parsed.value,
        });
        return json({ offer: data });
      }

      /* ───────────────────────────── Ad accounts ──────────────────────────── */
      case 'add_ad_account': {
        const norm = normalizeAdAccountId(body.provider_account_id);
        if (!norm.ok) return json({ error: norm.error }, 400);
        const accountId = norm.value;
        const provider = String(body.provider || 'meta').toLowerCase();

        const { data: existing } = await supabase
          .from('client_ad_accounts')
          .select('id, client_id, status')
          .eq('provider', provider)
          .eq('provider_account_id', accountId)
          .neq('status', 'disconnected')
          .maybeSingle();

        const conflict = classifyExistingAccount(existing as any, clientId);
        if (conflict?.kind === 'other_client') {
          const { data: owner } = await supabase.from('clients').select('name').eq('id', conflict.clientId).maybeSingle();
          return json(
            {
              error: 'ad_account_owned_by_other_client',
              message: `${withActPrefix(accountId)} is already connected to ${owner?.name || 'another client'}. Disconnect it there first — it will not be moved automatically.`,
            },
            409,
          );
        }
        if (conflict?.kind === 'duplicate') {
          const { data: row } = await supabase.from('client_ad_accounts').select('*').eq('id', conflict.existingId).maybeSingle();
          return json({
            ad_account: row,
            idempotent: true,
            propagation: { saved: true, note: 'Account was already linked to this client; nothing changed.' },
          });
        }

        // 1. Verify against Meta before claiming anything is connected.
        let probe: Awaited<ReturnType<typeof metaAccountProbe>> | null = null;
        if (provider === 'meta' && meta.token) probe = await metaAccountProbe(meta.token, accountId);

        const insert: any = {
          client_id: clientId,
          provider,
          provider_account_id: accountId,
          account_name: String(body.account_name || '').trim() || (probe?.ok ? probe.account_name : null),
          business_id: probe?.ok ? probe.business_id : null,
          currency: probe?.ok ? probe.currency : null,
          timezone_name: probe?.ok ? probe.timezone_name : null,
          status: probe?.ok ? 'active' : 'unknown',
          is_primary: !!body.is_primary,
          rollup_enabled: body.rollup_enabled === undefined ? true : !!body.rollup_enabled,
          token_source: meta.source,
          connection_state: probe?.ok ? 'verified' : meta.token ? 'failed' : 'verification_pending',
          last_verified_at: probe?.ok ? new Date().toISOString() : null,
          last_sync_error: probe && !probe.ok ? probe.error : null,
          created_by: actor.label,
          updated_by: actor.label,
        };
        if (insert.is_primary) {
          await supabase.from('client_ad_accounts').update({ is_primary: false }).eq('client_id', clientId).eq('provider', provider);
        }

        const { data: created, error: insertErr } = await supabase
          .from('client_ad_accounts')
          .insert(insert)
          .select()
          .single();
        if (insertErr) return json({ error: insertErr.message }, 400);

        // 2. Live counts (null when unavailable — never faked).
        let counts: Record<string, unknown> = {};
        if (provider === 'meta' && meta.token && probe?.ok) {
          counts = await metaCounts(meta.token, accountId);
          await supabase.from('client_ad_accounts').update(counts).eq('id', created.id);
        }

        // 3. Reporting roster write-through, then queue the existing sync path.
        const roster = await syncReportingRoster(supabase, clientId, insert.is_primary ? accountId : null);

        let syncState: 'sync_queued' | 'sync_running' | 'not_queued' = 'not_queued';
        let syncError: string | null = null;
        if (provider === 'meta' && probe?.ok) {
          try {
            const { error: invokeErr } = await supabase.functions.invoke('sync-meta-ads', {
              body: { clientId, adAccountOverride: accountId },
            });
            if (invokeErr) {
              syncError = invokeErr.message;
            } else {
              syncState = 'sync_running';
            }
          } catch (e) {
            syncError = e instanceof Error ? e.message : 'sync invoke failed';
          }
          await supabase
            .from('client_ad_accounts')
            .update({
              connection_state: syncState === 'not_queued' ? 'partial' : 'sync_running',
              last_sync_status: syncState === 'not_queued' ? 'failed' : 'running',
              last_sync_error: syncError,
            })
            .eq('id', created.id);
        }

        await writeAudit(supabase, {
          clientId, entityType: 'ad_account', entityId: created.id, action: 'ad_account.linked', source, actor,
          changes: { provider, provider_account_id: accountId, account_name: insert.account_name, is_primary: insert.is_primary, rollup_enabled: insert.rollup_enabled },
        });

        const { data: fresh } = await supabase.from('client_ad_accounts').select('*').eq('id', created.id).maybeSingle();
        return json({
          ad_account: fresh,
          idempotent: false,
          propagation: {
            saved: true,
            verified: !!probe?.ok,
            verification_error: probe && !probe.ok ? probe.error : meta.token ? null : 'No Meta token configured for this client',
            counts_available: Object.keys(counts).length > 0,
            reporting_roster: roster,
            sync: syncState,
            sync_error: syncError,
            reporting_state: probe?.ok && syncState !== 'not_queued' ? 'sync_running' : 'partial',
          },
        });
      }

      case 'patch_ad_account': {
        const id = String(body.ad_account_id || '');
        if (!id) return json({ error: 'ad_account_id is required' }, 400);
        const parsed = validateAdAccountPatch(body.updates || {});
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const updates = parsed.value as any;

        const { data: row } = await supabase
          .from('client_ad_accounts')
          .select('id, client_id, provider, provider_account_id')
          .eq('id', id)
          .maybeSingle();
        if (!row || row.client_id !== clientId) return json({ error: 'ad_account_not_found' }, 404);

        if (updates.is_primary) {
          await supabase.from('client_ad_accounts').update({ is_primary: false }).eq('client_id', clientId).eq('provider', row.provider);
        }
        const { data, error } = await supabase
          .from('client_ad_accounts')
          .update({ ...updates, updated_by: actor.label })
          .eq('id', id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 400);

        const roster = await syncReportingRoster(supabase, clientId, updates.is_primary ? row.provider_account_id : null);
        await writeAudit(supabase, {
          clientId, entityType: 'ad_account', entityId: id, action: 'ad_account.updated', source, actor, changes: updates,
        });
        return json({ ad_account: data, propagation: { saved: true, reporting_roster: roster } });
      }

      case 'disconnect_ad_account': {
        const id = String(body.ad_account_id || '');
        if (!id) return json({ error: 'ad_account_id is required' }, 400);
        const { data: row } = await supabase
          .from('client_ad_accounts')
          .select('id, client_id, provider_account_id')
          .eq('id', id)
          .maybeSingle();
        if (!row || row.client_id !== clientId) return json({ error: 'ad_account_not_found' }, 404);

        const { data, error } = await supabase
          .from('client_ad_accounts')
          .update({
            status: 'disconnected',
            rollup_enabled: false,
            is_primary: false,
            connection_state: 'saved',
            updated_by: actor.label,
          })
          .eq('id', id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 400);

        const roster = await syncReportingRoster(supabase, clientId);
        await writeAudit(supabase, {
          clientId, entityType: 'ad_account', entityId: id, action: 'ad_account.disconnected', source, actor,
          changes: { provider_account_id: row.provider_account_id },
        });
        return json({ ad_account: data, propagation: { saved: true, reporting_roster: roster } });
      }

      /* ───────────────────── Verification / counts / sync ─────────────────── */
      case 'test_connection': {
        const integration = String(body.integration || 'meta').toLowerCase();
        if (integration === 'ghl') {
          if (!client.ghl_api_key || !client.ghl_location_id) {
            return json({ integration: 'ghl', ok: false, status: 'disconnected', error: 'Location ID and private integration key are both required' });
          }
          const probe = await ghlProbe(client.ghl_api_key, client.ghl_location_id);
          await supabase.from('clients').update({
            ghl_sync_status: probe.ok ? 'connected' : probe.status,
            ghl_sync_error: probe.ok ? null : probe.error,
          }).eq('id', clientId);
          await writeAudit(supabase, {
            clientId, entityType: 'integration', action: 'ghl.tested', source, actor,
            changes: { result: probe.ok ? 'connected' : probe.status },
          });
          return json({ integration: 'ghl', ok: probe.ok, status: probe.status, label: probe.ok ? probe.label : null, error: probe.ok ? null : probe.error, last_verified_at: new Date().toISOString() });
        }

        if (!meta.token) return json({ integration: 'meta', ok: false, status: 'disconnected', error: 'No Meta token configured for this client' });
        const id = String(body.ad_account_id || '');
        const { data: rows } = await supabase
          .from('client_ad_accounts')
          .select('*')
          .eq('client_id', clientId)
          .eq('provider', 'meta')
          .neq('status', 'disconnected');
        const targets = (rows || []).filter((r: any) => !id || r.id === id);
        const results: any[] = [];
        for (const t of targets) {
          const probe = await metaAccountProbe(meta.token, t.provider_account_id);
          const counts = probe.ok ? await metaCounts(meta.token, t.provider_account_id) : {};
          await supabase.from('client_ad_accounts').update({
            status: probe.ok ? 'active' : 'unknown',
            connection_state: probe.ok ? 'verified' : 'failed',
            account_name: probe.ok ? probe.account_name ?? t.account_name : t.account_name,
            business_id: probe.ok ? probe.business_id ?? t.business_id : t.business_id,
            currency: probe.ok ? probe.currency ?? t.currency : t.currency,
            timezone_name: probe.ok ? probe.timezone_name ?? t.timezone_name : t.timezone_name,
            token_source: meta.source,
            last_verified_at: probe.ok ? new Date().toISOString() : t.last_verified_at,
            last_sync_error: probe.ok ? null : probe.error,
            ...counts,
          }).eq('id', t.id);
          results.push({ ad_account_id: t.id, provider_account_id: t.provider_account_id, ok: probe.ok, error: probe.ok ? null : probe.error });
        }
        await writeAudit(supabase, {
          clientId, entityType: 'integration', action: 'meta.tested', source, actor,
          changes: { accounts_tested: results.length, failures: results.filter((r) => !r.ok).length },
        });
        return json({ integration: 'meta', ok: results.every((r) => r.ok) && results.length > 0, token_source: meta.source, results });
      }

      case 'sync_ad_account': {
        const norm = normalizeAdAccountId(body.provider_account_id);
        if (!norm.ok) return json({ error: norm.error }, 400);
        const { data: row } = await supabase
          .from('client_ad_accounts')
          .select('id, status')
          .eq('client_id', clientId)
          .eq('provider', 'meta')
          .eq('provider_account_id', norm.value)
          .maybeSingle();
        if (!row) return json({ error: 'ad_account_not_found_for_client' }, 404);

        await supabase.from('client_ad_accounts').update({ connection_state: 'sync_queued', last_sync_status: 'running', last_sync_error: null }).eq('id', row.id);
        const { error: invokeErr } = await supabase.functions.invoke('sync-meta-ads', {
          body: { clientId, adAccountOverride: norm.value },
        });
        await supabase.from('client_ad_accounts').update({
          connection_state: invokeErr ? 'failed' : 'sync_running',
          last_sync_status: invokeErr ? 'failed' : 'running',
          last_sync_error: invokeErr?.message ?? null,
          last_sync_at: invokeErr ? null : new Date().toISOString(),
        }).eq('id', row.id);

        await writeAudit(supabase, {
          clientId, entityType: 'ad_account', entityId: row.id, action: 'ad_account.sync_requested', source, actor,
          changes: { provider_account_id: norm.value, queued: !invokeErr },
        });
        return json({ ok: !invokeErr, sync: invokeErr ? 'failed' : 'sync_running', error: invokeErr?.message ?? null });
      }

      /* ─────────────────────────── Credentials ────────────────────────────── */
      case 'replace_credential': {
        const integration = String(body.integration || '').toLowerCase();
        const value = String(body.value ?? '').trim();
        if (!value) return json({ error: 'A credential value is required' }, 400);

        const updates: Record<string, string | null> = {};
        if (integration === 'meta') updates.meta_access_token = value;
        else if (integration === 'ghl') {
          updates.ghl_api_key = value;
          const loc = String(body.location_id ?? '').trim();
          if (loc) updates.ghl_location_id = loc;
        } else return json({ error: 'integration must be meta or ghl' }, 400);

        const { error } = await supabase.from('clients').update(updates).eq('id', clientId);
        if (error) return json({ error: error.message }, 400);
        await writeAudit(supabase, {
          clientId, entityType: 'integration', action: `${integration}.credential_replaced`, source, actor,
          changes: { integration, credential: '[redacted]', last4: secretMeta(value).last4 },
        });
        // Response carries presence + last4 only.
        return json({ integration, ...secretMeta(value), status: 'connected' });
      }

      case 'revoke_credential': {
        const integration = String(body.integration || '').toLowerCase();
        const updates: Record<string, string | null> = {};
        if (integration === 'meta') updates.meta_access_token = null;
        else if (integration === 'ghl') updates.ghl_api_key = null;
        else return json({ error: 'integration must be meta or ghl' }, 400);
        const { error } = await supabase.from('clients').update(updates).eq('id', clientId);
        if (error) return json({ error: error.message }, 400);
        await writeAudit(supabase, {
          clientId, entityType: 'integration', action: `${integration}.credential_revoked`, source, actor, changes: { integration },
        });
        return json({ integration, secret_present: false, last4: null, status: 'disconnected' });
      }

      default:
        return json({ error: `unknown_action: ${action}` }, 400);
    }
  } catch (e) {
    // Sanitized: never echo request bodies or credentials.
    console.error('[client-connections] action failed', action, e instanceof Error ? e.message : 'unknown');
    return json({ error: 'internal_error', message: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
