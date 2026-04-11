import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText, CheckCircle, XCircle, Clock, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-chart-2" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  running: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
  partial: <AlertTriangle className="h-4 w-4 text-chart-4" />,
};

const SYNC_TYPE_LABELS: Record<string, string> = {
  full: 'Full Sync',
  ghl_contacts: 'GHL Contacts',
  ghl_calls: 'GHL Calls',
  meta_ads: 'Meta Ads',
  hubspot_contacts: 'HubSpot Contacts',
  hubspot_deals: 'HubSpot Deals',
  calendar: 'Calendar',
  pipeline: 'Pipeline',
};

export function SyncLogsTab() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['sync-logs', typeFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(200);

      if (typeFilter !== 'all') query = query.eq('sync_type', typeFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Get client names
  const { data: clientMap = {} } = useQuery({
    queryKey: ['sync-logs-client-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name');
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach(c => { map[c.id] = c.name; });
      return map;
    },
  });

  // Recent errors
  const { data: recentErrors = [] } = useQuery({
    queryKey: ['sync-recent-errors'],
    queryFn: async () => {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data, error } = await supabase
        .from('sync_errors')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  // Summary counts
  const successCount = logs.filter(l => l.status === 'success').length;
  const failedCount = logs.filter(l => l.status === 'failed').length;
  const runningCount = logs.filter(l => l.status === 'running').length;
  const totalRecords = logs.reduce((sum, l) => sum + (l.records_synced || 0), 0);

  return (
    <div className="space-y-4">
      {/* Error Alert */}
      {recentErrors.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {recentErrors.length} API Error{recentErrors.length !== 1 ? 's' : ''} (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {recentErrors.slice(0, 5).map(e => (
                <div key={e.id} className="text-xs flex items-start gap-2">
                  <Badge variant="outline" className="text-[9px] shrink-0">{e.integration_name}</Badge>
                  <span className="text-muted-foreground truncate">{e.error_message || 'Unknown error'}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-chart-2" /> {successCount} success</span>
        <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-destructive" /> {failedCount} failed</span>
        <span className="flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 text-primary" /> {runningCount} running</span>
        <span className="text-muted-foreground">· {totalRecords.toLocaleString()} records</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Sync Logs</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(SYNC_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading logs...</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No sync logs found</TableCell></TableRow>
                ) : logs.map(log => {
                  const duration = log.started_at && log.completed_at
                    ? Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                    : null;

                  return (
                    <TableRow key={log.id} className="text-sm">
                      <TableCell>{STATUS_ICONS[log.status] || <Clock className="h-4 w-4 text-muted-foreground" />}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[140px]">
                        {clientMap[log.client_id] || log.client_id?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {log.records_synced != null ? log.records_synced.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.started_at ? formatDistanceToNow(new Date(log.started_at), { addSuffix: true }) : '—'}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {duration != null ? (duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-destructive truncate max-w-[200px]">
                        {log.error_message || ''}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
