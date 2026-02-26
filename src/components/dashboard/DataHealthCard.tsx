import { useState } from 'react';
import { ShieldCheck, AlertTriangle, XCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  useReconciliationRuns,
  useReconciliationItems,
  useRunReconciliation,
  useResolveReconciliationItem,
  ReconciliationRun,
} from '@/hooks/useReconciliation';
import { useClients } from '@/hooks/useClients';
import { format } from 'date-fns';

export function DataHealthCard() {
  const { data: runs = [] } = useReconciliationRuns();
  const runReconciliation = useRunReconciliation();
  const { data: clients = [] } = useClients();
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const latestRun = runs[0];

  const getStatus = (run?: ReconciliationRun) => {
    if (!run) return { color: 'text-muted-foreground', icon: ShieldCheck, label: 'No runs yet', variant: 'secondary' as const };
    if (run.status === 'failed') return { color: 'text-destructive', icon: XCircle, label: 'Failed', variant: 'destructive' as const };
    if (run.mismatches_found > 0) return { color: 'text-yellow-500', icon: AlertTriangle, label: 'Mismatches', variant: 'outline' as const };
    return { color: 'text-green-500', icon: ShieldCheck, label: 'Healthy', variant: 'secondary' as const };
  };

  const status = getStatus(latestRun);
  const StatusIcon = status.icon;

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${status.color}`} />
            Data Health
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runReconciliation.mutate()}
            disabled={runReconciliation.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runReconciliation.isPending ? 'animate-spin' : ''}`} />
            Run Reconciliation
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {latestRun ? (
          <div className="flex items-center gap-4 text-sm">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-muted-foreground">
              Last run: {format(new Date(latestRun.created_at), 'MMM d, h:mm a')}
            </span>
            <span className="text-muted-foreground">
              {latestRun.total_checks} checks · {latestRun.mismatches_found} mismatches
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No reconciliation runs yet. Click "Run Reconciliation" to check data integrity.</p>
        )}

        {/* Run History */}
        {runs.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Run History</h4>
            {runs.slice(0, 10).map(run => (
              <ReconciliationRunRow
                key={run.id}
                run={run}
                clientMap={clientMap}
                isExpanded={expandedRunId === run.id}
                onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReconciliationRunRow({
  run,
  clientMap,
  isExpanded,
  onToggle,
}: {
  run: ReconciliationRun;
  clientMap: Record<string, string>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data: items = [] } = useReconciliationItems(isExpanded ? run.id : undefined);
  const resolveItem = useResolveReconciliationItem();
  const runStatus = getRunStatus(run);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/50 text-sm transition-colors">
          <div className="flex items-center gap-2">
            <Badge variant={runStatus.variant} className="text-[10px]">{runStatus.label}</Badge>
            <span>{format(new Date(run.created_at), 'MMM d, yyyy h:mm a')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {run.total_checks} checks · {run.mismatches_found} issues
            </span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {items.length > 0 ? (
          <div className="overflow-x-auto ml-4 mb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Metric</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs text-right">Dashboard</TableHead>
                  <TableHead className="text-xs text-right">Source Val</TableHead>
                  <TableHead className="text-xs text-right">Delta %</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id} className={item.is_mismatch ? 'bg-destructive/5' : ''}>
                    <TableCell className="text-xs">{clientMap[item.client_id] || 'Unknown'}</TableCell>
                    <TableCell className="text-xs font-medium">{item.metric_name}</TableCell>
                    <TableCell className="text-xs">{item.source_name}</TableCell>
                    <TableCell className="text-xs text-right">{item.dashboard_value?.toLocaleString() ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right">{item.source_value?.toLocaleString() ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right">
                      {item.delta_percent != null ? (
                        <span className={item.is_mismatch ? 'text-destructive font-bold' : ''}>
                          {item.delta_percent.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {item.is_mismatch ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px]"
                          onClick={() => resolveItem.mutate({ id: item.id, notes: 'Manually resolved' })}
                        >
                          Resolve
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground ml-4 mb-2">No items recorded for this run.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function getRunStatus(run: ReconciliationRun) {
  if (run.status === 'failed') return { label: 'Failed', variant: 'destructive' as const };
  if (run.mismatches_found > 0) return { label: `${run.mismatches_found} issues`, variant: 'outline' as const };
  return { label: 'Healthy', variant: 'secondary' as const };
}
