import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  AlertTriangle, Bot, CalendarIcon, CheckCircle2, Eye, EyeOff, Loader2, MessageSquarePlus, Printer, RefreshCw, Settings2,
  Sparkles, TrendingDown, TrendingUp, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useWeeklyReportRoster, useClientRangeReport, useReportReviews, useReviewActions,
  type DateRange, type RangeReport, type ReportReview, type RosterEntry,
} from '@/hooks/useWeeklyClientReports';
import { completedWeeks, localDate, pctChange, type Metric } from '@/lib/weeklyReport/core';
import { WeeklyClientReportsTab } from './WeeklyClientReportsTab';

type Preset = 'last7' | 'lastWeek' | 'last14' | 'last30' | 'mtd' | 'lastMonth' | 'custom';
const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
  { id: 'last7', label: 'Last 7d' },
  { id: 'lastWeek', label: 'Last week' },
  { id: 'last14', label: 'Last 14d' },
  { id: 'last30', label: 'Last 30d' },
  { id: 'mtd', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
];

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const shift = (s: string, n: number) => ymd(subDays(parseISO(s), -n));

function presetRange(p: Exclude<Preset, 'custom'>, tz: string): DateRange {
  const today = localDate(new Date(), tz);
  const y = shift(today, -1);
  switch (p) {
    case 'last7': return { from: shift(y, -6), to: y };
    case 'last14': return { from: shift(y, -13), to: y };
    case 'last30': return { from: shift(y, -29), to: y };
    case 'lastWeek': return completedWeeks(new Date(), tz, 1)[0];
    case 'mtd': { const f = ymd(startOfMonth(parseISO(today))); return f > y ? { from: today, to: today } : { from: f, to: y }; }
    case 'lastMonth': { const m = subMonths(parseISO(today), 1); return { from: ymd(startOfMonth(m)), to: ymd(endOfMonth(m)) }; }
  }
}

// ---------- formatting ----------
const money = (v: number | null | undefined, d = 0) => (v == null ? 'N/A' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const compact = (v: number | null | undefined) => {
  if (v == null) return 'N/A';
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (Math.abs(v) >= 1e4) return `$${Math.round(v / 1e3)}K`;
  return money(v);
};
const num = (v: number | null | undefined) => (v == null ? 'N/A' : v.toLocaleString('en-US'));
const mVal = (m: Metric, kind: 'money' | 'money2' | 'num' | 'compact') =>
  m.value == null ? 'N/A' : kind === 'money' ? money(m.value) : kind === 'money2' ? money(m.value, 2) : kind === 'compact' ? compact(m.value) : num(m.value);
const dayLabel = (s: string) => format(parseISO(s), 'EEE M/d');
const rangeLabel = (r: DateRange) => `${format(parseISO(r.from), 'MMMM d')} – ${format(parseISO(r.to), 'MMMM d, yyyy')}`;

const TONE = {
  alert: { cls: 'border-destructive/30 bg-destructive/5', dot: 'bg-destructive', text: 'text-destructive', label: 'Alert' },
  watch: { cls: 'border-warning/30 bg-warning/5', dot: 'bg-warning', text: 'text-warning', label: 'Watch' },
  good: { cls: 'border-success/30 bg-success/5', dot: 'bg-success', text: 'text-success', label: 'Good' },
} as const;

// ---------- page ----------
export function ClientReportingTab() {
  const [view, setView] = useState<'report' | 'setup'>('report');
  const { data: roster, isLoading } = useWeeklyReportRoster();
  const [clientId, setClientId] = useState<string | null>(() => localStorage.getItem('reporting:client'));
  const [preset, setPreset] = useState<Preset>('last7');
  const [custom, setCustom] = useState<{ from?: Date; to?: Date }>({});
  const [showNames, setShowNames] = useState(true);

  useEffect(() => {
    if (!roster?.length) return;
    if (!clientId || !roster.some((r) => r.id === clientId)) setClientId(roster[0].id);
  }, [roster, clientId]);
  useEffect(() => { if (clientId) localStorage.setItem('reporting:client', clientId); }, [clientId]);

  const entry = roster?.find((r) => r.id === clientId) ?? null;
  const tz = entry?.config.timezone ?? 'America/Los_Angeles';
  const range = useMemo<DateRange | null>(() => {
    if (preset !== 'custom') return presetRange(preset, tz);
    return custom.from && custom.to ? { from: ymd(custom.from), to: ymd(custom.to) } : null;
  }, [preset, custom, tz]);

  const report = useClientRangeReport(entry, range);
  const print = () => { document.body.classList.add('printing-report'); window.print(); setTimeout(() => document.body.classList.remove('printing-report'), 500); };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Control bar — sheet-stats style */}
      <div className="no-print relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/[0.06] via-card to-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Analytics</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>Client Reporting</h1>
            <p className="mt-1 text-xs text-muted-foreground">{roster ? `${roster.length} active clients` : 'Loading clients…'} · verified CRM + ad data</p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-muted p-1">
            {(['report', 'setup'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors', view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {v === 'report' ? 'Report' : <span className="inline-flex items-center gap-1"><Settings2 className="h-3 w-3" /> Setup & delivery</span>}
              </button>
            ))}
          </div>
        </div>

        {view === 'report' && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Select value={clientId ?? undefined} onValueChange={setClientId} disabled={isLoading}>
              <SelectTrigger className="h-9 w-[240px] rounded-full bg-background"><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>{roster?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-1 rounded-full bg-muted p-1">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => setPreset(p.id)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors', preset === p.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{p.label}</button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors', preset === 'custom' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    <CalendarIcon className="h-3 w-3" />
                    {preset === 'custom' && range ? `${format(parseISO(range.from), 'MMM d')} – ${format(parseISO(range.to), 'MMM d')}` : 'Custom'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="range" numberOfMonths={2} selected={{ from: custom.from, to: custom.to }}
                    disabled={{ after: new Date() }}
                    onSelect={(r: any) => { setCustom({ from: r?.from, to: r?.to }); if (r?.from && r?.to) setPreset('custom'); }}
                    className={cn('pointer-events-auto p-3')} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setShowNames((s) => !s)}>
                {showNames ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {showNames ? 'Names shown' : 'Names hidden'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => report.refetch()} disabled={report.isFetching} aria-label="Refresh">
                <RefreshCw className={cn('h-3.5 w-3.5', report.isFetching && 'animate-spin')} />
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={print} disabled={!report.data}><Printer className="h-3.5 w-3.5" /> Print / PDF</Button>
            </div>
          </div>
        )}
      </div>

      {view === 'setup' && <WeeklyClientReportsTab />}

      {view === 'report' && (
        <>
          {!range && <p className="text-sm text-muted-foreground">Pick a start and end date.</p>}
          {report.isLoading && <ReportSkeleton />}
          {report.error && <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-6 text-sm">Could not build this report. {(report.error as Error).message}</Card>}
          {report.data && entry && range && (
            <ReportView entry={entry} report={report.data.report} hash={report.data.hash} range={range} showNames={showNames} />
          )}
        </>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

// ---------- report ----------
function ReportView({ entry, report: r, hash, range, showNames }: { entry: RosterEntry; report: RangeReport; hash: string; range: DateRange; showNames: boolean }) {
  const cap = r.config.isCapital;
  const capRows = cap && r.daily.some((d) => d.commits || d.funded);
  const sum = (k: 'spend' | 'leads' | 'booked' | 'showed') => (r.daily.every((d) => d[k] == null) ? null : r.daily.reduce((a, d) => a + (d[k] || 0), 0));
  const tally = (k: 'commits' | 'funded') => (r.daily.every((d) => d[k] == null) ? null : r.daily.reduce((a, d) => ({ n: a.n + (d[k]?.n || 0), amount: a.amount + (d[k]?.amount || 0) }), { n: 0, amount: 0 }));
  const fmtTally = (t: { n: number; amount: number } | null) => (t == null ? 'N/A' : t.n === 0 ? '—' : `${t.n} · ${compact(t.amount)}`);

  return (
    <div id="client-report-print" className="mx-auto max-w-5xl space-y-5">
      {/* Title */}
      <header className="report-section space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{r.clientName} · Performance report</p>
        <h2 className="text-4xl font-semibold tracking-tight" style={{ fontFamily: 'Playfair Display, Georgia, serif' }}>{r.clientName}</h2>
        <p className="text-sm text-muted-foreground">
          {rangeLabel(range)} · {r.sources.length ? r.sources.join(' and ') : 'No connected sources'} · vs {format(parseISO(r.prior.from), 'MMM d')} – {format(parseISO(r.prior.to), 'MMM d')}
        </p>
      </header>

      {cap && <RaiseCard r={r} />}

      {/* KPI cards */}
      <div className={cn('report-section grid grid-cols-2 gap-3', cap ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
        <Kpi neutral label="Ad spend" value={mVal(r.cur.spend, 'money')} m={r.cur.spend} prev={r.prev.spend} note={r.cur.spend.value == null ? r.cur.spend.note : r.cur.spend.partial ? r.cur.spend.note : undefined} />
        <Kpi label="Leads · CPL" value={`${mVal(r.cur.verifiedLeads, 'num')} · ${mVal(r.cur.cpl, 'money2')}`} m={r.cur.verifiedLeads} prev={r.prev.verifiedLeads}
          note={r.cur.verifiedLeads.value == null ? r.cur.verifiedLeads.note : r.cur.metaFormLeads.value != null ? `${r.cur.metaFormLeads.value} Meta form leads` : undefined} />
        <Kpi label="Booked · CPBC" value={`${mVal(r.cur.bookedCalls, 'num')} · ${mVal(r.cur.cpbc, 'money2')}`} m={r.cur.bookedCalls} prev={r.prev.bookedCalls} note={r.cur.bookedCalls.value == null ? r.cur.bookedCalls.note : undefined} />
        <Kpi label="Showed · Cost/show" value={`${mVal(r.cur.shows, 'num')}${r.cur.costPerShow.value != null ? ` · ${mVal(r.cur.costPerShow, 'money')}` : ''}`} m={r.cur.shows} prev={r.prev.shows} note={r.cur.shows.value == null ? r.cur.shows.note : undefined} />
        {cap && <Kpi label="Committed · Funded" value={`${mVal(r.cur.committed, 'compact')} · ${mVal(r.cur.funded, 'compact')}`} m={r.cur.funded} prev={r.prev.funded}
          note={r.cur.committed.value == null ? r.cur.committed.note : r.cur.pipelineInterest.value != null ? `${compact(r.cur.pipelineInterest.value)} stated interest` : undefined} />}
      </div>

      {/* Daily breakdown — sheet style */}
      <Section title="Daily breakdown" right={`${r.days} day${r.days === 1 ? '' : 's'} · ${r.config.timezone.replace('_', ' ')}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pl-2 text-left font-semibold">Date</th>
                <th className="py-2 text-right font-semibold">Spend</th>
                <th className="py-2 text-right font-semibold">Leads</th>
                <th className="py-2 text-right font-semibold">CPL</th>
                <th className="py-2 text-right font-semibold">Booked</th>
                <th className="py-2 text-right font-semibold">Showed</th>
                {capRows && <th className="py-2 text-right font-semibold">Commits</th>}
                {capRows && <th className="py-2 pr-2 text-right font-semibold">Funded</th>}
              </tr>
            </thead>
            <tbody>
              {r.daily.map((d, i) => (
                <tr key={d.date} className={cn('border-b border-border/50', i % 2 === 1 && 'bg-muted/30')}>
                  <td className="py-2 pl-2">{dayLabel(d.date)}</td>
                  <td className="py-2 text-right">{d.spend == null ? <span className="text-muted-foreground">—</span> : money(d.spend)}</td>
                  <td className="py-2 text-right">{num(d.leads)}</td>
                  <td className="py-2 text-right text-muted-foreground">{d.spend != null && d.leads ? money(d.spend / d.leads, 2) : '—'}</td>
                  <td className="py-2 text-right">{num(d.booked)}</td>
                  <td className="py-2 text-right">{d.showed == null ? <span className="text-muted-foreground">—</span> : d.showed || '—'}</td>
                  {capRows && <td className="py-2 text-right">{fmtTally(d.commits)}</td>}
                  {capRows && <td className="py-2 pr-2 text-right">{fmtTally(d.funded)}</td>}
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="py-2.5 pl-2">{r.days}-day total</td>
                <td className="py-2.5 text-right">{money(sum('spend'))}</td>
                <td className="py-2.5 text-right">{num(sum('leads'))}</td>
                <td className="py-2.5 text-right">{mVal(r.cur.cpl, 'money2')}</td>
                <td className="py-2.5 text-right">{num(sum('booked'))}</td>
                <td className="py-2.5 text-right">{num(sum('showed'))}</td>
                {capRows && <td className="py-2.5 text-right">{fmtTally(tally('commits'))}</td>}
                {capRows && <td className="py-2.5 pr-2 text-right">{fmtTally(tally('funded'))}</td>}
              </tr>
              <tr className="text-xs text-muted-foreground">
                <td className="py-2 pl-2">Prior {r.days} days</td>
                <td className="py-2 text-right">{mVal(r.prev.spend, 'money')}</td>
                <td className="py-2 text-right">{mVal(r.prev.verifiedLeads, 'num')}</td>
                <td className="py-2 text-right">{mVal(r.prev.cpl, 'money2')}</td>
                <td className="py-2 text-right">{mVal(r.prev.bookedCalls, 'num')}</td>
                <td className="py-2 text-right">{mVal(r.prev.shows, 'num')}</td>
                {capRows && <td className="py-2 text-right">{mVal(r.prev.committed, 'compact')}</td>}
                {capRows && <td className="py-2 pr-2 text-right">{mVal(r.prev.funded, 'compact')}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Leads are unique CRM contacts with a name and a valid email or phone (spam, tests and duplicates removed). Booked counts bookings made that day. “—” in spend means no synced spend for that day; N/A means not tracked.</p>
      </Section>

      {/* Commitments & funded */}
      {cap && (
        <Section title="Commitments & funded investors" right="This period">
          {r.activity.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{r.cur.committed.value == null ? 'No dated commitment records in the CRM.' : 'No new commitments or funding this period.'}</p>
          ) : (
            <ul className="divide-y">
              {r.activity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', a.kind === 'funded' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>{a.kind === 'funded' ? 'Funded' : 'Commit'}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{showNames && a.name ? a.name : 'Investor'}</p>
                      <p className="text-xs text-muted-foreground">{format(parseISO(a.date), 'EEE M/d')}{a.kind === 'funded' ? ' · verified' : ' · verbal, pending funds'}</p>
                    </div>
                  </div>
                  <p className="font-semibold tabular-nums">{money(a.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Creatives */}
      <Section title="Creative performance" right={r.creativeDays ? `${r.creativeDays}/${r.days} days of ad data` : 'No per-ad data'}>
        {r.creatives.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Per-ad results unavailable for this period{entry.checks.find((c) => c.key === 'metaToken')?.level === 'block' ? ' — ad account access is failing' : ''}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {r.creatives.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl border bg-background">
                {c.image ? <img src={c.image} alt={c.name} className="aspect-square w-full object-cover" loading="lazy" /> : <div className="aspect-square bg-muted" />}
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <div className="grid grid-cols-3 text-[11px] tabular-nums">
                    <div><p className="text-muted-foreground">Spend</p><p className="font-semibold">{money(c.spend)}</p></div>
                    <div><p className="text-muted-foreground">Leads</p><p className="font-semibold">{num(c.leads)}</p></div>
                    <div><p className="text-muted-foreground">CPL</p><p className={cn('font-semibold', c.cpl != null && c.cpl < 100 && 'text-success')}>{c.cpl == null ? '—' : money(c.cpl, 2)}</p></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <AttentionSection r={r} hash={hash} range={range} />

      <p className="report-section px-1 text-[11px] leading-relaxed text-muted-foreground">
        Pulled from {r.sources.length ? r.sources.join(' and ') : 'connected sources'} in the client’s timezone. Leads and booked figures are verified CRM counts; Meta form counts are shown separately. N/A means the data was missing or not tracked — never zero.
        {cap && ' Commitments are verbal until funds are received and are not counted as raised. Figures reflect targeted returns only; investments involve risk, including loss of principal.'}
      </p>
    </div>
  );
}

function RaiseCard({ r }: { r: RangeReport }) {
  const { goal, fundedToDate, fundedInvestors, remaining, deadline, verbalAmount, verbalCount } = r.raise;
  const ratio = goal && fundedToDate != null ? Math.min(1, fundedToDate / goal) : 0;
  return (
    <Card className="report-section rounded-2xl border-border/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold">
          {fundedToDate == null ? 'Raise progress unavailable' : `${money(fundedToDate)} raised`}
          {goal ? <span className="font-normal text-muted-foreground"> of {money(goal)} goal</span> : null}
        </p>
        {goal && fundedToDate != null && <p className="text-sm text-muted-foreground">{(ratio * 100).toFixed(1)}% of goal</p>}
      </div>
      {goal ? (
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70" style={{ width: `${ratio * 100}%` }} />
        </div>
      ) : <p className="mt-1 text-xs text-muted-foreground">Add a raise goal in Setup & delivery to show progress.</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {[fundedInvestors != null ? `${fundedInvestors} funded investor${fundedInvestors === 1 ? '' : 's'}` : null,
          remaining != null ? `${money(remaining)} remaining` : null,
          deadline ? `target close ${format(parseISO(deadline), 'MMM d, yyyy')}` : 'ongoing raise, no fixed close date'].filter(Boolean).join(' · ')}
      </p>
      {verbalAmount != null && verbalAmount > 0 && (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Plus {money(verbalAmount)} in verbal commitments ({verbalCount} investor{verbalCount === 1 ? '' : 's'}) pending funds — not counted toward the bar until received.
        </p>
      )}
    </Card>
  );
}

function Kpi({ label, value, m, prev, note, neutral }: { label: string; value: string; m: Metric; prev: Metric; note?: string; neutral?: boolean }) {
  const d = m.partial || prev.partial ? null : pctChange(m, prev);
  const good = d != null && d > 0;
  return (
    <Card className="relative overflow-hidden rounded-2xl border-border/60 bg-card/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', value.startsWith('N/A') && 'text-muted-foreground')}>{value}</p>
      {m.partial && <Badge variant="outline" className="mt-1 h-5 text-[10px]">Partial</Badge>}
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>}
      {d != null && Math.abs(d) >= 0.005 && (
        <div className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', neutral ? 'bg-muted text-foreground' : good ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
          {d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(d * 100).toFixed(0)}%
          <span className="font-normal text-muted-foreground">vs prior</span>
        </div>
      )}
    </Card>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <Card className="report-section rounded-2xl border-border/60 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {right && <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{right}</p>}
      </div>
      {children}
    </Card>
  );
}

// ---------- attention: system checks + AI + agents + team ----------
function AttentionSection({ r, hash, range }: { r: RangeReport; hash: string; range: DateRange }) {
  const reviews = useReportReviews(r.clientId, range);
  const { aiReview, addNote } = useReviewActions(r.clientId, range);
  const [noting, setNoting] = useState(false);
  const exact = (reviews.data || []).filter((v) => v.range_from === range.from && v.range_to === range.to);
  const latestAi = exact.find((v) => v.author_kind === 'ai');
  const others = exact.filter((v) => v.author_kind !== 'ai').slice(0, 6);

  const run = () => aiReview.mutate(undefined, { onError: (e) => toast.error((e as Error).message), onSuccess: () => toast.success('AI review updated') });

  return (
    <Section title="What needs attention" right="Checks · AI · agents · team">
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={run} disabled={aiReview.isPending}>
          {aiReview.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {latestAi ? 'Re-run AI review' : 'Run AI review'}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNoting((n) => !n)}><MessageSquarePlus className="h-3.5 w-3.5" /> Add note</Button>
        {reviews.error && <p className="self-center text-xs text-muted-foreground">Review notes unavailable right now.</p>}
      </div>
      {noting && <NoteForm pending={addNote.isPending} onCancel={() => setNoting(false)} onSave={(item) => addNote.mutate(item, { onSuccess: () => { setNoting(false); toast.success('Note added'); }, onError: (e) => toast.error((e as Error).message) })} />}

      <div className="space-y-2">
        {latestAi && <ReviewBlock review={latestAi} stale={!!latestAi.facts_hash && latestAi.facts_hash !== hash} />}
        {others.map((v) => <ReviewBlock key={v.id} review={v} stale={false} />)}
        {r.attention.map((a, i) => <Item key={`s${i}`} tone={a.tone} title={a.title} detail={a.detail} />)}
      </div>
    </Section>
  );
}

function ReviewBlock({ review, stale }: { review: ReportReview; stale: boolean }) {
  const Icon = review.author_kind === 'ai' ? Sparkles : review.author_kind === 'agent' ? Bot : User;
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{review.author_name || (review.author_kind === 'ai' ? 'AI review' : 'Note')}</span>
        <span>· {format(new Date(review.created_at), 'MMM d, h:mm a')}</span>
        {stale && <Badge variant="outline" className="h-5 gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> Data changed since review</Badge>}
      </div>
      {review.summary && <p className="text-sm">{review.summary}</p>}
      {review.items.map((it, i) => <Item key={i} tone={it.tone} title={it.title} detail={it.detail} />)}
    </div>
  );
}

function Item({ tone, title, detail }: { tone: keyof typeof TONE; title: string; detail: string }) {
  const t = TONE[tone] ?? TONE.watch;
  return (
    <div className={cn('flex gap-3 rounded-lg border p-3', t.cls)}>
      {tone === 'good' ? <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', t.text)} /> : <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', t.dot)} />}
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function NoteForm({ onSave, onCancel, pending }: { onSave: (i: { tone: keyof typeof TONE; title: string; detail: string }) => void; onCancel: () => void; pending: boolean }) {
  const [tone, setTone] = useState<keyof typeof TONE>('watch');
  const [title, setTitle] = useState(''); const [detail, setDetail] = useState('');
  return (
    <div className="no-print mb-3 space-y-2 rounded-xl border bg-muted/30 p-3">
      <div className="flex gap-2">
        <Select value={tone} onValueChange={(v) => setTone(v as keyof typeof TONE)}>
          <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(TONE) as (keyof typeof TONE)[]).map((k) => <SelectItem key={k} value={k}>{TONE[k].label}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="What needs attention?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </div>
      <Textarea placeholder="Details (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} rows={2} />
      <div className="flex gap-2">
        <Button size="sm" disabled={!title.trim() || pending} onClick={() => onSave({ tone, title: title.trim(), detail: detail.trim() })}>Save note</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
