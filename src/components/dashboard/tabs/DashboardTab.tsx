import { Button } from '@/components/ui/button';
import { Wifi, Sliders } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { AgencyStatsBar } from '@/components/dashboard/AgencyStatsBar';
import { DraggableClientTable } from '@/components/dashboard/DraggableClientTable';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { AgencySyncStatusPanel } from '@/components/dashboard/AgencySyncStatusPanel';
import { Client } from '@/hooks/useClients';
import { SourceAggregatedMetrics } from '@/hooks/useSourceMetrics';
import { KPIThresholds, ClientSettings } from '@/hooks/useClientSettings';
import { ClientApiStatus } from '@/hooks/useApiConnectionTest';

interface DashboardTabProps {
  clients: Client[];
  clientIds: string[];
  clientMRRSettings: Record<string, any>;
  clientAdSpends: Record<string, number>;
  clientFullSettings: Record<string, ClientSettings>;
  currentMember: any;
  clientMetrics: Record<string, SourceAggregatedMetrics>;
  clientThresholds: Record<string, KPIThresholds>;
  testResults: ClientApiStatus;
  isTesting: boolean;
  isLoading: boolean;
  aggregatedMetrics: SourceAggregatedMetrics;
  handleOpenSettings: (client: Client) => void;
  handleDeleteClient: (client: Client) => void;
  handleReorder: (orderedIds: string[]) => void;
  testAllClients: (ids: string[]) => void;
  setMetricsCustomizeOpen: (open: boolean) => void;
  setDrillDownModal: (metric: string | null) => void;
}

export const DashboardTab = ({
  clients,
  clientIds,
  clientMRRSettings,
  clientAdSpends,
  clientFullSettings,
  currentMember,
  clientMetrics,
  clientThresholds,
  testResults,
  isTesting,
  isLoading,
  aggregatedMetrics,
  handleOpenSettings,
  handleDeleteClient,
  handleReorder,
  testAllClients,
  setMetricsCustomizeOpen,
  setDrillDownModal,
}: DashboardTabProps) => {
  return (
    <div className="space-y-6">
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

      <SectionErrorBoundary sectionName="Sync Status">
        <AgencySyncStatusPanel
          clients={clients}
          clientFullSettings={clientFullSettings}
          clientMetrics={clientMetrics}
        />
      </SectionErrorBoundary>
    </div>
  );
};
