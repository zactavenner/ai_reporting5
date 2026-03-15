import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, DollarSign, Upload, History, Plus, ExternalLink, X, Phone, Video, BarChart3, TrendingUp, Palette, Layers, Cog } from 'lucide-react';
import { LeadsDrillDownModal } from '@/components/drilldown/LeadsDrillDownModal';
import { CallsDrillDownModal } from '@/components/drilldown/CallsDrillDownModal';
import { AdSpendDrillDownModal } from '@/components/drilldown/AdSpendDrillDownModal';
import { FundedInvestorsDrillDownModal } from '@/components/drilldown/FundedInvestorsDrillDownModal';
import { toast } from 'sonner';
import { VoiceRecordButton } from '@/components/voice/VoiceRecordButton';
import { ActivityPanel } from '@/components/activity/ActivityPanel';
import { ClientMeetingsSection } from '@/components/meetings/ClientMeetingsSection';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { MetricChartsGrid } from '@/components/dashboard/MetricChartsGrid';
import { PeriodicStatsTable } from '@/components/dashboard/PeriodicStatsTable';
import { InlineRecordsView } from '@/components/dashboard/InlineRecordsView';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { ShareableLinkButton } from '@/components/dashboard/ShareableLinkButton';
import { CSVImportModal, ImportType } from '@/components/import/CSVImportModal';
import { ImportHistoryModal } from '@/components/import/ImportHistoryModal';
import { AddCustomTabModal } from '@/components/import/AddCustomTabModal';
import { CreativesSection } from '@/components/creative/CreativesSection';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AIAnalysisChat } from '@/components/ai/AIAnalysisChat';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { DataAuditSection } from '@/components/dashboard/DataAuditSection';
import { FunnelPreviewTab } from '@/components/funnel/FunnelPreviewTab';
import { PipelineTab } from '@/components/pipeline/PipelineTab';
import { AdsManagerTab } from '@/components/ads-manager/AdsManagerTab';
import { ClientOffersSection } from '@/components/offers/ClientOffersSection';
import { ClientBillingTab } from '@/components/billing/ClientBillingTab';
import { useClient } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors } from '@/hooks/useMetrics';
import { useSourceAggregatedMetrics } from '@/hooks/useSourceMetrics';
import { usePriorPeriodMetrics } from '@/hooks/usePriorMetrics';
import { useLeads, useCalls } from '@/hooks/useLeadsAndCalls';
import { useClientSettings, getThresholdsFromSettings } from '@/hooks/useClientSettings';
import { useCustomTabs, useDeleteCustomTab } from '@/hooks/useCustomTabs';
import { useAllTasks } from '@/hooks/useTasks';
import { useVoiceNotes } from '@/hooks/useVoiceNotes';
import { useMeetings } from '@/hooks/useMeetings';
import { useCreatives } from '@/hooks/useCreatives';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { useTeamMember } from '@/contexts/TeamMemberContext';
import { useSourceFilteredMetrics } from '@/hooks/useSourceFilteredMetrics';
import { exportToCSV } from '@/lib/exportUtils';
import { useQueryClient } from '@tanstack/react-query';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportType, setCsvImportType] = useState<ImportType>('ad_spend');
  const [importHistoryOpen, setImportHistoryOpen] = useState(false);
  const [addTabOpen, setAddTabOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('performance');
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string>('');
  const [drillDownModal, setDrillDownModal] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { currentMember } = useTeamMember();
  const isAdmin = currentMember?.role === 'admin';

  // Collapsible section states
  const [kpiOpen, setKpiOpen] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(true);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [meetingsOpen, setMeetingsOpen] = useState(true);

  const { startDate, endDate } = useDateFilter();
  const { data: client, isLoading: clientLoading } = useClient(clientId);
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useDailyMetrics(clientId, startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(clientId, startDate, endDate);
  const { data: priorMetrics } = usePriorPeriodMetrics(clientId, startDate, endDate);
  const { data: leads = [], isLoading: leadsLoading } = useLeads(clientId, startDate, endDate);
  const { data: calls = [] } = useCalls(clientId, false, startDate, endDate);
  const { data: settings } = useClientSettings(clientId);
  const { data: customTabs = [] } = useCustomTabs(clientId);
  const { data: allTasks = [] } = useAllTasks();
  const { data: voiceNotes = [] } = useVoiceNotes(clientId);
  const { data: meetings = [] } = useMeetings(clientId);
  const { data: creatives = [] } = useCreatives(clientId);
  
  const deleteCustomTab = useDeleteCustomTab();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const clientTasks = useMemo(() => {
    return allTasks.filter(t => t.client_id === clientId);
  }, [allTasks, clientId]);

  const handleActivityClick = (activityId: string, type: string) => {
    if (type.startsWith('task_')) {
      setSelectedTaskId(activityId);
      setActiveTab('performance');
    } else if (type.startsWith('creative_')) {
      setActiveTab('ads-creatives');
    }
  };

  const { 
    filteredLeads, 
    filteredCalls, 
    filteredFundedInvestors,
    isFiltered: hasSourceFilter 
  } = useSourceFilteredMetrics(leads, calls, fundedInvestors, true);

  const aggregatedMetrics = useSourceAggregatedMetrics(
    hasSourceFilter ? filteredLeads : leads,
    hasSourceFilter ? filteredCalls : calls,
    hasSourceFilter ? filteredFundedInvestors : fundedInvestors,
    dailyMetrics,
    (settings as any)?.default_lead_pipeline_value || 0
  );

  const thresholds = useMemo(() => getThresholdsFromSettings(settings), [settings]);
  const fundedInvestorLabel = settings?.funded_investor_label || 'Funded Investors';
  const isLoading = clientLoading || metricsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CashBagLoader message="Loading client..." />
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

  const handleExportCSV = () => {
    exportToCSV(dailyMetrics, `${client.name}-daily-metrics`);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors', clientId] });
    queryClient.invalidateQueries({ queryKey: ['call-recordings', clientId] });
    queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
    queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
    toast.success('Refreshed client data');
  };

  const openCsvImport = (type: ImportType) => {
    setCsvImportType(type);
    setCsvImportOpen(true);
  };

  const handleRecordSelect = (record: any, type: string) => {
    setSelectedRecord(record);
    setSelectedType(type);
  };

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
      {/* Slim header */}
      <header className="border-b border-border bg-card/80 apple-blur sticky top-0 z-30 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Client performance & management</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <VoiceRecordButton clientId={client.id} clientName={client.name} isPublicView={false} />
            <ActivityPanel
              tasks={clientTasks}
              voiceNotes={voiceNotes}
              meetings={meetings}
              creatives={creatives}
              isPublicView={false}
              clientId={client.id}
              clientName={client.name}
              onActivityClick={handleActivityClick}
            />
            <ShareableLinkButton
              clientId={client.id}
              clientName={client.name}
              publicToken={client.public_token}
              slug={client.slug}
            />
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Client Settings">
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <DateRangeFilter showAddClient={false} onExportCSV={handleExportCSV} onRefresh={handleRefresh} />

        {/* 4 Grouped Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="performance" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="ads-creatives" className="gap-2">
              <Palette className="h-4 w-4" />
              Ads & Creatives
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-2">
              <Layers className="h-4 w-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="client-settings" className="gap-2">
              <Cog className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* ─── PERFORMANCE TAB ─── */}
          <TabsContent value="performance" className="space-y-6">
            {/* KPIs - Collapsible */}
            <Collapsible open={kpiOpen} onOpenChange={setKpiOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                <h2 className="text-lg font-bold">Key Performance Indicators</h2>
                <span className="text-xs text-muted-foreground">{kpiOpen ? '▾' : '▸'}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <SectionErrorBoundary sectionName="KPI Grid">
                  <KPIGrid
                    metrics={aggregatedMetrics}
                    priorMetrics={priorMetrics || undefined}
                    showFundedMetrics
                    thresholds={thresholds}
                    fundedInvestorLabel={fundedInvestorLabel}
                    onMetricClick={(metric) => setDrillDownModal(metric)}
                  />
                </SectionErrorBoundary>
              </CollapsibleContent>
            </Collapsible>

            {/* Periodic Stats */}
            <SectionErrorBoundary sectionName="Performance Summary">
              <PeriodicStatsTable clientId={clientId} />
            </SectionErrorBoundary>

            {/* Charts - Collapsible */}
            <Collapsible open={chartsOpen} onOpenChange={setChartsOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                <h2 className="text-lg font-bold">Metric Charts</h2>
                <span className="text-xs text-muted-foreground">{chartsOpen ? '▾' : '▸'}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <SectionErrorBoundary sectionName="Metric Charts">
                  <MetricChartsGrid dailyMetrics={dailyMetrics} />
                </SectionErrorBoundary>
              </CollapsibleContent>
            </Collapsible>

            {/* Attribution & Records - Collapsible, default closed */}
            <Collapsible open={recordsOpen} onOpenChange={setRecordsOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                <h2 className="text-lg font-bold">Attribution & Records</h2>
                <span className="text-xs text-muted-foreground">{recordsOpen ? '▾' : '▸'}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-6">
                <SectionErrorBoundary sectionName="Records">
                  <InlineRecordsView
                    dailyMetrics={dailyMetrics}
                    leads={leads}
                    calls={calls}
                    fundedInvestors={fundedInvestors}
                    isLoading={metricsLoading || leadsLoading}
                    onRecordSelect={handleRecordSelect}
                    selectedRecord={selectedRecord}
                    selectedType={selectedType}
                    clientId={clientId}
                    ghlLocationId={client.ghl_location_id}
                  />
                </SectionErrorBoundary>
                {clientId && (
                  <SectionErrorBoundary sectionName="Data Audit">
                    <DataAuditSection clientId={clientId} />
                  </SectionErrorBoundary>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Meetings */}
            {meetings.length > 0 && (
              <Collapsible open={meetingsOpen} onOpenChange={setMeetingsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                  <Video className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-bold">Recent Meetings</h2>
                  <span className="text-xs text-muted-foreground">{meetingsOpen ? '▾' : '▸'}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <SectionErrorBoundary sectionName="Meetings">
                    <ClientMeetingsSection meetings={meetings} client={client} />
                  </SectionErrorBoundary>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Tasks inline */}
            <SectionErrorBoundary sectionName="Task Board">
              <h2 className="text-lg font-bold mb-3">Tasks</h2>
              <TaskBoardView clientId={clientId} />
            </SectionErrorBoundary>
          </TabsContent>

          {/* ─── ADS & CREATIVES TAB ─── */}
          <TabsContent value="ads-creatives" className="space-y-6">
            <SectionErrorBoundary sectionName="Creatives">
              <h2 className="text-lg font-bold mb-3">Creative Assets</h2>
              <CreativesSection
                clientId={client.id}
                clientName={client.name}
                isPublicView={false}
              />
            </SectionErrorBoundary>

            <SectionErrorBoundary sectionName="Ads Manager">
              <h2 className="text-lg font-bold mb-3">Ads Manager</h2>
              <AdsManagerTab clientId={client.id} clientName={client.name} />
            </SectionErrorBoundary>
          </TabsContent>

          {/* ─── PIPELINE TAB ─── */}
          <TabsContent value="pipeline" className="space-y-6">
            <SectionErrorBoundary sectionName="Pipeline">
              <h2 className="text-lg font-bold mb-3">Sales Pipeline</h2>
              <PipelineTab clientId={client.id} isPublicView={false} />
            </SectionErrorBoundary>

            <SectionErrorBoundary sectionName="Funnel Preview">
              <h2 className="text-lg font-bold mb-3">Funnel Pages</h2>
              <FunnelPreviewTab clientId={client.id} isPublicView={false} />
            </SectionErrorBoundary>

            <SectionErrorBoundary sectionName="Offers & Files">
              <h2 className="text-lg font-bold mb-3">Offers & Files</h2>
              <ClientOffersSection clientId={client.id} clientName={client.name} />
            </SectionErrorBoundary>
          </TabsContent>

          {/* ─── SETTINGS TAB ─── */}
          <TabsContent value="client-settings" className="space-y-6">
            {/* Billing */}
            {isAdmin && (
              <SectionErrorBoundary sectionName="Billing">
                <h2 className="text-lg font-bold mb-3">Billing</h2>
                <ClientBillingTab clientId={client.id} clientName={client.name} />
              </SectionErrorBoundary>
            )}

            {/* Import tools */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold">Data Import</h2>
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Import CSV
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => openCsvImport('ad_spend')}>
                      <DollarSign className="h-4 w-4 mr-2" />
                      Ad Spend (Meta Export)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openCsvImport('leads')}>Leads</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openCsvImport('calls')}>Calls</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openCsvImport('call_summary')}>
                      <Phone className="h-4 w-4 mr-2" />
                      Call Summary
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openCsvImport('funded_investors')}>Funded Investors</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => setImportHistoryOpen(true)}>
                  <History className="h-4 w-4 mr-2" />
                  Import History
                </Button>
              </div>
            </div>

            {/* External links / Custom tabs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Connected Accounts & Links</h2>
                <Button variant="ghost" size="sm" onClick={() => setAddTabOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Link
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {client.ghl_location_id && (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => window.open(`https://app.gohighlevel.com/v2/location/${client.ghl_location_id}/dashboard`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    GHL Dashboard
                  </Button>
                )}
                {client.business_manager_url && (
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => window.open(client.business_manager_url!, '_blank')}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Meta Ads Manager
                  </Button>
                )}
                {customTabs.map((tab) => (
                  <div key={tab.id} className="relative group">
                    <Button
                      variant="outline"
                      className="justify-start w-full"
                      onClick={() => window.open(tab.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {tab.name}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Link?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the "{tab.name}" link. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteCustomTab.mutate({ id: tab.id, clientId: clientId! })}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modals */}
      <ClientSettingsModal client={client} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <CSVImportModal clientId={clientId || ''} importType={csvImportType} open={csvImportOpen} onOpenChange={setCsvImportOpen} />
      <ImportHistoryModal clientId={clientId || ''} open={importHistoryOpen} onOpenChange={setImportHistoryOpen} />
      <AddCustomTabModal clientId={clientId || ''} open={addTabOpen} onOpenChange={setAddTabOpen} />
      <AIAnalysisChat context={aiContext} />

      {/* Drill-Down Modals */}
      <LeadsDrillDownModal clientId={clientId} open={drillDownModal === 'leads'} onOpenChange={(open) => !open && setDrillDownModal(null)} />
      <CallsDrillDownModal clientId={clientId} open={drillDownModal === 'calls'} onOpenChange={(open) => !open && setDrillDownModal(null)} />
      <CallsDrillDownModal clientId={clientId} showedOnly open={drillDownModal === 'showedCalls'} onOpenChange={(open) => !open && setDrillDownModal(null)} />
      <AdSpendDrillDownModal clientId={clientId} open={drillDownModal === 'totalAdSpend'} onOpenChange={(open) => !open && setDrillDownModal(null)} />
      <FundedInvestorsDrillDownModal clientId={clientId} open={drillDownModal === 'fundedInvestors'} onOpenChange={(open) => !open && setDrillDownModal(null)} />
    </div>
  );
}
