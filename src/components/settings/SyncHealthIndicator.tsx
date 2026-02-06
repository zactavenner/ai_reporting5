import { CheckCircle, AlertCircle, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface SyncHealthIndicatorProps {
  status: 'healthy' | 'stale' | 'error' | 'not_configured';
  lastSyncAt: string | null;
  syncError: string | null;
  compact?: boolean;
  source?: 'ghl' | 'hubspot' | 'none';
}

export function SyncHealthIndicator({
  status,
  lastSyncAt,
  syncError,
  compact = false,
  source = 'ghl',
}: SyncHealthIndicatorProps) {
  const getStatusConfig = () => {
    const sourceLabel = source === 'hubspot' ? 'HubSpot' : source === 'ghl' ? 'GHL' : 'CRM';
    
    switch (status) {
      case 'healthy':
        return {
          icon: CheckCircle,
          label: `${sourceLabel} Synced`,
          color: 'text-chart-2',
          bgColor: 'bg-chart-2/10',
          borderColor: 'border-chart-2/30',
        };
      case 'stale':
        return {
          icon: Clock,
          label: `${sourceLabel} Stale`,
          color: 'text-yellow-600 dark:text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
        };
      case 'error':
        return {
          icon: XCircle,
          label: `${sourceLabel} Error`,
          color: 'text-destructive',
          bgColor: 'bg-destructive/10',
          borderColor: 'border-destructive/30',
        };
      case 'not_configured':
      default:
        return {
          icon: AlertCircle,
          label: 'CRM Not Configured',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/30',
          borderColor: 'border-border',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const timeAgo = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })
    : null;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1', config.color)}>
        <Icon className="h-4 w-4" />
        {timeAgo && <span className="text-xs">{timeAgo}</span>}
      </div>
    );
  }

  return (
    <div className={cn(
      'p-3 border-2 rounded space-y-1',
      config.bgColor,
      config.borderColor
    )}>
      <div className={cn('flex items-center gap-2', config.color)}>
        <Icon className="h-4 w-4" />
        <span className="font-medium text-sm">{config.label}</span>
      </div>
      
      {timeAgo && (
        <p className="text-xs text-muted-foreground">
          Last synced: {timeAgo}
        </p>
      )}
      
      {syncError && status === 'error' && (
        <p className="text-xs text-destructive mt-1">
          {syncError}
        </p>
      )}
    </div>
  );
}

// Helper function to determine sync status from timestamps
export function getSyncStatus(
  lastSyncAt: string | null,
  hasCredentials: boolean
): 'healthy' | 'stale' | 'error' | 'not_configured' {
  if (!hasCredentials) return 'not_configured';
  if (!lastSyncAt) return 'not_configured';
  
  const now = new Date();
  const syncedAt = new Date(lastSyncAt);
  const hoursDiff = (now.getTime() - syncedAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff <= 2) return 'healthy';
  if (hoursDiff <= 24) return 'stale';
  return 'error';
}
