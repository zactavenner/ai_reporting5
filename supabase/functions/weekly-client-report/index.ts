// Weekly Client Reports — operator-only server renderer, Monday batch dry run,
// and the (disarmed) delivery path. No scheduler calls this function.
//   dry_run    → render every active client's PDF + plan deliveries. Writes nothing, sends nothing.
//   render_pdf → one client's PDF inline (base64). Writes nothing.
//   send       → refused unless armed in code AND server env, ledger + private bucket installed,
//                and an explicit confirmation phrase is supplied.
import { admin, corsHeaders, json, requireOperator } from '../_shared/aiSetter/http.ts';
import { completedWeeks } from '../_shared/weeklyReport/core.ts';
import { buildReportModel, loadReportRows, loadRoster, type RosterEntry } from '../_shared/weeklyReport/model.ts';
import { buildReportDoc } from '../_shared/weeklyReport/layout.ts';
import { renderReportPdf, toBase64 } from '../_shared/weeklyReport/pdf.ts';
import { executePlan, planClientDeliveries, type RecipientFlags } from '../_shared/weeklyReport/delivery.ts';
import { bucketReady, ghlEmailSender, isDeliveryArmed, loadLedger, supabaseStore } from '../_shared/weeklyReport/server.ts';

const UUID = /^[0-9a-f-]{36}$/i;
const ref = (id: string) => `r-${id.slice(0, 8)}`;

async function renderFor(sb: any, entry: RosterEntry, now: Date) {
  const model = buildReportModel(entry, await loadReportRows(sb, entry, now), now);
  const out = await renderReportPdf(buildReportDoc(model));
  return { model, ...out };
}

async function recipientFlags(sb: any, clientId: string): Promise<RecipientFlags[]> {
  // Flags only — contact addresses are not read for planning.
  const { data, error } = await sb.from('client_report_recipients').select('id,client_id,active,unsubscribed_at,cadences,channels').eq('client_id', clientId);
  if (error) throw error;
  return data || [];
}

async function planFor(sb: any, entry: RosterEntry, now: Date, pdfOk: boolean, armed: boolean) {
  const week = completedWeeks(now, entry.config.timezone, 1)[0];
  const [recipients, ledger] = await Promise.all([recipientFlags(sb, entry.id), loadLedger(sb, entry.id, week.from)]);
  return planClientDeliveries({ clientId: entry.id, weekStart: week.from, weekEnd: week.to, checks: entry.checks, recipients, ledger, authOk: true, armed, pdfOk });
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const sb = admin();
  const op = await requireOperator(req, sb, body);
  if (!('auth' in op) || !op.auth) return (op as { error: Response }).error;
  const action = body?.action;
  const clientId = body?.client_id;
  if (clientId !== undefined && clientId !== null && (typeof clientId !== 'string' || !UUID.test(clientId))) return json({ error: 'invalid client_id' }, 400);
  const now = new Date();

  try {
    if (action === 'render_pdf') {
      if (!clientId) return json({ error: 'client_id required' }, 400);
      const [entry] = await loadRoster(sb, now, clientId);
      if (!entry) return json({ error: 'client is not active' }, 404);
      const r = await renderFor(sb, entry, now);
      return json({ client_id: entry.id, week: r.model.weeks[0].range, pages: r.pages, pdf_base64: toBase64(r.bytes) });
    }

    if (action === 'dry_run') {
      const roster = await loadRoster(sb, now, clientId || undefined);
      const armed = isDeliveryArmed();
      const batchBlockers: string[] = [];
      if (!armed) batchBlockers.push('Delivery not armed (code flag and server flag both off)');
      if (!(await bucketReady(sb))) batchBlockers.push('Private PDF storage bucket not created');
      const clients = await pool(roster, 3, async (entry) => {
        let pdf: { ok: boolean; pages?: number; bytes?: number; error?: string };
        try { const r = await renderFor(sb, entry, now); pdf = { ok: true, pages: r.pages, bytes: r.bytes.length }; }
        catch (e) { pdf = { ok: false, error: String((e as Error)?.message || e).slice(0, 200) }; }
        const plan = await planFor(sb, entry, now, pdf.ok, armed);
        return {
          clientId: entry.id, clientName: entry.name, timezone: entry.config.timezone,
          week: { from: plan.weekStart, to: plan.weekEnd }, pdf,
          approvedRecipients: plan.deliveries.length,
          deliveries: plan.deliveries.map((d) => ({ key: d.key, recipientRef: ref(d.recipientId), channel: d.channel, action: d.action, reason: d.reason })),
          blockers: plan.blockers,
        };
      });
      return json({ mode: 'dry_run', armed: false, generatedAt: now.toISOString(), clients, batchBlockers });
    }

    if (action === 'send') {
      const blockers: string[] = [];
      if (!isDeliveryArmed()) blockers.push('Delivery not armed');
      if (body?.confirm !== 'SEND_WEEKLY_REPORTS') blockers.push('Confirmation phrase missing');
      if (!clientId) blockers.push('Sends run one client at a time (client_id required)');
      if (!(await bucketReady(sb))) blockers.push('Private PDF storage bucket not created');
      if (blockers.length) return json({ error: 'send refused', blockers }, 403);
      const [entry] = await loadRoster(sb, now, clientId);
      if (!entry) return json({ error: 'client is not active' }, 404);
      const r = await renderFor(sb, entry, now);
      const plan = await planFor(sb, entry, now, true, true);
      if (plan.blockers.length) return json({ error: 'send refused', blockers: plan.blockers }, 403);
      const week = r.model.weeks[0].range;
      const results = await executePlan(plan, supabaseStore(sb), ghlEmailSender(sb, { pdf: r.bytes, clientName: entry.name, weekFrom: week.from, weekTo: week.to }));
      return json({ client_id: entry.id, week, results: results.map((x) => ({ ...x, key: x.key })) });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error('weekly-client-report', e);
    return json({ error: 'internal error' }, 500);
  }
});
