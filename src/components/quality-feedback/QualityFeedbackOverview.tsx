import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, ShieldCheck, OctagonX, Loader2 } from 'lucide-react';
import { useQualityAction, useQualityOverview } from '@/hooks/useQualityFeedback';
import { QualityFeedbackClientTab } from './QualityFeedbackClientTab';
import { MILESTONE_LABEL, ModeBadge } from './qfUi';

const fmtLag = (v: number | null) => (v == null ? '—' : v < 60 ? `${Math.round(v)}m` : `${(v / 60).toFixed(1)}h`);

export function QualityFeedbackOverview() {
  const { data, isLoading, error } = useQualityOverview();
  const act = useQualityAction();
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading quality feedback…</div>;
  if (error) return <Card><CardContent className="p-6 text-sm text-destructive">{(error as Error).message}</CardContent></Card>;
  const g = data?.global ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Quality Feedback</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">Which leads would produce verified quality signals for Meta. Preview stores results only and never contacts Meta.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Global live: {g.live_enabled ? 'Enabled' : 'Disabled'}</Badge>
          {g.emergency_stop ? (
            <Button size="sm" variant="outline" onClick={() => act.mutate({ action: 'global_clear_stop' })}>Clear emergency stop</Button>
          ) : (
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => act.mutate({ action: 'global_stop' })}><OctagonX className="h-4 w-4" /> Emergency stop</Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Clients</CardTitle><CardDescription>Counts are for each client's configured milestone. Nothing is sent while the global gate is disabled.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>Mode</TableHead><TableHead>Rules</TableHead><TableHead>Milestone → event</TableHead>
              <TableHead>Dataset</TableHead><TableHead className="text-right">Eligible</TableHead><TableHead className="text-right">Withheld</TableHead>
              <TableHead className="text-right">Needs review</TableHead><TableHead className="text-right">Queue</TableHead><TableHead className="text-right">Failed</TableHead>
              <TableHead>Lag p50/p95</TableHead><TableHead>Risks</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.clients ?? []).map((c: any) => (
                <TableRow key={c.client_id} className="cursor-pointer" onClick={() => setOpen({ id: c.client_id, name: c.name })}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><ModeBadge mode={c.mode} /></TableCell>
                  <TableCell>{c.rules_version ? `v${c.rules_version}` : <span className="text-muted-foreground">None</span>}</TableCell>
                  <TableCell className="text-xs">{MILESTONE_LABEL[c.milestone]}{c.meta_event_name ? ` → ${c.meta_event_name}` : ''}</TableCell>
                  <TableCell className="text-xs font-mono">{c.dataset || <span className="text-muted-foreground">{c.client_dataset_on_file ? `on file ${c.client_dataset_on_file}` : 'none'}</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.eligible}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.withheld}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.needs_review}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.outbox.pending + c.outbox.held}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.outbox.failed_permanent}</TableCell>
                  <TableCell className="text-xs">{fmtLag(c.dispatch_lag_minutes.median)} / {fmtLag(c.dispatch_lag_minutes.p95)}</TableCell>
                  <TableCell>{c.legacy_sender_active && <Badge variant="outline" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" /> Legacy sender</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Other event senders</CardTitle><CardDescription>Duplicate risk must be resolved per client before Live.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.sender_inventory ?? []).map((s: any) => (
            <div key={s.name} className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
              <div><div className="font-medium">{s.name}</div><div className="text-muted-foreground text-xs">{s.sends}</div></div>
              <div className="text-xs text-muted-foreground">{s.clients_last_30d != null ? `${s.clients_last_30d} clients in 30 days · ` : ''}{s.status}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.name} — Quality Feedback</DialogTitle></DialogHeader>
          {open && <QualityFeedbackClientTab clientId={open.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
