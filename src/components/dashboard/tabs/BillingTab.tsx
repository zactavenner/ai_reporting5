import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { AgencyBillingTab } from '@/components/billing/AgencyBillingTab';
import { Client } from '@/hooks/useClients';

interface BillingTabProps {
  clients: Client[];
}

export const BillingTab = ({ clients }: BillingTabProps) => {
  return (
    <div className="space-y-6">
      <SectionErrorBoundary sectionName="Billing">
        <AgencyBillingTab clients={clients} />
      </SectionErrorBoundary>
    </div>
  );
};
