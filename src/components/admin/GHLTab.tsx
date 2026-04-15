import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Users, Phone, TrendingUp, DollarSign, Waypoints, ExternalLink, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

type SyncType = 'leads' | 'calls' | 'pipeline' | 'funded' | 'master';

interface ClientGhlInfo {
  id: string;
  name: string;
  status: string;
  ghl_location_id: string | null;
  ghl_api_key: string | null;
  ghl_sync_status: string | null;
  ghl_sync_error: string | null;
  last_ghl_sync_at: string | null;
  consecutive_ghl_failures: number;
}

export function GHLTab() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState<Record<string, Set<SyncType>>>({});

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['ghl-tab-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status, ghl_location_id, ghl_api_key, ghl_sync_status, ghl_sync_error, last_ghl_sync_at, consecutive_ghl_failures')
        .in('status', ['active', 'onboarding', 'paused'])
        .order('name');
      if (error) throw error;
      return (data || []) as ClientGhlInfo[];
    },
  });

  const { data: recentSyncRuns = [] } = useQuery({
    queryKey: ['ghl-tab-sync-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_runs')
        .select('id, client_id, source, status, error_message, started_at, rows_written')
        .in('source', ['ghl', 'ghl_contacts', 'ghl_calls', 'ghl_pipelines', 'master'])
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const isSyncing = (clientId: string, type: SyncType) => {
    return syncing[clientId]?.has(type) || false;
  };

  const setSyncState = (clientId: string, type: SyncType, active: boolean) => {
    setSyncing(prev => {
      const clientSet = new Set(prev[clientId] || []);
      if (active) clientSet.add(type); else clientSet.delete(type);
      return { ...prev, [clientId]: clientSet };
    });
  };

  const handleSync = async (clientId: string, clientName: string, type: SyncType) => {
    setSyncState(clientId, type, true);
    try {
      let res;
      switch (type) {
        case 'leads':
          res = await supabase.functions.invoke('sync-ghl-contacts', {
            body: { client_id: clientId, mode: 'contacts' },
          });
          break;
        case 'calls':
          res = await supabase.functions.invoke('sync-ghl-contacts', {
            body: { client_id: clientId, mode: 'calls' },
          });
          break;
        case 'pipeline':
          res = await supabase.functions.invoke('sync-ghl-pipelines', {
            body: { client_id: clientId },
          });
          break;
        case 'funded':
          res = await supabase.functions.invoke('sync-ghl-pipelines', {
            body: { client_id: clientId, mode: 'sync' },
          });
          break;
        case 'master':
          res = await supabase.functions.invoke('sync-ghl-contacts', {
            body: { client_id: clientId, mode: 'master_sync' },
          });
          break;
      }
      if (res?.error) throw new Error(res.error.message);
      const label = type === 'master' ? 'Master sync' : type.charAt(0).toUpperCase() + type.slice(1) + ' sync';
      toast.success(`${label} triggered for ${clientName}`);
      queryClient.invalidateQueries({ queryKey: ['ghl-tab-clients'] });
      queryClient.invalidateQueries({ queryKey: ['ghl-tab-sync-runs'] });
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncState(clientId, type, false);
    }
  };

  const getConnectionBadge = (client: ClientGhlInfo) => {
    if (!client.ghl_api_key || !client.ghl_location_id) {
      return <Badge variant="outline" className="text-muted-foreground border-muted"><XCircle className="w-3 h-3 mr-1" />Not Connected</Badge>;
    }
    if (client.consecutive_ghl_failures > 2) {
      return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failing</Badge>;
    }
    if (client.ghl_sync_status === 'error' || client.ghl_sync_status === 'failed') {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    }
    if (client.ghl_sync_status === 'healthy' || client.ghl_sync_status === 'syncing') {
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"><CheckCircle className="w-3 h-3 mr-1" />Connected</Badge>;
    }
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />Stale</Badge>;
  };

  const getLastSyncForClient = (clientId: string, source: string) => {
    return recentSyncRuns.find(r => r.client_id === clientId && r.source?.includes(source));
  };

  const connectedClients = clients.filter(c => c.ghl_api_key && c.ghl_location_id);
  const disconnectedClients = clients.filter(c => !c.ghl_api_key || !c.ghl_location_id);
  const failingCount = connectedClients.filter(c => c.consecutive_ghl_failures > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">GoHighLevel Integrations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage CRM connections, trigger syncs, and monitor data flow
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Waypoints className="w-4 h-4" />Connected
            </div>
            <p className="text-2xl font-bold">{connectedClients.length}<span className="text-sm text-muted-foreground font-normal">/{clients.length}</span></p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <XCircle className="w-4 h-4" />Disconnected
            </div>
            <p className="text-2xl font-bold text-destructive">{disconnectedClients.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertCircle className="w-4 h-4" />Failing Syncs
            </div>
            <p className="text-2xl font-bold text-amber-400">{failingCount}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <RefreshCw className="w-4 h-4" />Recent Runs
            </div>
            <p className="text-2xl font-bold">{recentSyncRuns.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Client sync table */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Client GHL Connections</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading clients...</p>
          ) : (
            <TooltipProvider>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location ID</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map(client => {
                      const hasCredentials = !!(client.ghl_api_key && client.ghl_location_id);
                      const lastRun = getLastSyncForClient(client.id, 'ghl');

                      return (
                        <TableRow key={client.id} className={!hasCredentials ? 'opacity-50' : ''}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {client.name}
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {client.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>{getConnectionBadge(client)}</TableCell>
                          <TableCell>
                            {client.ghl_location_id ? (
                              <div className="flex items-center gap-1">
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                  {client.ghl_location_id.slice(0, 12)}…
                                </code>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={() => window.open(`https://app.gohighlevel.com/v2/location/${client.ghl_location_id}/dashboard`, '_blank')}
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Open in GHL</TooltipContent>
                                </Tooltip>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.last_ghl_sync_at ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-xs">{formatDistanceToNow(new Date(client.last_ghl_sync_at), { addSuffix: true })}</span>
                                </TooltipTrigger>
                                <TooltipContent>{new Date(client.last_ghl_sync_at).toLocaleString()}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">Never</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.consecutive_ghl_failures > 0 ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="text-[10px]">
                                    {client.consecutive_ghl_failures}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>{client.ghl_sync_error || 'Unknown error'}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={!hasCredentials || isSyncing(client.id, 'leads')}
                                    onClick={() => handleSync(client.id, client.name, 'leads')}
                                  >
                                    <Users className={`w-3.5 h-3.5 ${isSyncing(client.id, 'leads') ? 'animate-spin' : ''}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync Leads</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={!hasCredentials || isSyncing(client.id, 'calls')}
                                    onClick={() => handleSync(client.id, client.name, 'calls')}
                                  >
                                    <Phone className={`w-3.5 h-3.5 ${isSyncing(client.id, 'calls') ? 'animate-spin' : ''}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync Calls</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={!hasCredentials || isSyncing(client.id, 'pipeline')}
                                    onClick={() => handleSync(client.id, client.name, 'pipeline')}
                                  >
                                    <TrendingUp className={`w-3.5 h-3.5 ${isSyncing(client.id, 'pipeline') ? 'animate-spin' : ''}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync Pipeline</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={!hasCredentials || isSyncing(client.id, 'funded')}
                                    onClick={() => handleSync(client.id, client.name, 'funded')}
                                  >
                                    <DollarSign className={`w-3.5 h-3.5 ${isSyncing(client.id, 'funded') ? 'animate-spin' : ''}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Pull Funded Investors</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs ml-1"
                                    disabled={!hasCredentials || isSyncing(client.id, 'master')}
                                    onClick={() => handleSync(client.id, client.name, 'master')}
                                  >
                                    <RefreshCw className={`w-3 h-3 mr-1 ${isSyncing(client.id, 'master') ? 'animate-spin' : ''}`} />
                                    Full Sync
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Master sync: leads + calls + pipeline + funded</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Recent sync runs */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent GHL Sync Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSyncRuns.slice(0, 20).map(run => {
                  const client = clients.find(c => c.id === run.client_id);
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">{client?.name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{run.source}</Badge>
                      </TableCell>
                      <TableCell>
                        {run.status === 'completed' ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                            <CheckCircle className="w-2.5 h-2.5 mr-0.5" />OK
                          </Badge>
                        ) : run.status === 'failed' ? (
                          <Badge variant="destructive" className="text-[10px]">
                            <XCircle className="w-2.5 h-2.5 mr-0.5" />Failed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{run.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{run.rows_written ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                        {run.error_message || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recentSyncRuns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      No recent GHL sync runs found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
