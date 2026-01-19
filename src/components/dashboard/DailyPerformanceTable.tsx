import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Download, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DailyMetric } from '@/hooks/useMetrics';
import { Sparkline } from './Sparkline';

interface DailyPerformanceTableProps {
  dailyMetrics: DailyMetric[];
  onExportCSV: () => void;
}

const ITEMS_PER_PAGE = 30;

export function DailyPerformanceTable({ dailyMetrics, onExportCSV }: DailyPerformanceTableProps) {
  const [currentPage, setCurrentPage] = useState(0);

  // Sort by date descending
  const sortedMetrics = useMemo(() => {
    return [...dailyMetrics].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [dailyMetrics]);

  const totalPages = Math.ceil(sortedMetrics.length / ITEMS_PER_PAGE);
  
  const paginatedMetrics = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return sortedMetrics.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedMetrics, currentPage]);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  // Calculate derived metrics for each day
  const getComputedMetrics = (day: DailyMetric) => {
    const adSpend = Number(day.ad_spend) || 0;
    const leads = day.leads || 0;
    const calls = day.calls || 0;
    const showedCalls = day.showed_calls || 0;
    const fundedInvestors = day.funded_investors || 0;
    const fundedDollars = Number(day.funded_dollars) || 0;

    return {
      cpl: leads > 0 ? adSpend / leads : 0,
      costPerCall: calls > 0 ? adSpend / calls : 0,
      costPerShow: showedCalls > 0 ? adSpend / showedCalls : 0,
      showRate: calls > 0 ? (showedCalls / calls) * 100 : 0,
      costPerInvestor: fundedInvestors > 0 ? adSpend / fundedInvestors : 0,
      costOfCapital: fundedDollars > 0 ? (adSpend / fundedDollars) * 100 : 0,
    };
  };

  // Calculate sparkline data for key metrics (last 14 days, chronological order)
  const sparklineData = useMemo(() => {
    const last14Days = sortedMetrics.slice(0, 14).reverse();
    
    return {
      adSpend: last14Days.map(d => Number(d.ad_spend) || 0),
      leads: last14Days.map(d => d.leads || 0),
      cpl: last14Days.map(d => {
        const adSpend = Number(d.ad_spend) || 0;
        const leads = d.leads || 0;
        return leads > 0 ? adSpend / leads : 0;
      }),
      calls: last14Days.map(d => d.calls || 0),
      showRate: last14Days.map(d => {
        const calls = d.calls || 0;
        const showed = d.showed_calls || 0;
        return calls > 0 ? (showed / calls) * 100 : 0;
      }),
      funded: last14Days.map(d => d.funded_investors || 0),
      fundedDollars: last14Days.map(d => Number(d.funded_dollars) || 0),
    };
  }, [sortedMetrics]);

  if (dailyMetrics.length === 0) {
    return (
      <div className="border-2 border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg">Daily Performance Data</h3>
            <p className="text-sm text-muted-foreground">Detailed metrics by date</p>
          </div>
          <Button variant="outline" size="sm" onClick={onExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>No data available yet</p>
          <p className="text-sm">Click Sync to fetch data from Meta and GHL APIs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-lg">Daily Performance Data</h3>
          <p className="text-sm text-muted-foreground">
            Detailed metrics by date • Showing {paginatedMetrics.length} of {sortedMetrics.length} days
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Sparkline Trend Row */}
      <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">14-Day Trends</span>
        </div>
        <div className="grid grid-cols-7 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ad Spend</p>
            <Sparkline data={sparklineData.adSpend} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Leads</p>
            <Sparkline data={sparklineData.leads} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">CPL</p>
            <Sparkline data={sparklineData.cpl} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Calls</p>
            <Sparkline data={sparklineData.calls} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Show Rate</p>
            <Sparkline data={sparklineData.showRate} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Funded</p>
            <Sparkline data={sparklineData.funded} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Funded $</p>
            <Sparkline data={sparklineData.fundedDollars} />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2">
              <TableHead className="font-bold whitespace-nowrap">Date</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Ad Spend</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Leads</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">CPL</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Calls</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Cost/Call</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Showed</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Show %</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Cost/Show</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Commits</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Commit $</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Funded</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Funded $</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">Cost/Investor</TableHead>
              <TableHead className="font-bold text-right whitespace-nowrap">CoC %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMetrics.map((day: DailyMetric) => {
              const computed = getComputedMetrics(day);
              return (
                <TableRow key={day.id} className="border-b">
                  <TableCell className="font-medium whitespace-nowrap">{day.date}</TableCell>
                  <TableCell className="text-right font-mono">${Number(day.ad_spend).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{day.leads || 0}</TableCell>
                  <TableCell className="text-right font-mono">${computed.cpl.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{day.calls || 0}</TableCell>
                  <TableCell className="text-right font-mono">${computed.costPerCall.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{day.showed_calls || 0}</TableCell>
                  <TableCell className="text-right font-mono">{computed.showRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono">${computed.costPerShow.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{day.commitments || 0}</TableCell>
                  <TableCell className="text-right font-mono">${Number(day.commitment_dollars || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{day.funded_investors || 0}</TableCell>
                  <TableCell className="text-right font-mono text-chart-2">${Number(day.funded_dollars || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">${computed.costPerInvestor.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{computed.costOfCapital.toFixed(2)}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
