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
import { AgencyChatInterface } from '@/components/chat/AgencyChatInterface';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { MetricsCustomizeModal } from '@/components/dashboard/MetricsCustomizeModal';
import { LeadsDrillDownModal } from '@/components/drilldown/LeadsDrillDownModal';
import { CallsDrillDownModal } from '@/components/drilldown/CallsDrillDownModal';
import { FundedInvestorsDrillDownModal } from '@/components/drilldown/FundedInvestorsDrillDownModal';
import { AdSpendDrillDownModal } from '@/components/drilldown/AdSpendDrillDownModal';
import { MeetingsList } from '@/components/meetings/MeetingsList';
import { PendingTasksReview } from '@/components/meetings/PendingTasksReview';
import { DataDiscrepancyBanner } from '@/components/dashboard/DataDiscrepancyBanner';
import { Button } from '@/components/ui/button';
import { Sliders, Video, CheckCircle, RefreshCw } from 'lucide-react';
import { useClients, Client } from '@/hooks/useClients';
import { useAllDailyMetrics, useFundedInvestors, aggregateMetrics, AggregatedMetrics } from '@/hooks/useMetrics';
import { useAllClientSettings, useAllClientFullSettings } from '@/hooks/useAllClientSettings';
import { useAllClientMRR } from '@/hooks/useClientMRR';
import { useMeetings, usePendingMeetingTasks, useSyncMeetings } from '@/hooks/useMeetings';
import { useDataDiscrepancies } from '@/hooks/useDataDiscrepancies';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { exportToCSV } from '@/lib/exportUtils';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateClientOrder } from '@/hooks/useClientOrder';

const Index = () => {
  const navigate = useNavigate();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agencySettingsOpen, setAgencySettingsOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [metricsCustomizeOpen, setMetricsCustomizeOpen] = useState(false);
  const [drillDownModal, setDrillDownModal] = useState<string | null>(null);
  const [pendingTasksOpen, setPendingTasksOpen] = useState(false);
  const queryClient = useQueryClient();
  const updateClientOrder = useUpdateClientOrder();

  const { startDate, endDate } = useDateFilter();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useAllDailyMetrics(startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(undefined, startDate, endDate);
  
  const clientIds = useMemo(() => clients.map(c => c.id), [clients]);
  const { data: clientThresholds = {} } = useAllClientSettings(clientIds);
  const { data: clientFullSettings = {} } = useAllClientFullSettings(clientIds);
  const { data: clientMRRSettings = {} } = useAllClientMRR(clientIds);
  
  // Meetings data
  const { data: meetings = [] } = useMeetings();
  const { data: pendingTasks = [] } = usePendingMeetingTasks();
  const syncMeetings = useSyncMeetings();
  
  // Data discrepancies
  const { data: discrepancies = [] } = useDataDiscrepancies();

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
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['calls'] });
    queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
  };

  const handleReorder = (orderedIds: string[]) => {
    // Persist the new order to the database
    updateClientOrder.mutate(orderedIds);
  };

  const isLoading = clientsLoading || metricsLoading;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        title="Capital Raising Dashboard"
        subtitle="Client Advertising Performance"
        onAgencySettings={() => setAgencySettingsOpen(true)}
        onSpamBlacklist={() => navigate('/spam-blacklist')}
        onDatabase={() => navigate('/database')}
      />

      <main className="p-6 space-y-6">
        <DateRangeFilter
          onExportCSV={handleExportCSV}
          onAddClient={handleAddClient}
          onRefresh={handleRefresh}
        />

        {/* Data Discrepancy Alert */}
        {discrepancies.length > 0 && (
          <DataDiscrepancyBanner discrepancies={discrepancies} />
        )}

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
                clients={clients}
                clientMRRSettings={clientMRRSettings}
                clientAdSpends={clientAdSpends}
                clientFullSettings={clientFullSettings}
              />
              <DraggableClientTable
                clients={clients}
                metrics={clientMetrics}
                thresholds={clientThresholds}
                fullSettings={clientFullSettings}
                onOpenSettings={handleOpenSettings}
                onDeleteClient={handleDeleteClient}
                onReorder={handleReorder}
              />
            </>
          )}
        </section>

        {/* AI Chat Interface */}
        <section>
          <h2 className="text-lg font-bold mb-2">AI Assistant</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Chat with AI about clients, metrics, and tasks. Create tasks with AI assistance.
          </p>
          <AgencyChatInterface
            clients={clients}
            clientMetrics={clientMetrics as Record<string, AggregatedMetrics>}
            agencyMetrics={aggregatedMetrics}
          />
        </section>

        {/* Meetings Section */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">Recent Meetings</h2>
              <p className="text-sm text-muted-foreground">
                Synced from MeetGeek with action items
              </p>
            </div>
            <div className="flex gap-2">
              {pendingTasks.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setPendingTasksOpen(true)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {pendingTasks.length} Pending Tasks
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => syncMeetings.mutate()}
                disabled={syncMeetings.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncMeetings.isPending ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </div>
          <MeetingsList meetings={meetings} clients={clients} />
        </section>

        {/* Project Management */}
        <section>
          <TaskBoardView />
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

      <PendingTasksReview
        tasks={pendingTasks}
        clients={clients}
        open={pendingTasksOpen}
        onOpenChange={setPendingTasksOpen}
      />
    </div>
  );
};

export default Index;
