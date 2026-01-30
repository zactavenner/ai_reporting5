import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useClientByToken } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics } from '@/hooks/useMetrics';
import { useLeads, useCalls } from '@/hooks/useLeadsAndCalls';
import { useCustomTabs } from '@/hooks/useCustomTabs';
import { useFunnelSteps } from '@/hooks/useFunnelSteps';
import { useTasks } from '@/hooks/useTasks';
import { useVoiceNotes } from '@/hooks/useVoiceNotes';
import { useMeetings } from '@/hooks/useMeetings';
import { useCreatives } from '@/hooks/useCreatives';
import { useClientSettings } from '@/hooks/useClientSettings';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { MetricChartsGrid } from '@/components/dashboard/MetricChartsGrid';
import { PeriodicStatsTable } from '@/components/dashboard/PeriodicStatsTable';
import { InlineRecordsView } from '@/components/dashboard/InlineRecordsView';
import { CreativeApproval } from '@/components/creative/CreativeApproval';
import { AIAnalysisChat } from '@/components/ai/AIAnalysisChat';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { AttributionDashboard } from '@/components/dashboard/AttributionDashboard';
import { ActivityPanel } from '@/components/activity/ActivityPanel';
import { PublicLinkPasswordGate } from '@/components/auth/PublicLinkPasswordGate';
import { Button } from '@/components/ui/button';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { useQueryClient } from '@tanstack/react-query';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { ExternalLink, ClipboardList, Smartphone, Layers, AlertCircle } from 'lucide-react';
import { FunnelPreviewTab } from '@/components/funnel/FunnelPreviewTab';
import { VoiceRecordButton } from '@/components/voice/VoiceRecordButton';
import { PipelineTab } from '@/components/pipeline/PipelineTab';
import { useClientPipelines } from '@/hooks/usePipelines';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const { startDate, endDate } = useDateFilter();
  const queryClient = useQueryClient();
  
  // Debug logging for public report access
  useEffect(() => {
    console.log('[PublicReport] Mounting with token:', token);
  }, [token]);
  
  const { data: client, isLoading, error: clientError } = useClientByToken(token);
  
  // Debug logging for client fetch
  useEffect(() => {
    console.log('[PublicReport] Client data:', { client, isLoading, error: clientError?.message });
  }, [client, isLoading, clientError]);
  
  const { data: clientSettings, error: settingsError } = useClientSettings(client?.id);
  const { data: dailyMetrics = [], isLoading: metricsLoading, error: metricsError } = useDailyMetrics(client?.id, startDate, endDate);
  const { data: fundedInvestors = [], error: fundedError } = useFundedInvestors(client?.id, startDate, endDate);
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useLeads(client?.id, startDate, endDate);
  const { data: calls = [], error: callsError } = useCalls(client?.id, false, startDate, endDate);
  const { data: customTabs = [], error: tabsError } = useCustomTabs(client?.id);
  const { data: funnelSteps = [], error: funnelError } = useFunnelSteps(client?.id);
  const { data: clientTasks = [], error: tasksError } = useTasks(client?.id);
  const { data: voiceNotes = [], error: voiceError } = useVoiceNotes(client?.id);
  const { data: meetings = [], error: meetingsError } = useMeetings(client?.id);
  const { data: creatives = [], error: creativesError } = useCreatives(client?.id);
  const { data: pipelines = [], error: pipelinesError } = useClientPipelines(client?.id);
  
  // Collect any errors for debugging
  const dataErrors = [
    settingsError, metricsError, fundedError, leadsError, callsError,
    tabsError, funnelError, tasksError, voiceError, meetingsError, creativesError, pipelinesError
  ].filter(Boolean);
  
  // Log data errors for debugging
  useEffect(() => {
    if (dataErrors.length > 0) {
      console.error('[PublicReport] Data fetching errors:', dataErrors.map(e => (e as Error).message));
    }
  }, [dataErrors.length]);
  
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string>('');

  const handleActivityClick = (activityId: string, type: string) => {
    if (type.startsWith('task_')) {
      setActiveSection('tasks');
    } else if (type.startsWith('creative_')) {
      setActiveSection('creatives');
    }
  };

  const metrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors, leads);
  }, [dailyMetrics, fundedInvestors, leads]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['calls'] });
    queryClient.invalidateQueries({ queryKey: ['creatives'] });
  };

  const handleRecordSelect = (record: any, type: string) => {
    setSelectedRecord(record);
    setSelectedType(type);
  };

  // Build context for AI analysis
  const aiContext = {
    clientName: client?.name || '',
    totalAdSpend: metrics.totalAdSpend,
    leads: metrics.totalLeads,
    calls: metrics.totalCalls,
    showedCalls: metrics.showedCalls,
    costPerLead: metrics.costPerLead,
    costPerCall: metrics.costPerCall,
    costPerShow: metrics.costPerShow,
    fundedInvestors: metrics.fundedInvestors,
    fundedDollars: metrics.fundedDollars,
    costPerInvestor: metrics.costPerInvestor,
    costOfCapital: metrics.costOfCapital,
    showedPercent: metrics.showedPercent,
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <CashBagLoader message="Loading report..." />
      </div>
    );
  }

  // Handle client fetch error
  if (clientError) {
    console.error('[PublicReport] Client fetch error:', clientError);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Report</AlertTitle>
          <AlertDescription>
            There was a problem loading this report. Please try refreshing the page.
            <div className="mt-2 text-xs opacity-70">
              Error: {(clientError as Error).message}
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center border-2 border-border bg-card p-8 max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Report Not Found</h1>
          <p className="text-muted-foreground mb-4">This report link is invalid or has expired.</p>
          <p className="text-xs text-muted-foreground">
            Token: {token || 'none'}
          </p>
        </div>
      </div>
    );
  }

  // Check if password protection is enabled
  const publicLinkPassword = clientSettings?.public_link_password;
  
  const reportContent = (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{client.name} - Performance Report</h1>
            <p className="text-sm text-muted-foreground">Capital Raising Performance Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <VoiceRecordButton 
              clientId={client.id}
              clientName={client.name}
              isPublicView={true}
            />
            <ActivityPanel
              tasks={clientTasks}
              voiceNotes={voiceNotes}
              meetings={meetings}
              creatives={creatives}
              isPublicView={true}
              onActivityClick={handleActivityClick}
            />
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        <DateRangeFilter showAddClient={false} onRefresh={handleRefresh} />

        {/* Section Navigation */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant={activeSection === 'overview' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('overview')}
          >
            Overview
          </Button>
          <Button 
            variant={activeSection === 'attribution' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('attribution')}
          >
            Attribution
          </Button>
          <Button 
            variant={activeSection === 'records' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('records')}
          >
            Detailed Records
          </Button>
          <Button 
            variant={activeSection === 'tasks' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('tasks')}
          >
            <ClipboardList className="h-4 w-4 mr-1" />
            Tasks
          </Button>
          {funnelSteps.length > 0 && (
            <Button 
              variant={activeSection === 'funnel' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveSection('funnel')}
            >
              <Smartphone className="h-4 w-4 mr-1" />
              Funnel
            </Button>
          )}
          {pipelines.length > 0 && (
            <Button 
              variant={activeSection === 'pipeline' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveSection('pipeline')}
            >
              <Layers className="h-4 w-4 mr-1" />
              Pipeline
            </Button>
          )}
          {customTabs.map((tab) => (
            <Button 
              key={tab.id}
              variant={activeSection === `custom-${tab.id}` ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveSection(`custom-${tab.id}`)}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              {tab.name}
            </Button>
          ))}
        </div>

        {activeSection === 'overview' && (
          <>
            <section>
              <h2 className="text-lg font-bold mb-2">Key Performance Indicators</h2>
              <KPIGrid metrics={metrics} showFundedMetrics />
            </section>

            <PeriodicStatsTable dailyMetrics={dailyMetrics} />

            <MetricChartsGrid dailyMetrics={dailyMetrics} />


            <CreativeApproval 
              clientId={client.id} 
              clientName={client.name} 
              isPublicView={true}
            />
          </>
        )}

        {activeSection === 'records' && (
          <InlineRecordsView
            dailyMetrics={dailyMetrics}
            leads={leads}
            calls={calls}
            fundedInvestors={fundedInvestors}
            isLoading={metricsLoading || leadsLoading}
            onRecordSelect={handleRecordSelect}
            selectedRecord={selectedRecord}
            selectedType={selectedType}
            clientId={client?.id}
            isPublicView={true}
            ghlLocationId={client?.ghl_location_id || undefined}
          />
        )}

        {/* Attribution Tab */}
        {activeSection === 'attribution' && (
          <AttributionDashboard 
            leads={leads} 
            calls={calls} 
            fundedInvestors={fundedInvestors} 
          />
        )}

        {/* Tasks Section */}
        {activeSection === 'tasks' && client && (
          <TaskBoardView clientId={client.id} isPublicView={true} />
        )}

        {/* Funnel Preview Section */}
        {activeSection === 'funnel' && client && (
          <FunnelPreviewTab clientId={client.id} isPublicView={true} />
        )}

        {/* Pipeline Section */}
        {activeSection === 'pipeline' && client && (
          <PipelineTab clientId={client.id} isPublicView={true} />
        )}

        {/* Custom Embed Tabs */}
        {customTabs.map((tab) => (
          activeSection === `custom-${tab.id}` && (
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

        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>Report generated on {new Date().toLocaleDateString()}</p>
        </footer>
      </main>

      <AIAnalysisChat context={aiContext} />
    </div>
  );

  // Wrap in password gate if password is set
  if (publicLinkPassword) {
    return (
      <PublicLinkPasswordGate
        clientId={client.id}
        clientName={client.name}
        requiredPassword={publicLinkPassword}
      >
        {reportContent}
      </PublicLinkPasswordGate>
    );
  }

  return reportContent;
}
