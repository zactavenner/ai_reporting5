import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Smartphone } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary';
import { FunnelPreviewTab } from '@/components/funnel/FunnelPreviewTab';
import { Client } from '@/hooks/useClients';

interface FunnelTabProps {
  clients: Client[];
  selectedFunnelClientId: string | null;
  setSelectedFunnelClientId: (id: string | null) => void;
}

export const FunnelTab = ({
  clients,
  selectedFunnelClientId,
  setSelectedFunnelClientId,
}: FunnelTabProps) => {
  return (
    <div className="space-y-6">
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
    </div>
  );
};
