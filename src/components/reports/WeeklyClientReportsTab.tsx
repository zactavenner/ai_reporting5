import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileText, FlaskConical, Lock, Printer, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWeeklyReportRoster, useWeeklyClientReport, useWeeklyDryRun, fetchServerPdf, type RosterEntry } from '@/hooks/useWeeklyClientReports';
import type { ReadinessCheck } from '@/lib/weeklyReport/core';
import { buildReportDoc, type Block } from '../../../supabase/functions/_shared/weeklyReport/layout.ts';
import { cn } from '@/lib/utils';

function Level({ level }: { level: ReadinessCheck['level'] }) {
  if (level === 'ok') return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  if (level === 'warn') return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
  return <XCircle className="h-3.5 w-3.5 text-destructive" />;
}

export function WeeklyClientReportsTab() {
  const { data: roster, isLoading, error } = useWeeklyReportRoster();
  const [preview, setPreview] = useState<RosterEntry | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const dry = useWeeklyDryRun();

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Weekly Client Reports</h1>
          <p className="text-sm text-muted-foreground">Monday draft for the last completed Mon–Sun vs the week before, in each client's timezone.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Delivery not armed</Badge>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => dry.mutate(undefined)} disabled={dry.isPending}>
            <FlaskConical className="h-4 w-4" /> {dry.isPending ? 'Running dry run…' : 'Dry-run Monday batch'}
          </Button>
        </div>
      </div>
      {dry.error && <p className="text-sm text-destructive">{(dry.error as Error).message}</p>}
      {dry.data && <DryRunPanel result={dry.data} />}
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


function DryRunPanel({ result }: { result: import('@/hooks/useWeeklyClientReports').DryRunResult }) {
  const rendered = result.clients.filter((c) => c.pdf.ok).length;
  const planned = result.clients.reduce((a, c) => a + c.deliveries.length, 0);
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Dry run — nothing was saved or sent</p>
        <p className="text-xs text-muted-foreground">{rendered}/{result.clients.length} PDFs rendered · {planned} planned deliveries · all blocked</p>
      </div>
      {result.batchBlockers.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{result.batchBlockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground"><tr><th className="py-1">Client</th><th>Week</th><th>PDF</th><th>Recipients</th><th>Blockers</th></tr></thead>
          <tbody>{result.clients.map((c) => (
            <tr key={c.clientId} className="border-t align-top">
              <td className="py-1.5 pr-2 font-medium">{c.clientName}</td>
              <td className="pr-2 whitespace-nowrap">{c.week.from} → {c.week.to}</td>
              <td className="pr-2">{c.pdf.ok ? `${c.pdf.pages} pages · ${Math.round((c.pdf.bytes || 0) / 1024)} KB` : <span className="text-destructive">Failed</span>}</td>
              <td className="pr-2">{c.approvedRecipients}</td>
              <td className="text-muted-foreground">{c.blockers.join(' · ') || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function DocBlock({ b }: { b: Block }) {
  switch (b.kind) {
    case 'header':
      return (
        <header className="flex items-end justify-between border-b pb-3">
          <div><p className="text-xs uppercase tracking-wider text-muted-foreground">{b.eyebrow}</p><h2 className="text-2xl font-semibold">{b.title}</h2></div>
          <p className="text-right text-xs text-muted-foreground">{b.right.map((t) => <span key={t} className="block">{t}</span>)}</p>
        </header>
      );
    case 'heading': return <h3 className="text-lg font-semibold">{b.text}</h3>;
    case 'table':
      return (
        <table className={cn('w-full', b.small ? 'text-xs' : 'text-sm')}>
          <thead><tr className="text-xs text-muted-foreground">{b.head.map((h, i) => <th key={i} className={cn('py-1', b.align?.[i] === 'right' ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, j) => (
            <tr key={j} className="border-t">{r.map((c, i) => <td key={i} className={cn('py-1.5', b.align?.[i] === 'right' && 'text-right', i === 1 && 'font-medium', c.startsWith('Unavailable') && 'text-muted-foreground')}>{c}</td>)}</tr>
          ))}</tbody>
        </table>
      );
    case 'stats':
      return (
        <div className="grid grid-cols-4 gap-3 text-center">
          {b.items.map((s) => <div key={s.label} className="rounded-lg border p-3"><p className="text-xl font-semibold">{s.value}</p><p className="text-[11px] text-muted-foreground">{s.label}</p></div>)}
        </div>
      );
    case 'progress':
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span>{b.label}</span><span>{b.right}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${b.ratio * 100}%` }} /></div>
        </div>
      );
    case 'creatives':
      return (
        <div className="grid grid-cols-3 gap-3">
          {b.items.map((c, i) => (
            <div key={i} className="overflow-hidden rounded-lg border">
              {c.image ? <img src={c.image} alt="" className="aspect-square w-full object-cover" loading="lazy" /> : <div className="aspect-square bg-muted" />}
              <div className="space-y-0.5 p-2 text-[11px]"><p className="truncate font-medium">{c.name}</p>{c.lines.map((l) => <p key={l}>{l}</p>)}</div>
            </div>
          ))}
        </div>
      );
    case 'note': return <p className={cn('text-[10px]', b.tone === 'warn' ? 'text-destructive text-xs' : 'text-muted-foreground')}>{b.text}</p>;
  }
}

function ReportPreview({ entry, onClose }: { entry: RosterEntry; onClose: () => void }) {
  const { data, isLoading, error } = useWeeklyClientReport(entry);
  const [downloading, setDownloading] = useState(false);
  const doc = data ? buildReportDoc(data) : null;
  const print = () => { document.body.classList.add('printing-weekly'); window.print(); setTimeout(() => document.body.classList.remove('printing-weekly'), 500); };
  const serverPdf = async () => {
    setDownloading(true);
    try {
      const blob = await fetchServerPdf(entry.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${entry.name.replace(/[^a-z0-9]+/gi, '-')}-weekly-${data?.weeks[0].range.from ?? 'report'}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error((e as Error).message); } finally { setDownloading(false); }
  };

  return createPortal(
    <div id="weekly-print-root" className="fixed inset-0 z-50 overflow-auto bg-background">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur">
        <p className="text-sm font-medium">{entry.name} — weekly report draft</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={serverPdf} disabled={!data || downloading}><Download className="h-4 w-4" /> {downloading ? 'Rendering…' : 'Server PDF'}</Button>
          <Button size="sm" className="gap-2" onClick={print} disabled={!data}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      {isLoading && <p className="p-6 text-sm text-muted-foreground">Building report…</p>}
      {error && <p className="p-6 text-sm text-destructive">Could not build this report.</p>}
      {data && doc && (
        <div className="mx-auto max-w-[8.5in] space-y-6 p-6 print:p-0">
          {data.exceptions.length > 0 && (
            <div className="no-print rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
              <p className="mb-1 font-medium">Internal exceptions (not printed or emailed)</p>
              <ul className="list-disc pl-4 space-y-0.5">{data.exceptions.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {doc.pages.map((blocks, i) => (
            <section key={i} className="weekly-page rounded-xl border bg-card p-8 space-y-5">
              {blocks.map((b, j) => <DocBlock key={j} b={b} />)}
            </section>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
