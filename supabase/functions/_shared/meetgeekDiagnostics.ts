// Server-only MeetGeek provider diagnostics.
//
// Answers ONE question with evidence: can this deployment authenticate against
// MeetGeek and read meetings right now? It reports credential presence, the
// resolved region, HTTP status classes and counts only. It NEVER returns or logs
// the API key, a provider response body, participant emails or meeting content.

export type MeetgeekDiagnosticCode =
  | 'ok'
  | 'missing_api_key'
  | 'unauthorized'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'parse_error'
  | 'empty_response';

export interface MeetgeekProbeOutcome {
  ok: boolean;
  status?: number | null;
  errorKind?: 'network' | 'parse' | null;
  /** Count of items returned by a list probe (never the items themselves). */
  count?: number | null;
}

/** Maps a probe outcome to a safe, stable code. */
export function classifyProbe(probe: MeetgeekProbeOutcome, apiKeyPresent: boolean): MeetgeekDiagnosticCode {
  if (!apiKeyPresent) return 'missing_api_key';
  if (probe.errorKind === 'network') return 'network_error';
  if (probe.errorKind === 'parse') return 'parse_error';
  const s = Number(probe.status || 0);
  if (probe.ok) return 'ok';
  if (s === 401 || s === 403) return 'unauthorized';
  if (s === 404) return 'not_found';
  if (s === 429) return 'rate_limited';
  if (s >= 500) return 'server_error';
  if (!s) return 'empty_response';
  return 'server_error';
}

export interface MeetgeekDiagnosticsReport {
  api_key_configured: boolean;
  region: string | null;
  region_source: 'explicit' | 'probe' | 'unresolved';
  list: { code: MeetgeekDiagnosticCode; http_status: number | null; meeting_count: number | null };
  /** Per-code counts for the sampled individual meeting reads. */
  meeting_reads: Record<string, number>;
  /** What an operator must do next, in one short phrase. */
  conclusion:
    | 'no_api_key'
    | 'credential_rejected'
    | 'provider_unavailable'
    | 'rate_limited'
    | 'reachable_no_meetings'
    | 'healthy';
  blockers: string[];
}

/** Pure report assembly, so the conclusion logic is directly testable. */
export function buildDiagnosticsReport(input: {
  apiKeyConfigured: boolean;
  region: string | null;
  regionSource: 'explicit' | 'probe' | 'unresolved';
  list: MeetgeekProbeOutcome;
  meetingReads: MeetgeekProbeOutcome[];
}): MeetgeekDiagnosticsReport {
  const listCode = classifyProbe(input.list, input.apiKeyConfigured);
  const reads: Record<string, number> = {};
  for (const r of input.meetingReads) {
    const code = classifyProbe(r, input.apiKeyConfigured);
    reads[code] = (reads[code] || 0) + 1;
  }

  const blockers: string[] = [];
  let conclusion: MeetgeekDiagnosticsReport['conclusion'];
  if (!input.apiKeyConfigured) {
    conclusion = 'no_api_key';
    blockers.push('No MeetGeek API key is configured server-side.');
  } else if (listCode === 'unauthorized') {
    conclusion = 'credential_rejected';
    blockers.push(
      'MeetGeek rejected the stored API key. Keys are region-specific — confirm the key was issued for the pinned region.',
    );
  } else if (listCode === 'rate_limited') {
    conclusion = 'rate_limited';
    blockers.push('MeetGeek is rate limiting this key; hydration will retry.');
  } else if (listCode !== 'ok') {
    conclusion = 'provider_unavailable';
    blockers.push(`MeetGeek meeting list failed (${listCode}).`);
  } else if (!input.list.count) {
    conclusion = 'reachable_no_meetings';
    blockers.push('Authentication works but this account has no meetings the key can see.');
  } else if (reads.unauthorized) {
    conclusion = 'credential_rejected';
    blockers.push('Individual meeting reads are unauthorized even though the list call succeeded.');
  } else {
    conclusion = 'healthy';
  }

  return {
    api_key_configured: input.apiKeyConfigured,
    region: input.region,
    region_source: input.regionSource,
    list: {
      code: listCode,
      http_status: input.list.status ?? null,
      meeting_count: input.list.count ?? null,
    },
    meeting_reads: reads,
    conclusion,
    blockers,
  };
}
