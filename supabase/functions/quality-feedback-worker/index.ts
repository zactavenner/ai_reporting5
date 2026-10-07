// Durable quality-feedback worker: drains the evaluation queue (fed by DB
// triggers on leads/dispositions/calls/funded), runs a reconciliation sweep for
// Preview/Live clients, then dispatches the outbox. Takes no input; returns
// counts only. Off clients are never evaluated; dispatch is gated server-side.
import { admin, corsHeaders, json } from '../_shared/aiSetter/http.ts';
import { runDispatch } from '../_shared/qualityFeedback/core.ts';
import { dbDispatchStore, evaluateLeads, liveSender } from '../_shared/qualityFeedback/store.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = admin();
  const owner = `qfw-${crypto.randomUUID()}`;
  const out: Record<string, any> = { queue: 0, reconciled: 0, evaluated: 0, queued_events: 0 };
  try {
    const { data: cfgs } = await sb.from('quality_feedback_clients').select('client_id,mode');
    const modes = new Map((cfgs ?? []).map((c: any) => [c.client_id, c.mode]));

    // 1. Queue
    const { data: jobs } = await sb.rpc('qf_claim_eval_jobs', { p_owner: owner, p_limit: 300, p_lease_seconds: 300 });
    const byClient = new Map<string, string[]>();
    for (const j of jobs ?? []) byClient.set(j.client_id, [...(byClient.get(j.client_id) ?? []), j.lead_id]);
    out.queue = jobs?.length ?? 0;
    for (const [clientId, leadIds] of byClient) {
      const mode = modes.get(clientId) ?? 'off';
      try {
        if (mode !== 'off') {
          const r = await evaluateLeads(sb, clientId, leadIds, mode === 'live' ? 'live' : 'preview');
          out.evaluated += r.evaluated; out.queued_events += r.queued;
        }
        await sb.from('quality_eval_queue').update({ status: 'done', finished_at: new Date().toISOString(), lease_owner: null })
          .eq('lease_owner', owner).eq('client_id', clientId);
      } catch (e) {
        await sb.from('quality_eval_queue').update({ status: 'pending', last_error: (e as Error).message.slice(0, 300), lease_owner: null })
          .eq('lease_owner', owner).eq('client_id', clientId).lt('attempts', 5);
        await sb.from('quality_eval_queue').update({ status: 'failed', lease_owner: null })
          .eq('lease_owner', owner).eq('client_id', clientId);
      }
    }

    // 2. Reconciliation fallback (missed triggers): recently touched leads.
    const since = new Date(Date.now() - 26 * 3600_000).toISOString();
    for (const [clientId, mode] of modes) {
      if (mode === 'off') continue;
      const { data: recent } = await sb.from('leads').select('id').eq('client_id', clientId).gte('updated_at', since).limit(500);
      const ids = (recent ?? []).map((r: any) => r.id);
      if (!ids.length) continue;
      const r = await evaluateLeads(sb, clientId, ids, mode === 'live' ? 'live' : 'preview');
      out.reconciled += r.evaluated; out.queued_events += r.queued;
    }

    // 3. Dispatch (global gate checked first; disabled sender unless installed).
    out.dispatch = await runDispatch(dbDispatchStore(sb, owner), liveSender(sb));
    return json({ success: true, ...out });
  } catch (e) {
    console.error('quality-feedback-worker failed:', (e as Error).message);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
