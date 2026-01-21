import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useClientByToken } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics } from '@/hooks/useMetrics';
import { useLeads, useCalls } from '@/hooks/useLeadsAndCalls';
import { useCustomTabs } from '@/hooks/useCustomTabs';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { MetricChartsGrid } from '@/components/dashboard/MetricChartsGrid';
import { PeriodicStatsTable } from '@/components/dashboard/PeriodicStatsTable';
import { InlineRecordsView } from '@/components/dashboard/InlineRecordsView';
import { CreativeApproval } from '@/components/creative/CreativeApproval';
import { AIAnalysisChat } from '@/components/ai/AIAnalysisChat';
import { Button } from '@/components/ui/button';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { useQueryClient } from '@tanstack/react-query';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { ExternalLink } from 'lucide-react';

export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const { startDate, endDate } = useDateFilter();
  const queryClient = useQueryClient();
  
  const { data: client, isLoading } = useClientByToken(token);
  const { data: dailyMetrics = [], isLoading: metricsLoading } = useDailyMetrics(client?.id, startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(client?.id, startDate, endDate);
  const { data: leads = [], isLoading: leadsLoading } = useLeads(client?.id, startDate, endDate);
  const { data: calls = [] } = useCalls(client?.id, false, startDate, endDate);
  const { data: customTabs = [] } = useCustomTabs(client?.id);
  
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<string>('');

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

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center border-2 border-border bg-card p-8">
          <h1 className="text-2xl font-bold mb-2">Report Not Found</h1>
          <p className="text-muted-foreground">This report link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold">{client.name} - Performance Report</h1>
        <p className="text-sm text-muted-foreground">Capital Raising Performance Dashboard</p>
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
            variant={activeSection === 'records' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('records')}
          >
            Detailed Records
          </Button>
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
          />
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
}
