// Operator-only API for Quality Feedback. Every action re-verifies the signed
// operator session and scopes every read/write by the requested client_id.
import { admin, corsHeaders, json, requireClient, requireOperator } from '../_shared/aiSetter/http.ts';
import {
  DEFAULT_RULES, SENDABLE_MILESTONES, buildMetaPayload, idempotencyKey, maskPayload, matchInputFromLead,
  percentile, costPer, rulesConfigured, validatePayload, validateRules, type Milestone,
} from '../_shared/qualityFeedback/core.ts';
import { clientCfg, evaluateLeads, latestRules } from '../_shared/qualityFeedback/store.ts';

const DAY = 86400_000;
const actorOf = (auth: any) => auth.memberName || auth.memberId || auth.via;

async function audit(sb: any, clientId: string | null, action: string, actor: string, details: Record<string, unknown>) {
  await sb.from('quality_feedback_audit').insert({ client_id: clientId, action, actor, details });
}

async function ensureCfg(sb: any, clientId: string) {
  await sb.from('quality_feedback_clients').upsert({ client_id: clientId }, { onConflict: 'client_id', ignoreDuplicates: true });
  return clientCfg(sb, clientId);
}

async function holdOpen(sb: any, reason: string, clientId?: string) {
  let q = sb.from('quality_event_outbox').update({ status: 'held', hold_reason: reason, lease_owner: null })
    .in('status', ['pending', 'failed_retryable', 'claimed']);
  if (clientId) q = q.eq('client_id', clientId);
  await q;
}

async function legacySenderRisk(sb: any, clientId: string) {
  const { count } = await sb.from('capi_events_sent').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).gte('sent_at', new Date(Date.now() - 30 * DAY).toISOString());
  return count ?? 0;
}

async function readiness(sb: any, clientId: string, cfg: any, rules: any, global: any) {
  const { data: c } = await sb.from('clients').select('meta_pixel_id,meta_capi_access_token,meta_ad_account_id').eq('id', clientId).maybeSingle();
  const hasToken = !!(c?.meta_capi_access_token?.trim() || Deno.env.get('META_SHARED_ACCESS_TOKEN'));
  const legacy = await legacySenderRisk(sb, clientId);
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const { count: eligible30 } = await sb.from('quality_evaluations').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).eq('is_current', true).eq('milestone', cfg.milestone).eq('status', 'eligible').gte('occurred_at', since);
  const items = [
    { key: 'rules', label: 'Qualification rules configured', ok: rulesConfigured(rules), detail: rules ? 'Mapped CRM evidence present' : 'No rules saved yet' },
    { key: 'mapping', label: 'Milestone mapped to a Meta event name', ok: !!cfg.meta_event_name, detail: cfg.meta_event_name ? `${cfg.milestone} → ${cfg.meta_event_name}` : 'No event name chosen' },
    { key: 'dataset', label: "Destination is this client's own dataset", ok: !!cfg.destination_dataset_id && cfg.destination_dataset_id === String(c?.meta_pixel_id || ''), detail: c?.meta_pixel_id ? `Client dataset on file: ${c.meta_pixel_id}` : 'No dataset on file for this client' },
    { key: 'token', label: 'Server-side Meta credential present', ok: hasToken, detail: hasToken ? 'Present (value never shown)' : 'No credential reference' },
    { key: 'validated', label: 'Connection validated', ok: !!cfg.destination_verified, detail: 'Connection validation / Test Events is disabled in this build' },
    { key: 'consent', label: 'Data-sharing eligibility documented', ok: cfg.sharing_consent_status === 'documented', detail: cfg.sharing_consent_evidence || `Status: ${cfg.sharing_consent_status}` },
    { key: 'source', label: 'Event source supported', ok: cfg.event_source === 'crm', detail: cfg.event_source === 'crm' ? 'CRM feedback (system_generated)' : 'Website source needs browser dedup + sanitized URL' },
    { key: 'duplicates', label: 'No other sender for these outcomes', ok: legacy === 0, detail: legacy ? `Legacy CAPI sender sent ${legacy} events in 30 days — must be retired for this client first` : 'No legacy sends seen in 30 days (GHL/browser senders not verifiable from here)' },
    { key: 'volume', label: 'Volume advisory', ok: (eligible30 ?? 0) >= cfg.volume_advisory_monthly, advisory: true, detail: `${eligible30 ?? 0} eligible in 30 days vs advisory ${cfg.volume_advisory_monthly}/month` },
    { key: 'global', label: 'Global live gate enabled', ok: !!global.live_enabled && !global.emergency_stop, detail: global.emergency_stop ? 'Emergency stop is on' : global.live_enabled ? 'Enabled' : 'Disabled agency-wide' },
  ];
  return { items, blockers: items.filter((i) => !i.ok && !(i as any).advisory).map((i) => i.label), eligible30: eligible30 ?? 0, legacy };
}

async function measurement(sb: any, clientId: string) {
  const since = new Date(Date.now() - 30 * DAY);
  const sinceIso = since.toISOString();
  const { count: raw } = await sb.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', sinceIso);
  // Cohort = leads captured in window; milestones counted for that cohort.
  const { data: evals } = await sb.from('quality_evaluations').select('milestone,status,occurred_at,lead_captured_at')
    .eq('client_id', clientId).eq('is_current', true).gte('lead_captured_at', sinceIso).limit(20000);
  const n = (m: string) => (evals ?? []).filter((e: any) => e.milestone === m && e.status === 'eligible').length;
  const evaluatedLeads = (evals ?? []).filter((e: any) => e.milestone === 'verified_qualified_lead').length;
  const coverage = raw ? Math.min(1, ((evals ?? []).filter((e: any) => e.milestone === 'verified_qualified_lead').length) / raw) : 0;
  const { data: spendRows } = await sb.from('daily_metrics').select('ad_spend').eq('client_id', clientId).gte('date', sinceIso.slice(0, 10));
  const spend = spendRows?.length ? spendRows.reduce((s: number, r: any) => s + Number(r.ad_spend || 0), 0) : null;
  const coverageOk = coverage >= 0.95;
  const lags = (evals ?? []).filter((e: any) => e.status === 'eligible' && e.occurred_at && e.milestone === 'verified_qualified_lead')
    .map((e: any) => (new Date(e.occurred_at).getTime() - new Date(e.lead_captured_at).getTime()) / 3600_000);
  const { data: sent } = await sb.from('quality_event_outbox').select('event_time,dispatched_at').eq('client_id', clientId).eq('status', 'accepted').not('dispatched_at', 'is', null).limit(5000);
  const dl = (sent ?? []).map((r: any) => (new Date(r.dispatched_at).getTime() - new Date(r.event_time).getTime()) / 60_000);
  const q = n('verified_qualified_lead'), att = n('attended_qualified_call');
  return {
    window_days: 30, raw_leads: raw ?? 0, evaluated_leads: evaluatedLeads, evaluation_coverage: coverage,
    verified_qualified: q, qualified_booked: n('verified_qualified_booking'), attended_qualified: att, funded_internal: n('verified_funded'),
    qualified_rate: coverageOk && raw ? q / raw : null,
    spend, cost_per_verified_qualified: costPer(spend, q, coverageOk), cost_per_attended_qualified: costPer(spend, att, coverageOk),
    coverage_note: coverageOk ? null : 'Not every lead in this window has been evaluated yet — rates and costs are hidden instead of showing false zeros.',
    capture_to_qualified_hours: { median: percentile(lags, 50), p95: percentile(lags, 95) },
    qualified_to_dispatch_minutes: { median: percentile(dl, 50), p95: percentile(dl, 95) },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = admin();
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const gate = await requireOperator(req, sb, body);
  if ('error' in gate) return gate.error;
  const actor = actorOf(gate.auth);
  const action = String(body.action || '');
  const { data: global } = await sb.from('quality_feedback_global').select('*').eq('id', 1).maybeSingle();

  try {
    if (action === 'overview') {
      const { data: clients } = await sb.from('clients').select('id,name,status,meta_pixel_id,meta_ad_account_id').in('status', ['active', 'onboarding']).order('name');
      const { data: cfgs } = await sb.from('quality_feedback_clients').select('*');
      const { data: rv } = await sb.from('quality_rule_versions').select('client_id,version');
      const { data: ev } = await sb.from('quality_evaluations').select('client_id,milestone,status,reasons').eq('is_current', true).limit(50000);
      const { data: ob } = await sb.from('quality_event_outbox').select('client_id,status,event_time,dispatched_at').limit(50000);
      const { data: legacy } = await sb.from('capi_events_sent').select('client_id').gte('sent_at', new Date(Date.now() - 30 * DAY).toISOString());
      const legacySet = new Set((legacy ?? []).map((r: any) => r.client_id));
      const rows = (clients ?? []).map((c: any) => {
        const cfg = (cfgs ?? []).find((x: any) => x.client_id === c.id);
        const milestone = cfg?.milestone ?? 'attended_qualified_call';
        const mine = (ev ?? []).filter((e: any) => e.client_id === c.id && e.milestone === milestone);
        const out = (ob ?? []).filter((o: any) => o.client_id === c.id);
        const lags = out.filter((o: any) => o.dispatched_at).map((o: any) => (new Date(o.dispatched_at).getTime() - new Date(o.event_time).getTime()) / 60000);
        return {
          client_id: c.id, name: c.name, mode: cfg?.mode ?? 'off', milestone, meta_event_name: cfg?.meta_event_name ?? null,
          rules_version: Math.max(0, ...(rv ?? []).filter((r: any) => r.client_id === c.id).map((r: any) => r.version)),
          dataset: cfg?.destination_dataset_id ?? null, client_dataset_on_file: c.meta_pixel_id ?? null, ad_account: cfg?.destination_ad_account_id ?? c.meta_ad_account_id ?? null,
          eligible: mine.filter((e: any) => e.status === 'eligible').length,
          withheld: mine.filter((e: any) => e.status === 'withheld').length,
          needs_review: mine.filter((e: any) => e.status === 'needs_review').length,
          excluded: mine.filter((e: any) => e.status === 'excluded').length,
          outbox: Object.fromEntries(['pending', 'held', 'accepted', 'failed_retryable', 'failed_permanent', 'cancelled'].map((s) => [s, out.filter((o: any) => o.status === s).length])),
          dispatch_lag_minutes: { median: percentile(lags, 50), p95: percentile(lags, 95) },
          legacy_sender_active: legacySet.has(c.id),
        };
      });
      return json({ global, clients: rows, sender_inventory: [
        { name: 'capi-conversion-feedback (legacy, hourly)', sends: 'qualified/booked/showed/funded dispositions as QualifiedLead/BookedCall/ShowedCall/Funded', clients_last_30d: legacySet.size, status: 'active — not changed by this build' },
        { name: 'GHL workflows / browser pixel', sends: 'Unknown from Reporting data', clients_last_30d: null, status: 'unknown — not treated as deduplicated' },
      ] });
    }

    if (action === 'global_stop') {
      await sb.from('quality_feedback_global').update({ emergency_stop: true, updated_by: actor, updated_at: new Date().toISOString() }).eq('id', 1);
      await holdOpen(sb, 'Global emergency stop');
      await audit(sb, null, 'global_emergency_stop', actor, {});
      return json({ ok: true });
    }
    if (action === 'global_clear_stop') {
      await sb.from('quality_feedback_global').update({ emergency_stop: false, updated_by: actor, updated_at: new Date().toISOString() }).eq('id', 1);
      await audit(sb, null, 'global_emergency_stop_cleared', actor, { note: 'Held jobs stay held; live gate unchanged' });
      return json({ ok: true });
    }
    if (action === 'set_global_live') {
      // Intentionally not available in this build.
      await audit(sb, null, 'global_live_attempt_blocked', actor, {});
      return json({ error: 'Enabling the global live gate is not available in this build.', code: 'global_live_locked' }, 409);
    }

    const client = await requireClient(sb, body.client_id);
    if (!client) return json({ error: 'Unknown client' }, 404);
    const clientId = client.id;
    const cfg: any = await ensureCfg(sb, clientId);

    if (action === 'client') {
      const rules = await latestRules(sb, clientId);
      const { data: versions } = await sb.from('quality_rule_versions').select('id,version,rules,note,created_by,created_at').eq('client_id', clientId).order('version', { ascending: false }).limit(30);
      const { data: evals } = await sb.from('quality_evaluations').select('id,lead_id,milestone,status,reasons,evidence,occurred_at,lead_captured_at,run_kind,evaluated_at,occurrence_ref')
        .eq('client_id', clientId).eq('is_current', true).order('evaluated_at', { ascending: false }).limit(800);
      const leadIds = [...new Set((evals ?? []).map((e: any) => e.lead_id))].slice(0, 300);
      const { data: leads } = leadIds.length ? await sb.from('leads').select('id,name,email,phone,custom_fields,external_id,source,created_at').eq('client_id', clientId).in('id', leadIds) : { data: [] };
      const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
      const records = [];
      for (const id of leadIds) {
        const l: any = leadMap.get(id); if (!l) continue;
        const mine = (evals ?? []).filter((e: any) => e.lead_id === id);
        const target = mine.find((e: any) => e.milestone === cfg.milestone);
        let payload = null, payload_errors: string[] = [], coverage: string[] = [];
        if (target?.status === 'eligible' && cfg.meta_event_name) {
          const key = await idempotencyKey({ clientId, leadId: id, milestone: target.milestone as Milestone, occurrenceRef: target.occurrence_ref, datasetId: cfg.destination_dataset_id || 'unset', eventName: cfg.meta_event_name });
          const built = await buildMetaPayload({ eventName: cfg.meta_event_name, eventTime: target.occurred_at, eventId: key, source: cfg.event_source, match: matchInputFromLead(l) });
          payload = maskPayload(built.event); coverage = built.coverage; payload_errors = validatePayload(built.event, new Date());
        }
        records.push({ lead_id: id, name: l.name, captured_at: l.created_at, external_id: l.external_id, milestones: mine, prospective_payload: payload, payload_errors, matching_coverage: coverage });
      }
      const { data: outbox } = await sb.from('quality_event_outbox').select('id,lead_id,milestone,meta_event_name,event_time,status,hold_reason,attempts,last_error,receipt,created_at,dispatched_at,is_test').eq('client_id', clientId).order('created_at', { ascending: false }).limit(200);
      const { data: attempts } = await sb.from('quality_event_attempts').select('outbox_id,attempted_at,http_status,outcome,response_redacted').eq('client_id', clientId).order('attempted_at', { ascending: false }).limit(200);
      const { data: auditRows } = await sb.from('quality_feedback_audit').select('action,actor,details,created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100);
      return json({
        client, config: cfg, global, default_rules: DEFAULT_RULES, rules: rules.rules, rules_version: rules.version, versions,
        records, outbox, attempts, audit: auditRows, readiness: await readiness(sb, clientId, cfg, rules.rules, global ?? {}), measurement: await measurement(sb, clientId),
      });
    }

    if (action === 'save_rules') {
      const v = validateRules(body.rules);
      if (!v.ok) return json({ error: v.error }, 400);
      const cur = await latestRules(sb, clientId);
      const { error } = await sb.from('quality_rule_versions').insert({ client_id: clientId, version: cur.version + 1, rules: v.rules, note: String(body.note || '').slice(0, 300) || null, created_by: actor });
      if (error) return json({ error: 'Another edit was saved first — reload and try again' }, 409);
      await audit(sb, clientId, 'rules_saved', actor, { version: cur.version + 1 });
      if (cfg.mode !== 'off') {
        const { data: recent } = await sb.from('leads').select('id').eq('client_id', clientId).gte('created_at', new Date(Date.now() - 60 * DAY).toISOString()).limit(2000);
        for (const r of recent ?? []) await sb.rpc('qf_enqueue', { p_client: clientId, p_lead: r.id, p_reason: 'rules_changed' });
      }
      return json({ ok: true, version: cur.version + 1 });
    }

    if (action === 'save_config') {
      const p = body.config || {};
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (p.milestone !== undefined) { if (!SENDABLE_MILESTONES.includes(p.milestone)) return json({ error: 'Invalid milestone' }, 400); patch.milestone = p.milestone; }
      if (p.meta_event_name !== undefined) {
        if (p.meta_event_name && !/^[A-Za-z][A-Za-z0-9_]{1,49}$/.test(p.meta_event_name)) return json({ error: 'Event name: letters, numbers, underscores' }, 400);
        patch.meta_event_name = p.meta_event_name || null;
      }
      if (p.event_source !== undefined) { if (!['crm', 'website'].includes(p.event_source)) return json({ error: 'Invalid event source' }, 400); patch.event_source = p.event_source; }
      if (p.destination_dataset_id !== undefined) patch.destination_dataset_id = p.destination_dataset_id ? String(p.destination_dataset_id).replace(/\D/g, '') || null : null;
      if (p.destination_ad_account_id !== undefined) patch.destination_ad_account_id = p.destination_ad_account_id ? String(p.destination_ad_account_id).slice(0, 40) : null;
      if (p.sharing_consent_status !== undefined) { if (!['unknown', 'documented', 'refused'].includes(p.sharing_consent_status)) return json({ error: 'Invalid consent status' }, 400); patch.sharing_consent_status = p.sharing_consent_status; }
      if (p.sharing_consent_evidence !== undefined) patch.sharing_consent_evidence = String(p.sharing_consent_evidence || '').slice(0, 1000) || null;
      if (p.volume_advisory_monthly !== undefined) patch.volume_advisory_monthly = Math.max(1, Math.min(10000, Number(p.volume_advisory_monthly) || 30));
      if (p.campaign_rollout !== undefined) {
        const r = p.campaign_rollout || {};
        patch.campaign_rollout = {
          test_campaign_ids: String(r.test_campaign_ids || '').slice(0, 500), control_campaign_ids: String(r.control_campaign_ids || '').slice(0, 500),
          start_date: String(r.start_date || '').slice(0, 10), outcome_window_days: Number(r.outcome_window_days) || null,
          manually_verified: !!r.manually_verified, notes: String(r.notes || '').slice(0, 1000),
        };
      }
      const mappingChanged = ['milestone', 'meta_event_name', 'destination_dataset_id', 'event_source'].some((k) => k in patch && patch[k] !== cfg[k]);
      if (mappingChanged) { patch.destination_verified = false; patch.destination_verified_at = null; }
      await sb.from('quality_feedback_clients').update(patch).eq('client_id', clientId);
      if (mappingChanged) await holdOpen(sb, 'Mapping or destination changed — needs review', clientId);
      await audit(sb, clientId, 'config_saved', actor, { fields: Object.keys(patch).filter((k) => k !== 'updated_at') });
      return json({ ok: true });
    }

    if (action === 'set_mode') {
      const mode = body.mode;
      if (!['off', 'preview'].includes(mode)) return json({ error: 'Use the activation workflow for Live' }, 400);
      await sb.from('quality_feedback_clients').update({ mode, updated_at: new Date().toISOString() }).eq('client_id', clientId);
      if (cfg.mode === 'live') await holdOpen(sb, 'Client paused', clientId);
      await audit(sb, clientId, mode === 'off' ? 'mode_off' : 'mode_preview', actor, { from: cfg.mode });
      return json({ ok: true });
    }

    if (action === 'run_preview') {
      const days = Math.max(1, Math.min(90, Number(body.days) || 30));
      const { data: leads } = await sb.from('leads').select('id').eq('client_id', clientId).gte('created_at', new Date(Date.now() - days * DAY).toISOString()).order('created_at', { ascending: false }).limit(1500);
      const ids = (leads ?? []).map((l: any) => l.id);
      let evaluated = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const r = await evaluateLeads(sb, clientId, ids.slice(i, i + 200), cfg.mode === 'preview' ? 'preview' : 'simulation');
        evaluated += r.evaluated;
      }
      await audit(sb, clientId, 'preview_run', actor, { days, evaluated, kind: cfg.mode === 'preview' ? 'preview' : 'simulation' });
      return json({ ok: true, evaluated, network_requests_to_meta: 0 });
    }

    if (action === 'test_events') {
      return json({ error: 'Connection validation and Test Events are disabled in this build.', code: 'test_events_disabled' }, 409);
    }

    if (action === 'activate_live') {
      const rules = await latestRules(sb, clientId);
      const r = await readiness(sb, clientId, cfg, rules.rules, global ?? {});
      const confirmOk = String(body.confirm_client_name || '').trim() === client.name;
      const blockers = [...r.blockers, ...(confirmOk ? [] : ['Typed client name does not match'])];
      await audit(sb, clientId, blockers.length ? 'live_activation_refused' : 'live_activated', actor, { blockers, milestone: cfg.milestone, event: cfg.meta_event_name, dataset: cfg.destination_dataset_id });
      if (blockers.length) return json({ error: 'Not ready for Live', blockers }, 409);
      const at = new Date().toISOString();
      await sb.from('quality_feedback_clients').update({ mode: 'live', live_activated_at: at, live_activated_by: actor, updated_at: at }).eq('client_id', clientId);
      return json({ ok: true, effective_from: at });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('quality-feedback-api error:', (e as Error).message);
    return json({ error: 'Request failed' }, 500);
  }
});
