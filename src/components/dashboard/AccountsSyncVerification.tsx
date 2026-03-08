import { useMemo } from 'react';
import { Client } from '@/hooks/useClients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, XCircle, Clock, AlertCircle, ShieldCheck, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type SyncVerdict = 'synced' | 'stale' | 'error' | 'not_configured';

interface ClientVerification {
  id: string;
  name: string;
  status: string;
  crmSource: 'ghl' | 'hubspot' | 'none';
  hasCredentials: boolean;
  lastSyncAt: string | null;
  syncStatus: string | null;
  syncError: string | null;
  verdict: SyncVerdict;
  leadCount: number;
}

interface AccountsSyncVerificationProps {
  clients: Client[];
  clientFullSettings: Record<string, any>;
  clientMetrics: Record<string, any>;
}

function getVerdict(
  hasCredentials: boolean,
  lastSyncAt: string | null,
  syncStatus: string | null,
): SyncVerdict {
  if (!hasCredentials) return 'not_configured';
  if (syncStatus === 'error') return 'error';
  if (!lastSyncAt) return 'not_configured';

  const hoursDiff = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  if (hoursDiff <= 6) return 'synced';
  if (hoursDiff <= 24) return 'stale';
  return 'error';
}

function VerdictIcon({ verdict }: { verdict: SyncVerdict }) {
  switch (verdict) {
    case 'synced':
      return <CheckCircle className="h-4 w-4 text-chart-2" />;
    case 'stale':
      return <Clock className="h-4 w-4 text-chart-4" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'not_configured':
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function VerdictBadge({ verdict }: { verdict: SyncVerdict }) {
  const variants: Record<SyncVerdict, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    synced: { variant: 'default', label: 'Synced' },
    stale: { variant: 'secondary', label: 'Stale' },
    error: { variant: 'destructive', label: 'Error' },
    not_configured: { variant: 'outline', label: 'Not Configured' },
  };
  const { variant, label } = variants[verdict];
  return <Badge variant={variant} className="text-[10px] px-1.5 py-0">{label}</Badge>;
}

export function AccountsSyncVerification({ clients, clientFullSettings, clientMetrics }: AccountsSyncVerificationProps) {
  const verifications = useMemo<ClientVerification[]>(() => {
    return clients
      .filter(c => c.status === 'active' || c.status === 'onboarding')
      .map(c => {
        const isHubspot = !!c.hubspot_portal_id;
        const isGhl = !!(c.ghl_location_id && c.ghl_api_key);
        const crmSource: 'ghl' | 'hubspot' | 'none' = isHubspot ? 'hubspot' : isGhl ? 'ghl' : 'none';
        const hasCredentials = isHubspot || isGhl;

        const lastSyncAt = isHubspot ? c.last_hubspot_sync_at : c.last_ghl_sync_at;
        const syncStatus = isHubspot ? c.hubspot_sync_status : c.ghl_sync_status;
        const syncError = isHubspot ? c.hubspot_sync_error : c.ghl_sync_error;

        const verdict = getVerdict(hasCredentials, lastSyncAt, syncStatus);
        const leadCount = clientMetrics[c.id]?.totalLeads ?? 0;

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          crmSource,
          hasCredentials,
          lastSyncAt,
          syncStatus,
          syncError,
          verdict,
          leadCount,
        };
      });
  }, [clients, clientMetrics]);

  const counts = useMemo(() => {
    const result = { synced: 0, stale: 0, error: 0, not_configured: 0, total: verifications.length };
    for (const v of verifications) {
      result[v.verdict]++;
    }
    return result;
  }, [verifications]);

  const allSynced = counts.synced === counts.total;
  const hasIssues = counts.error > 0 || counts.stale > 0;
  const hasUnconfigured = counts.not_configured > 0;

  if (verifications.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`h-5 w-5 ${allSynced ? 'text-chart-2' : hasIssues ? 'text-destructive' : 'text-chart-4'}`} />
            <CardTitle className="text-base">Accounts Sync Verification — Leads</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {allSynced ? (
              <Badge variant="default" className="bg-chart-2 text-white">
                <CheckCircle className="h-3 w-3 mr-1" />
                All {counts.total} Accounts Synced
              </Badge>
            ) : (
              <>
                {counts.synced > 0 && (
                  <Badge variant="default" className="text-xs">{counts.synced} Synced</Badge>
                )}
                {counts.stale > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {counts.stale} Stale
                  </Badge>
                )}
                {counts.error > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    {counts.error} Error
                  </Badge>
                )}
                {counts.not_configured > 0 && (
                  <Badge variant="outline" className="text-xs">{counts.not_configured} Not Configured</Badge>
                )}
              </>
            )}
          </div>
        </div>
        {hasIssues && (
          <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {counts.error > 0 && `${counts.error} account(s) have sync errors. `}
              {counts.stale > 0 && `${counts.stale} account(s) have stale data (>6h since last sync). `}
              Lead data may be incomplete in the reporting dashboard.
            </span>
          </div>
        )}
        {!hasIssues && hasUnconfigured && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{counts.not_configured} account(s) do not have CRM credentials configured — no leads will sync for these.</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <TooltipProvider delayDuration={200}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Account</TableHead>
                  <TableHead className="text-center">CRM</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Last Sync</TableHead>
                  <TableHead className="text-center">Verdict</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {verifications.map((v) => (
                  <TableRow key={v.id} className={v.verdict === 'error' ? 'bg-destructive/5' : v.verdict === 'stale' ? 'bg-chart-4/5' : ''}>
                    <TableCell className="font-medium text-sm py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={v.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                          {v.status}
                        </Badge>
                        <span className="truncate max-w-[120px]">{v.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-2">
                      {v.crmSource === 'hubspot' ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-400 text-purple-600 dark:text-purple-400">HubSpot</Badge>
                      ) : v.crmSource === 'ghl' ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-600 dark:text-blue-400">GHL</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center py-2 tabular-nums text-sm">
                      {v.leadCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center py-2">
                      {v.lastSyncAt ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs cursor-default">
                              {formatDistanceToNow(new Date(v.lastSyncAt), { addSuffix: true })}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {new Date(v.lastSyncAt).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <VerdictIcon verdict={v.verdict} />
                        <VerdictBadge verdict={v.verdict} />
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {v.syncError && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-destructive truncate max-w-[200px] block cursor-help">
                              {v.syncError}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">{v.syncError}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {!v.syncError && v.verdict === 'synced' && (
                        <span className="text-xs text-chart-2">All good</span>
                      )}
                      {!v.syncError && v.verdict === 'stale' && (
                        <span className="text-xs text-chart-4">Sync is overdue</span>
                      )}
                      {!v.syncError && v.verdict === 'not_configured' && (
                        <span className="text-xs text-muted-foreground">Configure CRM credentials</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
