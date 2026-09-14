// Durable delivery of AI-notetaker call summaries into each client's own
// reporting spreadsheet, on a dedicated `AI Calls` tab.
//
// Invariants:
//   * Service-role / operator only. No public surface, no client-supplied ids.
//   * Writes ONLY the `AI Calls` tab — other tabs, formulas and ranges untouched.
//   * One row per meeting record, verified by read-back. Unverified appends stay
//     retryable with bounded backoff; permanent failures stop retrying.
//   * No lead SMS/email is ever sent, and no CRM stage is changed here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeOperator } from '../_shared/operatorAuth.ts';
import {
  AI_CALLS_HEADER,
  AI_CALLS_LAST_COL,
  AI_CALLS_TAB,
  MAX_SHEET_ATTEMPTS,
  buildAiCallRow,
  classifySheetFailure,
  deliverAiCallRow,
  extractSpreadsheetId,
  nextAttemptAt,
} from '../_shared/meetingSheetDelivery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY = 'https://connector-gateway.lovable.dev/google_sheets/v4';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function gwFetch(path: string, init: RequestInit & { qs?: Record<string, string> } = {}) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const gsKey = Deno.env.get('GOOGLE_SHEETS_API_KEY');
  if (!lovableKey || !gsKey) throw new Error('sheets connector env missing');
  const url = new URL(`${GATEWAY}${path}`);
  for (const [k, v] of Object.entries(init.qs ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': gsKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sheets ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const deps = {
  async ensureTab(spreadsheetId: string) {
    const meta = await gwFetch(`/spreadsheets/${spreadsheetId}`);
    const tab = (meta.sheets ?? []).find((s: any) => s.properties?.title === AI_CALLS_TAB);
    if (!tab) {
      await gwFetch(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: AI_CALLS_TAB } } }] }),
      });
    }
    const header = await gwFetch(
      `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${AI_CALLS_TAB}!A1:${AI_CALLS_LAST_COL}1`)}`,
    );
    if (!(header.values?.[0]?.length)) {
      await gwFetch(
        `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${AI_CALLS_TAB}!A1`)}`,
        {
          method: 'PUT',
          qs: { valueInputOption: 'RAW' },
          body: JSON.stringify({ values: [AI_CALLS_HEADER] }),
        },
      );
    }
  },
  async readDeliveredMeetingIds(spreadsheetId: string) {
    const res = await gwFetch(
      `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${AI_CALLS_TAB}!N2:N`)}`,
    );
    return ((res.values ?? []) as string[][]).map((r) => String(r?.[0] ?? '')).filter(Boolean);
  },
  async appendRow(spreadsheetId: string, row: string[]) {
    await gwFetch(
      `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${AI_CALLS_TAB}!A1`)}:append`,
      {
        method: 'POST',
        qs: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' },
        body: JSON.stringify({ values: [row] }),
      },
    );
  },
};

async function processOne(supabase: any, job: any): Promise<Record<string, unknown>> {
  const now = new Date();
  const attempts = Number(job.attempts || 0) + 1;

  const fail = async (message: string) => {
    const kind = classifySheetFailure(message);
    const exhausted = kind === 'permanent' || attempts >= MAX_SHEET_ATTEMPTS;
    await supabase
      .from('meeting_sheet_deliveries')
      .update({
        status: exhausted ? 'failed' : 'pending',
        attempts,
        last_error: message.slice(0, 400),
        next_attempt_at: exhausted ? nextAttemptAt(MAX_SHEET_ATTEMPTS, now) : nextAttemptAt(attempts, now),
        updated_at: now.toISOString(),
      })
      .eq('id', job.id);
    return { meeting_record_id: job.meeting_record_id, status: exhausted ? 'failed' : 'retrying', error: message.slice(0, 200) };
  };

  const { data: record } = await supabase
    .from('meeting_records')
    .select(
      'id, client_id, title, started_at, duration_minutes, summary, recording_url, contact_name, contact_email, ' +
        'ghl_calendar_name, sales_agent_name, guest_invite_job_id',
    )
    .eq('id', job.meeting_record_id)
    .maybeSingle();
  if (!record) return await fail('missing sheet: meeting record no longer exists');
  if (!record.client_id) return await fail('missing sheet: meeting has no resolved client');
  if (!record.guest_invite_job_id) {
    // Unattributed meetings must not be reported against a guessed client.
    return await fail('meeting is not attributed to an appointment yet');
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, kpi_google_sheet_url, metrics_sheet_id')
    .eq('id', record.client_id)
    .maybeSingle();
  const spreadsheetId = client?.metrics_sheet_id || extractSpreadsheetId(client?.kpi_google_sheet_url);
  if (!spreadsheetId) return await fail('missing sheet: client has no reporting spreadsheet configured');

  // QA + disposition come from the client-scoped activity row the gate wrote.
  const { data: activity } = await supabase
    .from('meeting_call_activity')
    .select('qa_total, qa_gate_status, qa_next_step, qa_pipeline_outcome, status, agent_joined_at')
    .eq('client_id', record.client_id)
    .eq('started_at', record.started_at)
    .maybeSingle();

  const row = buildAiCallRow({
    meetingRecordId: record.id,
    clientName: client?.name ?? null,
    startedAt: record.started_at,
    contactName: record.contact_name,
    contactEmail: record.contact_email,
    calendarName: record.ghl_calendar_name,
    salesAgentName: record.sales_agent_name,
    durationMinutes: record.duration_minutes,
    attended: activity ? !!activity.agent_joined_at : null,
    qaTotal: activity?.qa_total ?? null,
    qaGateStatus: activity?.qa_gate_status ?? null,
    disposition: activity?.status ?? null,
    nextStep: typeof activity?.qa_next_step === 'string'
      ? activity.qa_next_step
      : (activity?.qa_next_step as any)?.detail ?? null,
    summary: record.summary,
    recordingUrl: record.recording_url,
    now,
  });

  try {
    const outcome = await deliverAiCallRow({
      spreadsheetId,
      row,
      meetingRecordId: record.id,
      deps,
    });
    if (outcome.status === 'unverified') return await fail('append did not read back');
    await supabase
      .from('meeting_sheet_deliveries')
      .update({
        status: 'delivered',
        attempts,
        spreadsheet_id: spreadsheetId,
        readback_verified: true,
        delivered_at: now.toISOString(),
        last_error: null,
        updated_at: now.toISOString(),
      })
      .eq('id', job.id);
    return { meeting_record_id: record.id, status: outcome.status };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : 'unknown sheet error');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    const auth = await authorizeOperator(req, supabase, createClient, body);
    if (!auth.ok) return jsonResponse({ error: auth.error, code: auth.code }, auth.status);

    if (body.action === 'enqueue_missing') {
      // Backfill: queue attributed meetings that have no delivery row yet.
      const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
      const { data: records } = await supabase
        .from('meeting_records')
        .select('id, client_id')
        .not('client_id', 'is', null)
        .not('guest_invite_job_id', 'is', null)
        .order('started_at', { ascending: false })
        .limit(limit);
      let queued = 0;
      for (const r of records || []) {
        const { error } = await supabase
          .from('meeting_sheet_deliveries')
          .upsert(
            { meeting_record_id: r.id, client_id: r.client_id, status: 'pending', next_attempt_at: new Date().toISOString() },
            { onConflict: 'meeting_record_id', ignoreDuplicates: true },
          );
        if (!error) queued += 1;
      }
      return jsonResponse({ queued, scanned: (records || []).length });
    }

    // Default: run due deliveries (bounded).
    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);
    const { data: jobs } = await supabase
      .from('meeting_sheet_deliveries')
      .select('id, meeting_record_id, client_id, attempts')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(limit);

    const results: unknown[] = [];
    for (const job of jobs || []) results.push(await processOne(supabase, job));
    return jsonResponse({ processed: results.length, results });
  } catch (error: unknown) {
    console.error('[meeting-sheet-delivery] failed:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
