import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileText, Lock, Printer, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWeeklyReportRoster, useWeeklyClientReport, type RosterEntry } from '@/hooks/useWeeklyClientReports';
import { pctChange, type Metric, type ReadinessCheck } from '@/lib/weeklyReport/core';
import { cn } from '@/lib/utils';

const money = (m: Metric | number | null, d = 0) => {
  const v = typeof m === 'number' || m == null ? m : m.value;
  return v == null ? 'Unavailable' : `$${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const num = (m: Metric) => (m.value == null ? 'Unavailable' : m.value.toLocaleString());

function Level({ level }: { level: ReadinessCheck['level'] }) {
  if (level === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  if (level === 'warn') return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
}

export function WeeklyClientReportsTab() {
  const { data: roster, isLoading, error } = useWeeklyReportRoster();
  const [preview, setPreview] = useState<RosterEntry | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Weekly Client Reports</h1>
          <p className="text-sm text-muted-foreground">Monday draft for the last completed Mon–Sun vs the week before, in each client's timezone.</p>
        </div>
        <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Delivery not armed — preview & print only</Badge>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading active clients…</p>}
      {error && <p className="text-sm text-destructive">Could not load clients.</p>}
      {roster && <p className="text-xs text-muted-foreground">{roster.length} active clients</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {roster?.map((r) => {
          const blocks = r.checks.filter((c) => c.level === 'block').length;
          const warns = r.checks.filter((c) => c.level === 'warn').length;
          return (
            <div key={r.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.config.isCapital ? 'Capital raise' : 'Lead gen'} · {r.config.timezone}</p>
                </div>
                <Badge variant={blocks ? 'destructive' : 'secondary'}>{blocks ? `${blocks} blocking` : warns ? `${warns} to review` : 'Ready'}</Badge>
              </div>
              <ul className="space-y-1">
                {r.checks.map((c) => (
                  <li key={c.key} className="flex items-center gap-2 text-xs">
                    <Level level={c.level} />
                    <span className="w-24 shrink-0 text-muted-foreground">{c.label}</span>
                    <span className="truncate">{c.detail}</span>
                    {c.level !== 'ok' && c.fix && (
                      c.fix === 'settings'
                        ? <button className="ml-auto text-primary underline-offset-2 hover:underline" onClick={() => setEditing(editing === r.id ? null : r.id)}>Fix</button>
                        : <Link className="ml-auto text-primary underline-offset-2 hover:underline" to={`/client/${r.id}?tab=client-settings`}>Open</Link>
                    )}
                  </li>
                ))}
              </ul>
              {editing === r.id && <ConfigEditor entry={r} onDone={() => setEditing(null)} />}
              <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => setPreview(r)}><FileText className="h-4 w-4" /> Preview / Print PDF</Button>
            </div>
          );
        })}
      </div>
      {preview && <ReportPreview entry={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** Fills only blank, non-secret settings — never overwrites existing values. */
function ConfigEditor({ entry, onDone }: { entry: RosterEntry; onDone: () => void }) {
  const qc = useQueryClient();
  const c = entry.config;
  const [tz, setTz] = useState(''); const [goal, setGoal] = useState(''); const [deadline, setDeadline] = useState('');
  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (!c.timezoneConfigured && tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); patch.stats_report_timezone = tz; } catch { return toast.error('Unknown timezone'); } }
    if (!c.raiseGoal && goal) patch.total_raise_amount = Number(goal.replace(/[^\d.]/g, ''));
    if (!c.raiseDeadline && deadline) patch.raise_deadline = deadline;
    if (!Object.keys(patch).length) return onDone();
    const { error } = await (supabase as any).from('client_settings').update(patch).eq('client_id', entry.id);
    if (error) return toast.error(error.message);
    toast.success('Saved'); qc.invalidateQueries({ queryKey: ['weekly-report-roster'] }); onDone();
  };
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
      {!c.timezoneConfigured && <Input placeholder="Timezone e.g. America/New_York" value={tz} onChange={(e) => setTz(e.target.value)} />}
      {c.isCapital && !c.raiseGoal && <Input placeholder="Raise goal ($)" value={goal} onChange={(e) => setGoal(e.target.value)} />}
      {c.isCapital && !c.raiseDeadline && <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
      <p className="text-muted-foreground">Calendars and funded stages are set in the client's settings. <Link className="text-primary" to={`/client/${entry.id}?tab=client-settings`}>Open settings</Link></p>
      <div className="flex gap-2"><Button size="sm" onClick={save}>Save</Button><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </div>
  );
}

function Delta({ cur, prev, invert }: { cur: Metric; prev: Metric; invert?: boolean }) {
  const p = pctChange(cur, prev);
  if (p == null) return <span className="text-muted-foreground">—</span>;
  const good = invert ? p < 0 : p > 0;
  return <span className={cn(good ? 'text-primary' : 'text-destructive')}>{p > 0 ? '+' : ''}{(p * 100).toFixed(0)}%</span>;
}

function ReportPreview({ entry, onClose }: { entry: RosterEntry; onClose: () => void }) {
  const { data, isLoading, error } = useWeeklyClientReport(entry);
  const print = () => { document.body.classList.add('printing-weekly'); window.print(); setTimeout(() => document.body.classList.remove('printing-weekly'), 500); };
  const cur = data?.weeks[0]; const prev = data?.weeks[1];
  const rows: [string, (w: any) => Metric, 'money' | 'num', boolean?][] = [
    ['Ad spend', (w) => w.spend, 'money'],
    ['Verified leads', (w) => w.verifiedLeads, 'num'],
    ['Cost per lead', (w) => w.cpl, 'money', true],
    ['Booked calls', (w) => w.bookedCalls, 'num'],
    ['Cost per booked call', (w) => w.cpbc, 'money', true],
    ...(entry.config.trackedCalendarIds.length ? [['Shows', (w: any) => w.shows, 'num'], ['Cost per show', (w: any) => w.costPerShow, 'money', true]] as any : []),
  ];
  const fmt = (m: Metric, t: 'money' | 'num') => (t === 'money' ? money(m, 2) : num(m));

  return createPortal(
    <div id="weekly-print-root" className="fixed inset-0 z-50 overflow-auto bg-background">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur">
        <p className="text-sm font-medium">{entry.name} — weekly report draft</p>
        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={print} disabled={!data}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      {isLoading && <p className="p-6 text-sm text-muted-foreground">Building report…</p>}
      {error && <p className="p-6 text-sm text-destructive">Could not build this report.</p>}
      {data && cur && prev && (
        <div className="mx-auto max-w-[8.5in] space-y-6 p-6 print:p-0">
          {data.exceptions.length > 0 && (
            <div className="no-print rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <p className="mb-1 font-medium">Internal exceptions (not printed)</p>
              <ul className="list-disc pl-4 space-y-0.5">{data.exceptions.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          <section className="weekly-page rounded-xl border bg-card p-8 space-y-5">
            <header className="flex items-end justify-between border-b pb-3">
              <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Weekly Performance Report</p><h2 className="text-2xl font-semibold">{data.clientName}</h2></div>
              <p className="text-xs text-muted-foreground">Week {cur.range.from} → {cur.range.to}<br />vs {prev.range.from} → {prev.range.to}</p>
            </header>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Metric</th><th>This week</th><th>Prior week</th><th>Change</th></tr></thead>
              <tbody>{rows.map(([label, get, t, inv]) => (
                <tr key={label} className="border-t"><td className="py-2">{label}</td><td className="font-medium">{fmt(get(cur), t)}</td><td>{fmt(get(prev), t)}</td><td><Delta cur={get(cur)} prev={get(prev)} invert={inv} /></td></tr>
              ))}</tbody>
            </table>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">4-week trend</p>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th>Week of</th><th>Spend</th><th>Verified leads</th><th>CPL</th><th>Booked</th></tr></thead>
                <tbody>{[...data.weeks].reverse().map((w) => (
                  <tr key={w.range.from} className="border-t"><td className="py-1">{w.range.from}</td><td>{money(w.spend)}</td><td>{num(w.verifiedLeads)}</td><td>{money(w.cpl, 2)}</td><td>{num(w.bookedCalls)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">Verified leads are unique CRM contacts with email and phone, excluding spam and duplicates. Booked calls count calendar bookings made during the week. "Unavailable" means the data was missing or not tracked — not zero.</p>
          </section>

          <section className="weekly-page rounded-xl border bg-card p-8 space-y-5">
            <h3 className="text-lg font-semibold">Lead quality & {entry.config.isCapital ? 'investor funnel' : 'funnel'}</h3>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[['New leads', data.quality.total], ['Verified', data.quality.verified], ['Spam', data.quality.spam], ['Missing contact / dup.', data.quality.missingContact + data.quality.duplicates]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border p-3"><p className="text-xl font-semibold">{v as number}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
              ))}
            </div>
            <table className="w-full text-sm"><tbody>
              <tr className="border-t"><td className="py-2">Meta form submissions (platform count)</td><td className="text-right">{num(cur.metaFormLeads)}</td></tr>
              <tr className="border-t"><td className="py-2">Verified leads this week</td><td className="text-right">{num(cur.verifiedLeads)}</td></tr>
              <tr className="border-t"><td className="py-2">…of those, booked a call (lead cohort)</td><td className="text-right">{num(cur.cohortBooked)}</td></tr>
              {entry.config.isCapital && <>
                <tr className="border-t"><td className="py-2">Stated pipeline interest (prospect estimate)</td><td className="text-right">{money(cur.pipelineInterest)}</td></tr>
                <tr className="border-t"><td className="py-2">Committed this week</td><td className="text-right">{money(cur.committed)}</td></tr>
                <tr className="border-t"><td className="py-2">Funded this week (verified)</td><td className="text-right">{money(cur.funded)}</td></tr>
              </>}
            </tbody></table>
            {entry.config.isCapital && data.raise.goal && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs"><span>Raise progress (verified funded)</span><span>{money(data.raise.fundedToDate)} of {money(data.raise.goal)}{data.raise.deadline ? ` · target ${data.raise.deadline}` : ''}</span></div>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, ((data.raise.fundedToDate || 0) / data.raise.goal) * 100)}%` }} /></div>
              </div>
            )}
            {entry.config.isCapital && <p className="text-[10px] text-muted-foreground">Stated interest is self-reported by prospects and is not a commitment or funding. Targeted figures only; past performance does not guarantee future results.</p>}
          </section>

          <section className="weekly-page rounded-xl border bg-card p-8 space-y-4">
            <h3 className="text-lg font-semibold">Creative performance</h3>
            {data.creatives.length === 0 ? <p className="text-sm text-muted-foreground">No creative spend data available.</p> : (
              <div className="grid grid-cols-3 gap-3">
                {data.creatives.map((c) => (
                  <div key={c.id} className="overflow-hidden rounded-lg border">
                    {c.image ? <img src={c.image} alt="" className="aspect-square w-full object-cover" loading="lazy" /> : <div className="aspect-square bg-muted" />}
                    <div className="space-y-0.5 p-2 text-[11px]">
                      <p className="truncate font-medium">{c.name}</p>
                      <p>Spend {money(c.spend)} · Leads {c.leads ?? 'Unavailable'}</p>
                      <p>CPL {money(c.cpl, 2)}{c.booked ? ` · Booked ${c.booked}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Creative totals are cumulative as of the last ad sync{data.creativesSyncedAt ? ` (${data.creativesSyncedAt.slice(0, 10)})` : ''}, not limited to this week. Booked results shown only where attribution exists.</p>
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}
