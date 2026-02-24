import { useState, useEffect, useMemo } from 'react';
import { Client, useUpdateClient } from '@/hooks/useClients';
import { AggregatedMetrics } from '@/hooks/useMetrics';
import { KPIThresholds, ClientSettings, getEffectiveDailyTarget, getEffectiveMonthlyTarget } from '@/hooks/useClientSettings';
import { calculateClientRevenue } from '@/hooks/useClientMRR';
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Settings, ExternalLink, Copy, Trash2, GripVertical, BarChart3, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, CheckCircle, Clock, XCircle, Columns } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SortConfig, SortDirection } from './SortableTableHeader';
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

// Helper function to get sync status from client data
function getClientSyncStatus(client: Client): {
  status: 'healthy' | 'stale' | 'error' | 'not_configured';
  lastSyncAt: string | null;
  error: string | null;
  source: 'ghl' | 'hubspot' | 'none';
} {
  const hasGhlCredentials = !!(client.ghl_api_key && client.ghl_location_id);
  const hasHubspotCredentials = !!(client.hubspot_portal_id && client.hubspot_access_token);
  
  // Check HubSpot first (if configured)
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
    
    // If credentials exist but no sync status, assume it needs to be synced
    return { status: 'stale', lastSyncAt: null, error: null, source: 'hubspot' };
  }
  
  // Check GHL
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
    
    // If credentials exist but no sync status, assume it needs to be synced
    return { status: 'stale', lastSyncAt: null, error: null, source: 'ghl' };
  }
  
  // No CRM configured
  return { status: 'not_configured', lastSyncAt: null, error: null, source: 'none' };
}

// Get row border style based on sync status
function getSyncBorderStyle(status: 'healthy' | 'stale' | 'error' | 'not_configured'): string {
  switch (status) {
    case 'error':
      return 'border-l-4 border-l-destructive';
    case 'stale':
      return 'border-l-4 border-l-yellow-500';
    case 'not_configured':
      return ''; // No border for not configured - neutral state
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
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('client-table-columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('client-table-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: prev[column] === false ? true : false
    }));
  };

  const isColumnVisible = (column: string) => visibleColumns[column] !== false;

  const updateClient = useUpdateClient();

  // Calculate computed values for sorting
  const clientsWithComputedValues = useMemo(() => {
    return clients.map(client => {
      const m = metrics[client.id] || {} as AggregatedMetrics;
      const s = fullSettings[client.id];
      const showedPercent = (m.totalCalls || 0) > 0 ? ((m.showedCalls || 0) / (m.totalCalls || 1) * 100) : 0;
      const costOfCapital = m.fundedDollars > 0 ? ((m.totalAdSpend || 0) / m.fundedDollars * 100) : 0;
      const costPerInvestor = m.fundedInvestors > 0 ? (m.totalAdSpend || 0) / m.fundedInvestors : 0;
      
      // Calculate estimated revenue
      let estRevenue = 0;
      if (s) {
        const monthlyTarget = getEffectiveMonthlyTarget(s);
        estRevenue = calculateClientRevenue(
          s.mrr || 0,
          monthlyTarget,
          s.ad_spend_fee_threshold || 30000,
          s.ad_spend_fee_percent || 10
        );
      }

      return {
        client,
        metrics: m,
        computed: {
          showedPercent,
          costOfCapital,
          costPerInvestor,
          estRevenue,
        },
      };
    });
  }, [clients, metrics, fullSettings]);

  // Sort clients based on sort config
  const sortedClients = useMemo(() => {
    if (!sortConfig.column || !sortConfig.direction) {
      return clientsWithComputedValues;
    }

    return [...clientsWithComputedValues].sort((a, b) => {
      let aVal: number = 0;
      let bVal: number = 0;

      // Map column names to values
      switch (sortConfig.column) {
        case 'adSpend':
          aVal = a.metrics.totalAdSpend || 0;
          bVal = b.metrics.totalAdSpend || 0;
          break;
        case 'ctr':
          aVal = a.metrics.ctr || 0;
          bVal = b.metrics.ctr || 0;
          break;
        case 'leads':
          aVal = a.metrics.totalLeads || 0;
          bVal = b.metrics.totalLeads || 0;
          break;
        case 'spam':
          aVal = a.metrics.spamLeads || 0;
          bVal = b.metrics.spamLeads || 0;
          break;
        case 'cpl':
          aVal = a.metrics.costPerLead || 0;
          bVal = b.metrics.costPerLead || 0;
          break;
        case 'calls':
          aVal = a.metrics.totalCalls || 0;
          bVal = b.metrics.totalCalls || 0;
          break;
        case 'costPerCall':
          aVal = a.metrics.costPerCall || 0;
          bVal = b.metrics.costPerCall || 0;
          break;
        case 'showed':
          aVal = a.metrics.showedCalls || 0;
          bVal = b.metrics.showedCalls || 0;
          break;
        case 'showedPercent':
          aVal = a.computed.showedPercent;
          bVal = b.computed.showedPercent;
          break;
        case 'costPerShow':
          aVal = a.metrics.costPerShow || 0;
          bVal = b.metrics.costPerShow || 0;
          break;
        case 'commit':
          aVal = a.metrics.totalCommitments || 0;
          bVal = b.metrics.totalCommitments || 0;
          break;
        case 'commitDollars':
          aVal = a.metrics.commitmentDollars || 0;
          bVal = b.metrics.commitmentDollars || 0;
          break;
        case 'funded':
          aVal = a.metrics.fundedInvestors || 0;
          bVal = b.metrics.fundedInvestors || 0;
          break;
        case 'fundedDollars':
          aVal = a.metrics.fundedDollars || 0;
          bVal = b.metrics.fundedDollars || 0;
          break;
        case 'costPerInvestor':
          aVal = a.computed.costPerInvestor;
          bVal = b.computed.costPerInvestor;
          break;
        case 'coc':
          aVal = a.computed.costOfCapital;
          bVal = b.computed.costOfCapital;
          break;
        case 'estRev':
          aVal = a.computed.estRevenue;
          bVal = b.computed.estRevenue;
          break;
        default:
          return 0;
      }

      if (sortConfig.direction === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
  }, [clientsWithComputedValues, sortConfig]);

  const handleSort = (column: string) => {
    setSortConfig(prev => {
      let newConfig: SortConfig;
      if (prev.column === column) {
        // Toggle through: asc -> desc -> null
        if (prev.direction === 'asc') {
          newConfig = { column, direction: 'desc' };
        } else if (prev.direction === 'desc') {
          newConfig = { column: '', direction: null };
        } else {
          newConfig = { column, direction: 'desc' };
        }
      } else {
        // Start with descending (highest first) for metrics
        newConfig = { column, direction: 'desc' };
      }
      return newConfig;
    });
  };

  // Effect to save order after sorting is applied
  const handleSaveOrderAfterSort = () => {
    if (sortConfig.column && sortConfig.direction && onReorder) {
      // Save the currently sorted order to database
      const orderedIds = sortedClients.map(c => c.client.id);
      onReorder(orderedIds);
    }
  };

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

    const draggedIndex = sortedClients.findIndex(c => c.client.id === draggedId);
    const targetIndex = sortedClients.findIndex(c => c.client.id === targetId);

    const newOrder = [...sortedClients];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Clear sort when drag-dropping (manual order takes precedence)
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

  // Color based on value - green = good, red = bad
  const getShowedPercentColor = (value: number): string => {
    if (value >= 70) return 'text-chart-2 font-semibold';
    if (value >= 50) return 'text-yellow-600 dark:text-yellow-500 font-semibold';
    if (value > 0) return 'text-destructive font-semibold';
    return '';
  };

  // For Funded $ - green when positive
  const getFundedColor = (value: number): string => {
    if (value > 0) return 'text-chart-2 font-semibold';
    return '';
  };

  // Calculate pacing status (comparing daily spend vs target)
  const getPacingStatus = (
    dailySpend: number, 
    settings: ClientSettings | undefined
  ): { status: 'on-track' | 'over' | 'under' | 'none'; color: string; icon: typeof TrendingUp } => {
    if (!settings) return { status: 'none', color: '', icon: Minus };
    
    const dailyTarget = getEffectiveDailyTarget(settings);
    if (dailyTarget <= 0) return { status: 'none', color: '', icon: Minus };
    
    const variance = (dailySpend - dailyTarget) / dailyTarget;
    
    if (Math.abs(variance) <= 0.1) {
      return { status: 'on-track', color: 'text-chart-2', icon: Minus };
    } else if (variance > 0.1) {
      return { status: 'over', color: 'text-destructive', icon: TrendingUp };
    } else {
      return { status: 'under', color: 'text-yellow-600 dark:text-yellow-500', icon: TrendingDown };
    }
  };

  // Calculate estimated monthly revenue for a client
  const getEstimatedRevenue = (settings: ClientSettings | undefined): number => {
    if (!settings) return 0;
    const monthlyTarget = getEffectiveMonthlyTarget(settings);
    return calculateClientRevenue(
      settings.mrr || 0,
      monthlyTarget,
      settings.ad_spend_fee_threshold || 30000,
      settings.ad_spend_fee_percent || 10
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Save sorted order button when sorting is active */}
          {sortConfig.column && sortConfig.direction && (
            <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded border border-border">
              <span className="text-xs text-muted-foreground">
                Sorted by <strong>{sortConfig.column}</strong>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={handleSaveOrderAfterSort}
              >
                Save Order
              </Button>
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2">
              <Columns className="h-4 w-4" />
              <span>Columns</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={isColumnVisible('status')} onCheckedChange={() => toggleColumn('status')}>Status</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('adSpend')} onCheckedChange={() => toggleColumn('adSpend')}>Ad Spend</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('pacing')} onCheckedChange={() => toggleColumn('pacing')}>Pacing</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('ctr')} onCheckedChange={() => toggleColumn('ctr')}>CTR</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('leads')} onCheckedChange={() => toggleColumn('leads')}>Leads</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('spam')} onCheckedChange={() => toggleColumn('spam')}>Spam/Bad</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('cpl')} onCheckedChange={() => toggleColumn('cpl')}>CPL</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('calls')} onCheckedChange={() => toggleColumn('calls')}>Calls</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('costPerCall')} onCheckedChange={() => toggleColumn('costPerCall')}>Cost/Call</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('showed')} onCheckedChange={() => toggleColumn('showed')}>Showed</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('showedPercent')} onCheckedChange={() => toggleColumn('showedPercent')}>Showed %</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('costPerShow')} onCheckedChange={() => toggleColumn('costPerShow')}>Cost/Show</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('commit')} onCheckedChange={() => toggleColumn('commit')}>Commit</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('commitDollars')} onCheckedChange={() => toggleColumn('commitDollars')}>Commit $</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('funded')} onCheckedChange={() => toggleColumn('funded')}>Funded</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('fundedDollars')} onCheckedChange={() => toggleColumn('fundedDollars')}>Funded $</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('costPerInvestor')} onCheckedChange={() => toggleColumn('costPerInvestor')}>Cost/Inv</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={isColumnVisible('coc')} onCheckedChange={() => toggleColumn('coc')}>CoC %</DropdownMenuCheckboxItem>
            {isAdmin && <DropdownMenuCheckboxItem checked={isColumnVisible('estRev')} onCheckedChange={() => toggleColumn('estRev')}>Est. Rev</DropdownMenuCheckboxItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-2 border-border bg-card overflow-x-auto scrollbar-thin">
        <Table className="min-w-[1200px]">
        <TableHeader>
          <TableRow className="border-b-2">
            <TableHead className="w-10 sticky left-0 bg-card z-10"></TableHead>
            <TableHead className="font-bold text-sm sticky left-10 bg-card z-10 min-w-[140px]">Client</TableHead>
            {isColumnVisible('status') && <TableHead className="font-bold text-sm min-w-[130px]">Status</TableHead>}
            {isColumnVisible('adSpend') && <SortableHeader column="adSpend" label="Ad Spend" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('pacing') && <TableHead className="font-bold text-sm text-center min-w-[90px]">Pacing</TableHead>}
            {isColumnVisible('ctr') && <SortableHeader column="ctr" label="CTR" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('leads') && <SortableHeader column="leads" label="Leads" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('spam') && <SortableHeader column="spam" label="Spam/Bad" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('cpl') && <SortableHeader column="cpl" label="CPL" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('calls') && <SortableHeader column="calls" label="Calls" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('costPerCall') && <SortableHeader column="costPerCall" label="Cost/Call" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('showed') && <SortableHeader column="showed" label="Showed" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('showedPercent') && <SortableHeader column="showedPercent" label="Showed %" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('costPerShow') && <SortableHeader column="costPerShow" label="Cost/Show" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('commit') && <SortableHeader column="commit" label="Commit" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('commitDollars') && <SortableHeader column="commitDollars" label="Commit $" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('funded') && <SortableHeader column="funded" label="Funded" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('fundedDollars') && <SortableHeader column="fundedDollars" label="Funded $" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('costPerInvestor') && <SortableHeader column="costPerInvestor" label="Cost/Inv" sortConfig={sortConfig} onSort={handleSort} />}
            {isColumnVisible('coc') && <SortableHeader column="coc" label="CoC %" sortConfig={sortConfig} onSort={handleSort} />}
            {isAdmin && isColumnVisible('estRev') && <SortableHeader column="estRev" label="Est. Rev" sortConfig={sortConfig} onSort={handleSort} />}
            <TableHead className="font-bold text-sm min-w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedClients.map(({ client, metrics: m, computed }) => {
            const t = thresholds[client.id] || {};
            const s = fullSettings[client.id];
            const pacing = getPacingStatus(m.totalAdSpend || 0, s);
            const PacingIcon = pacing.icon;
            const syncInfo = getClientSyncStatus(client);
            const syncBorderStyle = getSyncBorderStyle(syncInfo.status);
            
            return (
              <TooltipProvider key={client.id}>
              <TableRow
                className={cn(
                  "cursor-pointer hover:bg-muted/50 border-b h-14",
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
                <TableCell className="cursor-grab sticky left-0 bg-card z-10" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    {/* Unified API Test Status - single green/red indicator */}
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
                            "ml-1",
                            syncInfo.status === 'healthy' && 'text-chart-2',
                            syncInfo.status === 'stale' && 'text-yellow-600 dark:text-yellow-500',
                            syncInfo.status === 'error' && 'text-destructive',
                            syncInfo.status === 'not_configured' && 'text-muted-foreground'
                          )}>
                            {syncInfo.status === 'healthy' && <CheckCircle className="h-4 w-4" />}
                            {syncInfo.status === 'stale' && <Clock className="h-4 w-4" />}
                            {syncInfo.status === 'error' && <XCircle className="h-4 w-4" />}
                            {syncInfo.status === 'not_configured' && <AlertCircle className="h-4 w-4" />}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="text-sm">
                            <strong>GHL Sync: </strong>
                            {syncInfo.status === 'healthy' && 'Synced'}
                            {syncInfo.status === 'stale' && 'Stale (>2 hours)'}
                            {syncInfo.status === 'error' && 'Error'}
                            {syncInfo.status === 'not_configured' && 'Not Configured'}
                            {syncInfo.lastSyncAt && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Last: {formatDistanceToNow(new Date(syncInfo.lastSyncAt), { addSuffix: true })}
                              </div>
                            )}
                            {syncInfo.error && (
                              <div className="text-xs text-destructive mt-1">
                                {syncInfo.error}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-semibold text-sm sticky left-10 bg-card z-10">{client.name}</TableCell>
                {isColumnVisible('status') && (
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
                )}
                {isColumnVisible('adSpend') && <TableCell className="text-right font-mono tabular-nums text-sm">{formatCurrency(m.totalAdSpend || 0)}</TableCell>}
                {isColumnVisible('pacing') && (
                  <TableCell className="text-center">
                    {pacing.status !== 'none' ? (
                      <div className={cn("flex items-center justify-center gap-1", pacing.color)}>
                        <PacingIcon className="h-4 w-4" />
                        <span className="text-xs capitalize">{pacing.status === 'on-track' ? 'On Track' : pacing.status}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                )}
                {isColumnVisible('ctr') && <TableCell className="text-right font-mono tabular-nums text-sm">{formatPercent(m.ctr || 0)}</TableCell>}
                {isColumnVisible('leads') && <TableCell className="text-right font-mono tabular-nums text-sm">{m.totalLeads || 0}</TableCell>}
                {isColumnVisible('spam') && <TableCell className="text-right font-mono tabular-nums text-sm">{m.spamLeads || 0}</TableCell>}
                {isColumnVisible('cpl') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getThresholdColor(m.costPerLead || 0, t.costPerLead)
                  )}>
                    {formatCurrency(m.costPerLead || 0)}
                  </TableCell>
                )}
                {isColumnVisible('calls') && <TableCell className="text-right font-mono tabular-nums text-sm">{m.totalCalls || 0}</TableCell>}
                {isColumnVisible('costPerCall') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getThresholdColor(m.costPerCall || 0, t.costPerCall)
                  )}>
                    {formatCurrency(m.costPerCall || 0)}
                  </TableCell>
                )}
                {isColumnVisible('showed') && <TableCell className="text-right font-mono tabular-nums text-sm">{m.showedCalls || 0}</TableCell>}
                {isColumnVisible('showedPercent') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getShowedPercentColor(computed.showedPercent)
                  )}>
                    {formatPercent(computed.showedPercent)}
                  </TableCell>
                )}
                {isColumnVisible('costPerShow') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getThresholdColor(m.costPerShow || 0, t.costPerShow)
                  )}>
                    {formatCurrency(m.costPerShow || 0)}
                  </TableCell>
                )}
                {isColumnVisible('commit') && <TableCell className="text-right font-mono tabular-nums text-sm">{m.totalCommitments || 0}</TableCell>}
                {isColumnVisible('commitDollars') && <TableCell className="text-right font-mono tabular-nums text-sm">{formatCurrency(m.commitmentDollars || 0)}</TableCell>}
                {isColumnVisible('funded') && <TableCell className="text-right font-mono tabular-nums text-sm">{m.fundedInvestors || 0}</TableCell>}
                {isColumnVisible('fundedDollars') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getFundedColor(m.fundedDollars || 0)
                  )}>
                    {formatCurrency(m.fundedDollars || 0)}
                  </TableCell>
                )}
                {isColumnVisible('costPerInvestor') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getThresholdColor(computed.costPerInvestor, t.costPerInvestor)
                  )}>
                    {formatCurrency(computed.costPerInvestor)}
                  </TableCell>
                )}
                {isColumnVisible('coc') && (
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums text-sm",
                    getCostOfCapitalColor(computed.costOfCapital, t.costOfCapital)
                  )}>
                    {formatPercent(computed.costOfCapital)}
                  </TableCell>
                )}
                {isAdmin && isColumnVisible('estRev') && (
                  <TableCell className="text-right font-mono tabular-nums text-sm text-chart-2 font-semibold">
                    {computed.estRevenue > 0 ? formatCurrency(computed.estRevenue) : '-'}
                  </TableCell>
                )}
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
      className="font-bold text-sm text-right cursor-pointer select-none hover:bg-muted/50 transition-colors"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1 justify-end">
        <span>{label}</span>
        {direction === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : direction === 'desc' ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );
}
