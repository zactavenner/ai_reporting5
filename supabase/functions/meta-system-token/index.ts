/* meta-system-token */
/**
 * Dashboard path for a client's Meta SYSTEM USER token.
 *
 * Auth: authorizeOperator (dashboard session token / provisioned operator /
 * trusted server caller) — the same boundary as client-connections.
 *
 * Body: { action: 'status' | 'set' | 'delete' | 'revalidate', client_id, token? }
 * Response: metadata only (see _shared/metaSystemToken.ts toStatusPayload). The
 * token is never returned, logged or written to the audit trail.
 * 'delete' only removes it from Reporting 5.0; nothing is revoked at Meta.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders as sdkCors } from 'npm:@supabase/supabase-js@2.115.0/cors';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import { runSystemTokenAction, type SystemTokenAction } from '../_shared/metaSystemToken.ts';

const corsHeaders = {
  ...sdkCors,
  'Access-Control-Allow-Headers': `${sdkCors['Access-Control-Allow-Headers']}, x-dashboard-token`,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ACTIONS: SystemTokenAction[] = ['status', 'set', 'delete', 'revalidate'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const auth = await authorizeOperator(req, supabase, createClient, body);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);

  const action = String(body?.action || '') as SystemTokenAction;
  if (!ACTIONS.includes(action)) return json({ error: 'invalid_action', message: 'action must be status, set, delete or revalidate' }, 400);

  try {
    const res = await runSystemTokenAction(supabase, {
      action,
      clientId: String(body?.client_id || ''),
      token: action === 'set' ? body?.token : undefined,
      actor: {
        label: auth.memberName || (auth.via === 'service_role' ? 'service' : auth.userId || auth.via),
        userId: auth.userId,
      },
      source: 'dashboard',
    });
    // A rejected token is a normal outcome for the UI: 200 + saved:false + status 'invalid'.
    if (res.errorCode === 'meta_token_invalid') {
      return json({ ...res.data, saved: false, error: res.errorCode, message: res.errorMessage });
    }
    if (res.httpStatus >= 400) return json({ error: res.errorCode, message: res.errorMessage }, res.httpStatus);
    return json({ ...res.data, ...(res.saved !== undefined ? { saved: res.saved } : {}) });
  } catch (e) {
    console.error('[meta-system-token] failed', action, e instanceof Error ? e.message.slice(0, 200) : 'unknown');
    return json({ error: 'internal_error' }, 500);
  }
});
