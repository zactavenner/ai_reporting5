/**
 * Capital Raising SOP — REVIEWABLE PREVIEW (read-only).
 *
 * This panel never calls the review endpoint. The endpoint `media-buyer-sop-review`
 * IS reachable, but authenticated per-client review and deployed-version
 * verification are still pending, so nothing here is produced by it. Readiness is
 * computed locally from existing read-only data through the SAME shared adapter the
 * endpoint uses, so the two cannot disagree.
 *
 * Budgets shown are PER DAY. Illustrative calculator output is kept separate
 * from observed results and is never saved. No fake client data is rendered.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldAlert, Download, Calculator } from 'lucide-react';
import {
  BUDGET_TIERS,
  TIER_DAILY_BUDGETS,
  planDailyBudgetTier,
  planColdStart,
  computeTestDays,
  buildOperatingInstructions,
} from '@/lib/mediaBuyerSop';
import { loadClientSopReport } from '@/lib/mediaBuyerSopRead';

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

function money(v: number | null | undefined) {
  return v == null ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

interface MediaBuyerSopPreviewProps {
  /** Client chosen in the page header. When provided, this panel shows no selector. */
  clientId?: string;
  /** Names for the shared selector so the page and this panel cannot disagree. */
  clientOptions?: Array<{ id: string; name: string }>;
}

export default function MediaBuyerSopPreview({ clientId, clientOptions }: MediaBuyerSopPreviewProps = {}) {
  const controlled = clientId !== undefined;
  const [localSelected, setLocalSelected] = useState<string>('');
  const selected = controlled ? (clientId ?? '') : localSelected;
  const setSelected = setLocalSelected;
  const [calcBudget, setCalcBudget] = useState('500');
  const [calcTargetCpql, setCalcTargetCpql] = useState('100');
  const [calcPilotLoss, setCalcPilotLoss] = useState('2000');
  const [calcLag, setCalcLag] = useState('2');

  const clientsQuery = useQuery({
    queryKey: ['sop-preview-clients'],
    staleTime: 300_000,
    enabled: !controlled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const reportQuery = useQuery({
    queryKey: ['sop-preview-report', selected],
    enabled: !!selected,
    staleTime: 60_000,
    queryFn: async () => loadClientSopReport(supabase as never, selected, new Date().toISOString()),
  });


  const calc = useMemo(() => {
    const tier = planDailyBudgetTier(Number(calcBudget) || null, false);
    if ('error' in tier) return { error: tier.error, detail: tier.detail ?? null };
    return {
      tier,
      cold: planColdStart(Number(calcPilotLoss) || null, tier),
      // The DAILY test allocation is used as-is — never divided by 7.
      test: computeTestDays(Number(calcTargetCpql) || null, tier.test_usd, Number(calcLag)),
    };
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

  const loaded = reportQuery.data;
  const report = loaded?.report ?? null;

  return (
    <div className="space-y-4">
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>
          Review preview. Endpoint reachable; authenticated client review and deployed-version verification pending. New SOP
          scheduler not activated. No Meta execution.
        </AlertTitle>
        <AlertDescription className="text-xs leading-relaxed">
          The review service (<code>media-buyer-sop-review</code>) answers requests, but no authenticated per-client review has
          been proven and the deployed version is not confirmed to match this source, so nothing below was produced by it and no
          run was started. Readiness is calculated here from existing read-only data using the same shared read adapter, with no
          background calls to the endpoint. Runs in the other tabs came from the previous review logic and are <strong>not</strong>{' '}
          evidence for this SOP. The existing four scheduled jobs are unchanged, nothing here pauses, scales or edits an ad, and
          no narrative model is called.
        </AlertDescription>
      </Alert>


      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[320px]"><SelectValue placeholder="Select one client to review" /></SelectTrigger>
          <SelectContent>
            {(clientsQuery.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">One client per review — there is no portfolio sweep.</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportInstructions}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export operating instructions
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daily budget tiers</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Daily budget</TableHead><TableHead>Core / day</TableHead><TableHead>Test / day</TableHead>
                <TableHead>Retargeting / day</TableHead><TableHead>Net-new concepts / wk</TableHead>
                <TableHead>Variants / wk (total)</TableHead><TableHead>Prepared assets / wk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUDGET_TIERS.map((t) => (
                <TableRow key={t.daily_budget_usd}>
                  <TableCell className="font-medium">${t.daily_budget_usd}/day</TableCell>
                  <TableCell>${t.core_usd}</TableCell>
                  <TableCell>${t.test_usd}</TableCell>
                  <TableCell>${t.retargeting_usd}</TableCell>
                  <TableCell>{t.weekly_new_concepts}</TableCell>
                  <TableCell>{t.weekly_variants_total}</TableCell>
                  <TableCell className="text-muted-foreground">{t.weekly_prepared_assets_total} (inventory, not a launch quota)</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-2 space-x-1">
            <strong>Net-new concept</strong> = a new angle or offer framing. <strong>Variant</strong> = a re-cut of an existing
            proven concept (hook, edit, format). The variant figure is a weekly <em>total</em> across all concepts, not a
            per-concept multiplier. Only these four exact daily budgets are planned — any other daily budget needs a custom plan
            rather than being floored to a lower tier.
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
            <div><Label className="text-xs">Daily budget (USD)</Label><Input value={calcBudget} onChange={(e) => setCalcBudget(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">Target CPQL (USD)</Label><Input value={calcTargetCpql} onChange={(e) => setCalcTargetCpql(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">Pilot loss limit (USD)</Label><Input value={calcPilotLoss} onChange={(e) => setCalcPilotLoss(e.target.value)} inputMode="numeric" /></div>
            <div><Label className="text-xs">Qualification lag (days)</Label><Input value={calcLag} onChange={(e) => setCalcLag(e.target.value)} inputMode="numeric" /></div>
          </div>
          {'error' in calc && calc.error ? (
            <div className="text-xs text-amber-700 dark:text-amber-400">
              Cannot plan: {calc.error}. {calc.detail ?? `Published daily tiers: ${TIER_DAILY_BUDGETS.map((b) => `$${b}`).join(', ')}.`}
            </div>
          ) : 'tier' in calc && calc.tier ? (
            <div className="text-xs space-y-1">
              <div>
                Tier ${calc.tier.matched_tier_daily_budget_usd}/day → core ${calc.tier.core_usd}/day · test ${calc.tier.test_usd}/day · retargeting ${calc.tier.retargeting_usd}/day
              </div>
              <div>
                Weekly delivery: {calc.tier.weekly_new_concepts} net-new concepts + {calc.tier.weekly_variants_total} variants in total = {calc.tier.weekly_prepared_assets_total} assets
              </div>
              <div>
                Cold start:{' '}
                {'error' in calc.cold
                  ? `unavailable (${calc.cold.error})`
                  : `${calc.cold.campaigns} campaign · ${calc.cold.prospecting_adsets} prospecting ad set · ${calc.cold.min_ads}–${calc.cold.max_ads} ads`}
              </div>
              <div>
                Test duration:{' '}
                {'error' in calc.test
                  ? `unavailable (${calc.test.error})`
                  : `${calc.test.days} days (${calc.test.spend_days.toFixed(1)} spend days at $${calc.tier.test_usd}/day, 72h floor, + ${calc.test.lag_days}d lag)`}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Client review (observed, read-only)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-xs">
          {!selected ? (
            <div className="text-sm text-muted-foreground p-2">Select a client above to calculate its readiness from existing data.</div>
          ) : reportQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-2"><Loader2 className="h-4 w-4 animate-spin" /> Reading existing data…</div>
          ) : reportQuery.error ? (
            <div className="text-sm text-destructive">Could not load: {(reportQuery.error as Error).message}</div>
          ) : loaded?.fatal ? (
            <div className="text-sm text-destructive">Cannot review this client: {loaded.fatal}</div>
          ) : report ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${READINESS_TONE[report.readiness]}`}>{READINESS_LABEL[report.readiness]}</Badge>
                <span className="font-medium text-sm">{report.client_name}</span>
                <span className="text-muted-foreground">
                  Timezone {report.timezone ?? 'unresolved — the ad account timezone is required'}{report.timezone_source ? ` (from ${report.timezone_source.replace(/_/g, ' ')})` : ''}
                </span>
              </div>

              <div>
                <div className="font-semibold mb-1">Evidence windows (ad account timezone, current day excluded)</div>
                {report.windows.current && report.windows.prior ? (
                  <div className="text-muted-foreground">
                    Current {report.windows.current.start} → {report.windows.current.end} · prior {report.windows.prior.start} → {report.windows.prior.end}
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    Not calculated — the ad account's own timezone is not available, so no dates are derived. A client
                    reporting timezone is never used in its place, because it can differ from the ad account.
                  </div>
                )}
              </div>

              {report.config_missing.length > 0 || report.config_invalid.length > 0 ? (
                <div>
                  <div className="font-semibold mb-1">Configuration to fix (with source field)</div>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {report.config_missing.map((f) => (
                      <li key={`m-${f.key}`}><span className="text-foreground">{f.key}</span> — not set at <code>{f.source_field}</code></li>
                    ))}
                    {report.config_invalid.map((f) => (
                      <li key={`i-${f.key}`}><span className="text-foreground">{f.key}</span> — invalid value at <code>{f.source_field}</code></li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {report.blockers.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Data blockers</div>
                  <ul className="text-muted-foreground list-disc pl-4">{report.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              )}

              <div>
                <div className="font-semibold mb-1">Daily tier plan</div>
                {report.tier_plan ? (
                  <div className="text-muted-foreground">
                    ${report.tier_plan.matched_tier_daily_budget_usd}/day → core ${report.tier_plan.core_usd} · test ${report.tier_plan.test_usd} · retargeting ${report.tier_plan.retargeting_usd} (per day)
                  </div>
                ) : (
                  <div className="text-muted-foreground">Unavailable ({report.tier_error}). {report.tier_error_detail}</div>
                )}
              </div>

              <div>
                <div className="font-semibold mb-1">Pacing</div>
                <div className="text-muted-foreground">
                  {report.pacing.status === 'unknown' && report.pacing.month_to_date_spend_usd == null
                    ? 'Unknown — month-to-date spend or the monthly budget is unavailable.'
                    : `MTD ${money(report.pacing.month_to_date_spend_usd)}${report.pacing.mtd_range ? ` (${report.pacing.mtd_range.start} → ${report.pacing.mtd_range.end})` : ''} of ${money(report.pacing.monthly_media_budget_usd)} · ${report.pacing.days_remaining_including_today ?? '—'} days left including today · implied daily ${money(report.pacing.implied_daily_usd)} vs approved ${money(report.pacing.approved_daily_budget_usd)} · ${report.pacing.status.replace(/_/g, ' ')}`}
                </div>
              </div>

              <div>
                <div className="font-semibold mb-1">Ads</div>
                {report.ad_assessments.length === 0 ? (
                  <div className="text-muted-foreground">No ad can be assessed — per-ad daily metrics are not connected (see gaps below).</div>
                ) : (
                  <ul className="text-muted-foreground list-disc pl-4">
                    {report.ad_assessments.map((a) => <li key={a.ad_id}>{a.ad_id}: {a.status} — {a.reasons[0]}</li>)}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-semibold mb-1">Production queue recommendations</div>
                {report.creative_briefs.length === 0 ? (
                  <div className="text-muted-foreground">None — resolve configuration and evidence first.</div>
                ) : (
                  <ul className="text-muted-foreground list-disc pl-4">
                    {report.creative_briefs.map((b) => (
                      <li key={b.slot}>{b.kind === 'net_new_concept' ? 'Net-new concept' : 'Variant'} — {b.angle_hint}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-semibold mb-1">Draft actions (inert — recommendations only)</div>
                <div className="text-muted-foreground mb-1">
                  Budget-change numbers are switched off in this preview: the verified account-wide baseline spend and total
                  current budget are not connected, so no increase can be sized safely. Scale candidates are still shown for
                  a person to judge. Pausing an ad never claims a saving, because a shared budget can move that spend elsewhere.
                </div>
                {report.draft_actions.length === 0 ? (
                  <div className="text-muted-foreground">
                    No action proposals. Nothing can be proposed while data is blocked or configuration is missing.
                  </div>
                ) : (
                  <pre className="bg-muted/50 rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(report.draft_actions, null, 2)}</pre>
                )}
              </div>

              <div>
                <div className="font-semibold mb-1">Connection gaps (honest list)</div>
                <ul className="text-muted-foreground list-disc pl-4">{report.connection_gaps.map((g) => <li key={g}>{g}</li>)}</ul>
              </div>

              <div>
                <div className="font-semibold mb-1">Next checks</div>
                <ul className="text-muted-foreground list-disc pl-4">{report.next_checks.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>

              <div className="text-muted-foreground space-y-1">
                <div>
                  Cleared capital {report.capital.funded_cleared_usd == null ? 'unavailable' : money(report.capital.funded_cleared_usd)} · commitments{' '}
                  {report.capital.commitments_usd == null ? 'unavailable' : money(report.capital.commitments_usd)} — {report.capital.note}
                </div>
                <div>
                  Reported funding this month (unverified, not reconciled to cleared receipts):{' '}
                  {loaded?.reported_funding_mtd_usd_unverified == null ? 'unavailable' : money(loaded.reported_funding_mtd_usd_unverified)}
                  {loaded?.month_to_date_usable === false ? ' — the month\u2019s daily records are incomplete, so month figures are withheld.' : ''}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
