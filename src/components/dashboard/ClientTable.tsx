import { Client } from '@/hooks/useClients';
import { AggregatedMetrics } from '@/hooks/useMetrics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Settings, ExternalLink, Copy, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface ClientTableProps {
  clients: Client[];
  metrics: Record<string, AggregatedMetrics>;
  onOpenSettings: (client: Client) => void;
  onDeleteClient?: (client: Client) => void;
}

export function ClientTable({ clients, metrics, onOpenSettings, onDeleteClient }: ClientTableProps) {
  const navigate = useNavigate();

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'success' as const;
      case 'paused':
        return 'secondary' as const;
      case 'inactive':
        return 'outline' as const;
      default:
        return 'outline' as const;
    }
  };

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatPercent = (val: number) => `${val.toFixed(2)}%`;

  const copyPublicLink = (token: string) => {
    const url = `${window.location.origin}/public/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Public link copied to clipboard');
  };

  return (
    <div className="border-2 border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2">
            <TableHead className="font-bold">Client Name</TableHead>
            <TableHead className="font-bold">Status</TableHead>
            <TableHead className="font-bold text-right">Ad Spend</TableHead>
            <TableHead className="font-bold text-right">CTR</TableHead>
            <TableHead className="font-bold text-right">Leads</TableHead>
            <TableHead className="font-bold text-right">Spam/Bad</TableHead>
            <TableHead className="font-bold text-right">Avg CPL</TableHead>
            <TableHead className="font-bold text-right">Calls</TableHead>
            <TableHead className="font-bold text-right">Cost/Call</TableHead>
            <TableHead className="font-bold text-right">Showed</TableHead>
            <TableHead className="font-bold text-right">Showed %</TableHead>
            <TableHead className="font-bold text-right">Cost/Show</TableHead>
            <TableHead className="font-bold text-right">Commitments</TableHead>
            <TableHead className="font-bold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const m = metrics[client.id] || {} as AggregatedMetrics;
            return (
              <TableRow
                key={client.id}
                className="cursor-pointer hover:bg-muted/50 border-b-2"
                onClick={() => navigate(`/client/${client.id}`)}
              >
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Badge variant={getStatusVariant(client.status)}>
                    {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(m.totalAdSpend || 0)}</TableCell>
                <TableCell className="text-right font-mono">{formatPercent(m.ctr || 0)}</TableCell>
                <TableCell className="text-right font-mono">{m.totalLeads || 0}</TableCell>
                <TableCell className="text-right font-mono text-destructive">{m.spamLeads || 0}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(m.costPerLead || 0)}</TableCell>
                <TableCell className="text-right font-mono">{m.totalCalls || 0}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(m.costPerCall || 0)}</TableCell>
                <TableCell className="text-right font-mono">{m.showedCalls || 0}</TableCell>
                <TableCell className={`text-right font-mono ${(m.showedPercent || 0) < 30 ? 'text-destructive' : 'text-chart-2'}`}>
                  {formatPercent(m.showedPercent || 0)}
                </TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(m.costPerShow || 0)}</TableCell>
                <TableCell className="text-right font-mono">{m.totalCommitments || 0}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onOpenSettings(client)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => client.public_token && copyPublicLink(client.public_token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => navigate(`/client/${client.id}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    {onDeleteClient && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDeleteClient(client)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
