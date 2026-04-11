import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Users, Building2, User } from 'lucide-react';
import type { Client } from '@/hooks/useClients';

interface ClientScopePickerProps {
  clientId: string | null;
  onChange: (clientId: string | null) => void;
  clients: Client[];
}

export function ClientScopePicker({ clientId, onChange, clients }: ClientScopePickerProps) {
  const scopeValue = clientId || '__agency__';

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Scope
      </Label>
      <Select value={scopeValue} onValueChange={v => onChange(v === '__agency__' ? null : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select scope..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__agency__">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              <div className="flex flex-col">
                <span className="font-medium">Agency-wide</span>
                <span className="text-[10px] text-muted-foreground">Runs across all clients</span>
              </div>
            </div>
          </SelectItem>
          {clients.map(client => (
            <SelectItem key={client.id} value={client.id}>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                <span>{client.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-[10px] text-muted-foreground">
        {clientId
          ? `This agent runs only for ${clients.find(c => c.id === clientId)?.name || 'selected client'}`
          : 'This agent processes data across all clients'}
      </p>
    </div>
  );
}
