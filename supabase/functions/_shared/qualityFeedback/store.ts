import {
  type ClientCfg, type DispatchStore, type Milestone, type QualityRules, type Sender,
  disabledSender, evaluateLead, idempotencyKey, matchInputFromLead, outboxEligibility, validateRules,
} from './core.ts';
import { META_GRAPH_BASE } from '../meta.ts';

export async function latestRules(sb: any, clientId: string): Promise<{ id: string | null; version: number; rules: QualityRules | null }> {
  const { data } = await sb.from('quality_rule_versions').select('id,version,rules').eq('client_id', clientId)
    .order('version', { ascending: false }).limit(1).maybeSingle();
  if (!data) return { id: null, version: 0, rules: null };
  const v = validateRules(data.rules);
  return { id: data.id, version: data.version, rules: v.ok ? v.rules : null };
}

export async function clientCfg(sb: any, clientId: string): Promise<ClientCfg | null> {
  const { data } = await sb.from('quality_feedback_clients').select('*').eq('client_id', clientId).maybeSingle();
  return data ?? null;
}

/** Evaluate leads for ONE client. Every query is scoped by client_id. */
export async function evaluateLeads(sb: any, clientId: string, leadIds: string[], runKind: 'preview' | 'simulation' | 'live') {
  if (!leadIds.length) return { evaluated: 0, changed: 0, queued: 0 };
  const rules = await latestRules(sb, clientId);
  const cfg = await clientCfg(sb, clientId);
  const { data: leads } = await sb.from('leads')
    .select('id,client_id,name,email,phone,is_spam,created_at,updated_at,current_disposition,disposition_updated_at,opportunity_stage_id,custom_fields,quality_score')
    .eq('client_id', clientId).in('id', leadIds);
  const ids = (leads ?? []).map((l: any) => l.id);
  if (!ids.length) return { evaluated: 0, changed: 0, queued: 0 };
  const [{ data: disp }, { data: calls }, { data: funded }] = await Promise.all([
    sb.from('lead_dispositions').select('id,lead_id,disposition,disposed_at,source').eq('client_id', clientId).in('lead_id', ids),
    sb.from('calls').select('id,lead_id,booked_at,scheduled_at,appointment_status,showed,showed_at,attendance_source,is_reconnect').eq('client_id', clientId).in('lead_id', ids),
    sb.from('funded_investors').select('id,lead_id,funded_at,is_verified_funded').eq('client_id', clientId).in('lead_id', ids),
  ]);
  const by = (rows: any[] | null, id: string) => (rows ?? []).filter((r) => r.lead_id === id);
  const { data: currentRows } = await sb.from('quality_evaluations').select('id,lead_id,milestone,evidence_hash,rule_version_id')
    .eq('client_id', clientId).eq('is_current', true).in('lead_id', ids);
  const cur = new Map((currentRows ?? []).map((r: any) => [`${r.lead_id}|${r.milestone}`, r]));
  let changed = 0, queued = 0;
  for (const lead of leads ?? []) {
    const results = evaluateLead(rules.rules, lead, by(disp, lead.id), by(calls, lead.id), by(funded, lead.id));
    for (const r of results) {
      const prev: any = cur.get(`${lead.id}|${r.milestone}`);
      let evalId = prev?.id ?? null;
      if (!prev || prev.evidence_hash !== r.evidence_hash || prev.rule_version_id !== rules.id) {
        if (prev) await sb.from('quality_evaluations').update({ is_current: false }).eq('id', prev.id).eq('client_id', clientId);
        const { data: ins, error } = await sb.from('quality_evaluations').insert({
          client_id: clientId, lead_id: lead.id, rule_version_id: rules.id, milestone: r.milestone, status: r.status,
          reasons: r.reasons, evidence: r.evidence, evidence_hash: r.evidence_hash, occurrence_ref: r.occurrence_ref,
          occurred_at: r.occurred_at, lead_captured_at: lead.created_at, run_kind: runKind, is_current: true,
        }).select('id').maybeSingle();
        if (error) continue; // concurrent writer already stored the current row
        evalId = ins?.id; changed++;
      }
      if (cfg && !outboxEligibility(cfg, r, runKind)) {
        const key = await idempotencyKey({ clientId, leadId: lead.id, milestone: r.milestone as Milestone, occurrenceRef: r.occurrence_ref!, datasetId: cfg.destination_dataset_id!, eventName: cfg.meta_event_name! });
        const { error } = await sb.from('quality_event_outbox').upsert({
          client_id: clientId, lead_id: lead.id, evaluation_id: evalId, milestone: r.milestone, occurrence_ref: r.occurrence_ref,
          idempotency_key: key, meta_event_name: cfg.meta_event_name, event_time: r.occurred_at,
          destination_dataset_id: cfg.destination_dataset_id, evidence_hash: r.evidence_hash,
        }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
        if (!error) queued++;
      }
    }
  }
  return { evaluated: (leads ?? []).length, changed, queued };
}

export function dbDispatchStore(sb: any, owner: string): DispatchStore {
  return {
    async claim(limit) {
      const { data } = await sb.rpc('qf_claim_outbox', { p_owner: owner, p_limit: limit, p_lease_seconds: 300 });
      return data ?? [];
    },
    async global() {
      const { data } = await sb.from('quality_feedback_global').select('live_enabled,emergency_stop').eq('id', 1).maybeSingle();
      return data ?? { live_enabled: false, emergency_stop: true };
    },
    clientCfg: (id) => clientCfg(sb, id),
    async currentEval(leadId, milestone) {
      const { data } = await sb.from('quality_evaluations').select('status,evidence_hash').eq('lead_id', leadId).eq('milestone', milestone).eq('is_current', true).maybeSingle();
      return data ?? null;
    },
    async match(leadId, clientId) {
      const { data } = await sb.from('leads').select('email,phone,name,custom_fields').eq('id', leadId).eq('client_id', clientId).maybeSingle();
      return data ? matchInputFromLead(data) : null;
    },
    async update(id, patch) { await sb.from('quality_event_outbox').update(patch).eq('id', id); },
    async attempt(row) { await sb.from('quality_event_attempts').insert(row); },
  };
}

/**
 * Real Meta sender exists only when QUALITY_FEEDBACK_LIVE_SENDER=enabled is set
 * server-side. Not set in this build → disabledSender (no network I/O).
 * Token comes from the client's existing server-side credential reference.
 */
export function liveSender(sb: any): Sender {
  if (Deno.env.get('QUALITY_FEEDBACK_LIVE_SENDER') !== 'enabled') return disabledSender;
  return {
    installed: true,
    async send(datasetId, clientId, events) {
      const { data: c } = await sb.from('clients').select('meta_pixel_id,meta_capi_access_token').eq('id', clientId).maybeSingle();
      const token = c?.meta_capi_access_token?.trim() || Deno.env.get('META_SHARED_ACCESS_TOKEN')?.trim();
      if (!token) return { httpStatus: 400, body: { error: { message: 'No server-side access token for client' } } };
      if (String(c?.meta_pixel_id || '') !== datasetId) return { httpStatus: 400, body: { error: { message: 'Dataset does not match client' } } };
      try {
        const res = await fetch(`${META_GRAPH_BASE}/${encodeURIComponent(datasetId)}/events`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: events, access_token: token }),
        });
        return { httpStatus: res.status, body: await res.json().catch(() => ({})) };
      } catch (e) { return { httpStatus: null, body: null, networkError: (e as Error).message }; }
    },
  };
}
