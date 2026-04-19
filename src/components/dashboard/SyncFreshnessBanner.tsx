import { AlertTriangle, RefreshCw, Clock, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSyncClient } from '@/hooks/useSyncClient';
import { useState } from 'react';
import { toast } from 'sonner';

interface SyncFreshnessBannerProps {
  clientId: string;
  clientName: string;
  hasAdSpend: boolean;
  leadsCount: number;
  callsCount: number;
}

export function SyncFreshnessBanner({ clientId, clientName, hasAdSpend, leadsCount, callsCount }: SyncFreshnessBannerProps) {
  const [syncing, setSyncing] = useState(false);
  const { syncLeads, syncCalls } = useSyncClient(clientId);

  const { data: clientInfo } = useQuery({
    queryKey: ['client-sync-info', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('ghl_api_key, ghl_location_id, meta_ad_account_id, last_ghl_sync_at, ghl_sync_status, ghl_sync_error')
        .eq('id', clientId)
        .single();
      return data;
    },
  });

  if (!clientInfo) return null;

  const hasGHL = !!(clientInfo.ghl_api_key && clientInfo.ghl_location_id);
  const hasMeta = !!clientInfo.meta_ad_account_id;
  const lastSync = clientInfo.last_ghl_sync_at;
  const syncError = clientInfo.ghl_sync_error;
  const isGHLError = clientInfo.ghl_sync_status === 'error';

  const warnings: { type: 'error' | 'warning'; message: string }[] = [];

  if (hasAdSpend && leadsCount === 0 && hasGHL) {
    warnings.push({
      type: 'error',
      message: `${clientName} has ad spend but 0 CRM leads for this period. GHL integration may not be syncing properly.`,
    });
  }

  if (hasAdSpend && leadsCount === 0 && !hasGHL) {
    warnings.push({
      type: 'error',
      message: `${clientName} has ad spend but no GHL integration configured. Leads won't sync without GHL API key and location ID.`,
    });
  }

  if (isGHLError && syncError) {
    warnings.push({
      type: 'error',
      message: `GHL sync error: ${syncError}`,
    });
  }

  if (hasGHL && lastSync) {
    const hoursSinceSync = (Date.now() - new Date(lastSync).getTime()) / 3600000;
    if (hoursSinceSync > 48) {
      warnings.push({
        type: 'warning',
        message: `GHL data is ${formatDistanceToNow(new Date(lastSync))} old. CRM leads and calendar calls may be stale.`,
      });
    }
  } else if (hasGHL && !lastSync) {
    warnings.push({
      type: 'warning',
      message: 'GHL has never been synced for this client. Run a sync to pull in CRM leads and calendar data.',
    });
  }

  if (hasAdSpend && callsCount === 0 && hasGHL) {
    warnings.push({
      type: 'warning',
      message: 'No booked calls for this period despite ad spend. Check that tracked calendar IDs are configured in client settings.',
    });
  }

  if (hasMeta && !hasAdSpend) {
    warnings.push({
      type: 'warning',
      message: 'Meta ad account is configured but showing $0 spend. Campaigns may be paused or Meta token may need refresh.',
    });
  }

  if (warnings.length === 0) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncLeads();
      await syncCalls();
      toast.success('Sync triggered for ' + clientName);
    } catch (e) {
      toast.error('Sync failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <Alert key={i} variant={w.type === 'error' ? 'destructive' : 'default'} className="py-2.5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-sm">{w.message}</span>
            {i === 0 && hasGHL && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="shrink-0"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Sync Now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ))}
      {lastSync && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 pl-1">
          <Clock className="h-3 w-3" />
          Last GHL sync: {formatDistanceToNow(new Date(lastSync))} ago
        </p>
      )}
    </div>
  );
}
