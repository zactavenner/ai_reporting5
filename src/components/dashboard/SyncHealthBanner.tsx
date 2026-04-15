import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Clock, Key } from 'lucide-react';
import { formatDistanceToNow, format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface SyncHealthData {
  client_id: string;
  client_name: string;
  overall_health: string;
  last_meta_success_at: string | null;
  last_ghl_success_at: string | null;
  last_meta_error: string | null;
  last_ghl_error: string | null;
  last_meta_attempt_status: string | null;
  last_ghl_attempt_status: string | null;
  consecutive_meta_failures: number;
  consecutive_ghl_failures: number;
  meta_hours_since_success: number | null;
  ghl_hours_since_success: number | null;
  expected_data_present: boolean;
  meta_ad_account_id: string | null;
  has_ghl_credentials: boolean;
}

interface TokenWarning {
  client_id: string | null;
  error_message: string;
  metadata: any;
}

export function SyncHealthBanner() {
  const [expanded, setExpanded] = useState(false);
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  const { data: healthData = [], isLoading } = useQuery({
    queryKey: ['client-sync-health'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_sync_health' as any)
        .select('*');
      if (error) {
        console.error('Failed to fetch sync health:', error);
        return [];
      }
      return (data || []) as unknown as SyncHealthData[];
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // Check for token warnings in last 24h
  const { data: tokenWarnings = [] } = useQuery({
    queryKey: ['token-warnings'],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('sync_runs')
        .select('client_id, error_message, metadata')
        .eq('status', 'token_expiring')
        .gte('started_at', twentyFourHoursAgo)
        .order('started_at', { ascending: false });
      return (data || []) as TokenWarning[];
    },
    refetchInterval: 5 * 60 * 1000,
  });

  // Check when last master sync ran
  const { data: lastMasterSync } = useQuery({
    queryKey: ['last-master-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_runs')
        .select('started_at, finished_at, status, metadata')
        .eq('function_name', 'daily-master-sync')
        .eq('source', 'master')
        .is('client_id', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading || healthData.length === 0) return null;

  const failing = healthData.filter(h => h.overall_health === 'failing');
  const degraded = healthData.filter(h => h.overall_health === 'degraded');
  const stale = healthData.filter(h => h.overall_health === 'stale');
  const healthy = healthData.filter(h => h.overall_health === 'healthy');

  const lastSyncAge = lastMasterSync?.finished_at
    ? (Date.now() - new Date(lastMasterSync.finished_at).getTime()) / (1000 * 60 * 60)
    : null;
  const schedulerDown = lastSyncAge === null || lastSyncAge > 26;

  const allGood = failing.length === 0 && degraded.length === 0 && !schedulerDown && tokenWarnings.length === 0;

  // Determine banner color
  let bannerClass = 'bg-chart-2/10 border-chart-2/30 text-chart-2';
  let Icon = CheckCircle;
  let message = `All ${healthData.length} clients synced for ${yesterday}`;

  if (schedulerDown) {
    bannerClass = 'bg-destructive/10 border-destructive/30 text-destructive';
    Icon = XCircle;
    message = lastSyncAge === null
      ? 'Daily sync has never run'
      : `Last sync was ${Math.round(lastSyncAge)}h ago — scheduler may be down`;
  } else if (failing.length > 0) {
    bannerClass = 'bg-destructive/10 border-destructive/30 text-destructive';
    Icon = XCircle;
    message = `${failing.length} of ${healthData.length} clients failing to sync`;
  } else if (degraded.length > 0 || stale.length > 0 || tokenWarnings.length > 0) {
    bannerClass = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400';
    Icon = AlertTriangle;
    const issues = [];
    if (degraded.length > 0) issues.push(`${degraded.length} degraded`);
    if (stale.length > 0) issues.push(`${stale.length} stale`);
    if (tokenWarnings.length > 0) issues.push(`${tokenWarnings.length} token warning(s)`);
    message = `${issues.join(', ')} — ${healthy.length}/${healthData.length} clients healthy`;
  }

  return (
    <div className={cn('border rounded-lg px-4 py-2.5 flex items-center gap-3', bannerClass)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium flex-1">{message}</span>

      {lastMasterSync?.finished_at && (
        <span className="text-xs opacity-70 hidden sm:inline">
          Last sync: {formatDistanceToNow(new Date(lastMasterSync.finished_at), { addSuffix: true })}
        </span>
      )}

      {!allGood && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Details
        </Button>
      )}

      {!allGood && expanded && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-card border border-border rounded-lg shadow-lg p-4 max-h-[300px] overflow-y-auto">
          {/* Token warnings */}
          {tokenWarnings.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-bold text-foreground mb-1 flex items-center gap-1">
                <Key className="h-3 w-3" /> Token Warnings
              </h4>
              {tokenWarnings.map((tw, i) => (
                <div key={i} className="text-xs text-muted-foreground ml-4 mb-0.5">
                  {tw.error_message}
                </div>
              ))}
            </div>
          )}

          {/* Failing clients */}
          {failing.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-bold text-destructive mb-1">Failing ({failing.length})</h4>
              {failing.map(c => (
                <ClientHealthRow key={c.client_id} data={c} />
              ))}
            </div>
          )}

          {/* Degraded clients */}
          {degraded.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-bold text-yellow-600 dark:text-yellow-400 mb-1">Degraded ({degraded.length})</h4>
              {degraded.map(c => (
                <ClientHealthRow key={c.client_id} data={c} />
              ))}
            </div>
          )}

          {/* Stale clients */}
          {stale.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-muted-foreground mb-1">Stale ({stale.length})</h4>
              {stale.map(c => (
                <ClientHealthRow key={c.client_id} data={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientHealthRow({ data }: { data: SyncHealthData }) {
  return (
    <div className="flex items-center gap-2 text-xs py-1 ml-2 text-foreground">
      <span className="font-medium min-w-[120px] truncate">{data.client_name}</span>

      {/* Meta status */}
      {data.meta_ad_account_id && (
        <Badge variant="outline" className={cn(
          'text-[9px] px-1.5 py-0',
          data.consecutive_meta_failures > 0 ? 'border-destructive text-destructive' : 'border-chart-2 text-chart-2'
        )}>
          Meta {data.consecutive_meta_failures > 0 ? `✗${data.consecutive_meta_failures}` : '✓'}
        </Badge>
      )}

      {/* GHL status */}
      {data.has_ghl_credentials && (
        <Badge variant="outline" className={cn(
          'text-[9px] px-1.5 py-0',
          data.consecutive_ghl_failures > 0 ? 'border-destructive text-destructive' : 'border-chart-2 text-chart-2'
        )}>
          GHL {data.consecutive_ghl_failures > 0 ? `✗${data.consecutive_ghl_failures}` : '✓'}
        </Badge>
      )}

      {/* Last error */}
      {(data.last_meta_error || data.last_ghl_error) && (
        <span className="text-muted-foreground truncate max-w-[300px]">
          {data.last_meta_error || data.last_ghl_error}
        </span>
      )}

      {/* Hours since success */}
      {(data.meta_hours_since_success || data.ghl_hours_since_success) && (
        <span className="text-muted-foreground flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />
          {Math.round(Math.max(data.meta_hours_since_success || 0, data.ghl_hours_since_success || 0))}h
        </span>
      )}
    </div>
  );
}
