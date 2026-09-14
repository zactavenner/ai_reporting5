import { describe, it, expect } from 'vitest';
import { chooseAttributionCandidate } from '../../supabase/functions/_shared/meetingAttribution';
import {
  buildDiagnosticsReport,
  classifyProbe,
} from '../../supabase/functions/_shared/meetgeekDiagnostics';
import {
  AI_CALLS_HEADER,
  buildAiCallRow,
  classifySheetFailure,
  deliverAiCallRow,
  extractSpreadsheetId,
  nextAttemptAt,
} from '../../supabase/functions/_shared/meetingSheetDelivery';

describe('attribution uses authoritative identity only', () => {
  const base = { client_id: 'c1', title: 'Discovery — Jane', source_url: 'https://zoom.us/j/1' };

  it('never attributes on time overlap alone', () => {
    const res = chooseAttributionCandidate({
      meeting: { client_id: 'c1', title: 'Some untitled call' },
      windowCandidates: [{ id: 'j1', client_id: 'c1', meeting_url: 'https://zoom.us/j/9' }],
    });
    expect(res.job).toBeNull();
    expect(res.reason).toBe('time_only_insufficient');
  });

  it('matches on window + identical join URL', () => {
    const res = chooseAttributionCandidate({
      meeting: base,
      windowCandidates: [
        { id: 'j1', client_id: 'c1', meeting_url: 'https://ZOOM.us/j/1' },
        { id: 'j2', client_id: 'c1', meeting_url: 'https://zoom.us/j/2' },
      ],
    });
    expect(res.job?.id).toBe('j1');
    expect(res.method).toBe('window_and_url');
  });

  it('matches on window + exact invite summary when no URL evidence exists', () => {
    const res = chooseAttributionCandidate({
      meeting: { client_id: 'c1', title: '[ACME] Discovery — Jane' },
      windowCandidates: [{ id: 'j1', client_id: 'c1', invite_summary: '[ACME] Discovery — Jane' }],
    });
    expect(res.method).toBe('window_and_invite_summary');
  });

  it('never crosses clients, even with a matching UID', () => {
    const res = chooseAttributionCandidate({
      meeting: base,
      uidJob: { id: 'other', client_id: 'c2' },
      windowCandidates: [],
    });
    expect(res.job).toBeNull();
    expect(res.reason).toBe('uid_client_mismatch');
  });

  it('refuses to attribute when the client is unresolved', () => {
    const res = chooseAttributionCandidate({
      meeting: { client_id: null, title: 'Discovery' },
      windowCandidates: [{ id: 'j1', client_id: 'c1', invite_summary: 'Discovery' }],
    });
    expect(res.reason).toBe('client_unresolved');
  });

  it('reports ambiguity instead of guessing', () => {
    const res = chooseAttributionCandidate({
      meeting: base,
      windowCandidates: [
        { id: 'j1', client_id: 'c1', meeting_url: 'https://zoom.us/j/1' },
        { id: 'j2', client_id: 'c1', meeting_url: 'https://zoom.us/j/1' },
      ],
    });
    expect(res.reason).toBe('ambiguous_candidates');
  });
});

describe('provider diagnostics', () => {
  it('classifies every failure class safely', () => {
    expect(classifyProbe({ ok: false }, false)).toBe('missing_api_key');
    expect(classifyProbe({ ok: false, status: 401 }, true)).toBe('unauthorized');
    expect(classifyProbe({ ok: false, status: 429 }, true)).toBe('rate_limited');
    expect(classifyProbe({ ok: false, status: 503 }, true)).toBe('server_error');
    expect(classifyProbe({ ok: false, errorKind: 'network' }, true)).toBe('network_error');
    expect(classifyProbe({ ok: true, status: 200 }, true)).toBe('ok');
  });

  it('names the operator blocker for a rejected credential', () => {
    const report = buildDiagnosticsReport({
      apiKeyConfigured: true,
      region: 'eu',
      regionSource: 'explicit',
      list: { ok: false, status: 403 },
      meetingReads: [],
    });
    expect(report.conclusion).toBe('credential_rejected');
    expect(report.blockers.join(' ')).toMatch(/region-specific/i);
    expect(JSON.stringify(report)).not.toMatch(/Bearer|api_key"?\s*:\s*"[^"]/i);
  });

  it('separates "reachable but empty" from healthy', () => {
    expect(
      buildDiagnosticsReport({
        apiKeyConfigured: true, region: 'eu', regionSource: 'probe',
        list: { ok: true, status: 200, count: 0 }, meetingReads: [],
      }).conclusion,
    ).toBe('reachable_no_meetings');
    expect(
      buildDiagnosticsReport({
        apiKeyConfigured: true, region: 'us', regionSource: 'probe',
        list: { ok: true, status: 200, count: 4 },
        meetingReads: [{ ok: true, status: 200 }],
      }).conclusion,
    ).toBe('healthy');
  });
});

describe('reporting-sheet delivery', () => {
  it('builds a row matching the header contract with the meeting id in column N', () => {
    const row = buildAiCallRow({
      meetingRecordId: 'm1',
      clientName: 'Acme',
      startedAt: '2026-03-02T16:00:00Z',
      contactName: 'Jane Doe',
      durationMinutes: 31.4,
      attended: true,
      qaTotal: 78,
      qaGateStatus: 'pass',
      summary: 'Discussed  the   offer',
      now: new Date('2026-03-02T17:00:00Z'),
    });
    expect(row.length).toBe(AI_CALLS_HEADER.length);
    expect(row[13]).toBe('m1');
    expect(row[5]).toBe('31');
    expect(row[11]).toBe('Discussed the offer');
  });

  it('is idempotent: an already-present meeting is never appended twice', async () => {
    const sheet: string[][] = [['m1']];
    let appends = 0;
    const res = await deliverAiCallRow({
      spreadsheetId: 's1',
      row: buildAiCallRow({ meetingRecordId: 'm1' }),
      meetingRecordId: 'm1',
      deps: {
        ensureTab: async () => {},
        readDeliveredMeetingIds: async () => sheet.map((r) => r[0]),
        appendRow: async () => { appends += 1; },
      },
    });
    expect(res.status).toBe('duplicate');
    expect(appends).toBe(0);
  });

  it('treats an append that does not read back as unverified (retryable)', async () => {
    const res = await deliverAiCallRow({
      spreadsheetId: 's1',
      row: buildAiCallRow({ meetingRecordId: 'm2' }),
      meetingRecordId: 'm2',
      deps: {
        ensureTab: async () => {},
        readDeliveredMeetingIds: async () => [],
        appendRow: async () => {},
      },
    });
    expect(res.status).toBe('unverified');
  });

  it('confirms delivery only on read-back', async () => {
    const rows: string[] = [];
    const res = await deliverAiCallRow({
      spreadsheetId: 's1',
      row: buildAiCallRow({ meetingRecordId: 'm3' }),
      meetingRecordId: 'm3',
      deps: {
        ensureTab: async () => {},
        readDeliveredMeetingIds: async () => [...rows],
        appendRow: async () => { rows.push('m3'); },
      },
    });
    expect(res.status).toBe('delivered');
  });

  it('splits permanent from retryable failures and backs off within bounds', () => {
    expect(classifySheetFailure('sheets 429: quota')).toBe('retryable');
    expect(classifySheetFailure('sheets 503: unavailable')).toBe('retryable');
    expect(classifySheetFailure('sheets 404: not found')).toBe('permanent');
    expect(classifySheetFailure('missing sheet: client has no reporting spreadsheet configured')).toBe('permanent');

    const now = new Date('2026-03-02T00:00:00Z');
    const first = Date.parse(nextAttemptAt(1, now)) - now.getTime();
    const later = Date.parse(nextAttemptAt(9, now)) - now.getTime();
    expect(first).toBe(2 * 60_000);
    expect(later).toBe(60 * 60_000);
  });

  it('extracts the spreadsheet id from a sheet URL', () => {
    expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/AbC-123_x/edit#gid=0')).toBe('AbC-123_x');
    expect(extractSpreadsheetId(null)).toBeNull();
  });
});
