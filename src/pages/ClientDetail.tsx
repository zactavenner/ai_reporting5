import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DailyPerformanceTable } from '@/components/dashboard/DailyPerformanceTable';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { LeadsDrillDownModal } from '@/components/drilldown/LeadsDrillDownModal';
import { CallsDrillDownModal } from '@/components/drilldown/CallsDrillDownModal';
import { FundedInvestorsDrillDownModal } from '@/components/drilldown/FundedInvestorsDrillDownModal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AIAnalysisChat } from '@/components/ai/AIAnalysisChat';
import { useClient } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics } from '@/hooks/useMetrics';
import { useSyncClientData } from '@/hooks/useSyncData';
import { useClientSettings, getThresholdsFromSettings } from '@/hooks/useClientSettings';
import { exportToCSV } from '@/lib/exportUtils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  const { data: settings } = useClientSettings(clientId);
  const syncMutation = useSyncClientData();

  const aggregatedMetrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors);
  }, [dailyMetrics, fundedInvestors]);

  const thresholds = useMemo(() => getThresholdsFromSettings(settings), [settings]);

  const fundedInvestorLabel = settings?.funded_investor_label || 'Funded Investors';

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

  // Build context for AI analysis
  const aiContext = {
    clientName: client.name,
    totalAdSpend: aggregatedMetrics.totalAdSpend,
    leads: aggregatedMetrics.totalLeads,
    calls: aggregatedMetrics.totalCalls,
    showedCalls: aggregatedMetrics.showedCalls,
    costPerLead: aggregatedMetrics.costPerLead,
    costPerCall: aggregatedMetrics.costPerCall,
    costPerShow: aggregatedMetrics.costPerShow,
    fundedInvestors: aggregatedMetrics.fundedInvestors,
    fundedDollars: aggregatedMetrics.fundedDollars,
    costPerInvestor: aggregatedMetrics.costPerInvestor,
    costOfCapital: aggregatedMetrics.costOfCapital,
    showedPercent: aggregatedMetrics.showedPercent,
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
            Performance metrics with trend comparison • Color-coded based on your thresholds
          </p>
          <KPIGrid 
            metrics={aggregatedMetrics} 
            showFundedMetrics 
            thresholds={thresholds}
            fundedInvestorLabel={fundedInvestorLabel}
          />
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
              <p className="text-sm text-muted-foreground">{fundedInvestorLabel}</p>
            </div>
            <div className="border-2 border-border p-4">
              <p className="text-2xl font-bold font-mono">{aggregatedMetrics.avgTimeToFund.toFixed(1)}d</p>
              <p className="text-sm text-muted-foreground">Avg Time to Fund</p>
            </div>
          </div>
        </section>

        <DailyPerformanceTable 
          dailyMetrics={dailyMetrics} 
          onExportCSV={handleExportCSV} 
        />

        <section className="border-2 border-border bg-card p-4">
          <h3 className="font-bold text-lg mb-1">{fundedInvestorLabel}</h3>
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
              <p>No {fundedInvestorLabel.toLowerCase()} yet</p>
              <p className="text-sm">{fundedInvestorLabel} will appear here once synced from GHL</p>
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

      <AIAnalysisChat context={aiContext} />
    </div>
  );
}
