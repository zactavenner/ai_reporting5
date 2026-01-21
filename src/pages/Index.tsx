import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DraggableClientTable } from '@/components/dashboard/DraggableClientTable';
import { AgencyStatsBar } from '@/components/dashboard/AgencyStatsBar';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { AddClientModal } from '@/components/settings/AddClientModal';
import { DeleteClientDialog } from '@/components/settings/DeleteClientDialog';
import { AgencyAIChat } from '@/components/ai/AgencyAIChat';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';
import { useClients, Client } from '@/hooks/useClients';
import { useAllDailyMetrics, useFundedInvestors, aggregateMetrics, AggregatedMetrics } from '@/hooks/useMetrics';
import { useAllClientSettings } from '@/hooks/useAllClientSettings';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { exportToCSV } from '@/lib/exportUtils';
import { useQueryClient } from '@tanstack/react-query';

const Index = () => {
  const navigate = useNavigate();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [clientOrder, setClientOrder] = useState<string[]>([]);
  // MRR per client - in production this would come from the database
  const [clientMRR] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();

  const { startDate, endDate } = useDateFilter();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useAllDailyMetrics(startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(undefined, startDate, endDate);
  
  const clientIds = useMemo(() => clients.map(c => c.id), [clients]);
  const { data: clientThresholds = {} } = useAllClientSettings(clientIds);

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
          <Button variant="outline" onClick={() => navigate('/database')}>
            <Database className="h-4 w-4 mr-2" />
            Database
          </Button>
        </div>

        <section>
          <h2 className="text-lg font-bold mb-2">Key Performance Indicators</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Agency-wide performance metrics with trend comparison
          </p>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading metrics...</div>
          ) : (
            <KPIGrid metrics={aggregatedMetrics} showFundedMetrics />
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
                clientMRR={clientMRR}
                adSpendFeeThreshold={50000}
                adSpendFeePercent={10}
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
      </main>

      <ClientSettingsModal
        client={selectedClient}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
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
    </div>
  );
};

export default Index;
