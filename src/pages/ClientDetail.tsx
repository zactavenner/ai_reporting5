import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { LeadsDrillDownModal } from '@/components/drilldown/LeadsDrillDownModal';
import { CallsDrillDownModal } from '@/components/drilldown/CallsDrillDownModal';
import { FundedInvestorsDrillDownModal } from '@/components/drilldown/FundedInvestorsDrillDownModal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useClient } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics, DailyMetric } from '@/hooks/useMetrics';
import { useSyncClientData } from '@/hooks/useSyncData';
import { exportToCSV } from '@/lib/exportUtils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leadsModalOpen, setLeadsModalOpen] = useState(false);
  const [callsModalOpen, setCallsModalOpen] = useState(false);
  const [showedCallsModalOpen, setShowedCallsModalOpen] = useState(false);
  const [fundedModalOpen, setFundedModalOpen] = useState(false);

  const { data: client, isLoading: clientLoading } = useClient(clientId);
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useDailyMetrics(clientId);
  const { data: fundedInvestors = [] } = useFundedInvestors(clientId);
  const syncMutation = useSyncClientData();

  const aggregatedMetrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors);
  }, [dailyMetrics, fundedInvestors]);

  const isLoading = clientLoading || metricsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Client not found</p>
      </div>
    );
  }

  const handleSync = () => {
    syncMutation.mutate(clientId);
  };

  const handleExportCSV = () => {
    exportToCSV(dailyMetrics, `${client.name}-daily-metrics`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              Sync
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-5 w-5" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <div className="mt-4">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">Detailed performance metrics</p>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <DateRangeFilter showAddClient={false} onExportCSV={handleExportCSV} />

        <section>
          <h2 className="text-lg font-bold mb-2">Key Performance Indicators</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Performance metrics with trend comparison
          </p>
          <KPIGrid metrics={aggregatedMetrics} showFundedMetrics />
        </section>

        <section className="border-2 border-border bg-card p-4">
          <h3 className="font-bold text-lg mb-1">View Detailed Records</h3>
          <p className="text-sm text-muted-foreground mb-4">Click to view individual records for each metric category</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div 
              className="border-2 border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setLeadsModalOpen(true)}
            >
              <p className="text-2xl font-bold font-mono">{aggregatedMetrics.totalLeads}</p>
              <p className="text-sm text-muted-foreground">Leads</p>
            </div>
            <div 
              className="border-2 border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setCallsModalOpen(true)}
            >
              <p className="text-2xl font-bold font-mono">{aggregatedMetrics.totalCalls}</p>
              <p className="text-sm text-muted-foreground">Calls</p>
            </div>
            <div 
              className="border-2 border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowedCallsModalOpen(true)}
            >
              <p className="text-2xl font-bold font-mono">{aggregatedMetrics.showedCalls}</p>
              <p className="text-sm text-muted-foreground">Showed Calls</p>
            </div>
            <div 
              className="border-2 border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setFundedModalOpen(true)}
            >
              <p className="text-2xl font-bold font-mono">{aggregatedMetrics.fundedInvestors}</p>
              <p className="text-sm text-muted-foreground">Funded Investors</p>
            </div>
            <div className="border-2 border-border p-4">
              <p className="text-2xl font-bold font-mono">{aggregatedMetrics.avgTimeToFund.toFixed(1)}d</p>
              <p className="text-sm text-muted-foreground">Avg Time to Fund</p>
            </div>
          </div>
        </section>

        <section className="border-2 border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg">Daily Performance Data</h3>
              <p className="text-sm text-muted-foreground">Detailed metrics by date</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
          {dailyMetrics.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">Date</TableHead>
                  <TableHead className="font-bold text-right">Ad Spend</TableHead>
                  <TableHead className="font-bold text-right">Leads</TableHead>
                  <TableHead className="font-bold text-right">Calls</TableHead>
                  <TableHead className="font-bold text-right">Showed</TableHead>
                  <TableHead className="font-bold text-right">Commitments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyMetrics.map((day: DailyMetric) => (
                  <TableRow key={day.id} className="border-b">
                    <TableCell className="font-medium">{day.date}</TableCell>
                    <TableCell className="text-right font-mono">${Number(day.ad_spend).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{day.leads}</TableCell>
                    <TableCell className="text-right font-mono">{day.calls}</TableCell>
                    <TableCell className="text-right font-mono">{day.showed_calls}</TableCell>
                    <TableCell className="text-right font-mono">{day.commitments}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No data available yet</p>
              <p className="text-sm">Click Sync to fetch data from Meta and GHL APIs</p>
            </div>
          )}
        </section>

        <section className="border-2 border-border bg-card p-4">
          <h3 className="font-bold text-lg mb-1">Funded Investors</h3>
          <p className="text-sm text-muted-foreground mb-4">Track time to fund and calls required</p>
          {fundedInvestors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold text-right">Funded Amount</TableHead>
                  <TableHead className="font-bold text-right">Time to Fund</TableHead>
                  <TableHead className="font-bold text-right">Calls to Fund</TableHead>
                  <TableHead className="font-bold">Funded Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fundedInvestors.map((investor) => (
                  <TableRow key={investor.id} className="border-b">
                    <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                    <TableCell className="text-right font-mono text-chart-2">
                      ${Number(investor.funded_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {investor.time_to_fund_days !== null ? `${investor.time_to_fund_days} days` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{investor.calls_to_fund}</TableCell>
                    <TableCell>{new Date(investor.funded_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No funded investors yet</p>
              <p className="text-sm">Funded investors will appear here once synced from GHL</p>
            </div>
          )}
        </section>
      </main>

      <ClientSettingsModal
        client={client}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <LeadsDrillDownModal
        clientId={clientId}
        open={leadsModalOpen}
        onOpenChange={setLeadsModalOpen}
      />

      <CallsDrillDownModal
        clientId={clientId}
        open={callsModalOpen}
        onOpenChange={setCallsModalOpen}
      />

      <CallsDrillDownModal
        clientId={clientId}
        showedOnly
        open={showedCallsModalOpen}
        onOpenChange={setShowedCallsModalOpen}
      />

      <FundedInvestorsDrillDownModal
        clientId={clientId}
        open={fundedModalOpen}
        onOpenChange={setFundedModalOpen}
      />
    </div>
  );
}