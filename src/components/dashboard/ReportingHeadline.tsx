/**
 * Headline reporting panel. Renders totals from ONE explicitly selected source and
 * the exact same client set as the table below it. Missing or failed clients are
 * excluded and named, never counted as zero.
 */
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Database, FileSpreadsheet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  aggregateMetaTotals,
  aggregateScopeTotals,
  coverageLabel,
  sourceLabel,
  type ReportingScope,
  type ReportingSource,
} from '@/lib/reportingScope';

export const REPORTING_GOAL_COPY =
  'Know what we spent, what it produced, and what needs attention.';

interface DailyRow {
  client_id: string;
  ad_spend?: number | null;
  leads?: number | null;
  impressions?: number | null;
  clicks?: number | null;
}

interface ReportingHeadlineProps {
  scope: ReportingScope;
  dailyRows: DailyRow[];
  onSourceChange: (s: ReportingSource) => void;
  /** Sources actually available in this workspace. */
  sheetAvailable: boolean;
  databaseAvailable: boolean;
  clientNameById: Record<string, string>;
}

function money(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
}
function count(v: number | null): string {
  return v == null ? '—' : v.toLocaleString('en-US');
}
function percent(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

export function ReportingHeadline({
  scope,
  dailyRows,
  onSourceChange,
  sheetAvailable,
  databaseAvailable,
  clientNameById,
}: ReportingHeadlineProps) {
  const totals = aggregateScopeTotals(scope);
  const meta = aggregateMetaTotals(dailyRows, scope.includedClientIds);

  const excluded = scope.excludedClientIds.map((id) => ({
    id,
    name: clientNameById[id] ?? id,
    status: scope.statusByClient[id],
  }));

  const tiles: Array<{ label: string; value: string; hint?: string }> = [
    { label: 'Ad spend', value: money(totals.adSpend), hint: 'What we spent' },
    { label: 'CRM leads', value: count(totals.crmLeads), hint: 'Leads recorded in the CRM' },
    { label: 'Meta leads', value: count(meta.metaLeads), hint: 'Leads reported by the ad platform' },
    { label: 'Cost per CRM lead', value: money(totals.costPerLead) },
    { label: 'Booked calls', value: count(totals.calls) },
    { label: 'Showed calls', value: count(totals.showedCalls) },
    { label: 'Show rate', value: percent(totals.showRate) },
    { label: 'Cost per show', value: money(totals.costPerShow) },
    { label: 'Funded', value: count(totals.fundedInvestors) },
    { label: 'Funded $', value: money(totals.fundedDollars) },
    { label: 'Cost of capital', value: percent(totals.costOfCapital) },
    { label: 'Close rate', value: percent(totals.closeRate) },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Reporting</h2>
          <p className="text-sm text-muted-foreground">{REPORTING_GOAL_COPY}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Numbers from:</span>
          <div className="flex items-center rounded-md bg-muted p-0.5">
            <button
              type="button"
              disabled={!sheetAvailable}
              onClick={() => onSourceChange('sheet')}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                scope.source === 'sheet' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileSpreadsheet className="h-3 w-3" /> Client sheet
            </button>
            <button
              type="button"
              disabled={!databaseAvailable}
              onClick={() => onSourceChange('database')}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                scope.source === 'database' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Database className="h-3 w-3" /> CRM + Meta
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="font-normal">{sourceLabel(scope.source)}</Badge>
        <Badge variant={scope.isPartial ? 'secondary' : 'outline'} className="font-normal">
          {coverageLabel(scope)}
        </Badge>
        {scope.isLoading && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Still loading some clients — they are not counted yet
          </span>
        )}
        {scope.hasError && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" /> Some clients failed to load and are left out (not counted as zero)
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="border-2">
            <CardContent className="p-3">
              <p className="text-xl font-bold tabular-nums">{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.label}</p>
              {t.hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {excluded.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {excluded.length} client{excluded.length === 1 ? '' : 's'} in view not included in these totals
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4 list-disc">
            {excluded.map((c) => (
              <li key={c.id}>
                {c.name} —{' '}
                {c.status === 'loading'
                  ? 'still loading'
                  : c.status === 'error'
                  ? 'could not be loaded'
                  : scope.source === 'sheet'
                  ? 'no KPI sheet set up'
                  : 'no stored numbers for this date range'}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] text-muted-foreground">
        These are the numbers already stored in this app from the selected source for the selected dates. They are not a live
        check against Meta or the CRM, and a fetch time does not prove the platform agrees. Meta leads and CRM leads are
        counted differently and are shown separately on purpose.
      </p>
    </section>
  );
}
