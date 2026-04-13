import { useLatestSyncRuns, useTriggerSync, SyncRun } from '@/hooks/useSyncRuns';
import { useInvalidatePerformance } from '@/hooks/useClientPerformance';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Check, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SyncFreshnessPillsProps {
  clientId: string;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${diffDays}d ago`;
}

function getPillVariant(run: SyncRun | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!run) return 'outline';
  if (run.status === 'failed') return 'destructive';
  if (run.status === 'running') return 'secondary';

  // Check staleness
  const ageMs = Date.now() - new Date(run.finished_at || run.started_at).getTime();
  const isStale = ageMs > 24 * 60 * 60 * 1000; // > 24 hours
  return isStale ? 'secondary' : 'default';
}

function getPillIcon(run: SyncRun | undefined) {
  if (!run) return <Clock className="w-3 h-3" />;
  if (run.status === 'running') return <Loader2 className="w-3 h-3 animate-spin" />;
  if (run.status === 'failed') return <AlertCircle className="w-3 h-3" />;
  return <Check className="w-3 h-3" />;
}

const SOURCE_LABELS: Record<string, string> = {
  meta: 'Meta',
  ghl: 'GHL',
  hubspot: 'HubSpot',
  reconciliation: 'Reconciled',
};

export function SyncFreshnessPills({ clientId }: SyncFreshnessPillsProps) {
  const { data: syncRuns, isLoading } = useLatestSyncRuns(clientId);
  const triggerSync = useTriggerSync();
  const invalidatePerformance = useInvalidatePerformance();

  const handleSyncNow = async () => {
    try {
      await triggerSync.mutateAsync(clientId);
      invalidatePerformance();
    } catch (err) {
      console.error('Manual sync failed:', err);
    }
  };

  if (isLoading) {
    return <div className="flex gap-2 items-center text-muted-foreground text-xs">Loading sync status...</div>;
  }

  const sources = ['meta', 'ghl', 'reconciliation'] as const;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 flex-wrap">
        {sources.map((source) => {
          const run = syncRuns?.[source];
          const label = SOURCE_LABELS[source] || source;
          const timeAgo = run?.finished_at ? formatTimeAgo(run.finished_at) : (run?.started_at ? formatTimeAgo(run.started_at) : 'never');

          return (
            <Tooltip key={source}>
              <TooltipTrigger asChild>
                <Badge variant={getPillVariant(run)} className="flex items-center gap-1 text-xs cursor-default">
                  {getPillIcon(run)}
                  <span>{label}: {timeAgo}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {run ? (
                  <div className="text-xs space-y-1">
                    <div>Function: {run.function_name}</div>
                    <div>Status: {run.status}</div>
                    {run.rows_written > 0 && <div>Rows: {run.rows_written}</div>}
                    {run.error_message && <div className="text-red-400">Error: {run.error_message}</div>}
                  </div>
                ) : (
                  <span>No sync recorded for {label}</span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={handleSyncNow}
          disabled={triggerSync.isPending}
        >
          {triggerSync.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Sync now
        </Button>
      </div>
    </TooltipProvider>
  );
}
