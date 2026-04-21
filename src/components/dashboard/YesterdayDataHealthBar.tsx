import { useMemo } from 'react';
import { Client } from '@/hooks/useClients';
import { SourceAggregatedMetrics } from '@/hooks/useSourceMetrics';
import { ClientSettings } from '@/hooks/useClientSettings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, DollarSign, Users, Phone, Calendar, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface YesterdayDataHealthBarProps {
  clients: Client[];
  clientMetrics: Record<string, SourceAggregatedMetrics>;
  clientFullSettings: Record<string, ClientSettings>;
}

interface ClientHealthIssue {
  client: Client;
  issues: string[];
  hasAdSpend: boolean;
  hasCrmLeads: boolean;
  hasBookedCalls: boolean;
  hasGhlCredentials: boolean;
  hasMetaAccount: boolean;
  hasTrackedCalendars: boolean;
}

export function YesterdayDataHealthBar({ clients, clientMetrics, clientFullSettings }: YesterdayDataHealthBarProps) {
  const queryClient = useQueryClient();
  const [syncingAll, setSyncingAll] = useState(false);

  const healthData = useMemo(() => {
    const issues: ClientHealthIssue[] = [];
    let withAdSpend = 0;
    let withCrmLeads = 0;
    let withBookedCalls = 0;
    let withShowedCalls = 0;
    let totalIssues = 0;

    for (const client of clients) {
      if (client.status !== 'active' && client.status !== 'onboarding') continue;

      const m = clientMetrics[client.id];
      const s = clientFullSettings[client.id];
      const hasGhl = !!(client.ghl_api_key && client.ghl_location_id);
      const hasHubspot = !!(client.hubspot_portal_id && client.hubspot_access_token);
      const hasCrm = hasGhl || hasHubspot;
      const hasMeta = !!client.meta_ad_account_id;
      const hasCalendars = (s?.tracked_calendar_ids || []).length > 0;

      const adSpend = m?.totalAdSpend || 0;
      const crmLeads = m?.crmLeads || 0;
      const bookedCalls = m?.totalCalls || 0;
      const showedCalls = m?.showedCalls || 0;

      if (adSpend > 0) withAdSpend++;
      if (crmLeads > 0) withCrmLeads++;
      if (bookedCalls > 0) withBookedCalls++;
      if (showedCalls > 0) withShowedCalls++;

      const clientIssues: string[] = [];

      if (adSpend > 0 && crmLeads === 0 && hasCrm) {
        clientIssues.push(`$${adSpend.toFixed(0)} ad spend but 0 CRM leads — GHL sync may have failed`);
      }
      if (adSpend > 0 && crmLeads === 0 && !hasCrm) {
        clientIssues.push(`$${adSpend.toFixed(0)} ad spend but no CRM configured — add GHL credentials`);
      }
      if (hasCrm && crmLeads > 0 && bookedCalls === 0 && !hasCalendars) {
        clientIssues.push(`${crmLeads} CRM leads but no tracked calendars — configure calendar IDs in settings`);
      }
      if (hasCrm && crmLeads > 0 && bookedCalls === 0 && hasCalendars) {
        clientIssues.push(`${crmLeads} CRM leads but 0 booked calls — calendar sync may have failed`);
      }
      if (hasMeta && adSpend === 0) {
        clientIssues.push('Meta account configured but $0 ad spend — Meta sync may not have run');
      }

      if (clientIssues.length > 0) {
        totalIssues += clientIssues.length;
        issues.push({
          client,
          issues: clientIssues,
          hasAdSpend: adSpend > 0,
          hasCrmLeads: crmLeads > 0,
          hasBookedCalls: bookedCalls > 0,
          hasGhlCredentials: hasCrm,
          hasMetaAccount: hasMeta,
          hasTrackedCalendars: hasCalendars,
        });
      }
    }

    return { withAdSpend, withCrmLeads, withBookedCalls, withShowedCalls, issues, totalIssues };
  }, [clients, clientMetrics, clientFullSettings]);

  const activeClients = clients.filter(c => c.status === 'active' || c.status === 'onboarding').length;
  const allHealthy = healthData.totalIssues === 0;

  const handleSyncMissing = async () => {
    setSyncingAll(true);
    const clientsToSync = healthData.issues
      .filter(h => h.hasAdSpend && !h.hasCrmLeads && h.hasGhlCredentials)
      .map(h => h.client);

    if (clientsToSync.length === 0) {
      toast.info('No clients need CRM sync');
      setSyncingAll(false);
      return;
    }

    toast.info(`Triggering sync for ${clientsToSync.length} clients with missing CRM data...`);

    for (const client of clientsToSync) {
      try {
        await supabase.functions.invoke('sync-ghl-contacts', {
          body: { client_id: client.id, mode: 'master_sync' },
        });
      } catch {
        // Continue to next client
      }
    }

    toast.success(`Sync triggered for ${clientsToSync.length} clients — data will update shortly`);
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['client-source-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
    }, 15000);
    setSyncingAll(false);
  };

  if (activeClients === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`border rounded-lg px-4 py-2.5 flex items-center gap-4 flex-wrap ${allHealthy ? 'border-chart-2/30 bg-chart-2/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <div className="flex items-center gap-1.5">
          {allHealthy ? (
            <CheckCircle className="h-4 w-4 text-chart-2" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          )}
          <span className="text-sm font-medium">
            {allHealthy ? 'All data pipelines healthy' : `${healthData.totalIssues} data issue${healthData.totalIssues !== 1 ? 's' : ''} detected`}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono tabular-nums">{healthData.withAdSpend}/{activeClients}</span>
                <span className="text-muted-foreground">spend</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{healthData.withAdSpend} of {activeClients} clients have ad spend in this period</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className={`font-mono tabular-nums ${healthData.withCrmLeads < healthData.withAdSpend ? 'text-destructive font-semibold' : ''}`}>
                  {healthData.withCrmLeads}/{activeClients}
                </span>
                <span className="text-muted-foreground">leads</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {healthData.withCrmLeads} of {activeClients} clients have CRM leads synced
              {healthData.withCrmLeads < healthData.withAdSpend && (
                <div className="text-destructive mt-1">
                  {healthData.withAdSpend - healthData.withCrmLeads} client(s) with ad spend but no CRM leads
                </div>
              )}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono tabular-nums">{healthData.withBookedCalls}/{activeClients}</span>
                <span className="text-muted-foreground">booked</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{healthData.withBookedCalls} of {activeClients} clients have booked calls</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono tabular-nums">{healthData.withShowedCalls}/{activeClients}</span>
                <span className="text-muted-foreground">showed</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{healthData.withShowedCalls} of {activeClients} clients have show calls</TooltipContent>
          </Tooltip>
        </div>

        {healthData.issues.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 cursor-help border-yellow-500/50 text-yellow-600 dark:text-yellow-400">
                  {healthData.issues.length} client{healthData.issues.length !== 1 ? 's' : ''} need attention
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                <div className="space-y-2 text-xs">
                  {healthData.issues.map(({ client, issues }) => (
                    <div key={client.id}>
                      <p className="font-semibold">{client.name}</p>
                      {issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-1 text-muted-foreground ml-2">
                          <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>

            {healthData.issues.some(h => h.hasAdSpend && !h.hasCrmLeads && h.hasGhlCredentials) && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px]"
                onClick={handleSyncMissing}
                disabled={syncingAll}
              >
                {syncingAll ? 'Syncing...' : 'Sync Missing CRM'}
              </Button>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
