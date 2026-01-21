import { useState, useEffect } from 'react';
import { Client, useUpdateClient } from '@/hooks/useClients';
import { AggregatedMetrics } from '@/hooks/useMetrics';
import { KPIThresholds } from '@/hooks/useClientSettings';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings, ExternalLink, Copy, Trash2, GripVertical, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DraggableClientTableProps {
  clients: Client[];
  metrics: Record<string, AggregatedMetrics>;
  thresholds: Record<string, KPIThresholds>;
  onOpenSettings: (client: Client) => void;
  onDeleteClient?: (client: Client) => void;
  onReorder?: (orderedClientIds: string[]) => void;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'paused', label: 'Paused' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'inactive', label: 'Inactive' },
];

export function DraggableClientTable({ 
  clients, 
  metrics, 
  thresholds,
  onOpenSettings, 
  onDeleteClient,
  onReorder,
}: DraggableClientTableProps) {
  const navigate = useNavigate();
  const [orderedClients, setOrderedClients] = useState(clients);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const updateClient = useUpdateClient();

  useEffect(() => {
    setOrderedClients(clients);
  }, [clients]);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'success' as const;
      case 'onboarding':
        return 'default' as const;
      case 'paused':
      case 'on_hold':
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

  const getThresholdColor = (value: number, threshold?: { yellow: number; red: number }): string => {
    if (!threshold) return '';
    if (value >= threshold.red) return 'text-destructive font-semibold';
    if (value >= threshold.yellow) return 'text-yellow-600 dark:text-yellow-500 font-semibold';
    return 'text-chart-2';
  };

  const getCostOfCapitalColor = (value: number, threshold?: { yellow: number; red: number }): string => {
    if (!threshold) return '';
    if (value >= threshold.red) return 'text-destructive font-semibold';
    if (value >= threshold.yellow) return 'text-yellow-600 dark:text-yellow-500 font-semibold';
    return 'text-chart-2';
  };

  const handleDragStart = (e: React.DragEvent, clientId: string) => {
    setDraggedId(clientId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = orderedClients.findIndex(c => c.id === draggedId);
    const targetIndex = orderedClients.findIndex(c => c.id === targetId);

    const newOrder = [...orderedClients];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    setOrderedClients(newOrder);
    onReorder?.(newOrder.map(c => c.id));
    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const openAdsManager = (e: React.MouseEvent, url: string | null) => {
    e.stopPropagation();
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error('No Ads Manager URL configured for this client');
    }
  };

  const handleStatusChange = async (clientId: string, newStatus: string) => {
    try {
      await updateClient.mutateAsync({ id: clientId, status: newStatus as any });
      toast.success('Status updated');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="border-2 border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2">
            <TableHead className="w-8"></TableHead>
            <TableHead className="font-bold text-base">Client Name</TableHead>
            <TableHead className="font-bold text-base">Status</TableHead>
            <TableHead className="font-bold text-base text-right">Ad Spend</TableHead>
            <TableHead className="font-bold text-base text-right">Leads</TableHead>
            <TableHead className="font-bold text-base text-right">Booking %</TableHead>
            <TableHead className="font-bold text-base text-right">Calls</TableHead>
            <TableHead className="font-bold text-base text-right">Showed</TableHead>
            <TableHead className="font-bold text-base text-right">Investors</TableHead>
            <TableHead className="font-bold text-base text-right">Funded $</TableHead>
            <TableHead className="font-bold text-base text-right">Avg CPL</TableHead>
            <TableHead className="font-bold text-base text-right">CoC %</TableHead>
            <TableHead className="font-bold text-base">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderedClients.map((client) => {
            const m = metrics[client.id] || {} as AggregatedMetrics;
            const t = thresholds[client.id] || {};
            const bookingPercent = m.totalLeads > 0 ? ((m.totalCalls || 0) / m.totalLeads * 100) : 0;
            const costOfCapital = m.fundedDollars > 0 ? ((m.totalAdSpend || 0) / m.fundedDollars * 100) : 0;
            
            return (
              <TableRow
                key={client.id}
                className={cn(
                  "cursor-pointer hover:bg-muted/50 border-b-2",
                  draggedId === client.id && "opacity-50"
                )}
                draggable
                onDragStart={(e) => handleDragStart(e, client.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, client.id)}
                onDragEnd={handleDragEnd}
                onClick={() => navigate(`/client/${client.id}`)}
              >
                <TableCell className="cursor-grab" onClick={(e) => e.stopPropagation()}>
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </TableCell>
                <TableCell className="font-semibold text-base">{client.name}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={client.status}
                    onValueChange={(value) => handleStatusChange(client.id, value)}
                  >
                    <SelectTrigger className="w-[120px] h-8">
                      <SelectValue>
                        <Badge variant={getStatusVariant(client.status)} className="text-xs">
                          {STATUS_OPTIONS.find(s => s.value === client.status)?.label || client.status}
                        </Badge>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <Badge variant={getStatusVariant(option.value)} className="text-xs">
                            {option.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base">{formatCurrency(m.totalAdSpend || 0)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base">{m.totalLeads || 0}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base">{formatPercent(bookingPercent)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base">{m.totalCalls || 0}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base">{m.showedCalls || 0}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base">{m.fundedInvestors || 0}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-base text-chart-2">{formatCurrency(m.fundedDollars || 0)}</TableCell>
                <TableCell className={cn(
                  "text-right font-mono tabular-nums text-base",
                  getThresholdColor(m.costPerLead || 0, t.costPerLead)
                )}>
                  {formatCurrency(m.costPerLead || 0)}
                </TableCell>
                <TableCell className={cn(
                  "text-right font-mono tabular-nums text-base",
                  getCostOfCapitalColor(costOfCapital, t.costOfCapital)
                )}>
                  {formatPercent(costOfCapital)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => openAdsManager(e, client.business_manager_url)}
                      title="Ads Manager"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
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
