/**
 * Capital Raising SOP — REVIEWABLE PREVIEW (read-only).
 *
 * This panel never calls the review endpoint: `media-buyer-sop-review` is
 * prepared in source but NOT deployed. Everything shown here is either
 * (a) existing read-only data from the current schema, evaluated locally by the
 * shared deterministic rules in src/lib/mediaBuyerSop.ts, or
 * (b) clearly-labelled illustrative calculator output that is never saved.
 *
 * No fake client data is rendered: a client with no usable evidence is shown as
 * Configuration Needed / Data Blocked / Inadequate Evidence, never as a result.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldAlert, Download, Calculator } from 'lucide-react';
import {
  BUDGET_TIERS,
  planBudgetTier,
  planColdStart,
  computeTestDays,
  assessClient,
  todayInTz,
  addDays,
  buildOperatingInstructions,
  type ClientSopReport,
  type Window,
} from '@/lib/mediaBuyerSop';

const READINESS_TONE: Record<string, string> = {
  READY: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40',
  CONFIGURATION_NEEDED: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40',
  DATA_BLOCKED: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40',
  INADEQUATE_EVIDENCE: 'bg-muted text-muted-foreground border-border',
};

const READINESS_LABEL: Record<string, string> = {
  READY: 'Ready',
  CONFIGURATION_NEEDED: 'Configuration Needed',
  DATA_BLOCKED: 'Data Blocked',
  INADEQUATE_EVIDENCE: 'Inadequate Evidence',
};

const UNAVAILABLE_FREQUENCY = {
  available: false as const,
  reason: 'aggregate unique-reach frequency not directly sourced',
};

type DailyRow = {
  client_id: string;
  date: string;
  date_account_tz: string | null;
  ad_spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  funded_dollars: number | null;
  commitment_dollars: number | null;
};

function useSopPreviewData() {
  return useQuery({
    queryKey: ['media-buyer-sop-preview'],
    staleTime: 120_000,
    queryFn: async () => {
      const { data: clients, error: cErr } = await supabase
        .from('clients')
        .select('id, name, status, meta_ad_account_id')
        .eq('status', 'active')
        .order('name');
      if (cErr) throw cErr;
      const ids = (clients ?? []).map((c) => c.id);
      if (!ids.length) return { clients: [], targets: [], settings: [], daily: [] as DailyRow[] };

      const [{ data: targets }, { data: settings }, { data: daily }] = await Promise.all([
        supabase.from('client_kpi_targets').select('client_id, max_daily_budget, autonomy_mode, guardrails').in('client_id', ids),
        supabase.from('client_settings').select('client_id, stats_report_timezone, monthly_ad_spend_target, daily_ad_spend_target').in('client_id', ids),
        supabase
          .from('daily_metrics')
          .select('client_id, date, date_account_tz, ad_spend, impressions, clicks, leads, funded_dollars, commitment_dollars')
          .in('client_id', ids)
          .gte('date', addDays(todayInTz(new Date().toISOString(), 'UTC'), -45))
          .order('date', { ascending: true }),
      ]);
      return {
        clients: clients ?? [],
        targets: targets ?? [],
        settings: settings ?? [],
        daily: (daily ?? []) as unknown as DailyRow[],
      };
    },
  });
}

export default function MediaBuyerSopPreview() {
  const { data, isLoading, error } = useSopPreviewData();
  const [calcBudget, setCalcBudget] = useState('500');
  const [calcTargetCpql, setCalcTargetCpql] = useState('400');
  const [calcPilotLoss, setCalcPilotLoss] = useState('2000');
  const [calcLag, setCalcLag] = useState('3');

  const reports = useMemo<ClientSopReport[]>(() => {
    if (!data) return [];
    const nowIso = new Date().toISOString();
    return data.clients.map((client) => {
      const settings = data.settings.find((s) => s.client_id === client.id) ?? null;
      const targets = data.targets.find((t) => t.client_id === client.id) ?? null;
      const timezone = (settings?.stats_report_timezone as string) || 'America/Los_Angeles';
      const today = todayInTz(nowIso, timezone);
      const curEnd = addDays(today, -1);
      const curStart = addDays(curEnd, -6);
      const priorEnd = addDays(curStart, -1);
      const priorStart = addDays(priorEnd, -6);
      const monthStart = `${today.slice(0, 7)}-01`;
      const rows = data.daily.filter((r) => r.client_id === client.id);
      const between = (from: string, to: string) =>
        rows.filter((r) => {
          const d = String(r.date_account_tz ?? r.date ?? '');
          return d >= from && d <= to;
        });
      const sum = (list: DailyRow[], key: keyof DailyRow): number | null =>
        list.reduce<number | null>((acc, r) => {
          const v = r[key];
          if (v === null || v === undefined) return acc;
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) return null;
          return acc === null ? null : acc + n;
        }, 0);

      const buildWindow = (from: string, to: string): Window => {
        const w = between(from, to);
        const days = new Set(w.map((r) => String(r.date_account_tz ?? r.date))).size;
        return {
          client_id: client.id,
          timezone,
          start_date: from,
          end_date: to,
          complete_days: days,
          expected_days: 7,
          spend_usd: sum(w, 'ad_spend'),
          impressions: sum(w, 'impressions'),
          clicks_outbound: sum(w, 'clicks'),
          leads: sum(w, 'leads'),
          // Matured qualified leads have no wired source yet — null, never zero.
          qualified_leads_matured: null,
          qualification_cohort_end: null,
          frequency: UNAVAILABLE_FREQUENCY,
          source_complete: days === 7,
          source_error: null,
          truncated: false,
        };
      };

      const mtd = between(monthStart, curEnd);
      const [y, m] = today.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

      return assessClient({
        client: {
          id: client.id,
          name: client.name,
          status: client.status ?? null,
          meta_ad_account_id: (client as { meta_ad_account_id?: string | null }).meta_ad_account_id ?? null,
          timezone,
        },
        kpiTargets: targets ? { ...targets, guardrails: (targets.guardrails ?? {}) as Record<string, unknown> } : null,
        currentWindow: buildWindow(curStart, curEnd),
        priorWindow: buildWindow(priorStart, priorEnd),
        tracking: null,
        ads: [],
        weeklyBudgetUsd: settings?.monthly_ad_spend_target ? Number(settings.monthly_ad_spend_target) / 4.345 : null,
        retargetingViable: false,
        mtdSpendUsd: sum(mtd, 'ad_spend'),
        daysRemainingInMonth: lastDay - Number(today.slice(8, 10)),
        salesCapacityHeadroom: null,
        fundedClearedUsd: sum(mtd, 'funded_dollars'),
        commitmentsUsd: sum(mtd, 'commitment_dollars'),
        nowIso,
      });
    });
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { READY: 0, CONFIGURATION_NEEDED: 0, DATA_BLOCKED: 0, INADEQUATE_EVIDENCE: 0 };
    reports.forEach((r) => { c[r.readiness] = (c[r.readiness] ?? 0) + 1; });
    return c;
  }, [reports]);

  const calc = useMemo(() => {
    const tier = planBudgetTier(Number(calcBudget) || null, false);
    if ('error' in tier) return { error: tier.error };
    const cold = planColdStart(Number(calcPilotLoss) || null, tier);
    const test = computeTestDays(Number(calcTargetCpql) || null, tier.test_usd / 7, Number(calcLag));
    return { tier, cold, test };
  }, [calcBudget, calcPilotLoss, calcTargetCpql, calcLag]);

  function exportInstructions() {
    const blob = new Blob([buildOperatingInstructions()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'media-buyer-capital-raising-sop.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Preview only — review endpoint is not deployed</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          The SOP review service (<code>media-buyer-sop-review</code>) exists in source but has not been deployed, so nothing
          below was produced by it and no run was started. Readiness is calculated in this page from existing read-only data.
          Legacy runs in the other tabs were produced by the previous review logic and are <strong>not</strong> evidence for this SOP.
          Nothing here pauses, scales or edits an ad.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 flex-wrap">
        {Object.keys(READINESS_LABEL).map((k) => (
          <Badge key={k} variant="outline" className={`text-[10px] ${READINESS_TONE[k]}`}>
            {READINESS_LABEL[k]} · {counts[k] ?? 0}
          </Badge>
        ))}
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportInstructions}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export operating instructions
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Budget tier plan</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Weekly budget</TableHead><TableHead>Core</TableHead><TableHead>Test</TableHead>
                <TableHead>Retargeting</TableHead><TableHead>Concepts / wk</TableHead><TableHead>Variants</TableHead>
                <TableHead>Prepared assets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUDGET_TIERS.map((t) => (
                <TableRow key={t.weekly_budget_usd}>
                  <TableCell className="font-medium">${t.weekly_budget_usd}</TableCell>
                  <TableCell>${t.core_usd}</TableCell>
                  <TableCell>${t.test_usd}</TableCell>
                  <TableCell>${t.retargeting_usd}</TableCell>
                  <TableCell>{t.weekly_concepts}</TableCell>
                  <TableCell>{t.variants_per_concept}</TableCell>
                  <TableCell className="text-muted-foreground">{t.weekly_concepts * t.variants_per_concept} (inventory, not a launch quota)</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-2">
            When retargeting is not viable its budget returns to core. Every split sums exactly to the weekly budget.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Planning calculator
            <Badge variant="outline" className="text-[10px]">illustrative · not saved · not observed results</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Weekly budget (USD)</Label><Input value={calcBudget} onChange={(e) => setCalcBudget(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">Target CPQL (USD)</Label><Input value={calcTargetCpql} onChange={(e) => setCalcTargetCpql(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">Pilot loss limit (USD)</Label><Input value={calcPilotLoss} onChange={(e) => setCalcPilotLoss(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">Qualification lag (days)</Label><Input value={calcLag} onChange={(e) => setCalcLag(e.target.value)} inputMode="numeric" /></div>
          </div>
          {'error' in calc && calc.error ? (
            <div className="text-xs text-amber-700 dark:text-amber-400">Cannot plan: {calc.error}</div>
          ) : 'tier' in calc && calc.tier ? (
            <div className="text-xs space-y-1">
              <div>Tier ${calc.tier.matched_tier_weekly_budget} → core ${calc.tier.core_usd} · test ${calc.tier.test_usd} · retargeting ${calc.tier.retargeting_usd}</div>
              <div>
                Cold start:{' '}
                {'error' in calc.cold
                  ? `unavailable (${calc.cold.error})`
                  : `${calc.cold.campaigns} campaign · ${calc.cold.prospecting_adsets} prospecting ad set · ${calc.cold.min_ads}–${calc.cold.max_ads} ads`}
              </div>
              <div>
                Test duration:{' '}
                {'error' in calc.test ? `unavailable (${calc.test.error})` : `${calc.test.days} days (${calc.test.spend_days} spend days + ${calcLag}d lag, 72h floor)`}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Client scorecard (observed, read-only)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading existing data…</div>
          ) : error ? (
            <div className="text-sm text-destructive">Could not load client data: {(error as Error).message}</div>
          ) : reports.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4">No active clients found.</div>
          ) : (
            reports.map((r) => (
              <details key={r.client_id} className="border rounded-lg bg-card">
                <summary className="cursor-pointer p-3 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${READINESS_TONE[r.readiness]}`}>{READINESS_LABEL[r.readiness]}</Badge>
                  <span className="font-medium text-sm">{r.client_name}</span>
                  <span className="text-xs text-muted-foreground">{r.timezone}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {r.config_missing.length} config gap{r.config_missing.length === 1 ? '' : 's'} · {r.blockers.length} blocker{r.blockers.length === 1 ? '' : 's'}
                  </span>
                </summary>
                <div className="px-4 pb-4 space-y-3 text-xs">
                  <div>
                    <div className="font-semibold mb-1">Evidence window (client timezone, current day excluded)</div>
                    <div className="text-muted-foreground">
                      {r.window_summary.start_date} → {r.window_summary.end_date} · {r.window_summary.complete_days}/7 complete days
                    </div>
                  </div>

                  {r.config_missing.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1">Missing configuration (with source field)</div>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {r.config_fields.filter((f) => f.value === null || f.value === undefined).map((f) => (
                          <li key={f.key}><span className="text-foreground">{f.key}</span> — not set at <code>{f.source_field}</code></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.blockers.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1">Data blockers</div>
                      <ul className="text-muted-foreground list-disc pl-4">{r.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                    </div>
                  )}

                  <div>
                    <div className="font-semibold mb-1">Pacing</div>
                    <div className="text-muted-foreground">
                      {r.pacing.status === 'unknown'
                        ? 'Unknown — monthly media budget not configured.'
                        : `MTD $${(r.pacing.mtd_spend_usd ?? 0).toFixed(0)} of $${(r.pacing.monthly_budget_usd ?? 0).toFixed(0)} · implied daily $${(r.pacing.implied_daily_usd ?? 0).toFixed(0)} · ${r.pacing.status.replace('_', ' ')}`}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold mb-1">Production queue recommendations</div>
                    {r.creative_briefs.length === 0 ? (
                      <div className="text-muted-foreground">None — resolve configuration and evidence first.</div>
                    ) : (
                      <ul className="text-muted-foreground list-disc pl-4">
                        {r.creative_briefs.map((b, i) => <li key={i}>{b.concept}: {b.rationale}</li>)}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold mb-1">Draft actions (inert — recommendations only)</div>
                    {r.draft_actions.length === 0 ? (
                      <div className="text-muted-foreground">No action proposals. Nothing can be proposed while data is blocked or configuration is missing.</div>
                    ) : (
                      <pre className="bg-muted/50 rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(r.draft_actions, null, 2)}</pre>
                    )}
                  </div>

                  <div>
                    <div className="font-semibold mb-1">Next checks</div>
                    <ul className="text-muted-foreground list-disc pl-4">{r.next_checks.map((n) => <li key={n}>{n}</li>)}</ul>
                  </div>

                  <div className="text-muted-foreground">
                    Cleared capital ${(r.capital.funded_cleared_usd ?? 0).toLocaleString()} · commitments ${(r.capital.commitments_usd ?? 0).toLocaleString()} — {r.capital.note}
                  </div>
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
