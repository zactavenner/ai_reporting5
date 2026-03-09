import { useState, useMemo } from 'react';
import { Client, useUpdateClient } from '@/hooks/useClients';
import { AggregatedMetrics } from '@/hooks/useMetrics';
import { KPIThresholds, ClientSettings } from '@/hooks/useClientSettings';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Settings, ExternalLink, Copy, Trash2, GripVertical, BarChart3, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SortConfig } from './SortableTableHeader';
import { formatDistanceToNow } from 'date-fns';
import { ClientApiStatus } from '@/hooks/useApiConnectionTest';
import { ApiConnectionStatus } from '@/components/settings/ApiConnectionStatus';

interface DraggableClientTableProps {
  clients: Client[];
  metrics: Record<string, AggregatedMetrics>;
  thresholds: Record<string, KPIThresholds>;
  fullSettings?: Record<string, ClientSettings>;
  onOpenSettings: (client: Client) => void;
  onDeleteClient?: (client: Client) => void;
  onReorder?: (orderedClientIds: string[]) => void;
  isAdmin?: boolean;
  apiTestResults?: ClientApiStatus;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'paused', label: 'Paused' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'inactive', label: 'Inactive' },
];

// Helper function to get CRM sync status from client data
function getClientSyncStatus(client: Client): {
  status: 'healthy' | 'stale' | 'error' | 'not_configured';
  lastSyncAt: string | null;
  error: string | null;
  source: 'ghl' | 'hubspot' | 'none';
} {
  const hasGhlCredentials = !!(client.ghl_api_key && client.ghl_location_id);
  const hasHubspotCredentials = !!(client.hubspot_portal_id && client.hubspot_access_token);

  if (hasHubspotCredentials) {
    const hubspotSyncStatus = client.hubspot_sync_status;
    const lastHubspotSyncAt = client.last_hubspot_sync_at;
    const hubspotSyncError = client.hubspot_sync_error;
    if (hubspotSyncStatus) {
      return {
        status: hubspotSyncStatus as 'healthy' | 'stale' | 'error' | 'not_configured',
        lastSyncAt: lastHubspotSyncAt,
        error: hubspotSyncError,
        source: 'hubspot',
      };
    }
    return { status: 'stale', lastSyncAt: null, error: null, source: 'hubspot' };
  }

  if (hasGhlCredentials) {
    const ghlSyncStatus = client.ghl_sync_status;
    const lastGhlSyncAt = client.last_ghl_sync_at;
    const ghlSyncError = client.ghl_sync_error;
    if (ghlSyncStatus) {
      return {
        status: ghlSyncStatus as 'healthy' | 'stale' | 'error' | 'not_configured',
        lastSyncAt: lastGhlSyncAt,
        error: ghlSyncError,
        source: 'ghl',
      };
    }
    return { status: 'stale', lastSyncAt: null, error: null, source: 'ghl' };
  }

  return { status: 'not_configured', lastSyncAt: null, error: null, source: 'none' };
}

// Get Meta sync status from client settings
function getMetaSyncStatus(settings: ClientSettings | undefined, client: Client): {
  status: 'healthy' | 'stale' | 'not_synced';
  lastSyncAt: string | null;
} {
  const hasMetaAccount = !!client.meta_ad_account_id;
  if (!hasMetaAccount) return { status: 'not_synced', lastSyncAt: null };

  const lastSync = (settings as any)?.meta_ads_last_sync || null;
  if (!lastSync) return { status: 'not_synced', lastSyncAt: null };

  const hoursSince = (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60);
  if (hoursSince <= 24) return { status: 'healthy', lastSyncAt: lastSync };
  return { status: 'stale', lastSyncAt: lastSync };
}

// Compute bottleneck from conversion rates
function computeBottleneck(
  leadToBooked: number,
  bookedToShowed: number,
  showedToFunded: number,
): { label: string; value: number } | null {
  const stages = [
    { label: 'L→B', value: leadToBooked },
    { label: 'B→S', value: bookedToShowed },
    { label: 'S→F', value: showedToFunded },
  ].filter(s => s.value >= 0 && isFinite(s.value));

  if (stages.length === 0) return null;

  // Find the lowest conversion rate
  return stages.reduce((min, s) => (s.value < min.value ? s : min), stages[0]);
}

function getSyncBorderStyle(status: 'healthy' | 'stale' | 'error' | 'not_configured'): string {
  switch (status) {
    case 'error':
      return 'border-l-4 border-l-destructive';
    case 'stale':
      return 'border-l-4 border-l-yellow-500';
    default:
      return '';
  }
}

export function DraggableClientTable({
  clients,
  metrics,
  thresholds,
  fullSettings = {},
  onOpenSettings,
  onDeleteClient,
  onReorder,
  isAdmin = false,
  apiTestResults = {},
}: DraggableClientTableProps) {
  const navigate = useNavigate();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: '', direction: null });
  const updateClient = useUpdateClient();

  const clientsWithComputedValues = useMemo(() => {
    return clients.map(client => {
      const m = metrics[client.id] || {} as AggregatedMetrics;
      const s = fullSettings[client.id];

      const leadToBooked = (m.totalLeads || 0) > 0 ? ((m.totalCalls || 0) / (m.totalLeads || 1)) * 100 : 0;
      const bookedToShowed = (m.totalCalls || 0) > 0 ? ((m.showedCalls || 0) / (m.totalCalls || 1)) * 100 : 0;
      const showedToFunded = (m.showedCalls || 0) > 0 ? ((m.fundedInvestors || 0) / (m.showedCalls || 1)) * 100 : 0;
      const bottleneck = computeBottleneck(leadToBooked, bookedToShowed, showedToFunded);
      const metaSync = getMetaSyncStatus(s, client);

      return {
        client,
        metrics: m,
        computed: {
          leadToBooked,
          bookedToShowed,
          showedToFunded,
          bottleneck,
          metaSync,
        },
      };
    });
  }, [clients, metrics, fullSettings]);

  const sortedClients = useMemo(() => {
    if (!sortConfig.column || !sortConfig.direction) {
      return clientsWithComputedValues;
    }

    return [...clientsWithComputedValues].sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;

      switch (sortConfig.column) {
        case 'adSpend': aVal = a.metrics.totalAdSpend || 0; bVal = b.metrics.totalAdSpend || 0; break;
        case 'metaLeads': aVal = a.metrics.totalLeads || 0; bVal = b.metrics.totalLeads || 0; break;
        case 'cpl': aVal = a.metrics.costPerLead || 0; bVal = b.metrics.costPerLead || 0; break;
        case 'crmLeads': aVal = (a.metrics.totalLeads || 0) + (a.metrics.spamLeads || 0); bVal = (b.metrics.totalLeads || 0) + (b.metrics.spamLeads || 0); break;
        case 'calls': aVal = a.metrics.totalCalls || 0; bVal = b.metrics.totalCalls || 0; break;
        case 'showed': aVal = a.metrics.showedCalls || 0; bVal = b.metrics.showedCalls || 0; break;
        case 'funded': aVal = a.metrics.fundedInvestors || 0; bVal = b.metrics.fundedInvestors || 0; break;
        case 'ltb': aVal = a.computed.leadToBooked; bVal = b.computed.leadToBooked; break;
        case 'bts': aVal = a.computed.bookedToShowed; bVal = b.computed.bookedToShowed; break;
        case 'stf': aVal = a.computed.showedToFunded; bVal = b.computed.showedToFunded; break;
        default: return 0;
      }

      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [clientsWithComputedValues, sortConfig]);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      if (prev.column === column) {
        if (prev.direction === 'asc') return { column, direction: 'desc' };
        if (prev.direction === 'desc') return { column: '', direction: null };
        return { column, direction: 'desc' };
      }
      return { column, direction: 'desc' };
    });
  };

  const handleSaveOrderAfterSort = () => {
    if (sortConfig.column && sortConfig.direction && onReorder) {
      onReorder(sortedClients.map(c => c.client.id));
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active': return 'success' as const;
      case 'onboarding': return 'default' as const;
      case 'paused':
      case 'on_hold': return 'secondary' as const;
      default: return 'outline' as const;
    }
  };

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatPercent = (val: number) => `${val.toFixed(1)}%`;

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

  const getConversionColor = (value: number): string => {
    if (value >= 50) return 'text-chart-2 font-semibold';
    if (value >= 20) return 'text-yellow-600 dark:text-yellow-500';
    if (value > 0) return 'text-destructive';
    return 'text-muted-foreground';
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
    const draggedIndex = sortedClients.findIndex(c => c.client.id === draggedId);
    const targetIndex = sortedClients.findIndex(c => c.client.id === targetId);
    const newOrder = [...sortedClients];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    setSortConfig({ column: '', direction: null });
    onReorder?.(newOrder.map(c => c.client.id));
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
    <div className="space-y-2">
      {sortConfig.column && sortConfig.direction && (
        <div className="flex items-center justify-between px-2 py-1 bg-muted/50 rounded border border-border">
          <span className="text-sm text-muted-foreground">
            Sorted by <strong>{sortConfig.column}</strong> ({sortConfig.direction === 'asc' ? 'Low → High' : 'High → Low'})
          </span>
          <Button variant="outline" size="sm" onClick={handleSaveOrderAfterSort}>
            Save This Order
          </Button>
        </div>
      )}
      <div className="border-2 border-border bg-card overflow-x-auto scrollbar-thin">
        <Table className="min-w-[1500px]">
          <TableHeader>
            <TableRow className="border-b-2 h-8">
              <TableHead className="w-8 sticky left-0 bg-card z-10 py-1"></TableHead>
              <TableHead className="font-bold text-xs sticky left-8 bg-card z-10 min-w-[120px] py-1">Client</TableHead>
              <SortableHeader column="adSpend" label="Meta Spend" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="metaLeads" label="Meta Leads" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="cpl" label="CPL" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="crmLeads" label="CRM Leads" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="calls" label="Booked" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="showed" label="Shows" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="funded" label="Funded" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="ltb" label="L→B %" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="bts" label="B→S %" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader column="stf" label="S→F %" sortConfig={sortConfig} onSort={handleSort} />
              <TableHead className="font-bold text-xs text-center min-w-[80px] py-1">Bottleneck</TableHead>
              <TableHead className="font-bold text-xs text-center min-w-[70px] py-1">Meta Sync</TableHead>
              <TableHead className="font-bold text-xs text-center min-w-[80px] py-1">CRM</TableHead>
              <TableHead className="font-bold text-xs min-w-[90px] py-1">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedClients.map(({ client, metrics: m, computed }) => {
              const t = thresholds[client.id] || {};
              const syncInfo = getClientSyncStatus(client);
              const syncBorderStyle = getSyncBorderStyle(syncInfo.status);

              return (
                <TooltipProvider key={client.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer hover:bg-muted/50 border-b h-9",
                      draggedId === client.id && "opacity-50",
                      syncBorderStyle
                    )}
                    draggable
                    onDragStart={(e) => handleDragStart(e, client.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, client.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => navigate(`/client/${client.id}`)}
                  >
                    {/* Drag handle + sync dot */}
                    <TableCell className="cursor-grab sticky left-0 bg-card z-10 py-1 px-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        {apiTestResults[client.id] ? (
                          <ApiConnectionStatus
                            contacts={apiTestResults[client.id].contacts}
                            calendars={apiTestResults[client.id].calendars}
                            opportunities={apiTestResults[client.id].opportunities}
                            errors={apiTestResults[client.id].errors}
                            unified
                          />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={cn(
                                "ml-0.5",
                                syncInfo.status === 'healthy' && 'text-chart-2',
                                syncInfo.status === 'stale' && 'text-yellow-600 dark:text-yellow-500',
                                syncInfo.status === 'error' && 'text-destructive',
                                syncInfo.status === 'not_configured' && 'text-muted-foreground'
                              )}>
                                {syncInfo.status === 'healthy' && <CheckCircle className="h-3 w-3" />}
                                {syncInfo.status === 'stale' && <Clock className="h-3 w-3" />}
                                {syncInfo.status === 'error' && <XCircle className="h-3 w-3" />}
                                {syncInfo.status === 'not_configured' && <AlertCircle className="h-3 w-3" />}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <div className="text-sm">
                                <strong>{syncInfo.source === 'hubspot' ? 'HubSpot' : 'GHL'}: </strong>
                                {syncInfo.status === 'healthy' && 'Synced'}
                                {syncInfo.status === 'stale' && 'Stale'}
                                {syncInfo.status === 'error' && 'Error'}
                                {syncInfo.status === 'not_configured' && 'Not Configured'}
                                {syncInfo.lastSyncAt && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {formatDistanceToNow(new Date(syncInfo.lastSyncAt), { addSuffix: true })}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    {/* Client name */}
                    <TableCell className="font-medium text-xs sticky left-8 bg-card z-10 py-1">
                      {client.name}
                    </TableCell>

                    {/* Meta Spend */}
                    <TableCell className="text-right font-mono tabular-nums text-xs py-1">
                      {formatCurrency(m.totalAdSpend || 0)}
                    </TableCell>

                    {/* Meta Leads */}
                    <TableCell className="text-right font-mono tabular-nums text-xs py-1">
                      {m.totalLeads || 0}
                    </TableCell>

                    {/* CPL */}
                    <TableCell className={cn(
                      "text-right font-mono tabular-nums text-xs py-1",
                      getThresholdColor(m.costPerLead || 0, t.costPerLead)
                    )}>
                      {formatCurrency(m.costPerLead || 0)}
                    </TableCell>

                    {/* CRM Leads */}
                    <TableCell className="text-right font-mono tabular-nums text-xs py-1">
                      {(m.totalLeads || 0) + (m.spamLeads || 0)}
                    </TableCell>

                    {/* Booked Calls */}
                    <TableCell className="text-right font-mono tabular-nums text-xs py-1">
                      {m.totalCalls || 0}
                    </TableCell>

                    {/* Shows */}
                    <TableCell className="text-right font-mono tabular-nums text-xs py-1">
                      {m.showedCalls || 0}
                    </TableCell>

                    {/* Funded */}
                    <TableCell className={cn(
                      "text-right font-mono tabular-nums text-xs py-1",
                      (m.fundedInvestors || 0) > 0 && 'text-chart-2 font-semibold'
                    )}>
                      {m.fundedInvestors || 0}
                    </TableCell>

                    {/* L→B % */}
                    <TableCell className={cn(
                      "text-right font-mono tabular-nums text-xs py-1",
                      getConversionColor(computed.leadToBooked)
                    )}>
                      {computed.leadToBooked > 0 ? formatPercent(computed.leadToBooked) : '-'}
                    </TableCell>

                    {/* B→S % */}
                    <TableCell className={cn(
                      "text-right font-mono tabular-nums text-xs py-1",
                      getConversionColor(computed.bookedToShowed)
                    )}>
                      {computed.bookedToShowed > 0 ? formatPercent(computed.bookedToShowed) : '-'}
                    </TableCell>

                    {/* S→F % */}
                    <TableCell className={cn(
                      "text-right font-mono tabular-nums text-xs py-1",
                      getConversionColor(computed.showedToFunded)
                    )}>
                      {computed.showedToFunded > 0 ? formatPercent(computed.showedToFunded) : '-'}
                    </TableCell>

                    {/* Bottleneck */}
                    <TableCell className="text-center text-xs py-1">
                      {computed.bottleneck ? (
                        <span className="text-destructive line-through font-medium">
                          {computed.bottleneck.label}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Meta Sync Status */}
                    <TableCell className="text-center py-1">
                      {computed.metaSync.status === 'healthy' && (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">Healthy</Badge>
                      )}
                      {computed.metaSync.status === 'stale' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 border-yellow-500/50 text-yellow-600 dark:text-yellow-400">Stale</Badge>
                      )}
                      {computed.metaSync.status === 'not_synced' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">None</Badge>
                      )}
                    </TableCell>

                    {/* CRM Status */}
                    <TableCell className="text-center py-1">
                      {syncInfo.status === 'healthy' && (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          {syncInfo.source === 'hubspot' ? 'HS' : 'GHL'}
                        </Badge>
                      )}
                      {syncInfo.status === 'stale' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 border-yellow-500/50 text-yellow-600 dark:text-yellow-400">
                          {syncInfo.source === 'hubspot' ? 'HS' : 'GHL'}
                        </Badge>
                      )}
                      {syncInfo.status === 'error' && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Error</Badge>
                      )}
                      {syncInfo.status === 'not_configured' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">None</Badge>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-1" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => openAdsManager(e, client.business_manager_url)} title="Ads Manager">
                          <BarChart3 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenSettings(client)}>
                          <Settings className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => client.public_token && copyPublicLink(client.public_token)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/client/${client.id}`)}>
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        {onDeleteClient && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDeleteClient(client)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                </TooltipProvider>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Inline sortable header component
function SortableHeader({
  column,
  label,
  sortConfig,
  onSort,
}: {
  column: string;
  label: string;
  sortConfig: SortConfig;
  onSort: (column: string) => void;
}) {
  const isActive = sortConfig.column === column;
  const direction = isActive ? sortConfig.direction : null;

  return (
    <TableHead
      className="font-bold text-xs text-right cursor-pointer select-none hover:bg-muted/50 transition-colors py-1"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-0.5 justify-end">
        <span>{label}</span>
        {direction === 'asc' ? (
          <ArrowUp className="h-2.5 w-2.5" />
        ) : direction === 'desc' ? (
          <ArrowDown className="h-2.5 w-2.5" />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}
