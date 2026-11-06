/**
 * Weekly Client Report — client-safe document spec (pure).
 * The browser preview and the server PDF both draw this exact spec, so the
 * printed page and the emailed PDF can't drift. Internal exceptions, lead
 * names and contact details are never part of the spec.
 */
import { pctChange, type Metric } from './core.ts';
import type { WeeklyClientReport } from './model.ts';

export type Block =
  | { kind: 'header'; eyebrow: string; title: string; right: string[] }
  | { kind: 'heading'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][]; align?: ('left' | 'right')[]; small?: boolean }
  | { kind: 'stats'; items: { label: string; value: string }[] }
  | { kind: 'progress'; label: string; right: string; ratio: number }
  | { kind: 'creatives'; items: { name: string; image: string | null; lines: string[] }[] }
  | { kind: 'note'; text: string; tone?: 'warn' };

export interface ReportDoc { title: string; pages: Block[][] }

const tag = (m: Metric) => (m.partial ? ' (partial)' : '');
export const fmtMoney = (m: Metric | number | null, d = 0) => {
  const v = typeof m === 'number' || m == null ? m : m.value;
  if (v == null) return 'Unavailable';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}${typeof m === 'object' && m ? tag(m) : ''}`;
};
export const fmtNum = (m: Metric) => (m.value == null ? 'Unavailable' : m.value.toLocaleString('en-US') + tag(m));
const fmtCount = (v: number | null) => (v == null ? 'Unavailable' : v.toLocaleString('en-US'));
export const fmtDelta = (cur: Metric, prev: Metric) => {
  if (cur.partial || prev.partial) return '—';
  const p = pctChange(cur, prev);
  return p == null ? '—' : `${p > 0 ? '+' : ''}${(p * 100).toFixed(0)}%`;
};

export function buildReportDoc(r: WeeklyClientReport): ReportDoc {
  const cur = r.weeks[0], prev = r.weeks[1];
  const cap = r.config.isCapital;
  const showsOn = r.config.trackedCalendarIds.length > 0;
  type Row = [string, Metric, Metric, 'money' | 'num'];
  const rows: Row[] = [
    ['Ad spend', cur.spend, prev.spend, 'money'],
    ['Verified leads', cur.verifiedLeads, prev.verifiedLeads, 'num'],
    ['Cost per lead', cur.cpl, prev.cpl, 'money'],
    ['Booked calls', cur.bookedCalls, prev.bookedCalls, 'num'],
    ['Cost per booked call', cur.cpbc, prev.cpbc, 'money'],
    ...(showsOn ? [['Shows', cur.shows, prev.shows, 'num'], ['Cost per show', cur.costPerShow, prev.costPerShow, 'money']] as Row[] : []),
  ];
  const f = (m: Metric, t: 'money' | 'num') => (t === 'money' ? fmtMoney(m, 2) : fmtNum(m));

  const page1: Block[] = [
    { kind: 'header', eyebrow: 'WEEKLY PERFORMANCE REPORT', title: r.clientName, right: [`Week ${cur.range.from} to ${cur.range.to}`, `vs ${prev.range.from} to ${prev.range.to}`] },
    { kind: 'table', head: ['Metric', 'This week', 'Prior week', 'Change'], align: ['left', 'right', 'right', 'right'], rows: rows.map(([l, c, p, t]) => [l, f(c, t), f(p, t), fmtDelta(c, p)]) },
    { kind: 'heading', text: '4-week trend' },
    { kind: 'table', small: true, head: ['Week of', 'Spend', 'Verified leads', 'CPL', 'Booked'], align: ['left', 'right', 'right', 'right', 'right'],
      rows: [...r.weeks].reverse().map((w) => [w.range.from, fmtMoney(w.spend), fmtNum(w.verifiedLeads), fmtMoney(w.cpl, 2), fmtNum(w.bookedCalls)]) },
  ];
  if (cur.spend.partial) page1.push({ kind: 'note', tone: 'warn', text: `${cur.spend.note}. Figures marked (partial) do not represent the full week.` });
  page1.push({ kind: 'note', text: 'Verified leads are unique CRM contacts with a name and a valid email or phone, excluding spam, tests and duplicates. Booked calls count calendar bookings made during the week. "Unavailable" means the data was missing or not tracked, not zero.' });

  const q = r.quality;
  const page2: Block[] = [
    { kind: 'heading', text: cap ? 'Lead quality & investor funnel' : 'Lead quality & funnel' },
    { kind: 'stats', items: [
      { label: 'New CRM leads', value: fmtCount(q.total) }, { label: 'Verified', value: fmtCount(q.verified) },
      { label: 'Spam', value: fmtCount(q.spam) },
      { label: 'Incomplete / duplicate', value: q.incomplete == null || q.duplicates == null ? 'Unavailable' : fmtCount(q.incomplete + q.duplicates) },
    ] },
    { kind: 'table', head: ['', 'This week'], align: ['left', 'right'], rows: [
      ['Meta form submissions (platform count)', fmtNum(cur.metaFormLeads)],
      ['Verified leads', fmtNum(cur.verifiedLeads)],
      ['Of those, booked a call (lead cohort)', fmtNum(cur.cohortBooked)],
      ...(cap ? [
        ['Stated pipeline interest (prospect estimate)', fmtMoney(cur.pipelineInterest)],
        ['Committed this week', fmtMoney(cur.committed)],
        ['Funded this week (verified)', fmtMoney(cur.funded)],
      ] : []),
    ] },
  ];
  if (cap && r.raise.goal) {
    page2.push({ kind: 'progress', label: 'Raise progress (verified funded)',
      right: `${fmtMoney(r.raise.fundedToDate)} of ${fmtMoney(r.raise.goal)}${r.raise.deadline ? ` - target ${r.raise.deadline}` : ''}`,
      ratio: r.raise.fundedToDate == null ? 0 : Math.min(1, r.raise.fundedToDate / r.raise.goal) });
  }
  if (cap) page2.push({ kind: 'note', text: 'Stated interest is self-reported by prospects and is not a commitment or funding. Figures reflect targeted returns only; investments involve risk, including loss of principal, and past performance does not guarantee future results.' });

  const page3: Block[] = [{ kind: 'heading', text: 'Creative performance' }];
  if (!r.creatives.length) page3.push({ kind: 'note', text: 'Per-ad data unavailable for this week.' });
  else page3.push({ kind: 'creatives', items: r.creatives.map((c) => ({
    name: c.name, image: c.image,
    lines: [`Spend ${fmtMoney(c.spend)}  -  Leads ${c.leads ?? 'Unavailable'}`, `CPL ${fmtMoney(c.cpl, 2)}`],
  })) });
  page3.push({ kind: 'note', text: `Spend and Meta-reported leads per ad for ${cur.range.from} to ${cur.range.to}${r.creativeDays < 7 ? ` (partial: ${r.creativeDays}/7 days of data)` : ''}. Booked or committed results are not shown per ad because they can't be reliably attributed for the week.` });

  return { title: `${r.clientName} weekly report ${cur.range.from}`, pages: [page1, page2, page3] };
}
