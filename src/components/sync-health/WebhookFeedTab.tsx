import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Radio, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const WEBHOOK_TYPES = ['all', 'lead', 'booked', 'showed', 'ad-spend', 'committed', 'funded', 'reconnect', 'reconnect-showed', 'bad-lead', 'contact'] as const;

const TYPE_COLORS: Record<string, string> = {
  lead: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  booked: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  showed: 'bg-chart-2/10 text-chart-2 border-chart-2/20',
  'ad-spend': 'bg-chart-4/10 text-chart-4 border-chart-4/20',
  committed: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  funded: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  reconnect: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  'reconnect-showed': 'bg-teal-500/10 text-teal-600 border-teal-500/20',
  'bad-lead': 'bg-destructive/10 text-destructive border-destructive/20',
  contact: 'bg-muted text-muted-foreground border-border',
};

export function WebhookFeedTab() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPayload, setSelectedPayload] = useState<any>(null);

  const { data: webhooks = [], isLoading, refetch } = useQuery({
    queryKey: ['webhook-feed', typeFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('webhook_logs')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(100);

      if (typeFilter !== 'all') query = query.eq('webhook_type', typeFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  // Aggregate counts for header
  const { data: typeCounts = {} } = useQuery({
    queryKey: ['webhook-type-counts'],
    queryFn: async () => {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('webhook_type')
        .gte('processed_at', since.toISOString());
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach(d => { counts[d.webhook_type] = (counts[d.webhook_type] || 0) + 1; });
      return counts;
    },
  });

  // Get client names
  const { data: clientMap = {} } = useQuery({
    queryKey: ['webhook-client-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name');
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach(c => { map[c.id] = c.name; });
      return map;
    },
  });

  return (
    <>
      <div className="space-y-4">
        {/* Type breakdown chips */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <Badge
                key={type}
                variant="outline"
                className={`cursor-pointer text-xs ${TYPE_COLORS[type] || ''} ${typeFilter === type ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              >
                {type} · {count}
              </Badge>
            ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Webhook Feed</CardTitle>
                <Badge variant="secondary" className="text-[10px]">Live · 15s</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
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
                    <TableHead className="w-[60px]">Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-[60px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading webhooks...</TableCell></TableRow>
                  ) : webhooks.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No webhooks found</TableCell></TableRow>
                  ) : webhooks.map(w => (
                    <TableRow key={w.id} className="text-sm">
                      <TableCell>
                        {w.status === 'success'
                          ? <CheckCircle className="h-4 w-4 text-chart-2" />
                          : <XCircle className="h-4 w-4 text-destructive" />}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[w.webhook_type] || ''}`}>
                          {w.webhook_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[150px]">
                        {clientMap[w.client_id] || w.client_id?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {w.processed_at ? formatDistanceToNow(new Date(w.processed_at), { addSuffix: true }) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedPayload(w)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedPayload} onOpenChange={() => setSelectedPayload(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Webhook Details
              {selectedPayload && (
                <Badge variant="outline" className={TYPE_COLORS[selectedPayload.webhook_type] || ''}>
                  {selectedPayload.webhook_type}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedPayload && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={selectedPayload.status === 'success' ? 'default' : 'destructive'}>{selectedPayload.status}</Badge></div>
                <div><span className="text-muted-foreground">Client:</span> {clientMap[selectedPayload.client_id] || '—'}</div>
                <div><span className="text-muted-foreground">Processed:</span> {selectedPayload.processed_at ? new Date(selectedPayload.processed_at).toLocaleString() : '—'}</div>
                {selectedPayload.error_message && (
                  <div className="col-span-2"><span className="text-muted-foreground">Error:</span> <span className="text-destructive">{selectedPayload.error_message}</span></div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Payload</p>
                <ScrollArea className="h-[300px]">
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedPayload.payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
