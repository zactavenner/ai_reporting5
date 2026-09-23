/* sendblue-send */
/**
 * The only outbound path. Every send — reply, new conversation, campaign —
 * passes the same gate (line capability, opt-out, inbound history) before any
 * provider call, and is recorded before and after the provider responds.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders as sdkCors } from 'npm:@supabase/supabase-js@2.115.0/cors';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import {
  SENDBLUE_BASE,
  mapProviderStatus,
  normalizeE164,
  resolveSendCredentials,
  sendGuard,
  sendGuardMessage,
  sendblueHeaders,
  type SendKind,
} from '../_shared/sendblue.ts';
import { queueMirror, runMirrors } from '../_shared/sendblueMirror.ts';

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

interface SendTarget {
  phone: string;
  contact_name?: string | null;
}

async function sendOne(
  line: any,
  account: any,
  target: SendTarget,
  message: string,
  kind: SendKind,
  sentBy: string,
  campaignId: string | null,
) {
  const phone = normalizeE164(target.phone);
  if (!phone) return { phone: target.phone, ok: false, reason: 'unusable_phone', detail: 'Not a usable phone number.' };

  const [{ data: optout }, { data: conversation }] = await Promise.all([
    admin.from('sendblue_optouts').select('id').eq('line_id', line.id).eq('phone_e164', phone).maybeSingle(),
    admin.from('sendblue_conversations').select('*').eq('line_id', line.id).eq('contact_phone', phone).maybeSingle(),
  ]);

  let hasInbound = false;
  if (conversation) {
    const { count } = await admin
      .from('sendblue_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id)
      .eq('direction', 'inbound');
    hasInbound = (count || 0) > 0;
  }

  const guard = sendGuard({ line, kind, optedOut: Boolean(optout?.id), hasInbound });
  if (!guard.allowed) {
    return { phone, ok: false, reason: guard.reason, detail: sendGuardMessage(guard.reason) };
  }

  const resolved = resolveSendCredentials(line, account, ENV_CREDS);
  if (!resolved.ok) return { phone, ok: false, reason: resolved.reason, detail: resolved.detail };
  const creds = resolved.credentials;

  let convoId = conversation?.id as string | undefined;
  if (!convoId) {
    const { data: created, error } = await admin
      .from('sendblue_conversations')
      .upsert(
        {
          line_id: line.id,
          client_id: line.client_id,
          contact_phone: phone,
          contact_name: target.contact_name || null,
        },
        { onConflict: 'line_id,contact_phone' },
      )
      .select('id')
      .single();
    if (error) return { phone, ok: false, reason: 'conversation_failed', detail: error.message };
    convoId = created.id;
  }

  const idempotencyKey = crypto.randomUUID();
  const { data: row, error: insertErr } = await admin
    .from('sendblue_messages')
    .insert({
      conversation_id: convoId,
      line_id: line.id,
      client_id: line.client_id,
      direction: 'outbound',
      channel: 'sms',
      body: message,
      status: 'sending',
      idempotency_key: idempotencyKey,
      sent_by: sentBy,
      campaign_id: campaignId,
      sent_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (insertErr) return { phone, ok: false, reason: 'record_failed', detail: insertErr.message };

  try {
    const res = await fetch(`${SENDBLUE_BASE}/api/send-message`, {
      method: 'POST',
      headers: sendblueHeaders(creds),
      body: JSON.stringify({
        number: phone,
        from_number: line.phone_e164,
        content: message,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      await admin
        .from('sendblue_messages')
        .update({ status: 'failed', error_message: `Sendblue ${res.status}: ${text.slice(0, 200)}` })
        .eq('id', row.id);
      return { phone, ok: false, reason: 'provider_rejected', detail: `Sendblue ${res.status}: ${text.slice(0, 200)}` };
    }
    const payload = JSON.parse(text || '{}');
    const providerId = payload?.message_handle || payload?.message_id || null;
    const channel = String(payload?.service || '').toLowerCase() === 'imessage' ? 'imessage' : 'sms';
    await admin
      .from('sendblue_messages')
      .update({
        status: mapProviderStatus(payload?.status) || 'sent',
        provider_message_id: providerId,
        provider_message_handle: payload?.message_handle || null,
        channel,
      })
      .eq('id', row.id);
    await admin
      .from('sendblue_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: message.slice(0, 160),
      })
      .eq('id', convoId);
    await queueMirror(admin, { ...row, client_id: line.client_id });
    return { phone, ok: true, message_id: row.id };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network error';
    // The provider may or may not have accepted this. Never re-send blindly.
    await admin
      .from('sendblue_messages')
      .update({ status: 'submission_unknown', error_message: detail.slice(0, 200) })
      .eq('id', row.id);
    return { phone, ok: false, reason: 'submission_unknown', detail };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON body required' }, 400);
  }

  const auth = await authorizeOperator(req, admin, createClient, body);
  if (!auth.ok) return json({ error: auth.error, code: auth.code }, auth.status);
  const sentBy = auth.memberName || auth.memberId || 'agency';

  const lineId = String(body.line_id || '');
  const message = String(body.message || '').trim();
  const kind: SendKind = body.kind === 'campaign' ? 'campaign' : body.kind === 'new_conversation' ? 'new_conversation' : 'reply';
  if (!lineId) return json({ error: 'line_id is required' }, 400);
  if (!message) return json({ error: 'A message is required' }, 400);
  if (message.length > 18996) return json({ error: 'Message is longer than Sendblue allows (18,996 characters).' }, 400);

  const { data: line } = await admin.from('sendblue_lines').select('*').eq('id', lineId).maybeSingle();
  if (!line) return json({ error: 'Line not found' }, 404);

  // Imported numbers carry no keys of their own — they belong to an account.
  let account: any = null;
  if (line.account_id) {
    const { data: acct } = await admin
      .from('sendblue_accounts')
      .select('id, api_key_id, api_secret, active, status')
      .eq('id', line.account_id)
      .maybeSingle();
    account = acct || null;
  }

  const targets: SendTarget[] = Array.isArray(body.recipients) && body.recipients.length
    ? body.recipients.slice(0, 500).map((r: any) => ({ phone: String(r.phone || r), contact_name: r.contact_name || null }))
    : body.phone
      ? [{ phone: String(body.phone), contact_name: body.contact_name || null }]
      : [];
  if (!targets.length) return json({ error: 'At least one recipient is required' }, 400);
  if (targets.length > 1 && kind !== 'campaign') {
    return json({ error: 'Multiple recipients require a campaign send.' }, 400);
  }

  const results = [];
  for (const target of targets) {
    results.push(await sendOne(line, account, target, message, kind, sentBy, body.campaign_id || null));
  }

  // Mirror right away so the CRM note appears with the message.
  try {
    await runMirrors(admin, Math.min(results.length + 5, 30));
  } catch (err) {
    console.error('sendblue-send mirror pass failed', err instanceof Error ? err.message : err);
  }

  const sent = results.filter((r) => r.ok).length;
  return json({ ok: sent > 0, sent, blocked: results.length - sent, results }, sent > 0 ? 200 : 400);
});
