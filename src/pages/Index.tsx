import { useState, useMemo, useEffect } from 'react';
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
import { AIHubTab } from '@/components/ai/AIHubTab';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { MetricsCustomizeModal } from '@/components/dashboard/MetricsCustomizeModal';
import { LeadsDrillDownModal } from '@/components/drilldown/LeadsDrillDownModal';
import { CallsDrillDownModal } from '@/components/drilldown/CallsDrillDownModal';
import { FundedInvestorsDrillDownModal } from '@/components/drilldown/FundedInvestorsDrillDownModal';
import { AdSpendDrillDownModal } from '@/components/drilldown/AdSpendDrillDownModal';
import { MeetingsTab } from '@/components/meetings/MeetingsTab';
import { CreativesTab } from '@/components/creative/CreativesTab';
import { PendingTasksReview } from '@/components/meetings/PendingTasksReview';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';

import { FunnelPreviewTab } from '@/components/funnel/FunnelPreviewTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Sliders, Video, CheckCircle, RefreshCw, Upload, LayoutDashboard, Smartphone, Bot, Wifi, LayoutGrid } from 'lucide-react';
import { useClients, Client } from '@/hooks/useClients';
import { useAllDailyMetrics, useFundedInvestors, aggregateMetrics, AggregatedMetrics } from '@/hooks/useMetrics';
import { aggregateFromSourceData } from '@/hooks/useSourceMetrics';
import { useAllClientSettings, useAllClientFullSettings } from '@/hooks/useAllClientSettings';
import { useAllClientMRR } from '@/hooks/useClientMRR';
import { useMeetings, usePendingMeetingTasks, useSyncMeetings } from '@/hooks/useMeetings';
import { useApiConnectionTest } from '@/hooks/useApiConnectionTest';

import { useAllCreatives } from '@/hooks/useAllCreatives';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { useSourceFilteredMetrics } from '@/hooks/useSourceFilteredMetrics';
import { useLeads, useCalls } from '@/hooks/useLeadsAndCalls';
import { exportToCSV } from '@/lib/exportUtils';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateClientOrder } from '@/hooks/useClientOrder';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { toast } from 'sonner';

const Index = () => {
  const navigate = useNavigate();
  const { currentMember, logout } = useTeamMember();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agencySettingsOpen, setAgencySettingsOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [metricsCustomizeOpen, setMetricsCustomizeOpen] = useState(false);
  const [drillDownModal, setDrillDownModal] = useState<string | null>(null);
  const [pendingTasksOpen, setPendingTasksOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedFunnelClientId, setSelectedFunnelClientId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const updateClientOrder = useUpdateClientOrder();

  const { startDate, endDate, sourceFilter } = useDateFilter();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useAllDailyMetrics(startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(undefined, startDate, endDate);
  
  // Fetch all leads and calls across clients for source filtering and accurate KPI calculation
  const { data: allLeads = [] } = useLeads(undefined, startDate, endDate);
  const { data: allCalls = [] } = useCalls(undefined, false, startDate, endDate);
  
  const clientIds = useMemo(() => clients.map(c => c.id), [clients]);
  const { data: clientThresholds = {} } = useAllClientSettings(clientIds);
  const { data: clientFullSettings = {} } = useAllClientFullSettings(clientIds);
  const { data: clientMRRSettings = {} } = useAllClientMRR(clientIds);
  
  // Meetings data
  const { data: meetings = [] } = useMeetings();
  const { data: pendingTasks = [] } = usePendingMeetingTasks();
  const syncMeetings = useSyncMeetings();
  
  // API Connection Test
  const { testResults, isTesting, testAllClients, getClientStatus } = useApiConnectionTest();
  
  // Creatives data
  const { data: allCreatives = [] } = useAllCreatives();
  const pendingCreatives = allCreatives.filter(c => c.status === 'pending');

  

  // Apply source filter to leads for metric calculations - updateGlobalSources=true on agency view
  const { filteredLeads, filteredCalls, filteredFundedInvestors, isFiltered: hasSourceFilter } = useSourceFilteredMetrics(allLeads, allCalls, fundedInvestors, true);

  // Calculate KPIs directly from source data (leads, calls, funded_investors)
  const aggregatedMetrics = useMemo(() => {
    const leadsToUse = hasSourceFilter ? filteredLeads : allLeads;
    const callsToUse = hasSourceFilter ? filteredCalls : allCalls;
    const fundedToUse = hasSourceFilter ? filteredFundedInvestors : fundedInvestors;
    return aggregateFromSourceData(leadsToUse, callsToUse, fundedToUse, dailyMetrics);
  }, [allLeads, allCalls, fundedInvestors, dailyMetrics, filteredLeads, filteredCalls, filteredFundedInvestors, hasSourceFilter]);

  // Group source data by client for the table
  const clientMetrics = useMemo(() => {
    // Group leads, calls, and funded investors by client
    const result: Record<string, ReturnType<typeof aggregateFromSourceData>> = {};
    
    for (const client of clients) {
      const clientLeads = allLeads.filter(l => l.client_id === client.id);
      const clientCalls = allCalls.filter(c => c.client_id === client.id);
      const clientFunded = fundedInvestors.filter(f => f.client_id === client.id);
      const clientDailyMetrics = dailyMetrics.filter(m => m.client_id === client.id);
      
      result[client.id] = aggregateFromSourceData(clientLeads, clientCalls, clientFunded, clientDailyMetrics);
    }
    
    return result;
  }, [clients, allLeads, allCalls, fundedInvestors, dailyMetrics]);

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
    toast.success('Refreshed dashboard data');
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
        currentMemberName={currentMember?.name}
        onLogout={currentMember ? logout : undefined}
      />

      <main className="p-6 space-y-6">
        <DateRangeFilter
          onExportCSV={handleExportCSV}
          onAddClient={handleAddClient}
          onRefresh={handleRefresh}
        />


        {/* Main Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <ScrollArea className="w-full max-w-3xl">
            <TabsList className="inline-flex w-max">
              <TabsTrigger value="dashboard" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Tasks</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-2">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">AI</span>
              </TabsTrigger>
              <TabsTrigger value="meetings" className="gap-2">
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">Meetings</span>
                {pendingTasks.length > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs">
                    {pendingTasks.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="creatives" className="gap-2">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Creatives</span>
                {pendingCreatives.length > 0 && (
                  <span className="ml-1 bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 text-xs">
                    {pendingCreatives.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="funnel" className="gap-2">
                <Smartphone className="h-4 w-4" />
                <span className="hidden sm:inline">Funnel</span>
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Client Summary - moved to top */}
            <SectionErrorBoundary sectionName="Client Summary">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-lg font-bold">Client Summary</h2>
                    <p className="text-sm text-muted-foreground">
                      Aggregated performance metrics by client
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testAllClients(clientIds)}
                    disabled={isTesting || clients.length === 0}
                  >
                    <Wifi className={`h-4 w-4 mr-2 ${isTesting ? 'animate-pulse' : ''}`} />
                    {isTesting ? 'Testing...' : 'Test API Connections'}
                  </Button>
                </div>
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
                      isAdmin={currentMember?.role === 'admin'}
                    />
                    <DraggableClientTable
                      clients={clients}
                      metrics={clientMetrics}
                      thresholds={clientThresholds}
                      fullSettings={clientFullSettings}
                      onOpenSettings={handleOpenSettings}
                      onDeleteClient={handleDeleteClient}
                      onReorder={handleReorder}
                      isAdmin={currentMember?.role === 'admin'}
                      apiTestResults={testResults}
                    />
                  </>
                )}
              </section>
            </SectionErrorBoundary>

            {/* KPIs below Client Summary */}
            <SectionErrorBoundary sectionName="KPI Grid">
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
            </SectionErrorBoundary>

          </TabsContent>

          {/* Tasks Tab - Project Management */}
          <TabsContent value="tasks" className="space-y-6">
            <SectionErrorBoundary sectionName="Task Board">
              <TaskBoardView />
            </SectionErrorBoundary>
          </TabsContent>

          {/* AI Hub Tab */}
          <TabsContent value="ai" className="space-y-6">
            <SectionErrorBoundary sectionName="AI Hub">
              <AIHubTab
                clients={clients}
                clientMetrics={clientMetrics as Record<string, AggregatedMetrics>}
                agencyMetrics={aggregatedMetrics}
              />
            </SectionErrorBoundary>
          </TabsContent>

          {/* Meetings Tab */}
          <TabsContent value="meetings" className="space-y-6">
            <SectionErrorBoundary sectionName="Meetings">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">Meetings & Highlights</h2>
                  <p className="text-sm text-muted-foreground">
                    Synced from MeetGeek with action items and highlights
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
              <MeetingsTab meetings={meetings} clients={clients} />
            </SectionErrorBoundary>
          </TabsContent>

          {/* Creatives Tab */}
          <TabsContent value="creatives" className="space-y-6">
            <SectionErrorBoundary sectionName="Creatives">
              <div className="mb-4">
                <h2 className="text-lg font-bold">Creative Approvals</h2>
                <p className="text-sm text-muted-foreground">
                  Manage creative assets across all clients
                </p>
              </div>
              <CreativesTab />
            </SectionErrorBoundary>
          </TabsContent>

          {/* Funnel Tab */}
          <TabsContent value="funnel" className="space-y-6">
            <SectionErrorBoundary sectionName="Funnel Preview">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold">Funnel Previews</h2>
                  <p className="text-sm text-muted-foreground">
                    Preview funnel pages across all clients
                  </p>
                </div>
                <Select
                  value={selectedFunnelClientId || ''}
                  onValueChange={(v) => setSelectedFunnelClientId(v || null)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedFunnelClientId ? (
                <FunnelPreviewTab clientId={selectedFunnelClientId} />
              ) : (
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                  <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Select a client to view their funnel</p>
                </div>
              )}
            </SectionErrorBoundary>
          </TabsContent>
        </Tabs>
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
