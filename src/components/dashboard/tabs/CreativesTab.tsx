import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { CreativesTab as CreativesTabContent } from '@/components/creative/CreativesTab';

export const CreativesTab = () => {
  return (
    <div className="space-y-6">
      <SectionErrorBoundary sectionName="Creatives">
        <div className="mb-4">
          <h2 className="text-lg font-bold">Creative Approvals</h2>
          <p className="text-sm text-muted-foreground">
            Manage creative assets across all clients
          </p>
        </div>
        <CreativesTabContent />
      </SectionErrorBoundary>
    </div>
  );
};
