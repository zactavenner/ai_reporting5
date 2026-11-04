import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { CalendarClock, Pencil, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  scorecardWindows,
  summarize,
  parseRaiseAmount,
  type ScorecardMode,
  type ScorecardTotals,
} from '@/lib/huddle/scorecardSummary';

const money = (v: number | null, compact = false) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: compact ? 'compact' : 'standard',
        maximumFractionDigits: compact ? 1 : v >= 100 ? 0 : 2,
      }).format(v);
const num = (v: number | null) => (v == null ? '—' : new Intl.NumberFormat('en-US').format(v));
const pct = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

type MetricDef = {
  key: keyof ScorecardTotals;
  label: string;
  fmt: (v: number | null) => string;
  /** true when a lower number is better (costs) */
  lowerIsBetter?: boolean;
};

const METRICS: MetricDef[] = [
  { key: 'ad_spend', label: 'Ad Spend', fmt: (v) => money(v) },
  { key: 'leads', label: 'Leads', fmt: num },
  { key: 'cpl', label: 'CPL', fmt: (v) => money(v), lowerIsBetter: true },
  { key: 'calls', label: 'Booked Calls', fmt: num },
  { key: 'cost_per_call', label: '$ / Call', fmt: (v) => money(v), lowerIsBetter: true },
  { key: 'showed_calls', label: 'Showed', fmt: num },
  { key: 'show_pct', label: 'Show %', fmt: pct },
  { key: 'cost_per_show', label: '$ / Show', fmt: (v) => money(v), lowerIsBetter: true },
  { key: 'commitment_dollars', label: 'Commitments', fmt: (v) => money(v, true) },
  { key: 'funded_dollars', label: 'Funded', fmt: (v) => money(v, true) },
];

function Delta({ cur, prev, lowerIsBetter }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur == null || prev == null || prev === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  const change = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(change) || Math.abs(change) < 0.5) return <span className="text-[11px] text-muted-foreground">flat</span>;
  const up = change > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center text-[11px] font-medium ${good ? 'text-success' : 'text-destructive'}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

const modeStore = new Map<string, ScorecardMode>();

export function HuddleScorecardStrip({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<ScorecardMode>(() => modeStore.get('mode') ?? 'daily');
  useEffect(() => { modeStore.set('mode', mode); }, [mode]);

  const today = useMemo(() => new Date(), []);
  const windows = useMemo(() => scorecardWindows(mode, today), [mode, today]);
  const fetchStart = useMemo(() => scorecardWindows('monthly', today).prior.start, [today]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['huddle-scorecard-daily', clientId, fetchStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_client_performance_daily' as any)
        .select('date_account_tz, ad_spend, leads, calls, showed_calls, commitments, commitment_dollars, funded_count, funded_dollars')
        .eq('client_id', clientId)
        .gte('date_account_tz', fetchStart)
        .order('date_account_tz', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: raise } = useQuery({
    queryKey: ['huddle-raise', clientId],
    queryFn: async () => {
      const [{ data: cs }, { data: offers }, { data: monthly }] = await Promise.all([
        (supabase as any).from('client_settings').select('total_raise_amount, raise_deadline').eq('client_id', clientId).maybeSingle(),
        (supabase as any)
          .from('client_offers')
          .select('raise_amount, timeline, is_primary, updated_at')
          .eq('client_id', clientId)
          .order('is_primary', { ascending: false })
          .order('updated_at', { ascending: false }),
        supabase.from('v_client_performance_monthly' as any).select('funded_dollars').eq('client_id', clientId),
      ]);
      const offerWithRaise = (offers || []).find((o: any) => parseRaiseAmount(o.raise_amount));
      const offerTimeline = (offers || []).find((o: any) => o.timeline)?.timeline ?? null;
      const settingsAmount = Number(cs?.total_raise_amount) || 0;
      const fundedToDate = (monthly || []).reduce((s: number, r: any) => s + (Number(r.funded_dollars) || 0), 0);
      return {
        amount: settingsAmount > 0 ? settingsAmount : parseRaiseAmount(offerWithRaise?.raise_amount),
        deadline: (cs?.raise_deadline as string | null) ?? null,
        offerTimeline: offerTimeline as string | null,
        fundedToDate,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const current = useMemo(() => summarize(rows, windows.current), [rows, windows]);
  const prior = useMemo(() => summarize(rows, windows.prior), [rows, windows]);

  // Editing raise size + deadline
  const [editOpen, setEditOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (editOpen) {
      setAmountDraft(raise?.amount ? String(raise.amount) : '');
      setDeadlineDraft(raise?.deadline ?? '');
    }
  }, [editOpen, raise]);

  const save = async () => {
    const parsed = amountDraft.trim() ? parseRaiseAmount(amountDraft) : 0;
    if (amountDraft.trim() && parsed == null) {
      toast.error('Enter the raise as a number, e.g. 3000000 or 3M');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('client_settings')
      .upsert(
        { client_id: clientId, total_raise_amount: parsed ?? 0, raise_deadline: deadlineDraft || null },
        { onConflict: 'client_id' },
      );
    setSaving(false);
    if (error) {
      toast.error('Could not save raise details');
      return;
    }
    toast.success('Raise details saved');
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ['huddle-raise', clientId] });
  };

  const daysLeft = useMemo(() => {
    if (!raise?.deadline) return null;
    const [y, m, d] = raise.deadline.split('-').map(Number);
    const dl = new Date(y, m - 1, d);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((dl.getTime() - t.getTime()) / 86_400_000);
  }, [raise?.deadline, today]);

  const progress = raise?.amount ? Math.min(100, (raise.fundedToDate / raise.amount) * 100) : null;

  return (
    <Card className="p-4 space-y-4">
      {/* Raise + deadline row */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            <Target className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Size of Raise</div>
            <div className="text-lg font-semibold tabular-nums">{raise?.amount ? money(raise.amount) : 'Not set'}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Deadline</div>
            {raise?.deadline ? (
              <div className="text-lg font-semibold">
                {new Date(raise.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                <span className={`ml-2 text-xs font-medium ${daysLeft != null && daysLeft < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {daysLeft == null ? '' : daysLeft < 0 ? `${Math.abs(daysLeft)}d past` : daysLeft === 0 ? 'today' : `${daysLeft}d left`}
                </span>
              </div>
            ) : (
              <div className="text-lg font-semibold text-muted-foreground">
                None
                {raise?.offerTimeline && (
                  <span className="ml-2 text-xs font-normal">Offer timeline: {raise.offerTimeline}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {progress != null && (
          <div className="flex-1 min-w-[220px] max-w-[360px] space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Funded to date {money(raise!.fundedToDate, true)}</span>
              <span className="tabular-nums">{progress.toFixed(1)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}

        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="ml-auto">
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit raise
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="raise-amount">Size of raise</Label>
              <Input id="raise-amount" placeholder="e.g. 3000000 or 3M" value={amountDraft} onChange={(e) => setAmountDraft(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raise-deadline">Deadline (optional)</Label>
              <Input id="raise-deadline" type="date" value={deadlineDraft} onChange={(e) => setDeadlineDraft(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="border-t" />

      {/* Daily / Monthly scorecard */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {windows.current.label}
          <span className="ml-2 text-xs font-normal text-muted-foreground">vs {windows.prior.label}</span>
        </div>
        <ToggleGroup type="single" size="sm" value={mode} onValueChange={(v) => v && setMode(v as ScorecardMode)}>
          <ToggleGroupItem value="daily" className="px-3">Daily</ToggleGroupItem>
          <ToggleGroupItem value="monthly" className="px-3">Monthly</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-10 gap-2">
        {METRICS.map((m) => (
          <div key={m.key} className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="text-[11px] text-muted-foreground truncate">{m.label}</div>
            <div className="text-base font-semibold tabular-nums truncate">
              {isLoading ? '…' : m.fmt(current[m.key] as number | null)}
            </div>
            <Delta cur={current[m.key] as number | null} prev={prior[m.key] as number | null} lowerIsBetter={m.lowerIsBetter} />
          </div>
        ))}
      </div>
    </Card>
  );
}
