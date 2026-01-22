import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DraggableClientTable } from '@/components/dashboard/DraggableClientTable';
import { AgencyStatsBar } from '@/components/dashboard/AgencyStatsBar';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { AgencySettingsModal } from '@/components/settings/AgencySettingsModal';
import { AddClientModal } from '@/components/settings/AddClientModal';
import { DeleteClientDialog } from '@/components/settings/DeleteClientDialog';
import { AgencyAIChat } from '@/components/ai/AgencyAIChat';
import { AgencyTaskSummary } from '@/components/tasks/AgencyTaskSummary';
import { MetricsCustomizeModal } from '@/components/dashboard/MetricsCustomizeModal';
import { LeadsDrillDownModal } from '@/components/drilldown/LeadsDrillDownModal';
import { CallsDrillDownModal } from '@/components/drilldown/CallsDrillDownModal';
import { FundedInvestorsDrillDownModal } from '@/components/drilldown/FundedInvestorsDrillDownModal';
import { AdSpendDrillDownModal } from '@/components/drilldown/AdSpendDrillDownModal';
import { Button } from '@/components/ui/button';
import { Database, Settings2, Shield, Sliders } from 'lucide-react';
import { useClients, Client } from '@/hooks/useClients';
import { useAllDailyMetrics, useFundedInvestors, aggregateMetrics, AggregatedMetrics } from '@/hooks/useMetrics';
import { useAllClientSettings } from '@/hooks/useAllClientSettings';
import { useAllClientMRR } from '@/hooks/useClientMRR';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { exportToCSV } from '@/lib/exportUtils';
import { useQueryClient } from '@tanstack/react-query';

const Index = () => {
  const navigate = useNavigate();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agencySettingsOpen, setAgencySettingsOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [clientOrder, setClientOrder] = useState<string[]>([]);
  const [metricsCustomizeOpen, setMetricsCustomizeOpen] = useState(false);
  const [drillDownModal, setDrillDownModal] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { startDate, endDate } = useDateFilter();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useAllDailyMetrics(startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(undefined, startDate, endDate);
  
  const clientIds = useMemo(() => clients.map(c => c.id), [clients]);
  const { data: clientThresholds = {} } = useAllClientSettings(clientIds);
  const { data: clientMRRSettings = {} } = useAllClientMRR(clientIds);

  const aggregatedMetrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors);
  }, [dailyMetrics, fundedInvestors]);

  // Group metrics by client for the table
  const clientMetrics = useMemo(() => {
    const grouped: Record<string, typeof dailyMetrics> = {};
    for (const metric of dailyMetrics) {
      if (!grouped[metric.client_id]) {
        grouped[metric.client_id] = [];
      }
      grouped[metric.client_id].push(metric);
    }
    
    const result: Record<string, ReturnType<typeof aggregateMetrics>> = {};
    for (const [clientId, metrics] of Object.entries(grouped)) {
      const clientFunded = fundedInvestors.filter(f => f.client_id === clientId);
      result[clientId] = aggregateMetrics(metrics, clientFunded);
    }
    return result;
  }, [dailyMetrics, fundedInvestors]);

  // Extract ad spends for MRR calculation
  const clientAdSpends = useMemo(() => {
    const spends: Record<string, number> = {};
    for (const [clientId, m] of Object.entries(clientMetrics)) {
      spends[clientId] = m.totalAdSpend || 0;
    }
    return spends;
  }, [clientMetrics]);

  const handleOpenSettings = (client: Client) => {
    setSelectedClient(client);
    setSettingsOpen(true);
  };

  const handleExportCSV = () => {
    exportToCSV(dailyMetrics, 'all-clients-metrics');
  };

  const handleAddClient = () => {
    setAddClientOpen(true);
  };

  const handleDeleteClient = (client: Client) => {
    setDeleteClient(client);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['all-client-settings'] });
  };

  const handleReorder = (orderedIds: string[]) => {
    setClientOrder(orderedIds);
    // In production, persist this order to user preferences or database
  };

  // Order clients based on drag-drop order
  const orderedClients = useMemo(() => {
    if (clientOrder.length === 0) return clients;
    return [...clients].sort((a, b) => {
      const aIndex = clientOrder.indexOf(a.id);
      const bIndex = clientOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [clients, clientOrder]);

  const isLoading = clientsLoading || metricsLoading;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        title="Capital Raising Dashboard"
        subtitle="Client Advertising Performance"
      />

      <main className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <DateRangeFilter
            onExportCSV={handleExportCSV}
            onAddClient={handleAddClient}
            onRefresh={handleRefresh}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAgencySettingsOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline" onClick={() => navigate('/spam-blacklist')}>
              <Shield className="h-4 w-4 mr-2" />
              Spam
            </Button>
            <Button variant="outline" onClick={() => navigate('/database')}>
              <Database className="h-4 w-4 mr-2" />
              Database
            </Button>
          </div>
        </div>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">Key Performance Indicators</h2>
              <p className="text-sm text-muted-foreground">
                Agency-wide performance metrics with trend comparison
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMetricsCustomizeOpen(true)}>
              <Sliders className="h-4 w-4 mr-2" />
              Customize
            </Button>
          </div>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading metrics...</div>
          ) : (
            <KPIGrid 
              metrics={aggregatedMetrics} 
              showFundedMetrics 
              onMetricClick={(metric) => setDrillDownModal(metric)}
            />
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold mb-2">Client Summary</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Aggregated performance metrics by client
          </p>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading clients...</div>
          ) : clients.length === 0 ? (
            <div className="border-2 border-border bg-card p-8 text-center">
              <p className="text-muted-foreground mb-2">No clients configured yet</p>
              <p className="text-sm text-muted-foreground">Add a client to start tracking metrics</p>
            </div>
          ) : (
            <>
              <AgencyStatsBar 
                clients={orderedClients}
                clientMRRSettings={clientMRRSettings}
                clientAdSpends={clientAdSpends}
              />
              <DraggableClientTable
                clients={orderedClients}
                metrics={clientMetrics}
                thresholds={clientThresholds}
                onOpenSettings={handleOpenSettings}
                onDeleteClient={handleDeleteClient}
                onReorder={handleReorder}
              />
            </>
          )}
        </section>

        {/* Task Overview */}
        <section>
          <AgencyTaskSummary />
        </section>
      </main>

      <ClientSettingsModal
        client={selectedClient}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <AgencySettingsModal
        open={agencySettingsOpen}
        onOpenChange={setAgencySettingsOpen}
      />

      <AddClientModal
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
      />

      <DeleteClientDialog
        client={deleteClient}
        open={!!deleteClient}
        onOpenChange={(open) => !open && setDeleteClient(null)}
      />

      <AgencyAIChat 
        clients={clients}
        clientMetrics={clientMetrics as Record<string, AggregatedMetrics>}
        agencyMetrics={aggregatedMetrics}
      />

      <MetricsCustomizeModal
        open={metricsCustomizeOpen}
        onOpenChange={setMetricsCustomizeOpen}
      />

      <LeadsDrillDownModal
        open={drillDownModal === 'leads'}
        onOpenChange={(open) => !open && setDrillDownModal(null)}
      />

      <CallsDrillDownModal
        open={drillDownModal === 'calls'}
        onOpenChange={(open) => !open && setDrillDownModal(null)}
      />

      <CallsDrillDownModal
        showedOnly
        open={drillDownModal === 'showedCalls'}
        onOpenChange={(open) => !open && setDrillDownModal(null)}
      />

      <FundedInvestorsDrillDownModal
        open={drillDownModal === 'fundedInvestors'}
        onOpenChange={(open) => !open && setDrillDownModal(null)}
      />

      <AdSpendDrillDownModal
        open={drillDownModal === 'totalAdSpend'}
        onOpenChange={(open) => !open && setDrillDownModal(null)}
      />
    </div>
  );
};

export default Index;
