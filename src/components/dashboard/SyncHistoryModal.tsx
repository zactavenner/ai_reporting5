import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SyncHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
}

export function SyncHistoryModal({ open, onOpenChange, clientId, clientName }: SyncHistoryModalProps) {
  const { data: syncRuns = [], isLoading } = useQuery({
    queryKey: ['sync-history', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_runs')
        .select('*')
        .eq('client_id', clientId)
        .order('started_at', { ascending: false })
        .limit(10);
      if (error) {
        console.error('Failed to fetch sync history:', error);
        return [];
      }
      return data || [];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Sync History — {clientName}</DialogTitle>
          <DialogDescription className="text-xs">Last 10 sync runs for this client</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : syncRuns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No sync runs found for this client</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Function</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs">Rows</TableHead>
                <TableHead className="text-xs">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncRuns.map((run: any) => {
                const meta = run.metadata || {};
                return (
                  <TableRow key={run.id}>
                    <TableCell className="text-xs font-mono">
                      {run.function_name}
                      {meta.was_retry && (
                        <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0">retry</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-1.5 py-0',
                          run.status === 'completed' && 'border-chart-2 text-chart-2',
                          run.status === 'failed' && 'border-destructive text-destructive',
                          run.status === 'partial' && 'border-yellow-500 text-yellow-600',
                          run.status === 'token_expiring' && 'border-orange-500 text-orange-600',
                          run.status === 'timed_out' && 'border-muted text-muted-foreground',
                        )}
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">{run.rows_written ?? '—'}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate" title={run.error_message || ''}>
                      {run.error_message || '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Metadata details for most recent run */}
        {syncRuns.length > 0 && syncRuns[0].metadata && (
          <div className="mt-3 p-3 bg-muted/50 rounded text-xs">
            <p className="font-medium mb-1">Latest run details:</p>
            <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(syncRuns[0].metadata, null, 2)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
