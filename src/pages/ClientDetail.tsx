import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Settings, DollarSign, Mic, Upload, History, Plus, ExternalLink, X, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { KPIGrid } from '@/components/dashboard/KPIGrid';

import { MetricChartsGrid } from '@/components/dashboard/MetricChartsGrid';
import { PeriodicStatsTable } from '@/components/dashboard/PeriodicStatsTable';
import { InlineRecordsView } from '@/components/dashboard/InlineRecordsView';
import { AttributionDashboard } from '@/components/dashboard/AttributionDashboard';
import { ClientSettingsModal } from '@/components/settings/ClientSettingsModal';
import { ShareableLinkButton } from '@/components/dashboard/ShareableLinkButton';
import { CSVImportModal, ImportType } from '@/components/import/CSVImportModal';
import { ImportHistoryModal } from '@/components/import/ImportHistoryModal';
import { AddCustomTabModal } from '@/components/import/AddCustomTabModal';
import { CreativeApproval } from '@/components/creative/CreativeApproval';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { AIAnalysisChat } from '@/components/ai/AIAnalysisChat';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { useClient } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics } from '@/hooks/useMetrics';
import { useLeads, useCalls } from '@/hooks/useLeadsAndCalls';
import { useClientSettings, getThresholdsFromSettings } from '@/hooks/useClientSettings';
import { useCustomTabs, useDeleteCustomTab } from '@/hooks/useCustomTabs';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { exportToCSV } from '@/lib/exportUtils';
import { useQueryClient } from '@tanstack/react-query';
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
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string>('');
  const queryClient = useQueryClient();

  const { startDate, endDate } = useDateFilter();
  const { data: client, isLoading: clientLoading } = useClient(clientId);
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useDailyMetrics(clientId, startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(clientId, startDate, endDate);
  const { data: leads = [], isLoading: leadsLoading } = useLeads(clientId, startDate, endDate);
  const { data: calls = [] } = useCalls(clientId, false, startDate, endDate);
  const { data: settings } = useClientSettings(clientId);
  const { data: customTabs = [] } = useCustomTabs(clientId);
  const deleteCustomTab = useDeleteCustomTab();

  const aggregatedMetrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors, leads);
  }, [dailyMetrics, fundedInvestors, leads]);

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
  };

  const openCsvImport = (type: ImportType) => {
    setCsvImportType(type);
    setCsvImportOpen(true);
  };

  const handleRecordSelect = (record: any, type: string) => {
    setSelectedRecord(record);
    setSelectedType(type);
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
                <DropdownMenuItem onClick={() => openCsvImport('leads')}>
                  Leads
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCsvImport('calls')}>
                  Calls
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCsvImport('funded_investors')}>
                  Funded Investors
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setImportHistoryOpen(true)}>
              <History className="h-4 w-4 mr-2" />
              History
            </Button>
            <ShareableLinkButton 
              clientId={client.id}
              clientName={client.name}
              publicToken={client.public_token}
              slug={client.slug}
            />
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
        <DateRangeFilter showAddClient={false} onExportCSV={handleExportCSV} onRefresh={handleRefresh} />

        {/* Main Navigation Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button 
            variant={activeTab === 'overview' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </Button>
          <Button 
            variant={activeTab === 'attribution' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveTab('attribution')}
          >
            Attribution
          </Button>
          <Button 
            variant={activeTab === 'records' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveTab('records')}
          >
            Detailed Records
          </Button>
          <Button 
            variant={activeTab === 'tasks' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveTab('tasks')}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            Tasks
          </Button>
          {customTabs.map((tab) => (
            <div key={tab.id} className="relative group">
              <Button 
                variant={activeTab === `custom-${tab.id}` ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setActiveTab(`custom-${tab.id}`)}
                className="pr-8"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {tab.name}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Tab?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the "{tab.name}" tab. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteCustomTab.mutate({ id: tab.id, clientId: clientId! })}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setAddTabOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Tab
          </Button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
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

            <PeriodicStatsTable dailyMetrics={dailyMetrics} />

            <MetricChartsGrid dailyMetrics={dailyMetrics} />


            <CreativeApproval 
              clientId={client.id} 
              clientName={client.name} 
              isPublicView={false}
            />
          </>
        )}

        {/* Detailed Records Tab */}
        {activeTab === 'records' && (
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
        )}

        {/* Attribution Tab */}
        {activeTab === 'attribution' && (
          <AttributionDashboard 
            leads={leads} 
            calls={calls} 
            fundedInvestors={fundedInvestors} 
          />
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <TaskBoardView clientId={clientId} />
        )}
        {customTabs.map((tab) => (
          activeTab === `custom-${tab.id}` && (
            <div key={tab.id} className="border-2 border-border bg-card rounded-lg overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold">{tab.name}</h3>
                <a 
                  href={tab.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Open in new tab
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <iframe
                src={tab.url}
                className="w-full h-[600px] border-0"
                title={tab.name}
                sandbox="allow-same-origin allow-scripts allow-forms"
              />
            </div>
          )
        ))}
      </main>

      <ClientSettingsModal
        client={client}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <CSVImportModal
        clientId={clientId || ''}
        importType={csvImportType}
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
      />

      <ImportHistoryModal
        clientId={clientId || ''}
        open={importHistoryOpen}
        onOpenChange={setImportHistoryOpen}
      />

      <AddCustomTabModal
        clientId={clientId || ''}
        open={addTabOpen}
        onOpenChange={setAddTabOpen}
      />

      <AIAnalysisChat context={aiContext} />
    </div>
  );
}
