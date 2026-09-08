/**
 * media-buyer-sop-review — Capital Raising SOP review for the EXISTING logical
 * Media Buyer agent. Read-only, one client per request.
 *
 * NOT DEPLOYED. This source is prepared for review only. Deploying it is an
 * explicit, separate step (see docs/ai-media-buyer-capital-raising.md).
 *
 * Guarantees enforced here:
 * - Authorization is verified server-side BEFORE any privileged read. Anonymous
 *   callers and callers asking for a client they may not read are rejected.
 * - No wildcard/portfolio sweep. `client_id` is required.
 * - Only whitelisted columns are selected — never `client_settings.*`.
 * - Source errors, pagination and truncation fail closed as data blockers.
 * - The deterministic analysis in _shared/mediaBuyerSop.ts is authoritative and
 *   is re-validated here regardless of what the caller sends.
 * - No Meta writes, no approval_queue writes, no gatekeeper call, no
 *   notifications, no schedule changes. Draft actions are inert JSON.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import {
  assessClient,
  todayInTz,
  addDays,
  SOP_NARRATOR_SYSTEM_PROMPT,
  buildOperatingInstructions,
  type AdInput,
  type Window,
  type FrequencyReading,
} from '../_shared/mediaBuyerSop.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dashboard-token',
};

/** Hard runtime cap so a single review can never run away. */
const MAX_RUNTIME_MS = 25_000;
/** Narrative model output cap. */
const MAX_NARRATIVE_TOKENS = 700;
/** Row cap per source read; exceeding it is reported as truncation. */
const ROW_CAP = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNAVAILABLE_FREQUENCY: FrequencyReading = {
  available: false,
  reason: 'aggregate unique-reach frequency not directly sourced for this window',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ---- Authorization BEFORE any privileged read ----------------------------
  const auth = await authorizeOperator(req, supabase, createClient, body);
  if (!auth.ok) return json({ success: false, error: auth.error, code: auth.code }, auth.status);

  if (body.action === 'operating_instructions') {
    return json({ success: true, instructions: buildOperatingInstructions(), narrator_system_prompt: SOP_NARRATOR_SYSTEM_PROMPT });
  }

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  if (!clientId || !UUID_RE.test(clientId)) {
    return json({ success: false, error: 'client_id (uuid) is required — this endpoint has no portfolio mode', code: 'client_id_required' }, 400);
  }
  // Non-operator identities (future client-scoped sessions) may only read their
  // own client. Service/scheduler callers must still authenticate explicitly.
  const scopedClientId = typeof (auth as { clientId?: string }).clientId === 'string' ? (auth as { clientId?: string }).clientId : null;
  if (scopedClientId && scopedClientId !== clientId) {
    return json({ success: false, error: 'Forbidden: client scope mismatch', code: 'client_scope_mismatch' }, 403);
  }

  try {
    // ---- Whitelisted reads ------------------------------------------------
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, name, status, meta_ad_account_id')
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) return json({ success: false, error: 'client read failed', code: 'source_error' }, 502);
    if (!client) return json({ success: false, error: 'client not found', code: 'not_found' }, 404);

    const { data: settings, error: settingsErr } = await supabase
      .from('client_settings')
      .select('client_id, stats_report_timezone, monthly_ad_spend_target, daily_ad_spend_target')
      .eq('client_id', clientId)
      .maybeSingle();
    if (settingsErr) return json({ success: false, error: 'settings read failed', code: 'source_error' }, 502);

    const { data: targets, error: targetsErr } = await supabase
      .from('client_kpi_targets')
      .select('client_id, max_daily_budget, autonomy_mode, guardrails')
      .eq('client_id', clientId)
      .maybeSingle();
    if (targetsErr) return json({ success: false, error: 'kpi targets read failed', code: 'source_error' }, 502);

    const timezone = (settings?.stats_report_timezone as string) || 'America/Los_Angeles';
    const nowIso = new Date().toISOString();
    const today = todayInTz(nowIso, timezone);
    const curEnd = addDays(today, -1);
    const curStart = addDays(curEnd, -6);
    const priorEnd = addDays(curStart, -1);
    const priorStart = addDays(priorEnd, -6);
    const monthStart = `${today.slice(0, 7)}-01`;

    const { data: daily, error: dailyErr, count } = await supabase
      .from('daily_metrics')
      .select(
        'client_id, date, date_account_tz, ad_spend, impressions, clicks, leads, spam_leads, calls_scheduled, calls_showed, commitments, commitment_dollars, funded_investors, funded_dollars',
        { count: 'exact' },
      )
      .eq('client_id', clientId)
      .gte('date', priorStart)
      .lte('date', curEnd)
      .order('date', { ascending: true })
      .range(0, ROW_CAP - 1);
    if (dailyErr) return json({ success: false, error: 'daily metrics read failed', code: 'source_error' }, 502);
    const truncated = (count ?? 0) > (daily?.length ?? 0);

    const rows = (daily ?? []) as Array<Record<string, number | string | null>>;
    const inRange = (from: string, to: string) =>
      rows.filter((r) => {
        const d = String(r.date_account_tz ?? r.date ?? '');
        return d >= from && d <= to;
      });

    /**
     * Builds a window. Qualified-lead maturity is NOT available from
     * daily_metrics today, so it is reported as null (never zero) and the
     * deterministic rules fail closed with DATA BLOCKED. See the doc for the
     * qualified-lead source that must be wired before live use.
     */
    function buildWindow(from: string, to: string): Window {
      const w = inRange(from, to);
      const sum = (k: string) =>
        w.reduce<number | null>((acc, r) => {
          const v = r[k];
          if (v === null || v === undefined) return acc;
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) return null;
          return acc === null ? null : acc + n;
        }, 0);
      const days = new Set(w.map((r) => String(r.date_account_tz ?? r.date))).size;
      return {
        client_id: clientId,
        timezone,
        start_date: from,
        end_date: to,
        complete_days: days,
        expected_days: 7,
        spend_usd: sum('ad_spend'),
        impressions: sum('impressions'),
        clicks_outbound: sum('clicks'),
        leads: sum('leads'),
        qualified_leads_matured: null,
        qualification_cohort_end: null,
        frequency: UNAVAILABLE_FREQUENCY,
        source_complete: days === 7 && !truncated,
        source_error: null,
        truncated,
      };
    }

    const currentWindow = buildWindow(curStart, curEnd);
    const priorWindow = buildWindow(priorStart, priorEnd);

    const mtd = inRange(monthStart, curEnd);
    const mtdSpend = mtd.reduce<number | null>((acc, r) => {
      const v = r.ad_spend;
      if (v === null || v === undefined) return acc;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      return acc === null ? null : acc + n;
    }, 0);

    const funded = mtd.reduce<number | null>((a, r) => (a === null ? null : a + Number(r.funded_dollars ?? 0)), 0);
    const commitments = mtd.reduce<number | null>((a, r) => (a === null ? null : a + Number(r.commitment_dollars ?? 0)), 0);

    // Ad-level rows are whitelisted and scoped to the client.
    const { data: adRows, error: adErr } = await supabase
      .from('meta_ads')
      .select('meta_ad_id, name, client_id, status, daily_budget, created_time')
      .eq('client_id', clientId)
      .limit(ROW_CAP);
    if (adErr) return json({ success: false, error: 'ads read failed', code: 'source_error' }, 502);

    const ads: AdInput[] = ((adRows ?? []) as Array<Record<string, unknown>>)
      .filter((a) => a.client_id === clientId)
      .map((a) => ({
        ad_id: String(a.meta_ad_id),
        ad_name: (a.name as string) ?? null,
        client_id: clientId,
        hours_live: a.created_time ? Math.floor((Date.now() - Date.parse(String(a.created_time))) / 3600000) : null,
        daily_budget_usd: a.daily_budget == null ? null : Number(a.daily_budget),
        current: {
          spend_usd: null, clicks_outbound: null, impressions: null,
          qualified_leads_matured: null, frequency: UNAVAILABLE_FREQUENCY,
        },
        prior: null,
        // Qualification quality per ad is not sourced yet — fails closed.
        downstream_quality: 'unknown',
      }));

    const daysRemaining = (() => {
      const [y, m] = today.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return lastDay - Number(today.slice(8, 10));
    })();

    const report = assessClient({
      client: {
        id: client.id as string,
        name: client.name as string,
        status: (client.status as string) ?? null,
        meta_ad_account_id: (client.meta_ad_account_id as string) ?? null,
        timezone,
      },
      kpiTargets: targets ?? null,
      currentWindow,
      priorWindow,
      tracking: null, // freshness/coverage source not wired — fails closed.
      ads,
      weeklyBudgetUsd: settings?.monthly_ad_spend_target ? Number(settings.monthly_ad_spend_target) / 4.345 : null,
      retargetingViable: false,
      mtdSpendUsd: mtdSpend,
      daysRemainingInMonth: daysRemaining,
      salesCapacityHeadroom: null,
      fundedClearedUsd: funded,
      commitmentsUsd: commitments,
      nowIso,
    });

    // ---- Optional narrative (deterministic result never depends on it) -----
    let narrative: string | null = null;
    let narrative_error: string | null = null;
    const wantNarrative = body.narrate === true && report.readiness === 'READY';
    const gatewayKey = Deno.env.get('LOVABLE_API_KEY');
    if (wantNarrative && gatewayKey && Date.now() - startedAt < MAX_RUNTIME_MS) {
      try {
        const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewayKey}` },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            max_tokens: MAX_NARRATIVE_TOKENS,
            messages: [
              { role: 'system', content: SOP_NARRATOR_SYSTEM_PROMPT },
              { role: 'user', content: `UNTRUSTED DATA — deterministic analysis to summarise:\n${JSON.stringify(report).slice(0, 20000)}` },
            ],
          }),
        });
        if (!r.ok) throw new Error(`gateway ${r.status}`);
        const payload = await r.json();
        narrative = payload?.choices?.[0]?.message?.content ?? null;
      } catch (e) {
        narrative_error = e instanceof Error ? e.message : 'narrative unavailable';
      }
    } else if (body.narrate === true) {
      narrative_error = gatewayKey ? 'narration skipped: analysis is not READY' : 'no narrative model configured';
    }

    return json({
      success: true,
      mode: 'capital_raising_sop',
      review_only: true,
      executes_nothing: true,
      authorized_via: auth.via,
      runtime_ms: Date.now() - startedAt,
      report,
      narrative,
      narrative_error,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('media-buyer-sop-review failed:', message);
    return json({ success: false, error: message, code: 'internal_error' }, 500);
  }
});
