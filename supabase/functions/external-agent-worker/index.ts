// Routes Agents Team @mentions and delivers due push deliveries. Takes no input and
// returns counts only; safe to call from the scheduler or as an immediate kick.
import { admin, corsHeaders, json } from '../_shared/aiSetter/http.ts';
import { dispatchPush, routePendingMentions } from '../_shared/externalAgents/dispatch.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = admin();
  const owner = `eaw-${crypto.randomUUID().slice(0, 8)}`;
  try {
    const mentions = await routePendingMentions(sb);
    const push = await dispatchPush(sb, owner, 10);
    await sb.from('external_agent_callback_nonces').delete().lt('created_at', new Date(Date.now() - 86400_000).toISOString());
    return json({ ok: true, mentions, ...push });
  } catch (e) {
    console.error('[external-agent-worker]', (e as Error).message);
    return json({ ok: false, error: 'worker_failed' }, 500);
  }
});
