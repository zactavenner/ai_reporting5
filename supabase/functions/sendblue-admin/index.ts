/* sendblue-admin */
/**
 * Operator surface for Sendblue lines, conversations and health.
 *
 * All reads go through here because the sendblue_* tables are server-only
 * (RLS on, no browser grants). Credentials are never returned — only masked.
 *
 * Actions:
 *   overview            -> lines + health rollup (optional client_id filter)
 *   conversations       -> conversation list (optional client_id / line_id)
 *   messages            -> thread for one conversation, marks it read
 *   register_line       -> manual line registration (credentials + number)
 *   update_line         -> label / plan_type / active / credentials
 *   test_line           -> harmless read against Sendblue, records status
 *   create_line         -> attempts Sendblue line provisioning (capability probed)
 *   run_mirrors         -> process pending CRM mirrors
 *   set_optout          -> record or clear an opt-out
 */
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders as sdkCors } from 'npm:@supabase/supabase-js@2.115.0/cors';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import {
  SENDBLUE_BASE,
  credentialsFor,
  maskSecret,
  normalizeE164,
  sendblueHeaders,
} from '../_shared/sendblue.ts';
import {
  VERIFY_ENDPOINTS,
  classifyProbe,
  connectionSignals,
  extractProviderLines,
  LINE_ENDPOINTS,
  isLineEndpoint,
  planLineImport,
  WEBHOOKS_ENDPOINT,
  WebhookPlanEntry,
  parseWebhookResponse,
  buildWebhookAppendBody,
  planWebhookRegistration,
  verifyWebhookReadback,
  webhookHealth,
} from '../_shared/sendblueAccounts.ts';
import { runMirrors } from '../_shared/sendblueMirror.ts';

const corsHeaders = {
  ...sdkCors,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dashboard-token',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const ENV_CREDS = {
  keyId: Deno.env.get('SENDBLUE_API_KEY') || null,
  secret: Deno.env.get('SENDBLUE_API_SECRET') || null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function publicLine(row: any) {
  return {
    id: row.id,
    client_id: row.client_id,
    label: row.label,
    phone_e164: row.phone_e164,
    plan_type: row.plan_type,
    status: row.status,
    active: row.active,
    provisioned_via: row.provisioned_via,
    last_tested_at: row.last_tested_at,
    last_error: row.last_error,
    notes: row.notes,
    account_id: row.account_id || null,
    first_inbound_at: row.first_inbound_at || null,
    last_delivered_at: row.last_delivered_at || null,
    has_own_credentials: Boolean(row.api_key_id && row.api_secret),
    api_key_masked: maskSecret(row.api_key_id),
    created_at: row.created_at,
  };
}

/**
 * Read-only credential probe against the documented endpoints. Verification is
 * judged by classifyProbe, which also rejects a 2xx carrying a body-level ERROR.
 */
async function probeCredentials(keyId: string, secret: string) {
  let last = { ok: false, status: 'error', detail: 'No Sendblue endpoint answered.' as string | null };
  for (const endpoint of VERIFY_ENDPOINTS) {
    try {
      const res = await fetch(`${SENDBLUE_BASE}${endpoint}`, {
        headers: sendblueHeaders({ keyId, secret }),
      });
      const text = await res.text();
      const outcome = classifyProbe(res.status, text);
      if (outcome.ok) return { ...outcome, endpoint };
      last = { ...outcome, endpoint } as typeof last;
      // Rejected keys are final — no point trying the other endpoints.
      if (outcome.status === 'credentials_rejected') return last;
    } catch (err) {
      last = { ok: false, status: 'error', detail: err instanceof Error ? err.message : 'network error' };
    }
  }
  return last;
}

function publicAccount(row: any) {
  return {
    id: row.id,
    client_id: row.client_id,
    label: row.label,
    active: row.active,
    status: row.status,
    verified_at: row.verified_at,
    verify_endpoint: row.verify_endpoint,
    last_checked_at: row.last_checked_at,
    last_error: row.last_error,
    notes: row.notes,
    api_key_masked: maskSecret(row.api_key_id),
    provider_slug: row.provider_slug || null,
    // Never the secret itself — only whether one exists.
    webhook_secret_configured: Boolean(row.webhook_secret),
    webhook_status: row.webhook_status || 'not_configured',
    webhook_receive_registered_at: row.webhook_receive_registered_at || null,
    webhook_outbound_registered_at: row.webhook_outbound_registered_at || null,
    webhook_last_checked_at: row.webhook_last_checked_at || null,
    webhook_last_error: row.webhook_last_error || null,
    webhook_last_event_at: row.webhook_last_event_at || null,
    created_at: row.created_at,
  };
}

/**
 * Real read-only verification: walks the candidate GET endpoints and stops at
 * the first genuinely successful answer (2xx that parses as JSON and carries no
 * body-level ERROR), recording which endpoint proved the credentials. A 401/403,
 * or a body-level authentication error, is reported as rejected immediately.
 */
async function verifyCredentials(keyId: string, secret: string) {
  let last = { ok: false, status: 'error', detail: 'Sendblue could not be reached.', endpoint: null as string | null, payload: null as unknown };
  for (const endpoint of VERIFY_ENDPOINTS) {
    try {
      const res = await fetch(`${SENDBLUE_BASE}${endpoint}`, { headers: sendblueHeaders({ keyId, secret }) });
      const text = await res.text();
      const outcome = classifyProbe(res.status, text);
      if (outcome.ok) {
        let payload: unknown = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = null;
        }
        return { ok: true, status: 'connected', detail: null as string | null, endpoint, payload };
      }
      last = { ...outcome, endpoint, payload: null };
      if (outcome.status === 'credentials_rejected') return last;
    } catch (err) {
      last = {
        ok: false,
        status: 'error',
        detail: err instanceof Error ? err.message : 'network error',
        endpoint,
        payload: null,
      };
    }
  }
  return last;
}

/** Read-only line discovery. Returns supported:false when the plan exposes none. */
async function discoverLines(keyId: string, secret: string) {
  const verification = await verifyCredentials(keyId, secret);
  if (!verification.ok) {
    return { ok: false, supported: false, verification, lines: [] as ReturnType<typeof extractProviderLines> };
  }
  if (isLineEndpoint(verification.endpoint)) {
    const lines = extractProviderLines(verification.payload);
    if (lines.length > 0) return { ok: true, supported: true, verification, lines };
  }
  // Credentials are good but the proving endpoint carried no lines; ask the
  // documented assigned-numbers endpoint explicitly before reporting
  // "not available". GET /api/lines is the only documented listing.
  for (const endpoint of LINE_ENDPOINTS) {
    if (endpoint === verification.endpoint) continue;
    try {
      const res = await fetch(`${SENDBLUE_BASE}${endpoint}`, { headers: sendblueHeaders({ keyId, secret }) });
      const text = await res.text();
      if (!classifyProbe(res.status, text).ok) continue;
      const lines = extractProviderLines(safeJson(text));
      if (lines.length > 0) return { ok: true, supported: true, verification: { ...verification, endpoint }, lines };
    } catch {
      // keep probing
    }
  }
  return { ok: true, supported: false, verification, lines: [] as ReturnType<typeof extractProviderLines> };
}

function safeJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** The public receiver Sendblue should call. Same URL for both hook types. */
function reportingWebhookUrl(): string {
  const base = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  return `${base}/functions/v1/sendblue-webhook`;
}

async function accountCredentials(accountId: string | null | undefined) {
  if (!accountId) return null;
  const { data } = await admin
    .from('sendblue_accounts')
    .select('id, api_key_id, api_secret, client_id, label')
    .eq('id', accountId)
    .maybeSingle();
  if (!data?.api_key_id || !data?.api_secret) return null;
  return { keyId: data.api_key_id as string, secret: data.api_secret as string, row: data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const auth = await authorizeOperator(req, admin, createClient, body);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);

  const action = String(body.action || 'overview');

  try {
    if (action === 'overview') {
      let query = admin.from('sendblue_lines').select('*').order('created_at', { ascending: true });
      if (body.client_id) query = query.eq('client_id', body.client_id);
      const { data: lines, error } = await query;
      if (error) throw error;

      const lineIds = (lines || []).map((l: any) => l.id);
      let mirrors: any[] = [];
      let recent: any[] = [];
      if (lineIds.length) {
        const [mirrorRes, recentRes] = await Promise.all([
          admin.from('sendblue_ghl_mirrors').select('status, skipped_reason, last_error, client_id'),
          admin
            .from('sendblue_messages')
            .select('id, line_id, direction, created_at, status')
            .in('line_id', lineIds)
            .order('created_at', { ascending: false })
            .limit(400),
        ]);
        mirrors = mirrorRes.data || [];
        recent = recentRes.data || [];
      }

      let accountQuery = admin.from('sendblue_accounts').select('*').order('created_at', { ascending: true });
      if (body.client_id) accountQuery = accountQuery.eq('client_id', body.client_id);
      const { data: accounts } = await accountQuery;
      const webhookSecretConfigured = Boolean(Deno.env.get('SENDBLUE_WEBHOOK_SECRET'));

      const health = (lines || []).map((line: any) => {
        const mine = recent.filter((m) => m.line_id === line.id);
        const lastInbound = mine.find((m) => m.direction === 'inbound');
        const lastOutbound = mine.find((m) => m.direction === 'outbound');
        const delivered = mine.find((m) => m.direction === 'outbound' && (m.status === 'delivered' || m.status === 'sent'));
        const account = (accounts || []).find((a: any) => a.id === line.account_id);
        const signals = connectionSignals({
          credentialsVerifiedAt: line.status === 'connected' ? line.last_tested_at || account?.verified_at || null : null,
          webhookSecretConfigured,
          firstInboundAt: line.first_inbound_at || lastInbound?.created_at || null,
          lastDeliveredAt: line.last_delivered_at || delivered?.created_at || null,
        });
        return {
          line_id: line.id,
          client_id: line.client_id,
          account_id: line.account_id || null,
          credentials_ok: line.status === 'connected',
          webhook_receiving: signals.first_inbound_received,
          last_inbound_at: signals.first_inbound_at,
          last_outbound_at: lastOutbound?.created_at || null,
          message_count: mine.length,
          signals,
        };
      });

      const mirrorSummary = {
        pending: mirrors.filter((m) => m.status === 'pending' || m.status === 'processing').length,
        mirrored: mirrors.filter((m) => m.status === 'mirrored').length,
        skipped: mirrors.filter((m) => m.status === 'skipped').length,
        failed: mirrors.filter((m) => m.status === 'failed').length,
      };

      // Coverage counts ONE population: active clients. An account attached to a
      // non-active client is counted under accounts, never against this denominator.
      const { data: clientRows } = await admin.from('clients').select('id, status');
      const activeClientIds = new Set(
        (clientRows || []).filter((c: any) => c.status === 'active').map((c: any) => c.id),
      );
      const configuredClientIds = new Set(
        (accounts || [])
          .filter((a: any) => a.client_id && a.active && activeClientIds.has(a.client_id))
          .map((a: any) => a.client_id),
      );
      const accountsWithOwnCredentials = (accounts || []).filter(
        (a: any) => a.api_key_id && a.api_secret,
      ).length;


      return json({
        ok: true,
        agency_credentials_configured: Boolean(ENV_CREDS.keyId && ENV_CREDS.secret),
        webhook_secret_configured: webhookSecretConfigured,
        accounts: (accounts || []).map((a: any) => {
          const own = (lines || []).filter((l: any) => l.account_id === a.id);
          return {
            ...publicAccount(a),
            // Registration is a setting; traffic is observed reality. Kept apart.
            webhook_health: webhookHealth({
              receiveRegisteredAt: a.webhook_receive_registered_at || null,
              outboundRegisteredAt: a.webhook_outbound_registered_at || null,
              firstInboundAt: own.map((l: any) => l.first_inbound_at).filter(Boolean).sort()[0] || null,
              lastDeliveredAt: own.map((l: any) => l.last_delivered_at).filter(Boolean).sort().pop() || null,
            }),
          };
        }),
        accounts_with_credentials: accountsWithOwnCredentials,
        coverage: {
          accounts_total: (accounts || []).length,
          accounts_verified: (accounts || []).filter((a: any) => a.status === 'connected').length,
          accounts_with_credentials: accountsWithOwnCredentials,
          // Denominator and numerator are the same population: ACTIVE clients.
          clients_population: 'active',
          clients_total: activeClientIds.size,
          clients_all_total: (clientRows || []).length,
          clients_with_account: configuredClientIds.size,
          clients_missing_account: Math.max(activeClientIds.size - configuredClientIds.size, 0),
        },
        lines: (lines || []).map(publicLine),
        health,
        mirrors: mirrorSummary,
      });
    }

    if (action === 'conversations') {
      let query = admin
        .from('sendblue_conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(Math.min(Number(body.limit) || 200, 500));
      if (body.client_id) query = query.eq('client_id', body.client_id);
      if (body.line_id) query = query.eq('line_id', body.line_id);
      const { data, error } = await query;
      if (error) throw error;
      const optouts = await admin.from('sendblue_optouts').select('line_id, phone_e164');
      const optSet = new Set((optouts.data || []).map((o: any) => `${o.line_id}:${o.phone_e164}`));
      return json({
        ok: true,
        conversations: (data || []).map((c: any) => ({
          ...c,
          opted_out: optSet.has(`${c.line_id}:${c.contact_phone}`),
        })),
      });
    }

    if (action === 'messages') {
      const conversationId = String(body.conversation_id || '');
      if (!conversationId) return json({ error: 'conversation_id is required' }, 400);
      const { data, error } = await admin
        .from('sendblue_messages')
        .select('id, direction, channel, body, media_urls, status, error_message, sent_by, created_at, sent_at, delivered_at, received_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      const mirrorRows = await admin
        .from('sendblue_ghl_mirrors')
        .select('message_id, status, skipped_reason, last_error')
        .in('message_id', (data || []).map((m: any) => m.id));
      await admin.from('sendblue_conversations').update({ unread_count: 0 }).eq('id', conversationId);
      return json({ ok: true, messages: data || [], mirrors: mirrorRows.data || [] });
    }

    if (action === 'register_line') {
      const phone = normalizeE164(body.phone_e164);
      if (!phone) return json({ error: 'A valid phone number is required' }, 400);
      const label = String(body.label || '').trim();
      if (!label) return json({ error: 'A label is required' }, 400);
      const planType = body.plan_type === 'outbound' ? 'outbound' : 'inbound_only';

      const creds = credentialsFor(
        { api_key_id: body.api_key_id, api_secret: body.api_secret },
        ENV_CREDS,
      );
      let status = 'unverified';
      let lastError: string | null = null;
      if (creds) {
        const probe = await probeCredentials(creds.keyId, creds.secret);
        status = probe.status;
        lastError = probe.detail;
      } else {
        lastError = 'No Sendblue credentials available for this line yet.';
      }

      const { data, error } = await admin
        .from('sendblue_lines')
        .upsert(
          {
            client_id: body.client_id || null,
            label,
            phone_e164: phone,
            plan_type: planType,
            api_key_id: body.api_key_id || null,
            api_secret: body.api_secret || null,
            provisioned_via: 'manual',
            status,
            last_error: lastError,
            last_tested_at: new Date().toISOString(),
            notes: body.notes || null,
            active: true,
          },
          { onConflict: 'phone_e164' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, line: publicLine(data) });
    }

    if (action === 'update_line') {
      const id = String(body.line_id || '');
      if (!id) return json({ error: 'line_id is required' }, 400);
      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = String(body.label);
      if (body.plan_type !== undefined) patch.plan_type = body.plan_type === 'outbound' ? 'outbound' : 'inbound_only';
      if (body.active !== undefined) patch.active = Boolean(body.active);
      if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
      if (body.client_id !== undefined) patch.client_id = body.client_id || null;
      if (body.api_key_id) patch.api_key_id = String(body.api_key_id);
      if (body.api_secret) patch.api_secret = String(body.api_secret);
      const { data, error } = await admin
        .from('sendblue_lines')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, line: publicLine(data) });
    }

    if (action === 'test_line') {
      const id = String(body.line_id || '');
      if (!id) return json({ error: 'line_id is required' }, 400);
      const { data: line } = await admin.from('sendblue_lines').select('*').eq('id', id).maybeSingle();
      if (!line) return json({ error: 'Line not found' }, 404);
      const creds = credentialsFor(line, ENV_CREDS);
      if (!creds) {
        await admin
          .from('sendblue_lines')
          .update({ status: 'unverified', last_error: 'No credentials saved for this line.', last_tested_at: new Date().toISOString() })
          .eq('id', id);
        return json({ ok: false, status: 'unverified', detail: 'No credentials saved for this line.' });
      }
      const probe = await probeCredentials(creds.keyId, creds.secret);
      await admin
        .from('sendblue_lines')
        .update({ status: probe.status, last_error: probe.detail, last_tested_at: new Date().toISOString() })
        .eq('id', id);
      return json({ ok: probe.ok, status: probe.status, detail: probe.detail });
    }

    if (action === 'create_line') {
      const creds = credentialsFor(null, ENV_CREDS);
      if (!creds) {
        return json({
          ok: false,
          supported: false,
          reason: 'Sendblue account credentials are not configured yet, so a new line cannot be requested.',
        });
      }
      // Capability probe first: line provisioning is only available on eligible plans.
      const limits = await fetch(`${SENDBLUE_BASE}/accounts/limits`, { headers: sendblueHeaders(creds) });
      if (!limits.ok) {
        const text = await limits.text();
        return json({
          ok: false,
          supported: false,
          reason: `Your Sendblue plan does not expose line provisioning (${limits.status}). Buy the line in Sendblue, then register it here.`,
          detail: text.slice(0, 200),
        });
      }
      const limitsJson = await limits.json().catch(() => ({}));

      if (!body.confirm) {
        const preview = await fetch(`${SENDBLUE_BASE}/accounts/lines/provision-preview`, {
          method: 'POST',
          headers: sendblueHeaders(creds),
          body: JSON.stringify({}),
        });
        const previewText = await preview.text();
        if (!preview.ok) {
          return json({
            ok: false,
            supported: false,
            reason: `Sendblue would not quote a new line (${preview.status}). Buy the line in Sendblue, then register it here.`,
            detail: previewText.slice(0, 300),
          });
        }
        return json({ ok: true, supported: true, stage: 'preview', limits: limitsJson, preview: JSON.parse(previewText || '{}') });
      }

      const confirm = await fetch(`${SENDBLUE_BASE}/accounts/lines/provision-confirm`, {
        method: 'POST',
        headers: sendblueHeaders(creds),
        body: JSON.stringify(body.provision_payload || {}),
      });
      const confirmText = await confirm.text();
      if (!confirm.ok) {
        return json({
          ok: false,
          supported: true,
          reason: `Sendblue refused to create the line (${confirm.status}).`,
          detail: confirmText.slice(0, 300),
        }, 200);
      }
      const confirmJson = JSON.parse(confirmText || '{}');
      const number = normalizeE164(confirmJson?.number || confirmJson?.phone_number || confirmJson?.line?.number);
      if (!number) {
        return json({
          ok: false,
          supported: true,
          reason: 'Sendblue created a line but did not return its number. Check Sendblue, then register the number here.',
          detail: confirmText.slice(0, 300),
        });
      }
      const { data, error } = await admin
        .from('sendblue_lines')
        .upsert(
          {
            client_id: body.client_id || null,
            label: String(body.label || 'New Sendblue line'),
            phone_e164: number,
            plan_type: 'inbound_only',
            provisioned_via: 'api',
            provider_line_id: confirmJson?.line_id || confirmJson?.subscription_id || null,
            status: 'connected',
            last_tested_at: new Date().toISOString(),
            active: true,
          },
          { onConflict: 'phone_e164' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return json({ ok: true, supported: true, stage: 'created', line: publicLine(data) });
    }

    /* ---------------- account onboarding ---------------- */

    if (action === 'accounts') {
      let query = admin.from('sendblue_accounts').select('*').order('created_at', { ascending: true });
      if (body.client_id) query = query.eq('client_id', body.client_id);
      const { data, error } = await query;
      if (error) throw error;
      return json({ ok: true, accounts: (data || []).map(publicAccount) });
    }

    if (action === 'save_account') {
      const label = String(body.label || '').trim();
      const keyId = String(body.api_key_id || '').trim();
      const secret = String(body.api_secret || '').trim();
      if (!label) return json({ error: 'A label is required' }, 400);
      if (!keyId || !secret) return json({ error: 'Both the API key id and API secret are required' }, 400);

      const verification = await verifyCredentials(keyId, secret);
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from('sendblue_accounts')
        .upsert(
          {
            client_id: body.client_id || null,
            label,
            api_key_id: keyId,
            api_secret: secret,
            status: verification.status,
            verified_at: verification.ok ? now : null,
            verify_endpoint: verification.ok ? verification.endpoint : null,
            last_checked_at: now,
            last_error: verification.ok ? null : verification.detail,
            notes: body.notes ? String(body.notes) : null,
            active: true,
          },
          { onConflict: 'api_key_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return json({
        ok: true,
        verified: verification.ok,
        detail: verification.ok ? null : verification.detail,
        account: publicAccount(data),
      });
    }

    if (action === 'update_account') {
      const id = String(body.account_id || '');
      if (!id) return json({ error: 'account_id is required' }, 400);
      const patch: Record<string, unknown> = {};
      if (body.label !== undefined) patch.label = String(body.label);
      if (body.client_id !== undefined) patch.client_id = body.client_id || null;
      if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes) : null;
      if (body.active !== undefined) {
        patch.active = Boolean(body.active);
        if (!body.active) patch.status = 'disabled';
      }
      if (body.api_key_id && body.api_secret) {
        const verification = await verifyCredentials(String(body.api_key_id), String(body.api_secret));
        patch.api_key_id = String(body.api_key_id);
        patch.api_secret = String(body.api_secret);
        patch.status = verification.status;
        patch.verified_at = verification.ok ? new Date().toISOString() : null;
        patch.verify_endpoint = verification.ok ? verification.endpoint : null;
        patch.last_error = verification.ok ? null : verification.detail;
        patch.last_checked_at = new Date().toISOString();
      }
      const { data, error } = await admin.from('sendblue_accounts').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return json({ ok: true, account: publicAccount(data) });
    }

    if (action === 'verify_account') {
      const id = String(body.account_id || '');
      const creds = await accountCredentials(id);
      if (!creds) return json({ error: 'Account not found or has no credentials saved' }, 404);
      const verification = await verifyCredentials(creds.keyId, creds.secret);
      const now = new Date().toISOString();
      const { data } = await admin
        .from('sendblue_accounts')
        .update({
          status: verification.status,
          verified_at: verification.ok ? now : null,
          verify_endpoint: verification.ok ? verification.endpoint : null,
          last_checked_at: now,
          last_error: verification.ok ? null : verification.detail,
        })
        .eq('id', id)
        .select('*')
        .single();
      // Keep the account's lines honest about their credential state too.
      await admin
        .from('sendblue_lines')
        .update({
          status: verification.ok ? 'connected' : verification.status,
          last_error: verification.ok ? null : verification.detail,
          last_tested_at: now,
        })
        .eq('account_id', id);
      return json({
        ok: verification.ok,
        status: verification.status,
        detail: verification.ok ? null : verification.detail,
        checked_at: now,
        verified_at: verification.ok ? now : null,
        endpoint: verification.ok ? verification.endpoint : null,
        account: data ? publicAccount(data) : null,
      });
    }

    if (action === 'discover_lines') {
      const id = String(body.account_id || '');
      const creds = await accountCredentials(id);
      if (!creds) return json({ error: 'Account not found or has no credentials saved' }, 404);
      const result = await discoverLines(creds.keyId, creds.secret);
      const now = new Date().toISOString();
      await admin
        .from('sendblue_accounts')
        .update({
          status: result.verification.status,
          verified_at: result.verification.ok ? now : null,
          verify_endpoint: result.verification.ok ? result.verification.endpoint : null,
          last_checked_at: now,
          last_error: result.verification.ok ? null : result.verification.detail,
        })
        .eq('id', id);

      const { data: existing } = await admin.from('sendblue_lines').select('phone_e164, account_id, client_id');
      const existingPhones = new Set((existing || []).map((l: any) => l.phone_e164));
      return json({
        ok: result.verification.ok,
        supported: result.supported,
        checked_at: now,
        detail: result.verification.ok
          ? result.supported
            ? null
            : 'Sendblue did not return any phone lines for this account, so numbers have to be entered by hand.'
          : result.verification.detail,
        lines: result.lines.map((l) => ({
          phone_e164: l.phone_e164,
          label: l.label,
          provider_line_id: l.provider_line_id,
          already_imported: existingPhones.has(l.phone_e164),
        })),
      });
    }

    if (action === 'import_lines') {
      const id = String(body.account_id || '');
      const creds = await accountCredentials(id);
      if (!creds) return json({ error: 'Account not found or has no credentials saved' }, 404);
      const requested: unknown[] = Array.isArray(body.phones) ? body.phones : [];
      if (requested.length === 0) return json({ error: 'Pick at least one number to import' }, 400);

      const result = await discoverLines(creds.keyId, creds.secret);
      if (!result.verification.ok) {
        return json({ ok: false, detail: result.verification.detail, imported: 0 }, 200);
      }
      const { data: existing } = await admin.from('sendblue_lines').select('phone_e164');
      const plan = planLineImport(
        result.lines,
        requested,
        (existing || []).map((l: any) => l.phone_e164),
        creds.row.label || 'Sendblue line',
      );

      const clientId = body.client_id !== undefined ? body.client_id || null : creds.row.client_id || null;
      const planType = body.plan_type === 'outbound' ? 'outbound' : 'inbound_only';
      const inserted: any[] = [];
      for (const entry of plan.toInsert) {
        const { data, error } = await admin
          .from('sendblue_lines')
          .insert({
            client_id: clientId,
            account_id: id,
            label: entry.label,
            phone_e164: entry.phone_e164,
            plan_type: planType,
            provisioned_via: 'imported',
            provider_line_id: entry.provider_line_id,
            provider_metadata: entry.raw,
            status: 'connected',
            last_tested_at: new Date().toISOString(),
            active: true,
          })
          .select('*')
          .single();
        if (error) {
          // A concurrent import already registered it — never duplicate.
          plan.alreadyImported.push(entry.phone_e164);
          continue;
        }
        inserted.push(publicLine(data));
      }

      return json({
        ok: true,
        imported: inserted.length,
        skipped_already_imported: plan.alreadyImported,
        skipped_unknown: plan.invalid,
        lines: inserted,
      });
    }

    /* ---------------- webhook registration (append-only) ---------------- */

    if (action === 'configure_webhooks') {
      const id = String(body.account_id || '');
      const creds = await accountCredentials(id);
      if (!creds) return json({ error: 'Account not found or has no credentials saved' }, 404);

      const { data: account } = await admin
        .from('sendblue_accounts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!account) return json({ error: 'Account not found' }, 404);

      const receiverUrl = reportingWebhookUrl();
      const desired: WebhookPlanEntry[] = [
        { url: receiverUrl, type: 'receive' },
        { url: receiverUrl, type: 'outbound' },
      ];

      // 1. Read what is already registered. Never guess — a failed read stops here.
      const listRes = await fetch(`${SENDBLUE_BASE}${WEBHOOKS_ENDPOINT}`, {
        headers: sendblueHeaders({ keyId: creds.keyId, secret: creds.secret }),
      });
      const listText = await listRes.text();
      // A 2xx with a body-level ERROR is still a failure — classifyProbe decides.
      const listOutcome = classifyProbe(listRes.status, listText);
      if (!listOutcome.ok) {
        const outcome = listOutcome;
        await admin
          .from('sendblue_accounts')
          .update({ webhook_last_checked_at: new Date().toISOString(), webhook_last_error: outcome.detail })
          .eq('id', id);
        return json({ ok: false, detail: outcome.detail }, 200);
      }
      let existing = parseProviderWebhooks(safeJson(listText));
      const plan = planWebhookRegistration(existing, desired);

      // 2. Per-account signing secret, created once and kept server-side only.
      const webhookSecret: string = account.webhook_secret || crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      if (!account.webhook_secret) {
        await admin.from('sendblue_accounts').update({ webhook_secret: webhookSecret }).eq('id', id);
      }

      // 3. Append ONLY the missing hooks. POST appends; PUT would replace every
      //    hook on the account, so it is never used here.
      const appendErrors: string[] = [];
      for (const hook of plan.toAppend) {
        const res = await fetch(`${SENDBLUE_BASE}${WEBHOOKS_ENDPOINT}`, {
          method: 'POST',
          headers: sendblueHeaders({ keyId: creds.keyId, secret: creds.secret }),
          body: JSON.stringify({ url: hook.url, secret: webhookSecret, type: hook.type }),
        });
        const text = await res.text();
        const outcome = classifyProbe(res.status, text);
        if (!outcome.ok) appendErrors.push(`${hook.type}: ${outcome.detail}`);
      }

      // 4. Prove it by reading the list back.
      const readbackRes = await fetch(`${SENDBLUE_BASE}${WEBHOOKS_ENDPOINT}`, {
        headers: sendblueHeaders({ keyId: creds.keyId, secret: creds.secret }),
      });
      const readbackText = await readbackRes.text();
      const readbackOk = classifyProbe(readbackRes.status, readbackText).ok;
      const after = readbackOk ? parseProviderWebhooks(safeJson(readbackText)) : existing;
      const check = verifyWebhookReadback(after, desired);
      const now = new Date().toISOString();

      const receiveOk = check.registered.some((r) => r.type === 'receive');
      const outboundOk = check.registered.some((r) => r.type === 'outbound');
      const detail = check.ok
        ? null
        : appendErrors.length
          ? appendErrors.join(' · ')
          : `Sendblue still does not list: ${check.missing.map((m) => m.type).join(', ')}`;

      const { data: updated } = await admin
        .from('sendblue_accounts')
        .update({
          webhook_receive_registered_at: receiveOk ? account.webhook_receive_registered_at || now : null,
          webhook_outbound_registered_at: outboundOk ? account.webhook_outbound_registered_at || now : null,
          webhook_registered_urls: after.map((h) => ({ url: h.url, type: h.type })),
          webhook_status: check.ok ? 'registered' : receiveOk || outboundOk ? 'partially_registered' : 'not_configured',
          webhook_last_checked_at: now,
          webhook_last_error: detail,
        })
        .eq('id', id)
        .select('*')
        .single();

      return json({
        ok: check.ok,
        detail,
        checked_at: now,
        receiver_url: receiverUrl,
        appended: plan.toAppend.filter((h) => check.registered.some((r) => r.type === h.type)).map((h) => h.type),
        already_present: plan.alreadyPresent.map((h) => h.type),
        preserved_other_hooks: plan.preserved.length,
        registered: check.registered.map((h) => h.type),
        missing: check.missing.map((h) => h.type),
        account: updated ? publicAccount(updated) : null,
      });
    }

    if (action === 'webhook_status') {
      const id = String(body.account_id || '');
      const creds = await accountCredentials(id);
      if (!creds) return json({ error: 'Account not found or has no credentials saved' }, 404);
      const res = await fetch(`${SENDBLUE_BASE}${WEBHOOKS_ENDPOINT}`, {
        headers: sendblueHeaders({ keyId: creds.keyId, secret: creds.secret }),
      });
      const text = await res.text();
      const statusOutcome = classifyProbe(res.status, text);
      if (!statusOutcome.ok) return json({ ok: false, detail: statusOutcome.detail }, 200);
      const hooks = parseProviderWebhooks(safeJson(text));
      const receiverUrl = reportingWebhookUrl();
      const check = verifyWebhookReadback(hooks, [
        { url: receiverUrl, type: 'receive' },
        { url: receiverUrl, type: 'outbound' },
      ]);
      return json({
        ok: check.ok,
        receiver_url: receiverUrl,
        registered: check.registered.map((h) => h.type),
        missing: check.missing.map((h) => h.type),
        total_hooks_on_account: hooks.length,
      });
    }

    if (action === 'run_mirrors') {
      const outcomes = await runMirrors(admin, Math.min(Number(body.limit) || 25, 100));
      return json({ ok: true, outcomes });
    }

    if (action === 'set_optout') {
      const phone = normalizeE164(body.phone_e164);
      if (!phone || !body.line_id) return json({ error: 'line_id and a valid phone are required' }, 400);
      if (body.opted_out === false) {
        await admin.from('sendblue_optouts').delete().eq('line_id', body.line_id).eq('phone_e164', phone);
        return json({ ok: true, opted_out: false });
      }
      await admin
        .from('sendblue_optouts')
        .upsert({ line_id: body.line_id, phone_e164: phone, source: 'manual' }, { onConflict: 'line_id,phone_e164' });
      return json({ ok: true, opted_out: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('sendblue-admin failure', action, err instanceof Error ? err.message : err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
