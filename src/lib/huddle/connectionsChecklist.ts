/**
 * Status rules for the Huddle "Connections, Offer & Files" checklist.
 * Every row resolves to one of three states so the card reads the same way
 * top to bottom: green = set and current, amber = set but stale/partial,
 * red = missing.
 */
export type RowState = 'ok' | 'warn' | 'missing';

/** A sync older than this is considered stale. */
export const SYNC_STALE_HOURS = 24;

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

/** Newest of several timestamps, or null when none are set. */
export function newest(...values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v || Number.isNaN(ts(v))) continue;
    if (!best || ts(v) > ts(best)) best = v;
  }
  return best;
}

export function syncState(lastSyncAt: string | null | undefined, now = Date.now()): RowState {
  const t = ts(lastSyncAt);
  if (Number.isNaN(t)) return 'missing';
  return now - t <= SYNC_STALE_HOURS * 3_600_000 ? 'ok' : 'warn';
}

export function offerState(offers: { status?: string | null; is_primary?: boolean | null }[]): RowState {
  const live = offers.filter((o) => o.status !== 'archived');
  if (live.length === 0) return 'missing';
  return live.some((o) => o.is_primary) ? 'ok' : 'warn';
}

export function metaState(
  accounts: { status?: string | null; last_sync_error?: string | null }[],
  lastSyncAt: string | null | undefined,
  now = Date.now(),
): RowState {
  const linked = accounts.filter((a) => a.status !== 'disconnected');
  if (linked.length === 0) return 'missing';
  const s = syncState(lastSyncAt, now);
  if (s === 'missing') return 'missing';
  if (linked.some((a) => a.last_sync_error)) return 'warn';
  return s;
}

export function crmState(
  { connected, lastSyncAt, error }: { connected: boolean; lastSyncAt: string | null | undefined; error?: string | null },
  now = Date.now(),
): RowState {
  if (!connected) return 'missing';
  const s = syncState(lastSyncAt, now);
  if (s === 'missing') return 'missing';
  return error ? 'warn' : s;
}

export interface PipelineMapping {
  calendars: number;
  committedStages: number;
  fundedPipeline: boolean;
  fundedStages: number;
  /** HubSpot books through meetings, not tracked calendars. Defaults to true (GoHighLevel). */
  calendarsRequired?: boolean;
}

/** The mappings reporting needs: booked-call calendars (GHL), committed stages, funded pipeline + stages. */
export function pipelineChecks(m: PipelineMapping) {
  const checks = [
    { key: 'calendars', label: 'Booked-call calendars', ok: m.calendars > 0, count: m.calendars },
    { key: 'committed', label: 'Committed stages', ok: m.committedStages > 0, count: m.committedStages },
    { key: 'funded', label: 'Funded pipeline & stages', ok: m.fundedPipeline && m.fundedStages > 0, count: m.fundedStages },
  ];
  return m.calendarsRequired === false ? checks.filter((c) => c.key !== 'calendars') : checks;
}

export function pipelineState(m: PipelineMapping): RowState {
  const checks = pipelineChecks(m);
  const done = checks.filter((c) => c.ok).length;
  if (done === checks.length) return 'ok';
  return done === 0 ? 'missing' : 'warn';
}
