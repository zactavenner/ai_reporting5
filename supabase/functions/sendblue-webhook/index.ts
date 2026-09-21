/* sendblue-webhook */
/**
 * Public Sendblue callback endpoint: inbound messages, outbound status updates.
 *
 * Fails closed when SENDBLUE_WEBHOOK_SECRET is absent or the signature does not
 * verify. Every message is deduped on the provider message id, so retries never
 * create a second row or a second CRM note.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders as sdkCors } from 'npm:@supabase/supabase-js@2.115.0/cors';
import {
  isOptOutMessage,
  mapProviderStatus,
  normalizeWebhookEvent,
  verifyWebhookSignature,
} from '../_shared/sendblue.ts';
import { queueMirror, runMirrors } from '../_shared/sendblueMirror.ts';

const corsHeaders = { ...sdkCors };

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('SENDBLUE_WEBHOOK_SECRET');
  const raw = await req.text();
  if (!secret) {
    console.error('sendblue-webhook rejected: signing secret not configured');
    return json({ error: 'Webhook signing secret not configured' }, 503);
  }
  const verified = await verifyWebhookSignature(secret, raw, req.headers);
  if (!verified) {
    console.error('sendblue-webhook rejected: signature verification failed');
    return json({ error: 'Signature verification failed' }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const event = normalizeWebhookEvent(payload);

  try {
    if (event.kind === 'status') {
      if (event.providerMessageId) {
        const patch: Record<string, unknown> = { status: mapProviderStatus(event.status) };
        if (patch.status === 'delivered') patch.delivered_at = new Date().toISOString();
        if (patch.status === 'failed') patch.error_message = payload?.error_message || 'Delivery failed';
        await admin
          .from('sendblue_messages')
          .update(patch)
          .or(`provider_message_id.eq.${event.providerMessageId},provider_message_handle.eq.${event.providerMessageId}`);
      }
      return json({ ok: true, handled: 'status' });
    }

    if (event.kind !== 'message' || !event.fromNumber) {
      return json({ ok: true, handled: 'ignored' });
    }

    // Which of our lines received this?
    let lineQuery = admin.from('sendblue_lines').select('*').eq('active', true);
    if (event.toNumber) lineQuery = lineQuery.eq('phone_e164', event.toNumber);
    const { data: lines } = await lineQuery;
    const line = (lines || [])[0];
    if (!line) {
      console.error('sendblue-webhook: inbound for an unregistered line');
      return json({ ok: true, handled: 'unknown_line' });
    }

    const { data: conversation, error: convErr } = await admin
      .from('sendblue_conversations')
      .upsert(
        {
          line_id: line.id,
          client_id: line.client_id,
          contact_phone: event.fromNumber,
        },
        { onConflict: 'line_id,contact_phone' },
      )
      .select('*')
      .single();
    if (convErr) throw convErr;

    const { data: inserted, error: insertErr } = await admin
      .from('sendblue_messages')
      .upsert(
        {
          conversation_id: conversation.id,
          line_id: line.id,
          client_id: line.client_id,
          direction: 'inbound',
          channel: event.channel,
          body: event.body,
          media_urls: event.mediaUrls,
          status: 'received',
          provider_message_id: event.providerMessageId,
          provider_message_handle: event.messageHandle,
          received_at: new Date().toISOString(),
        },
        { onConflict: 'provider_message_id', ignoreDuplicates: true },
      )
      .select('*')
      .maybeSingle();

    if (!inserted) {
      // Already stored from an earlier delivery attempt.
      return json({ ok: true, handled: 'duplicate' });
    }

    await admin
      .from('sendblue_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: (event.body || '(attachment)').slice(0, 160),
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id);

    if (isOptOutMessage(event.body)) {
      await admin
        .from('sendblue_optouts')
        .upsert(
          { line_id: line.id, phone_e164: event.fromNumber, source: 'keyword' },
          { onConflict: 'line_id,phone_e164' },
        );
    }

    await queueMirror(admin, inserted);
    try {
      await runMirrors(admin, 5);
    } catch (err) {
      console.error('sendblue-webhook mirror pass failed', err instanceof Error ? err.message : err);
    }

    return json({ ok: true, handled: 'message' });
  } catch (err) {
    console.error('sendblue-webhook failure', err instanceof Error ? err.message : err);
    return json({ error: 'Processing failed' }, 500);
  }
});
