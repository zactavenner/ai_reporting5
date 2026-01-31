import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, RefreshCw, Clock, CheckCircle, XCircle, Play } from 'lucide-react';
import { toast } from 'sonner';

interface QueueStats {
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  total_records_processed: number;
}

interface QueueJob {
  id: string;
  client_id: string;
  sync_type: string;
  status: string;
  batch_number: number;
  total_batches: number;
  records_processed: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  clients: { name: string } | null;
}

export function SyncQueueStatus() {
  const queryClient = useQueryClient();

  // Fetch queue statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['sync-queue-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sync_queue_stats');
      if (error) throw error;
      return (data as QueueStats[])?.[0] || {
        pending_count: 0,
        processing_count: 0,
        completed_count: 0,
        failed_count: 0,
        total_records_processed: 0
      };
    },
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch recent jobs
  const { data: recentJobs } = useQuery({
    queryKey: ['sync-queue-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_queue')
        .select('*, clients(name)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as QueueJob[];
    },
    refetchInterval: 10000
  });

  // Trigger worker manually
  const triggerWorker = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-queue-worker');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.message === 'No pending jobs') {
        toast.info('No pending jobs in queue');
      } else {
        toast.success(`Processed job for ${data.client_name}: ${data.records_processed} records`);
      }
      queryClient.invalidateQueries({ queryKey: ['sync-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-queue-jobs'] });
    },
    onError: (error) => {
      toast.error(`Worker failed: ${error.message}`);
    }
  });

  // Queue all clients
  const queueAllClients = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('queue_full_sync_all_clients', { p_days_back: 365 });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (jobsCreated) => {
      toast.success(`Queued ${jobsCreated} sync jobs for all clients`);
      queryClient.invalidateQueries({ queryKey: ['sync-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-queue-jobs'] });
    },
    onError: (error) => {
      toast.error(`Failed to queue jobs: ${error.message}`);
    }
  });

  // Clear completed/failed jobs
  const clearOldJobs = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('sync_queue')
        .delete()
        .in('status', ['completed', 'failed']);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cleared old jobs');
      queryClient.invalidateQueries({ queryKey: ['sync-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-queue-jobs'] });
    }
  });

  const totalJobs = (stats?.pending_count || 0) + (stats?.processing_count || 0) + 
                    (stats?.completed_count || 0) + (stats?.failed_count || 0);
  const completedPercent = totalJobs > 0 
    ? ((stats?.completed_count || 0) / totalJobs) * 100 
    : 0;

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="border-2 border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Sync Queue Status
        </h4>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerWorker.mutate()}
            disabled={triggerWorker.isPending}
          >
            {triggerWorker.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="ml-1">Process Next</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => queueAllClients.mutate()}
            disabled={queueAllClients.isPending}
          >
            {queueAllClients.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Queue All Clients
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 border border-border rounded bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Pending
          </div>
          <div className="text-2xl font-bold mt-1">{stats?.pending_count || 0}</div>
        </div>
        <div className="p-3 border border-border rounded bg-primary/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4" />
            Processing
          </div>
          <div className="text-2xl font-bold mt-1">{stats?.processing_count || 0}</div>
        </div>
        <div className="p-3 border border-border rounded bg-chart-2/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4" />
            Completed
          </div>
          <div className="text-2xl font-bold mt-1">{stats?.completed_count || 0}</div>
        </div>
        <div className="p-3 border border-border rounded bg-destructive/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <XCircle className="h-4 w-4" />
            Failed
          </div>
          <div className="text-2xl font-bold mt-1">{stats?.failed_count || 0}</div>
        </div>
      </div>

      {/* Progress Bar */}
      {totalJobs > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Overall Progress</span>
            <span>{stats?.completed_count || 0} / {totalJobs} jobs</span>
          </div>
          <Progress value={completedPercent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {stats?.total_records_processed?.toLocaleString() || 0} total records processed
          </p>
        </div>
      )}

      {/* Recent Jobs */}
      {recentJobs && recentJobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Recent Jobs</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clearOldJobs.mutate()}
              disabled={clearOldJobs.isPending}
              className="text-xs"
            >
              Clear Old
            </Button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {recentJobs.map((job) => (
              <div 
                key={job.id} 
                className="flex items-center justify-between text-xs p-2 border border-border rounded"
              >
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={
                      job.status === 'completed' ? 'default' :
                      job.status === 'failed' ? 'destructive' :
                      job.status === 'processing' ? 'secondary' : 'outline'
                    }
                    className="text-xs"
                  >
                    {job.status}
                  </Badge>
                  <span className="font-medium">{job.clients?.name || 'Unknown'}</span>
                  <span className="text-muted-foreground">
                    Batch {job.batch_number}/{job.total_batches}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {job.records_processed > 0 && `${job.records_processed} records`}
                  {job.error_message && (
                    <span className="text-destructive ml-2">{job.error_message.slice(0, 30)}...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Queue automatically processes every 5 minutes via scheduled job. 
        Click "Process Next" to manually trigger the next job.
      </p>
    </div>
  );
}
