import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { AIHubTab } from '@/components/ai/AIHubTab';
import { Client } from '@/hooks/useClients';
import { SourceAggregatedMetrics } from '@/hooks/useSourceMetrics';

interface AITabProps {
  clients: Client[];
  clientMetrics: Record<string, SourceAggregatedMetrics>;
  agencyMetrics: SourceAggregatedMetrics;
}

export const AITab = ({ clients, clientMetrics, agencyMetrics }: AITabProps) => {
  return (
    <div className="space-y-6">
      <SectionErrorBoundary sectionName="AI Hub">
        <AIHubTab
          clients={clients}
          clientMetrics={clientMetrics}
          agencyMetrics={agencyMetrics}
        />
      </SectionErrorBoundary>
    </div>
  );
};
