import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileBarChart,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Clock,
  ChevronRight,
  Slack,
} from 'lucide-react';
import { useLatestDailyReport, useGenerateDailyReport, DailyReportClientDetail } from '@/hooks/useDailyReports';

function DeltaBadge({ value, label }: { value: number; label?: string }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        {label || '0'}
      </span>
    );
  }
  const isPositive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      }`}
    >
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? '+' : ''}{value}
      {label ? ` ${label}` : ''}
    </span>
  );
}

function SyncStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-emerald-500',
    stale: 'bg-amber-500',
    error: 'bg-red-500',
    not_configured: 'bg-gray-400',
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || 'bg-gray-400'}`} />;
}

export function DailyReportCard() {
  const { data: report, isLoading } = useLatestDailyReport();
  const generateReport = useGenerateDailyReport();
  const [showDetail, setShowDetail] = useState(false);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Daily Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileBarChart className="h-4 w-4" />
            Daily Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">No daily reports yet.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateReport.mutate()}
            disabled={generateReport.isPending}
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${generateReport.isPending ? 'animate-spin' : ''}`} />
            Generate Report
          </Button>
        </CardContent>
      </Card>
    );
  }

  const accuracyOk = report.discrepancies_found === 0;
  const syncHealthy = report.error_clients === 0 && report.stale_clients === 0;

  return (
    <>
      <Card
        className="cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => setShowDetail(true)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileBarChart className="h-4 w-4" />
              Daily Report — {format(new Date(report.report_date + 'T12:00:00'), 'MMM d, yyyy')}
            </CardTitle>
            <div className="flex items-center gap-2">
              {report.slack_sent && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Slack className="h-3 w-3" />
                  Sent
                </Badge>
              )}
              <Badge
                variant={report.status === 'completed' ? 'default' : 'destructive'}
                className="text-xs"
              >
                {report.status === 'completed' ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                {report.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Key metrics row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
            <div>
              <p className="text-xs text-muted-foreground">Leads</p>
              <p className="text-lg font-semibold">{report.total_leads}</p>
              <DeltaBadge value={report.leads_delta} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Calls</p>
              <p className="text-lg font-semibold">{report.total_calls}</p>
              <DeltaBadge value={report.calls_delta} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Showed</p>
              <p className="text-lg font-semibold">{report.total_showed}</p>
              <DeltaBadge value={report.showed_delta} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Funded</p>
              <p className="text-lg font-semibold">{report.total_funded}</p>
              <DeltaBadge value={report.funded_delta} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ad Spend</p>
              <p className="text-lg font-semibold">${report.total_ad_spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <DeltaBadge value={Math.round(report.ad_spend_delta)} label="" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Funded $</p>
              <p className="text-lg font-semibold">${report.total_funded_dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              {accuracyOk ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              )}
              {accuracyOk
                ? 'Accurate'
                : `${report.discrepancies_fixed}/${report.discrepancies_found} fixed`}
            </span>
            <span className="flex items-center gap-1.5">
              {syncHealthy ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              )}
              {report.healthy_clients}/{report.total_clients} healthy
            </span>
            {report.duration_ms && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {Math.round(report.duration_ms / 1000)}s
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5" />
                Daily Close Report — {format(new Date(report.report_date + 'T12:00:00'), 'MMMM d, yyyy')}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateReport.mutate(report.report_date)}
                disabled={generateReport.isPending}
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${generateReport.isPending ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </DialogTitle>
          </DialogHeader>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{report.total_leads}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
              <DeltaBadge value={report.leads_delta} label="DoD" />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{report.total_calls}</p>
              <p className="text-xs text-muted-foreground">Total Calls</p>
              <DeltaBadge value={report.calls_delta} label="DoD" />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{report.total_showed}</p>
              <p className="text-xs text-muted-foreground">Showed</p>
              <DeltaBadge value={report.showed_delta} label="DoD" />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{report.total_funded}</p>
              <p className="text-xs text-muted-foreground">Funded</p>
              <DeltaBadge value={report.funded_delta} label="DoD" />
            </div>
          </div>

          {/* Accuracy + Sync Health */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-lg p-3 border ${accuracyOk ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                {accuracyOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                <span className="text-sm font-medium">Data Accuracy</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {accuracyOk
                  ? 'All metrics match source tables — no discrepancies'
                  : `${report.discrepancies_found} discrepancies across ${report.clients_with_issues} clients, ${report.discrepancies_fixed} auto-fixed`}
              </p>
            </div>
            <div className={`rounded-lg p-3 border ${syncHealthy ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                {syncHealthy ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                <span className="text-sm font-medium">Sync Health</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {report.healthy_clients} healthy, {report.stale_clients} stale, {report.error_clients} errors, {report.not_configured_clients} not configured
              </p>
            </div>
          </div>

          {/* Client breakdown table */}
          <ScrollArea className="flex-1 border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Client</th>
                  <th className="text-center p-2 font-medium">Sync</th>
                  <th className="text-right p-2 font-medium">Leads</th>
                  <th className="text-right p-2 font-medium">Calls</th>
                  <th className="text-right p-2 font-medium">Showed</th>
                  <th className="text-right p-2 font-medium">Funded</th>
                  <th className="text-right p-2 font-medium">Ad Spend</th>
                  <th className="text-center p-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {(report.client_details as DailyReportClientDetail[])
                  .sort((a, b) => b.leads - a.leads)
                  .map((client) => (
                    <tr key={client.client_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-2 font-medium truncate max-w-[180px]">{client.client_name}</td>
                      <td className="p-2 text-center">
                        <SyncStatusDot status={client.sync_status} />
                      </td>
                      <td className="p-2 text-right">
                        <span>{client.leads}</span>
                        {client.leads_delta !== 0 && (
                          <span className={`ml-1 text-xs ${client.leads_delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            ({client.leads_delta > 0 ? '+' : ''}{client.leads_delta})
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <span>{client.calls}</span>
                        {client.calls_delta !== 0 && (
                          <span className={`ml-1 text-xs ${client.calls_delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            ({client.calls_delta > 0 ? '+' : ''}{client.calls_delta})
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right">{client.showed}</td>
                      <td className="p-2 text-right">{client.funded}</td>
                      <td className="p-2 text-right">
                        ${client.ad_spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="p-2 text-center">
                        {client.discrepancies.length > 0 ? (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            {client.discrepancies.length} fixed
                          </Badge>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
