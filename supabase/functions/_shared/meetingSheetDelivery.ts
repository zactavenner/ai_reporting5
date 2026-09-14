// Durable per-meeting delivery of an AI-notetaker call summary into the client's
// own reporting spreadsheet.
//
// Rules baked in here:
//   * Writes ONLY to a dedicated `AI Calls` tab. Other tabs, formulas and
//     ranges in the client's sheet are never touched.
//   * One row per meeting record. The meeting id lives in a stable column so a
//     retry can detect its own prior row instead of appending a duplicate.
//   * Every append is verified by reading the row back; an unverified append is
//     retryable, never silently "delivered".
//   * Bounded exponential backoff with a permanent/retryable split, so a bad
//     sheet URL stops retrying while a 429 keeps trying.

export const AI_CALLS_TAB = 'AI Calls';

export const AI_CALLS_HEADER = [
  'Meeting Date',
  'Client',
  'Contact',
  'Calendar',
  'Sales Agent',
  'Duration (min)',
  'Attended',
  'QA Score',
  'QA Gate',
  'Disposition',
  'Next Step',
  'Summary',
  'Recording',
  'Meeting ID',
  'Delivered At',
];

export const AI_CALLS_MEETING_ID_COLUMN_INDEX = 13; // zero-based, matches header
export const AI_CALLS_LAST_COL = 'O'; // 15 columns

export interface AiCallRowInput {
  meetingRecordId: string;
  clientName?: string | null;
  startedAt?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  calendarName?: string | null;
  salesAgentName?: string | null;
  durationMinutes?: number | null;
  attended?: boolean | null;
  qaTotal?: number | null;
  qaGateStatus?: string | null;
  disposition?: string | null;
  nextStep?: string | null;
  summary?: string | null;
  recordingUrl?: string | null;
  now?: Date;
}

const SUMMARY_MAX = 2000;

function clean(value: unknown, max = 300): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Pure row builder — column order is contractual with AI_CALLS_HEADER. */
export function buildAiCallRow(input: AiCallRowInput): string[] {
  const now = input.now ?? new Date();
  return [
    input.startedAt ? new Date(input.startedAt).toISOString() : '',
    clean(input.clientName, 120),
    clean(input.contactName) || clean(input.contactEmail),
    clean(input.calendarName, 120),
    clean(input.salesAgentName, 120),
    input.durationMinutes == null ? '' : String(Math.round(input.durationMinutes)),
    input.attended == null ? '' : input.attended ? 'yes' : 'no',
    input.qaTotal == null ? '' : String(input.qaTotal),
    clean(input.qaGateStatus, 40),
    clean(input.disposition, 60),
    clean(input.nextStep, 300),
    clean(input.summary, SUMMARY_MAX),
    clean(input.recordingUrl, 500),
    input.meetingRecordId,
    now.toISOString(),
  ];
}

/** Retryable vs permanent. A permanent failure must stop consuming retries. */
export function classifySheetFailure(message: string): 'retryable' | 'permanent' {
  const m = String(message || '').toLowerCase();
  if (/no reporting sheet|missing sheet|invalid spreadsheet|not a valid|connector env missing/.test(m)) {
    return 'permanent';
  }
  const status = m.match(/sheets (\d{3})/);
  if (status) {
    const code = Number(status[1]);
    if (code === 429 || code >= 500) return 'retryable';
    if (code === 401 || code === 403 || code === 404 || code === 400) return 'permanent';
  }
  return 'retryable';
}

export const MAX_SHEET_ATTEMPTS = 6;

/** Bounded exponential backoff: 2m, 4m, 8m, 16m, 32m, capped at 60m. */
export function nextAttemptAt(attempts: number, now: Date = new Date()): string {
  const minutes = Math.min(60, 2 ** Math.max(1, attempts));
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export interface SheetDeliveryDeps {
  /** Existing meeting-id values already present in the tab. */
  readDeliveredMeetingIds(spreadsheetId: string): Promise<string[]>;
  ensureTab(spreadsheetId: string): Promise<void>;
  appendRow(spreadsheetId: string, row: string[]): Promise<void>;
}

export type SheetDeliveryOutcome =
  | { status: 'delivered' }
  | { status: 'duplicate' }
  | { status: 'unverified' };

/**
 * Idempotent single-meeting delivery. Returns `duplicate` when the meeting is
 * already in the tab and `unverified` when the append did not read back — the
 * caller keeps an unverified delivery retryable.
 */
export async function deliverAiCallRow(args: {
  spreadsheetId: string;
  row: string[];
  meetingRecordId: string;
  deps: SheetDeliveryDeps;
}): Promise<SheetDeliveryOutcome> {
  const { spreadsheetId, row, meetingRecordId, deps } = args;
  await deps.ensureTab(spreadsheetId);

  const before = await deps.readDeliveredMeetingIds(spreadsheetId);
  if (before.includes(meetingRecordId)) return { status: 'duplicate' };

  await deps.appendRow(spreadsheetId, row);

  const after = await deps.readDeliveredMeetingIds(spreadsheetId);
  return after.includes(meetingRecordId) ? { status: 'delivered' } : { status: 'unverified' };
}

export function extractSpreadsheetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}
