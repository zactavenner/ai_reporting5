import { UniversalRecordPanel } from '@/components/records/UniversalRecordPanel';
import { PipelineOpportunity } from '@/hooks/usePipelines';

interface OpportunityDetailPanelProps {
  opportunity: PipelineOpportunity;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPublicView?: boolean;
}

export function OpportunityDetailPanel({ 
  opportunity, 
  clientId,
  open, 
  onOpenChange,
  isPublicView 
}: OpportunityDetailPanelProps) {
  return (
    <UniversalRecordPanel
      record={opportunity}
      recordType="opportunity"
      clientId={clientId}
      open={open}
      onOpenChange={onOpenChange}
      isPublicView={isPublicView}
    />
  );
}
