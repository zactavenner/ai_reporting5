import { useMemo, useState } from 'react';
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval, parseISO } from 'date-fns';
import { DailyMetric } from '@/hooks/useMetrics';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PeriodicStatsTableProps {
  dailyMetrics: DailyMetric[];
}

type PeriodType = 'weekly' | 'monthly';

interface PeriodStats {
  period: string;
  periodLabel: string;
  adSpend: number;
  leads: number;
  cpl: number;
  calls: number;
  costPerCall: number;
  showedCalls: number;
  showRate: number;
  commitments: number;
  commitmentDollars: number;
  fundedInvestors: number;
  fundedDollars: number;
  costPerInvestor: number;
  costOfCapital: number;
}

export function PeriodicStatsTable({ dailyMetrics }: PeriodicStatsTableProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('monthly');

  const periodicStats = useMemo(() => {
    if (dailyMetrics.length === 0) return [];

    // Parse dates and sort
    const metricsWithDates = dailyMetrics.map(m => ({
      ...m,
      parsedDate: parseISO(m.date)
    }));

    const dates = metricsWithDates.map(m => m.parsedDate);
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    let periods: { start: Date; end: Date; label: string }[] = [];

    if (periodType === 'weekly') {
      const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
      periods = weeks.map(weekStart => ({
        start: startOfWeek(weekStart, { weekStartsOn: 1 }),
        end: endOfWeek(weekStart, { weekStartsOn: 1 }),
        label: `${format(startOfWeek(weekStart, { weekStartsOn: 1 }), 'M/d')}-${format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'M/d')}`
      }));
    } else {
      const months = eachMonthOfInterval({ start: minDate, end: maxDate });
      periods = months.map(monthStart => ({
        start: startOfMonth(monthStart),
        end: endOfMonth(monthStart),
        label: format(monthStart, 'MMMM yyyy')
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
        commitments: acc.commitments + (day.commitments || 0),
        commitmentDollars: acc.commitmentDollars + Number(day.commitment_dollars || 0),
        fundedInvestors: acc.fundedInvestors + (day.funded_investors || 0),
        fundedDollars: acc.fundedDollars + Number(day.funded_dollars || 0),
      }), {
        adSpend: 0,
        leads: 0,
        calls: 0,
        showedCalls: 0,
        commitments: 0,
        commitmentDollars: 0,
        fundedInvestors: 0,
        fundedDollars: 0,
      });

      return {
        period: format(period.start, 'yyyy-MM-dd'),
        periodLabel: period.label,
        adSpend: totals.adSpend,
        leads: totals.leads,
        cpl: totals.leads > 0 ? totals.adSpend / totals.leads : 0,
        calls: totals.calls,
        costPerCall: totals.calls > 0 ? totals.adSpend / totals.calls : 0,
        showedCalls: totals.showedCalls,
        showRate: totals.calls > 0 ? (totals.showedCalls / totals.calls) * 100 : 0,
        commitments: totals.commitments,
        commitmentDollars: totals.commitmentDollars,
        fundedInvestors: totals.fundedInvestors,
        fundedDollars: totals.fundedDollars,
        costPerInvestor: totals.fundedInvestors > 0 ? totals.adSpend / totals.fundedInvestors : 0,
        costOfCapital: totals.fundedDollars > 0 ? (totals.adSpend / totals.fundedDollars) * 100 : 0,
      };
    });

    // Sort by period descending (most recent first)
    return stats.sort((a, b) => b.period.localeCompare(a.period));
  }, [dailyMetrics, periodType]);

  // Calculate totals
  const totals = useMemo(() => {
    const t = periodicStats.reduce((acc, p) => ({
      adSpend: acc.adSpend + p.adSpend,
      leads: acc.leads + p.leads,
      calls: acc.calls + p.calls,
      showedCalls: acc.showedCalls + p.showedCalls,
      commitments: acc.commitments + p.commitments,
      commitmentDollars: acc.commitmentDollars + p.commitmentDollars,
      fundedInvestors: acc.fundedInvestors + p.fundedInvestors,
      fundedDollars: acc.fundedDollars + p.fundedDollars,
    }), {
      adSpend: 0,
      leads: 0,
      calls: 0,
      showedCalls: 0,
      commitments: 0,
      commitmentDollars: 0,
      fundedInvestors: 0,
      fundedDollars: 0,
    });

    return {
      ...t,
      cpl: t.leads > 0 ? t.adSpend / t.leads : 0,
      costPerCall: t.calls > 0 ? t.adSpend / t.calls : 0,
      showRate: t.calls > 0 ? (t.showedCalls / t.calls) * 100 : 0,
      costPerInvestor: t.fundedInvestors > 0 ? t.adSpend / t.fundedInvestors : 0,
      costOfCapital: t.fundedDollars > 0 ? (t.adSpend / t.fundedDollars) * 100 : 0,
    };
  }, [periodicStats]);

  if (dailyMetrics.length === 0) {
    return null;
  }

  return (
    <section className="border-2 border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg">
            {periodType === 'weekly' ? 'Weekly' : 'Monthly'} Performance Summary
          </h3>
          <p className="text-sm text-muted-foreground">
            Aggregated metrics by {periodType === 'weekly' ? 'week' : 'month'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={periodType === 'weekly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriodType('weekly')}
          >
            Weekly
          </Button>
          <Button
            variant={periodType === 'monthly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriodType('monthly')}
          >
            Monthly
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2">
              <TableHead className="font-bold whitespace-nowrap">{periodType === 'weekly' ? 'Week' : 'Month'}</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Ad Spend</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Leads</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">CPL</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Calls</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">$/Call</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Showed</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Show %</TableHead>
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
              <TableCell className="text-right font-mono">{totals.commitments.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">${totals.commitmentDollars.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">{totals.fundedInvestors.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono text-chart-2">${totals.fundedDollars.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono">${totals.costPerInvestor.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
              <TableCell className="text-right font-mono">{totals.costOfCapital.toFixed(2)}%</TableCell>
            </TableRow>
            
            {periodicStats.map((period) => (
              <TableRow key={period.period} className="border-b">
                <TableCell className="font-medium whitespace-nowrap">{period.periodLabel}</TableCell>
                <TableCell className="text-right font-mono">${period.adSpend.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right font-mono">{period.leads}</TableCell>
                <TableCell className="text-right font-mono">${period.cpl.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">{period.calls}</TableCell>
                <TableCell className="text-right font-mono">${period.costPerCall.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">{period.showedCalls}</TableCell>
                <TableCell className="text-right font-mono">{period.showRate.toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono">{period.commitments}</TableCell>
                <TableCell className="text-right font-mono">${period.commitmentDollars.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">{period.fundedInvestors}</TableCell>
                <TableCell className="text-right font-mono text-chart-2">${period.fundedDollars.toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">${period.costPerInvestor.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-right font-mono">{period.costOfCapital.toFixed(2)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
