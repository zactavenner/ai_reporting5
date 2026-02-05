import { useMemo, useState } from 'react';
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, eachDayOfInterval, isWithinInterval, parseISO } from 'date-fns';
import { DailyMetric } from '@/hooks/useMetrics';
import { useYearlyMetrics, useUpsertMonthlyMetric } from '@/hooks/useYearlyMetrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pencil, Plus, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PeriodicStatsTableProps {
  clientId?: string;
  dailyMetrics?: DailyMetric[]; // Optional fallback for non-client views
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

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function PeriodicStatsTable({ clientId, dailyMetrics: externalMetrics }: PeriodicStatsTableProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [addingMonth, setAddingMonth] = useState<number | null>(null);
  const [newMonthData, setNewMonthData] = useState<Record<string, string>>({});

  // Fetch yearly metrics if clientId provided
  const { data: yearlyMetrics = [], isLoading } = useYearlyMetrics(clientId, selectedYear);
  const upsertMonthlyMetric = useUpsertMonthlyMetric();

  // Use external metrics if no clientId, otherwise use yearly metrics
  const metricsToUse = clientId ? yearlyMetrics : (externalMetrics || []);

  const periodicStats = useMemo(() => {
    // Generate all months for the year
    const allMonths: PeriodStats[] = [];

    if (periodType === 'monthly') {
      for (let month = 1; month <= 12; month++) {
        const monthStart = new Date(selectedYear, month - 1, 1);
        const monthEnd = endOfMonth(monthStart);

        // Filter metrics for this month
        const monthMetrics = metricsToUse.filter(m => {
          const date = parseISO(m.date);
          return isWithinInterval(date, { start: monthStart, end: monthEnd });
        });

        const totals = monthMetrics.reduce((acc, day) => ({
          adSpend: acc.adSpend + Number(day.ad_spend || 0),
          leads: acc.leads + (day.leads || 0),
          calls: acc.calls + (day.calls || 0),
          showedCalls: acc.showedCalls + (day.showed_calls || 0),
          reconnectCalls: acc.reconnectCalls + (day.reconnect_calls || 0),
          reconnectShowed: acc.reconnectShowed + (day.reconnect_showed || 0),
          commitments: acc.commitments + (day.commitments || 0),
          commitmentDollars: acc.commitmentDollars + Number(day.commitment_dollars || 0),
          fundedInvestors: acc.fundedInvestors + (day.funded_investors || 0),
          fundedDollars: acc.fundedDollars + Number(day.funded_dollars || 0),
        }), {
          adSpend: 0, leads: 0, calls: 0, showedCalls: 0, reconnectCalls: 0,
          reconnectShowed: 0, commitments: 0, commitmentDollars: 0, fundedInvestors: 0, fundedDollars: 0,
        });

        const hasData = monthMetrics.length > 0;

        allMonths.push({
          period: format(monthStart, 'yyyy-MM-dd'),
          periodLabel: format(monthStart, 'MMMM yyyy'),
          year: selectedYear,
          month,
          hasData,
          adSpend: totals.adSpend,
          leads: totals.leads,
          cpl: totals.leads > 0 ? totals.adSpend / totals.leads : 0,
          calls: totals.calls,
          costPerCall: totals.calls > 0 ? totals.adSpend / totals.calls : 0,
          showedCalls: totals.showedCalls,
          showRate: totals.calls > 0 ? (totals.showedCalls / totals.calls) * 100 : 0,
          costPerShow: totals.showedCalls > 0 ? totals.adSpend / totals.showedCalls : 0,
          reconnectCalls: totals.reconnectCalls,
          costPerReconnect: totals.reconnectCalls > 0 ? totals.adSpend / totals.reconnectCalls : 0,
          reconnectShowed: totals.reconnectShowed,
          costPerReconnectShowed: totals.reconnectShowed > 0 ? totals.adSpend / totals.reconnectShowed : 0,
          commitments: totals.commitments,
          commitmentDollars: totals.commitmentDollars,
          fundedInvestors: totals.fundedInvestors,
          fundedDollars: totals.fundedDollars,
          costPerInvestor: totals.fundedInvestors > 0 ? totals.adSpend / totals.fundedInvestors : 0,
          costOfCapital: totals.fundedDollars > 0 ? (totals.adSpend / totals.fundedDollars) * 100 : 0,
        });
      }

      // Return in reverse order (most recent first)
      return allMonths.reverse();
    }

    // For weekly and daily, use existing logic
    if (metricsToUse.length === 0) return [];

    const metricsWithDates = metricsToUse.map(m => ({
      ...m,
      parsedDate: parseISO(m.date)
    }));

    const yearStart = new Date(selectedYear, 0, 1);
    const yearEnd = new Date(selectedYear, 11, 31);

    let periods: { start: Date; end: Date; label: string }[] = [];

    if (periodType === 'daily') {
      const days = eachDayOfInterval({ start: yearStart, end: yearEnd });
      periods = days.map(day => ({
        start: day,
        end: day,
        label: format(day, 'MMM d, yyyy')
      }));
    } else if (periodType === 'weekly') {
      const weeks = eachWeekOfInterval({ start: yearStart, end: yearEnd }, { weekStartsOn: 1 });
      periods = weeks.map(weekStart => ({
        start: startOfWeek(weekStart, { weekStartsOn: 1 }),
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
        label: `${format(startOfWeek(weekStart, { weekStartsOn: 1 }), 'M/d')}-${format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'M/d')}`
      }));
    }

    const stats: PeriodStats[] = periods.map(period => {
      const periodMetrics = metricsWithDates.filter(m =>
        isWithinInterval(m.parsedDate, { start: period.start, end: period.end })
      );

      const totals = periodMetrics.reduce((acc, day) => ({
        adSpend: acc.adSpend + Number(day.ad_spend || 0),
        leads: acc.leads + (day.leads || 0),
        calls: acc.calls + (day.calls || 0),
        showedCalls: acc.showedCalls + (day.showed_calls || 0),
        reconnectCalls: acc.reconnectCalls + (day.reconnect_calls || 0),
        reconnectShowed: acc.reconnectShowed + (day.reconnect_showed || 0),
        commitments: acc.commitments + (day.commitments || 0),
        commitmentDollars: acc.commitmentDollars + Number(day.commitment_dollars || 0),
        fundedInvestors: acc.fundedInvestors + (day.funded_investors || 0),
        fundedDollars: acc.fundedDollars + Number(day.funded_dollars || 0),
      }), {
        adSpend: 0, leads: 0, calls: 0, showedCalls: 0, reconnectCalls: 0,
        reconnectShowed: 0, commitments: 0, commitmentDollars: 0, fundedInvestors: 0, fundedDollars: 0,
      });

      return {
        period: format(period.start, 'yyyy-MM-dd'),
        periodLabel: period.label,
        year: selectedYear,
        month: period.start.getMonth() + 1,
        hasData: periodMetrics.length > 0,
        adSpend: totals.adSpend,
        leads: totals.leads,
        cpl: totals.leads > 0 ? totals.adSpend / totals.leads : 0,
        calls: totals.calls,
        costPerCall: totals.calls > 0 ? totals.adSpend / totals.calls : 0,
        showedCalls: totals.showedCalls,
        showRate: totals.calls > 0 ? (totals.showedCalls / totals.calls) * 100 : 0,
        costPerShow: totals.showedCalls > 0 ? totals.adSpend / totals.showedCalls : 0,
        reconnectCalls: totals.reconnectCalls,
        costPerReconnect: totals.reconnectCalls > 0 ? totals.adSpend / totals.reconnectCalls : 0,
        reconnectShowed: totals.reconnectShowed,
        costPerReconnectShowed: totals.reconnectShowed > 0 ? totals.adSpend / totals.reconnectShowed : 0,
        commitments: totals.commitments,
        commitmentDollars: totals.commitmentDollars,
        fundedInvestors: totals.fundedInvestors,
        fundedDollars: totals.fundedDollars,
        costPerInvestor: totals.fundedInvestors > 0 ? totals.adSpend / totals.fundedInvestors : 0,
        costOfCapital: totals.fundedDollars > 0 ? (totals.adSpend / totals.fundedDollars) * 100 : 0,
      };
    }).filter(p => p.hasData);

    return stats.sort((a, b) => b.period.localeCompare(a.period));
  }, [metricsToUse, periodType, selectedYear]);

  // Filter to only show months with data (for monthly view)
  const displayStats = periodType === 'monthly'
    ? periodicStats.filter(p => p.hasData)
    : periodicStats;

  // Get months without data for "Add" option
  const emptyMonths = periodType === 'monthly'
    ? periodicStats.filter(p => !p.hasData && p.month <= new Date().getMonth() + 1)
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
    };
  }, [displayStats]);

  const handleEditClick = (period: string, field: string, currentValue: number) => {
    setEditing({ period, field, value: currentValue.toString() });
  };

  const handleEditSave = async (periodStats: PeriodStats) => {
    if (!editing || !clientId) return;

    const fieldMap: Record<string, string> = {
      adSpend: 'ad_spend',
      leads: 'leads',
      calls: 'calls',
      showedCalls: 'showed_calls',
      reconnectCalls: 'reconnect_calls',
      reconnectShowed: 'reconnect_showed',
      commitments: 'commitments',
      commitmentDollars: 'commitment_dollars',
      fundedInvestors: 'funded_investors',
      fundedDollars: 'funded_dollars',
    };

    const dbField = fieldMap[editing.field];
    if (!dbField) return;

    try {
      await upsertMonthlyMetric.mutateAsync({
        clientId,
        year: periodStats.year,
        month: periodStats.month,
        updates: { [dbField]: parseFloat(editing.value) || 0 },
      });
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
        clientId,
        year: selectedYear,
        month: addingMonth,
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

  const renderEditableCell = (periodStats: PeriodStats, field: string, value: number, format: (v: number) => string) => {
    const isEditing = editing?.period === periodStats.period && editing?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            className="h-6 w-20 text-xs px-1"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => handleEditSave(periodStats)}
            disabled={upsertMonthlyMetric.isPending}
          >
            {upsertMonthlyMetric.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => setEditing(null)}
          >
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 group">
        <span>{format(value)}</span>
        {clientId && (
          <Button
            size="icon"
            variant="ghost"
            className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleEditClick(periodStats.period, field, value)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  };

  const periodLabels = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly'
  };

  if (isLoading && clientId) {
    return (
      <section className="border-2 border-border bg-card p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="border-2 border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-lg">
            {periodLabels[periodType]} Performance Summary
          </h3>
          <p className="text-sm text-muted-foreground">
            Aggregated metrics by {periodType === 'daily' ? 'day' : periodType === 'weekly' ? 'week' : 'month'} for {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_YEARS.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button
              variant={periodType === 'monthly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodType('monthly')}
            >
              Monthly
            </Button>
            <Button
              variant={periodType === 'weekly' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodType('weekly')}
            >
              Weekly
            </Button>
            <Button
              variant={periodType === 'daily' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodType('daily')}
            >
              Daily
            </Button>
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
                  <Button
                    key={m.month}
                    variant="outline"
                    size="sm"
                    onClick={() => setAddingMonth(m.month)}
                  >
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
          {/* Add month option */}
          {clientId && periodType === 'monthly' && emptyMonths.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Add missing month:</span>
              {emptyMonths.slice(0, 3).map(m => (
                <Button
                  key={m.month}
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingMonth(m.month)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {MONTH_NAMES[m.month - 1]}
                </Button>
              ))}
              {emptyMonths.length > 3 && (
                <span className="text-xs text-muted-foreground">+{emptyMonths.length - 3} more</span>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold whitespace-nowrap">
                    {periodType === 'daily' ? 'Day' : periodType === 'weekly' ? 'Week' : 'Month'}
                  </TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Ad Spend</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Leads</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">CPL</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Calls</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">$/Call</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Showed</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Show %</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">$/Show</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Recon</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">$/Recon</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Recon Shwd</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">$/R.Shwd</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Commits</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Commit $</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Funded #</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">Funded $</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">CPA</TableHead>
                  <TableHead className="font-bold text-right whitespace-nowrap">CoC %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Totals Row */}
                <TableRow className="border-b-2 bg-muted/50 font-semibold">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right font-mono">${totals.adSpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right font-mono">{totals.leads.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${totals.cpl.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{totals.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${totals.costPerCall.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{totals.showedCalls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{totals.showRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono">${totals.costPerShow.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{totals.reconnectCalls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${totals.costPerReconnect.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{totals.reconnectShowed.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${totals.costPerReconnectShowed.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{totals.commitments.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${totals.commitmentDollars.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{totals.fundedInvestors.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-chart-2">${totals.fundedDollars.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${totals.costPerInvestor.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right font-mono">{totals.costOfCapital.toFixed(2)}%</TableCell>
                </TableRow>

                {displayStats.map((period) => (
                  <TableRow key={period.period} className="border-b">
                    <TableCell className="font-medium whitespace-nowrap">{period.periodLabel}</TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'adSpend', period.adSpend, (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'leads', period.leads, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono">${period.cpl.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'calls', period.calls, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono">${period.costPerCall.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'showedCalls', period.showedCalls, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono">{period.showRate.toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono">${period.costPerShow.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'reconnectCalls', period.reconnectCalls, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono">${period.costPerReconnect.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'reconnectShowed', period.reconnectShowed, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono">${period.costPerReconnectShowed.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'commitments', period.commitments, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'commitmentDollars', period.commitmentDollars, (v) => `$${v.toLocaleString()}`)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {renderEditableCell(period, 'fundedInvestors', period.fundedInvestors, (v) => v.toString())}
                    </TableCell>
                    <TableCell className="text-right font-mono text-chart-2">
                      {renderEditableCell(period, 'fundedDollars', period.fundedDollars, (v) => `$${v.toLocaleString()}`)}
                    </TableCell>
                    <TableCell className="text-right font-mono">${period.costPerInvestor.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-mono">{period.costOfCapital.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add Month Modal */}
      {addingMonth && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <div className="bg-card border-2 border-border p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">Add Data for {MONTH_NAMES[addingMonth - 1]} {selectedYear}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Ad Spend</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.adSpend || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, adSpend: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Leads</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.leads || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, leads: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Calls</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.calls || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, calls: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Showed Calls</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.showedCalls || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, showedCalls: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Reconnect Calls</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.reconnectCalls || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, reconnectCalls: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Reconnect Showed</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.reconnectShowed || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, reconnectShowed: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Commitments</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.commitments || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, commitments: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Commitment $</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.commitmentDollars || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, commitmentDollars: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Funded Investors</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.fundedInvestors || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, fundedInvestors: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Funded $</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newMonthData.fundedDollars || ''}
                  onChange={(e) => setNewMonthData({ ...newMonthData, fundedDollars: e.target.value })}
                />
              </div>
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
    </section>
  );
}
