// Pure helpers for the Huddle scorecard strip: pick the Daily (yesterday) or
// Monthly (month-to-date) window and roll daily view rows into totals with
// ratios recomputed from the sums (never averaged).

export type ScorecardMode = 'daily' | 'monthly';

export interface DailyRow {
  date_account_tz: string;
  ad_spend?: number | null;
  leads?: number | null;
  calls?: number | null;
  showed_calls?: number | null;
  commitments?: number | null;
  commitment_dollars?: number | null;
  funded_count?: number | null;
  funded_dollars?: number | null;
}

export interface ScorecardTotals {
  ad_spend: number;
  leads: number;
  calls: number;
  showed_calls: number;
  commitments: number;
  commitment_dollars: number;
  funded_count: number;
  funded_dollars: number;
  cpl: number | null;
  cost_per_call: number | null;
  cost_per_show: number | null;
  show_pct: number | null;
  cost_of_capital_pct: number | null;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface Window { start: string; end: string; label: string }

/** Current + comparison windows. Daily = yesterday vs day before. Monthly = MTD vs same days last month. */
export function scorecardWindows(mode: ScorecardMode, today: Date): { current: Window; prior: Window } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (mode === 'daily') {
    const y = new Date(t); y.setDate(t.getDate() - 1);
    const p = new Date(t); p.setDate(t.getDate() - 2);
    return {
      current: { start: iso(y), end: iso(y), label: 'Yesterday' },
      prior: { start: iso(p), end: iso(p), label: 'day before' },
    };
  }
  const start = new Date(t.getFullYear(), t.getMonth(), 1);
  const priorStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const lastDayPrior = new Date(t.getFullYear(), t.getMonth(), 0).getDate();
  const priorEnd = new Date(t.getFullYear(), t.getMonth() - 1, Math.min(t.getDate(), lastDayPrior));
  return {
    current: { start: iso(start), end: iso(t), label: 'Month to date' },
    prior: { start: iso(priorStart), end: iso(priorEnd), label: 'same days last month' },
  };
}

const n = (v: unknown) => Number(v) || 0;
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function summarize(rows: DailyRow[], w: Window): ScorecardTotals {
  const inWin = rows.filter((r) => r.date_account_tz >= w.start && r.date_account_tz <= w.end);
  const s = (k: keyof DailyRow) => inWin.reduce((acc, r) => acc + n(r[k]), 0);
  const ad_spend = s('ad_spend');
  const leads = s('leads');
  const calls = s('calls');
  const showed_calls = s('showed_calls');
  const funded_dollars = s('funded_dollars');
  return {
    ad_spend,
    leads,
    calls,
    showed_calls,
    commitments: s('commitments'),
    commitment_dollars: s('commitment_dollars'),
    funded_count: s('funded_count'),
    funded_dollars,
    cpl: div(ad_spend, leads),
    cost_per_call: div(ad_spend, calls),
    cost_per_show: div(ad_spend, showed_calls),
    show_pct: calls > 0 ? (showed_calls / calls) * 100 : null,
    cost_of_capital_pct: funded_dollars > 0 ? (ad_spend / funded_dollars) * 100 : null,
  };
}

/** Parse loose raise strings like "3,000,000", "$4M", "10m", "2.5 million". */
export function parseRaiseAmount(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase().replace(/[$,\s]/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|mm|million|b|billion)?$/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'b' || m[2] === 'billion' ? 1e9 : m[2] ? 1e6 : 1;
  const out = base * mult;
  return out > 0 ? out : null;
}
