import { useState, useMemo } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { ClientTable } from '@/components/dashboard/ClientTable';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { AddClientModal } from '@/components/settings/AddClientModal';
import { DeleteClientDialog } from '@/components/settings/DeleteClientDialog';
import { AgencyAIChat } from '@/components/ai/AgencyAIChat';
import { useClients, Client } from '@/hooks/useClients';
import { useAllDailyMetrics, useFundedInvestors, aggregateMetrics, AggregatedMetrics } from '@/hooks/useMetrics';
import { useSyncClientData } from '@/hooks/useSyncData';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { exportToCSV } from '@/lib/exportUtils';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const Index = () => {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const queryClient = useQueryClient();

  const { startDate, endDate } = useDateFilter();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useAllDailyMetrics(startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(undefined, startDate, endDate);
  const syncMutation = useSyncClientData();

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

  const handleSync = () => {
    syncMutation.mutate(undefined);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

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
          <Button 
            variant="outline" 
            onClick={handleSync}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Now
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
            <ClientTable
              clients={clients}
              metrics={clientMetrics}
              onOpenSettings={handleOpenSettings}
              onDeleteClient={handleDeleteClient}
            />
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
