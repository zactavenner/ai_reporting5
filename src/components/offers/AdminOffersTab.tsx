import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientOffersSection } from './ClientOffersSection';
import { Client } from '@/hooks/useClients';

interface AdminOffersTabProps { clients: Client[]; }

export function AdminOffersTab({ clients }: AdminOffersTabProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const selectedClient = clients.find(c => c.id === selectedClientId);

  return (
    <div className="space-y-6">
      <Select value={selectedClientId} onValueChange={setSelectedClientId}>
        <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select a client" /></SelectTrigger>
        <SelectContent>
          {clients.map((client) => (<SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>))}
        </SelectContent>
      </Select>
      {selectedClient ? (
        <ClientOffersSection clientId={selectedClient.id} clientName={selectedClient.name} />
      ) : (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">Select a client to manage their offers</p>
        </div>
      )}
    </div>
  );
}
