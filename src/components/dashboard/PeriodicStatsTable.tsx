import { useMemo, useState } from 'react';
import { format, parseISO, startOfWeek, endOfWeek, endOfMonth, eachWeekOfInterval, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { DailyMetric } from '@/hooks/useMetrics';
import { useClientPerformance, useReconciliationCheck, Granularity, PerformanceRow } from '@/hooks/useClientPerformance';
import { useUpsertMonthlyMetric, useUpdateDailyMetric } from '@/hooks/useYearlyMetrics';
import { useClientSettings, getThresholdsFromSettings } from '@/hooks/useClientSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Plus, Check, X, Loader2, CheckCircle, XCircle, Scale } from 'lucide-react';
import { toast } from 'sonner';

interface PeriodicStatsTableProps {
  clientId?: string;
  dailyMetrics?: DailyMetric[];
}

type PeriodType = 'daily' | 'weekly' | 'monthly';

interface PeriodStats {
  period: string;
  periodLabel: string;
  year: number;
  month: number;
  adSpend: number;
  leads: number;
  cpl: number;
  calls: number;
  costPerCall: number;
  showedCalls: number;
  showRate: number;
  costPerShow: number;
  reconnectCalls: number;
  costPerReconnect: number;
  reconnectShowed: number;
  costPerReconnectShowed: number;
  commitments: number;
  commitmentDollars: number;
  fundedInvestors: number;
  fundedDollars: number;
  costPerInvestor: number;
  costOfCapital: number;
  hasData: boolean;
}

interface EditingState {
  period: string;
  field: string;
  value: string;
}

interface MetricRowConfig {
  label: string;
  key: keyof PeriodStats;
  format: (value: number) => string;
  editable: boolean;
  dbField?: string;
  highlight?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const METRIC_ROWS: MetricRowConfig[] = [
  { label: 'Ad Spend', key: 'adSpend', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: true, dbField: 'ad_spend' },
  { label: 'Leads', key: 'leads', format: (v) => v.toLocaleString(), editable: true, dbField: 'leads' },
  { label: 'CPL', key: 'cpl', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: false },
  { label: 'Calls', key: 'calls', format: (v) => v.toLocaleString(), editable: true, dbField: 'calls' },
  { label: '$/Call', key: 'costPerCall', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: false },
  { label: 'Showed', key: 'showedCalls', format: (v) => v.toLocaleString(), editable: true, dbField: 'showed_calls' },
  { label: 'Show %', key: 'showRate', format: (v) => `${Math.round(v)}%`, editable: false },
  { label: '$/Show', key: 'costPerShow', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: false },
  { label: 'Commitments', key: 'commitments', format: (v) => v.toLocaleString(), editable: true, dbField: 'commitments' },
  { label: 'Commit $', key: 'commitmentDollars', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: true, dbField: 'commitment_dollars' },
  { label: 'Funded #', key: 'fundedInvestors', format: (v) => v.toLocaleString(), editable: true, dbField: 'funded_investors' },
  { label: 'Funded $', key: 'fundedDollars', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: true, dbField: 'funded_dollars', highlight: true },
  { label: 'CPA', key: 'costPerInvestor', format: (v) => `$${Math.round(v).toLocaleString()}`, editable: false },
  { label: 'Cost of Capital %', key: 'costOfCapital', format: (v) => `${v.toFixed(2)}%`, editable: false, highlight: true },
];

/** Map a PerformanceRow (from DB view) to the component's PeriodStats shape */
function viewRowToStats(row: PerformanceRow, periodLabel: string): PeriodStats {
  return {
    period: row.period_start,
    periodLabel,
    year: new Date(row.period_start + 'T00:00:00').getFullYear(),
    month: new Date(row.period_start + 'T00:00:00').getMonth() + 1,
    hasData: true,
    adSpend: row.ad_spend,
    leads: row.leads,
    cpl: row.cpl,
    calls: row.calls,
    costPerCall: row.dollar_per_call,
    showedCalls: row.showed_calls,
    showRate: row.show_pct,
    costPerShow: row.dollar_per_show,
    reconnectCalls: row.reconnect_calls,
    costPerReconnect: row.reconnect_calls > 0 ? row.ad_spend / row.reconnect_calls : 0,
    reconnectShowed: row.reconnect_showed,
    costPerReconnectShowed: row.reconnect_showed > 0 ? row.ad_spend / row.reconnect_showed : 0,
    commitments: row.commitments,
    commitmentDollars: row.commitment_dollars,
    fundedInvestors: row.funded_count,
    fundedDollars: row.funded_dollars,
    costPerInvestor: row.cpa,
    costOfCapital: row.cost_of_capital_pct,
  };
}

function formatPeriodLabel(periodStart: string, granularity: Granularity): string {
  const d = parseISO(periodStart);
  switch (granularity) {
    case 'daily':
      return format(d, 'MMM d');
    case 'weekly': {
      const end = endOfWeek(d, { weekStartsOn: 1 });
      return `${format(d, 'M/d')}-${format(end, 'M/d')}`;
    }
    case 'monthly':
      return format(d, 'MMM yyyy');
  }
}

export function PeriodicStatsTable({ clientId, dailyMetrics: externalMetrics }: PeriodicStatsTableProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [addingMonth, setAddingMonth] = useState<number | null>(null);
  const [newMonthData, setNewMonthData] = useState<Record<string, string>>({});
  const [showReconciliation, setShowReconciliation] = useState(false);

  // ── Data from DB views (when clientId is present) ──
  const { data: viewData = [], isLoading: viewLoading } = useClientPerformance(
    clientId, periodType as Granularity, selectedYear
  );

  const { data: reconciliationData, isLoading: reconLoading } = useReconciliationCheck(
    clientId, selectedYear, showReconciliation
  );

  const { data: clientSettings } = useClientSettings(clientId);
  const upsertMonthlyMetric = useUpsertMonthlyMetric();
  const updateDailyMetric = useUpdateDailyMetric();

  const thresholds = useMemo(() => getThresholdsFromSettings(clientSettings), [clientSettings]);

  const metricLabels: Record<string, string> = useMemo(() => {
    return (clientSettings as any)?.metric_labels || {};
  }, [clientSettings]);

  // ── Build PeriodStats[] from either view data or passed-in dailyMetrics ──
  const periodicStats = useMemo((): PeriodStats[] => {
    // If we have a clientId, use the DB views
    if (clientId && viewData.length > 0) {
      const stats = viewData.map(row =>
        viewRowToStats(row, formatPeriodLabel(row.period_start, periodType as Granularity))
      );

      // For monthly, pad missing months
      if (periodType === 'monthly') {
        const existingMonths = new Set(stats.map(s => s.month));
        const allMonths: PeriodStats[] = [];
        for (let month = 1; month <= 12; month++) {
          const existing = stats.find(s => s.month === month);
          if (existing) {
            allMonths.push(existing);
          } else {
            allMonths.push({
              period: `${selectedYear}-${String(month).padStart(2, '0')}-01`,
              periodLabel: format(new Date(selectedYear, month - 1, 1), 'MMM yyyy'),
              year: selectedYear,
              month,
              hasData: false,
              adSpend: 0, leads: 0, cpl: 0, calls: 0, costPerCall: 0,
              showedCalls: 0, showRate: 0, costPerShow: 0,
              reconnectCalls: 0, costPerReconnect: 0,
              reconnectShowed: 0, costPerReconnectShowed: 0,
              commitments: 0, commitmentDollars: 0,
              fundedInvestors: 0, fundedDollars: 0,
              costPerInvestor: 0, costOfCapital: 0,
            });
          }
        }
        return allMonths;
      }

      return stats;
    }

    // Fallback: build from externalMetrics (for agency-level view or when no clientId)
    const metricsToUse = externalMetrics || [];
    if (metricsToUse.length === 0 && periodType === 'monthly') {
      // Return empty month shells
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        return {
          period: `${selectedYear}-${String(month).padStart(2, '0')}-01`,
          periodLabel: format(new Date(selectedYear, i, 1), 'MMM yyyy'),
          year: selectedYear, month, hasData: false,
          adSpend: 0, leads: 0, cpl: 0, calls: 0, costPerCall: 0,
          showedCalls: 0, showRate: 0, costPerShow: 0,
          reconnectCalls: 0, costPerReconnect: 0,
          reconnectShowed: 0, costPerReconnectShowed: 0,
          commitments: 0, commitmentDollars: 0,
          fundedInvestors: 0, fundedDollars: 0,
          costPerInvestor: 0, costOfCapital: 0,
        };
      });
    }

    if (metricsToUse.length === 0) return [];

    // Client-side aggregation for external metrics (agency overview)
    const metricsWithDates = metricsToUse.map(m => ({ ...m, parsedDate: parseISO(m.date) }));
    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);

    let periods: { start: Date; end: Date; label: string }[] = [];

    if (periodType === 'monthly') {
      for (let month = 0; month < 12; month++) {
        const start = new Date(selectedYear, month, 1);
        periods.push({ start, end: endOfMonth(start), label: format(start, 'MMM yyyy') });
      }
    } else if (periodType === 'weekly') {
      const weeks = eachWeekOfInterval({ start: yearStart, end: yearEnd }, { weekStartsOn: 1 });
      periods = weeks.map(ws => ({
        start: startOfWeek(ws, { weekStartsOn: 1 }),
        end: endOfWeek(ws, { weekStartsOn: 1 }),
        label: `${format(startOfWeek(ws, { weekStartsOn: 1 }), 'M/d')}-${format(endOfWeek(ws, { weekStartsOn: 1 }), 'M/d')}`
      }));
    } else {
      const days = eachDayOfInterval({ start: yearStart, end: yearEnd });
      periods = days.map(d => ({ start: d, end: d, label: format(d, 'MMM d') }));
    }

    return periods.map(period => {
      const pm = metricsWithDates.filter(m => isWithinInterval(m.parsedDate, { start: period.start, end: period.end }));
      const t = pm.reduce((a, d) => ({
        adSpend: a.adSpend + Number(d.ad_spend || 0),
        leads: a.leads + (d.leads || 0),
        calls: a.calls + (d.calls || 0),
        showedCalls: a.showedCalls + (d.showed_calls || 0),
        reconnectCalls: a.reconnectCalls + (d.reconnect_calls || 0),
        reconnectShowed: a.reconnectShowed + (d.reconnect_showed || 0),
        commitments: a.commitments + (d.commitments || 0),
        commitmentDollars: a.commitmentDollars + Number(d.commitment_dollars || 0),
        fundedInvestors: a.fundedInvestors + (d.funded_investors || 0),
        fundedDollars: a.fundedDollars + Number(d.funded_dollars || 0),
      }), { adSpend: 0, leads: 0, calls: 0, showedCalls: 0, reconnectCalls: 0, reconnectShowed: 0, commitments: 0, commitmentDollars: 0, fundedInvestors: 0, fundedDollars: 0 });

      return {
        period: format(period.start, 'yyyy-MM-dd'),
        periodLabel: period.label,
        year: selectedYear,
        month: period.start.getMonth() + 1,
        hasData: pm.length > 0,
        ...t,
        cpl: t.leads > 0 ? t.adSpend / t.leads : 0,
        costPerCall: t.calls > 0 ? t.adSpend / t.calls : 0,
        showRate: t.calls > 0 ? (t.showedCalls / t.calls) * 100 : 0,
        costPerShow: t.showedCalls > 0 ? t.adSpend / t.showedCalls : 0,
        costPerReconnect: t.reconnectCalls > 0 ? t.adSpend / t.reconnectCalls : 0,
        costPerReconnectShowed: t.reconnectShowed > 0 ? t.adSpend / t.reconnectShowed : 0,
        costPerInvestor: t.fundedInvestors > 0 ? t.adSpend / t.fundedInvestors : 0,
        costOfCapital: t.fundedDollars > 0 ? (t.adSpend / t.fundedDollars) * 100 : 0,
      };
    });
  }, [clientId, viewData, externalMetrics, periodType, selectedYear]);

  const displayStats = periodType === 'monthly'
    ? periodicStats.filter(p => p.hasData)
    : periodicStats.filter(p => p.hasData);

  const emptyMonths = periodType === 'monthly'
    ? periodicStats.filter(p => !p.hasData && (selectedYear < CURRENT_YEAR || p.month <= new Date().getMonth() + 1))
    : [];

  // Calculate totals
  const totals = useMemo(() => {
    const t = displayStats.reduce((acc, p) => ({
      adSpend: acc.adSpend + p.adSpend,
      leads: acc.leads + p.leads,
      calls: acc.calls + p.calls,
      showedCalls: acc.showedCalls + p.showedCalls,
      reconnectCalls: acc.reconnectCalls + p.reconnectCalls,
      reconnectShowed: acc.reconnectShowed + p.reconnectShowed,
      commitments: acc.commitments + p.commitments,
      commitmentDollars: acc.commitmentDollars + p.commitmentDollars,
      fundedInvestors: acc.fundedInvestors + p.fundedInvestors,
      fundedDollars: acc.fundedDollars + p.fundedDollars,
    }), {
      adSpend: 0, leads: 0, calls: 0, showedCalls: 0, reconnectCalls: 0,
      reconnectShowed: 0, commitments: 0, commitmentDollars: 0, fundedInvestors: 0, fundedDollars: 0,
    });

    return {
      ...t,
      cpl: t.leads > 0 ? t.adSpend / t.leads : 0,
      costPerCall: t.calls > 0 ? t.adSpend / t.calls : 0,
      showRate: t.calls > 0 ? (t.showedCalls / t.calls) * 100 : 0,
      costPerShow: t.showedCalls > 0 ? t.adSpend / t.showedCalls : 0,
      costPerReconnect: t.reconnectCalls > 0 ? t.adSpend / t.reconnectCalls : 0,
      costPerReconnectShowed: t.reconnectShowed > 0 ? t.adSpend / t.reconnectShowed : 0,
      costPerInvestor: t.fundedInvestors > 0 ? t.adSpend / t.fundedInvestors : 0,
      costOfCapital: t.fundedDollars > 0 ? (t.adSpend / t.fundedDollars) * 100 : 0,
      period: 'total',
      periodLabel: 'TOTAL',
      year: selectedYear,
      month: 0,
      hasData: true,
    } as PeriodStats;
  }, [displayStats, selectedYear]);

  // ── Edit handlers (unchanged from original) ──
  const handleEditClick = (period: string, field: string, currentValue: number) => {
    setEditing({ period, field, value: currentValue.toString() });
  };

  const handleEditSave = async (periodStats: PeriodStats) => {
    if (!editing || !clientId) return;

    const fieldMap: Record<string, string> = {
      adSpend: 'ad_spend', leads: 'leads', calls: 'calls',
      showedCalls: 'showed_calls', reconnectCalls: 'reconnect_calls',
      reconnectShowed: 'reconnect_showed', commitments: 'commitments',
      commitmentDollars: 'commitment_dollars', fundedInvestors: 'funded_investors',
      fundedDollars: 'funded_dollars',
    };

    const dbField = fieldMap[editing.field];
    if (!dbField) return;
    const desiredValue = parseFloat(editing.value) || 0;

    try {
      if (periodType === 'daily') {
        await updateDailyMetric.mutateAsync({ clientId, date: periodStats.period, updates: { [dbField]: desiredValue } });
      } else if (periodType === 'weekly') {
        // For weekly edits, adjust first day of the week
        await updateDailyMetric.mutateAsync({ clientId, date: periodStats.period, updates: { [dbField]: desiredValue } });
      } else {
        await upsertMonthlyMetric.mutateAsync({
          clientId, year: periodStats.year, month: periodStats.month,
          updates: { [dbField]: desiredValue },
        });
      }
      toast.success('Metric updated successfully');
      setEditing(null);
    } catch (error) {
      toast.error('Failed to update metric');
    }
  };

  const handleAddMonth = async () => {
    if (!addingMonth || !clientId) return;
    try {
      await upsertMonthlyMetric.mutateAsync({
        clientId, year: selectedYear, month: addingMonth,
        updates: {
          ad_spend: parseFloat(newMonthData.adSpend) || 0,
          leads: parseInt(newMonthData.leads) || 0,
          calls: parseInt(newMonthData.calls) || 0,
          showed_calls: parseInt(newMonthData.showedCalls) || 0,
          reconnect_calls: parseInt(newMonthData.reconnectCalls) || 0,
          reconnect_showed: parseInt(newMonthData.reconnectShowed) || 0,
          commitments: parseInt(newMonthData.commitments) || 0,
          commitment_dollars: parseFloat(newMonthData.commitmentDollars) || 0,
          funded_investors: parseInt(newMonthData.fundedInvestors) || 0,
          funded_dollars: parseFloat(newMonthData.fundedDollars) || 0,
        },
      });
      toast.success(`${MONTH_NAMES[addingMonth - 1]} data added successfully`);
      setAddingMonth(null);
      setNewMonthData({});
    } catch (error) {
      toast.error('Failed to add month data');
    }
  };

  const getKpiColorClass = (_metric: MetricRowConfig, _value: number): string => '';

  const renderEditableCell = (periodStats: PeriodStats, metric: MetricRowConfig, value: number) => {
    const isEditing = editing?.period === periodStats.period && editing?.field === metric.key;

    if (isEditing) {
      return (
        <div className="flex items-center justify-center gap-1">
          <Input
            type="number"
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            className="h-6 w-20 text-xs px-1"
            autoFocus
          />
          <Button
            size="icon" variant="ghost" className="h-5 w-5"
            onClick={() => handleEditSave(periodStats)}
            disabled={upsertMonthlyMetric.isPending || updateDailyMetric.isPending}
          >
            {(upsertMonthlyMetric.isPending || updateDailyMetric.isPending) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-success" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditing(null)}>
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      );
    }

    const colorClass = metric.highlight ? 'text-emerald-400 font-semibold' : getKpiColorClass(metric, value);

    return (
      <div className="relative flex items-center justify-center group">
        <span className={colorClass}>{metric.format(value)}</span>
        {clientId && metric.editable && (
          <Button
            size="icon" variant="ghost"
            className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0"
            onClick={() => handleEditClick(periodStats.period, metric.key, value)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  };

  const periodLabels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
  const isLoading = clientId ? viewLoading : false;

  if (isLoading) {
    return (
      <section className="border-2 border-border bg-card p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-lg">
            {periodLabels[periodType]} Performance Summary
          </h3>
          <p className="text-xs text-muted-foreground">
            Aggregated metrics by {periodType === 'daily' ? 'day' : periodType === 'weekly' ? 'week' : 'month'} for {selectedYear}
            {clientId && <span className="ml-1 text-muted-foreground/60">• Server-computed from DB views</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-20 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-0.5">
            {(['monthly', 'weekly', 'daily'] as const).map(pt => (
              <Button
                key={pt}
                variant={periodType === pt ? 'default' : 'outline'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setPeriodType(pt)}
              >
                {pt[0].toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {displayStats.length === 0 && periodType === 'monthly' ? (
        <div className="py-8 text-center">
          <p className="text-muted-foreground mb-4">No data available for {selectedYear}</p>
          {clientId && emptyMonths.length > 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Add historical data for:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {emptyMonths.map(m => (
                  <Button key={m.month} variant="outline" size="sm" onClick={() => setAddingMonth(m.month)}>
                    <Plus className="h-3 w-3 mr-1" />
                    {MONTH_NAMES[m.month - 1]}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {clientId && periodType === 'monthly' && emptyMonths.length > 0 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Add missing month:</span>
              {emptyMonths.slice(0, 3).map(m => (
                <Button key={m.month} variant="outline" size="sm" onClick={() => setAddingMonth(m.month)}>
                  <Plus className="h-3 w-3 mr-1" />
                  {MONTH_NAMES[m.month - 1]}
                </Button>
              ))}
              {emptyMonths.length > 3 && (
                <span className="text-xs text-muted-foreground">+{emptyMonths.length - 3} more</span>
              )}
            </div>
          )}

          {/* Transposed Table */}
          <div className="relative -mx-2">
            <div className="overflow-x-auto">
              <Table className="text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="font-bold whitespace-nowrap bg-card w-[120px] py-2 px-3 text-left sticky left-0 z-20 shadow-[2px_0_4px_-2px_hsl(var(--border))]">
                      Metric
                    </TableHead>
                    <TableHead className="font-bold text-center whitespace-nowrap bg-muted min-w-[110px] py-2 px-3 sticky left-[120px] z-20 shadow-[2px_0_4px_-2px_hsl(var(--border))]">
                      TOTAL
                    </TableHead>
                    {displayStats.map((period, i) => (
                      <TableHead
                        key={period.period}
                        className={`font-bold text-center whitespace-nowrap py-2 px-4 min-w-[110px] ${i < displayStats.length - 1 ? 'border-r border-border/50' : ''}`}
                      >
                        {period.periodLabel}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METRIC_ROWS.map((metric) => {
                    const totalValue = totals[metric.key] as number;
                    const totalColorClass = metric.highlight ? 'text-emerald-400 font-semibold' : getKpiColorClass(metric, totalValue);

                    return (
                      <TableRow key={metric.key} className={`border-b border-border/20 ${metric.highlight ? 'bg-emerald-500/5' : ''}`}>
                        <TableCell className="font-medium whitespace-nowrap bg-card py-1.5 px-3 text-left sticky left-0 z-20 shadow-[2px_0_4px_-2px_hsl(var(--border))] border-b border-border/20">
                          {metricLabels[metric.key] || metric.label}
                        </TableCell>
                        <TableCell className="text-center bg-muted py-1.5 px-3 font-semibold sticky left-[120px] z-20 shadow-[2px_0_4px_-2px_hsl(var(--border))] border-b border-border/20 tabular-nums">
                          <span className={totalColorClass}>
                            {metric.format(totalValue)}
                          </span>
                        </TableCell>
                        {displayStats.map((period, i) => {
                          const value = period[metric.key] as number;
                          const colorClass = metric.highlight ? 'text-emerald-400 font-semibold' : getKpiColorClass(metric, value);

                          return (
                            <TableCell
                              key={period.period}
                              className={`text-center py-1.5 px-4 min-w-[110px] tabular-nums ${i < displayStats.length - 1 ? 'border-r border-border/50' : ''}`}
                            >
                              {metric.editable
                                ? renderEditableCell(period, metric, value)
                                : <span className={colorClass}>{metric.format(value)}</span>
                              }
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Reconciliation Check Link */}
          {clientId && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                onClick={() => setShowReconciliation(true)}
              >
                <Scale className="h-3.5 w-3.5" />
                Reconciliation check
              </Button>
            </div>
          )}
        </>
      )}

      {/* Add Month Modal */}
      {addingMonth && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="bg-card border-2 border-border p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">Add Data for {MONTH_NAMES[addingMonth - 1]} {selectedYear}</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Ad Spend', key: 'adSpend' },
                { label: 'Leads', key: 'leads' },
                { label: 'Calls', key: 'calls' },
                { label: 'Showed Calls', key: 'showedCalls' },
                { label: 'Reconnect Calls', key: 'reconnectCalls' },
                { label: 'Reconnect Showed', key: 'reconnectShowed' },
                { label: 'Commitments', key: 'commitments' },
                { label: 'Commitment $', key: 'commitmentDollars' },
                { label: 'Funded Investors', key: 'fundedInvestors' },
                { label: 'Funded $', key: 'fundedDollars' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-sm font-medium">{label}</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newMonthData[key] || ''}
                    onChange={(e) => setNewMonthData({ ...newMonthData, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => { setAddingMonth(null); setNewMonthData({}); }}>
                Cancel
              </Button>
              <Button onClick={handleAddMonth} disabled={upsertMonthlyMetric.isPending}>
                {upsertMonthlyMetric.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Modal */}
      <Dialog open={showReconciliation} onOpenChange={setShowReconciliation}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Reconciliation Check — {selectedYear}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Compares sum-of-dailies vs weekly view vs monthly view. All should match.
          </p>
          {reconLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : reconciliationData ? (
            <div className="space-y-0">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2">Metric</TableHead>
                    <TableHead className="text-right py-2">Daily Σ</TableHead>
                    <TableHead className="text-right py-2">Weekly Σ</TableHead>
                    <TableHead className="text-right py-2">Monthly Σ</TableHead>
                    <TableHead className="text-center py-2">D↔W</TableHead>
                    <TableHead className="text-center py-2">W↔M</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliationData.map(r => (
                    <TableRow key={r.metric}>
                      <TableCell className="py-1.5 font-medium">{r.metric}</TableCell>
                      <TableCell className="text-right py-1.5 tabular-nums">{r.dailySum.toLocaleString()}</TableCell>
                      <TableCell className="text-right py-1.5 tabular-nums">{r.weeklySum.toLocaleString()}</TableCell>
                      <TableCell className="text-right py-1.5 tabular-nums">{r.monthlySum.toLocaleString()}</TableCell>
                      <TableCell className="text-center py-1.5">
                        {r.dailyVsWeekly
                          ? <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                          : <XCircle className="h-4 w-4 text-destructive mx-auto" />
                        }
                      </TableCell>
                      <TableCell className="text-center py-1.5">
                        {r.weeklyVsMonthly
                          ? <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />
                          : <XCircle className="h-4 w-4 text-destructive mx-auto" />
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {reconciliationData.every(r => r.dailyVsWeekly && r.weeklyVsMonthly) && (
                <p className="text-sm text-emerald-500 font-medium mt-3 flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4" />
                  All metrics reconcile perfectly across daily, weekly, and monthly views.
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
