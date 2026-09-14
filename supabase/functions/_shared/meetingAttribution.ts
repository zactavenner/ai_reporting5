/**
 * Deterministic attribution of a recorded MeetGeek meeting back to the
 * notetaker invite job that created it.
 *
 * Authoritative identifiers ONLY. Match order (first hit wins):
 *   1. The server-minted invite UID embedded in the meeting title/description,
 *      and only when the job belongs to the meeting's client.
 *   2. Scheduling-window overlap (±30 min) PLUS the identical join URL, inside
 *      one known client.
 *   3. Scheduling-window overlap PLUS the exact structured invite summary,
 *      inside one known client.
 *
 * There is deliberately NO time-only and NO title-only path, and no path that
 * can cross clients: a meeting with no resolved client, or 0/2+ candidates, is
 * left unattributed with an explicit reason.
 */
const WINDOW_MS = 30 * 60 * 1000;

export interface AttributionOutcome {
  ok: boolean;
  method: string | null;
  job_id?: string;
  reason?: string;
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/https?:\/\/[^\s<>"']+/);
  if (!m) return null;
  return m[0].replace(/[.,;)]+$/, '').toLowerCase();
}

export function normalizeTitle(title: string | null | undefined): string {
  return String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface AttributionCandidate {
  id: string;
  client_id?: string | null;
  invite_uid?: string | null;
  invite_summary?: string | null;
  meeting_url?: string | null;
}

export interface AttributionSubject {
  client_id?: string | null;
  title?: string | null;
  summary?: string | null;
  source_url?: string | null;
  recording_url?: string | null;
}

/**
 * Pure candidate selection, shared by the live path and the tests. `uidJob` is
 * the row looked up by the invite UID found in the meeting text (if any).
 */
export function chooseAttributionCandidate(args: {
  meeting: AttributionSubject;
  uidJob?: AttributionCandidate | null;
  windowCandidates: AttributionCandidate[];
}): { job: AttributionCandidate | null; method: string | null; reason?: string } {
  const clientId = args.meeting.client_id || null;

  if (args.uidJob) {
    // A UID is authoritative, but must never pull a meeting into another client.
    if (clientId && args.uidJob.client_id && args.uidJob.client_id !== clientId) {
      return { job: null, method: null, reason: 'uid_client_mismatch' };
    }
    return { job: args.uidJob, method: 'invite_uid' };
  }

  if (!clientId) return { job: null, method: null, reason: 'client_unresolved' };

  const candidates = (args.windowCandidates || []).filter((c) => c.client_id === clientId);
  if (!candidates.length) return { job: null, method: null, reason: 'no_candidate' };

  const url = normalizeUrl(args.meeting.source_url) || normalizeUrl(args.meeting.recording_url);
  const byUrl = url ? candidates.filter((c) => normalizeUrl(c.meeting_url) === url) : [];
  if (byUrl.length === 1) return { job: byUrl[0], method: 'window_and_url' };
  if (byUrl.length > 1) return { job: null, method: null, reason: 'ambiguous_candidates' };

  const title = normalizeTitle(args.meeting.title);
  const byTitle = title
    ? candidates.filter((c) => normalizeTitle(c.invite_summary) === title)
    : [];
  if (byTitle.length === 1) return { job: byTitle[0], method: 'window_and_invite_summary' };
  if (byTitle.length > 1) return { job: null, method: null, reason: 'ambiguous_candidates' };

  // Time overlap alone is NEVER sufficient.
  return {
    job: null,
    method: null,
    reason: candidates.length > 1 ? 'ambiguous_candidates' : 'time_only_insufficient',
  };
}

export async function attributeMeetingRecord(supabase: any, meetingRecordId: string): Promise<AttributionOutcome> {
  const { data: meeting } = await supabase
    .from('meeting_records')
    .select('id, client_id, title, summary, started_at, ended_at, source_url, recording_url, guest_invite_job_id')
    .eq('id', meetingRecordId)
    .maybeSingle();
  if (!meeting) return { ok: false, method: null, reason: 'meeting_not_found' };
  if (meeting.guest_invite_job_id) return { ok: true, method: 'already_attributed', job_id: meeting.guest_invite_job_id };

  const haystack = `${meeting.title || ''} ${meeting.summary || ''}`;
  const uidMatch = haystack.match(
    /hpa-mg-[0-9a-f-]{36}-[A-Za-z0-9._-]+@reporting\.highperformanceads\.com/i,
  );

  const select =
    'id, client_id, ghl_appointment_id, ghl_calendar_id, ghl_calendar_name, ghl_location_id, ghl_contact_id, ' +
    'contact_name, contact_email, assigned_user_id, assigned_user_name, invite_summary, invite_uid, ' +
    'scheduled_start, scheduled_end, meeting_url';

  let uidJob: any = null;
  if (uidMatch) {
    const { data } = await supabase
      .from('meetgeek_guest_invite_jobs')
      .select(select)
      .eq('invite_uid', uidMatch[0])
      .maybeSingle();
    uidJob = data || null;
  }

  const startMs = meeting.started_at ? Date.parse(meeting.started_at) : NaN;
  let windowCandidates: any[] = [];
  if (!uidJob && Number.isFinite(startMs) && meeting.client_id) {
    const { data } = await supabase
      .from('meetgeek_guest_invite_jobs')
      .select(select)
      .eq('client_id', meeting.client_id)
      .gte('scheduled_start', new Date(startMs - WINDOW_MS).toISOString())
      .lte('scheduled_start', new Date(startMs + WINDOW_MS).toISOString())
      .limit(25);
    windowCandidates = data || [];
  }

  const chosen = chooseAttributionCandidate({
    meeting: meeting as AttributionSubject,
    uidJob,
    windowCandidates,
  });
  const job: any = chosen.job;
  const method = chosen.method;

  if (!job) {
    return { ok: false, method: null, reason: chosen.reason || 'no_candidate' };
  }


  await supabase
    .from('meeting_records')
    .update({
      guest_invite_job_id: job.id,
      client_id: meeting.client_id || job.client_id,
      ghl_appointment_id: job.ghl_appointment_id,
      ghl_calendar_id: job.ghl_calendar_id,
      ghl_calendar_name: job.ghl_calendar_name,
      ghl_location_id: job.ghl_location_id,
      ghl_contact_id: job.ghl_contact_id,
      contact_name: job.contact_name,
      contact_email: job.contact_email,
      sales_agent_id: job.assigned_user_id,
      sales_agent_name: job.assigned_user_name,
      attribution_method: method,
      attributed_at: new Date().toISOString(),
    })
    .eq('id', meeting.id);

  // Reschedules/cancels update this SAME job row, so the link stays 1:1.
  await supabase
    .from('meetgeek_guest_invite_jobs')
    .update({ meeting_record_id: meeting.id, matched_at: new Date().toISOString(), match_method: method })
    .eq('id', job.id);

  return { ok: true, method, job_id: job.id };
}

/** Backfill/sweep: attribute recent meetings that have no job link yet. */
export async function attributeRecentMeetings(supabase: any, limit = 100): Promise<{ scanned: number; attributed: number }> {
  const { data } = await supabase
    .from('meeting_records')
    .select('id')
    .is('guest_invite_job_id', null)
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  let attributed = 0;
  for (const row of data || []) {
    const res = await attributeMeetingRecord(supabase, row.id);
    if (res.ok && res.method !== 'already_attributed') attributed += 1;
  }
  return { scanned: (data || []).length, attributed };
}
