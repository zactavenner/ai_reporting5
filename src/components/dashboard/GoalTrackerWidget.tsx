import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useGoals,
  useGoalSnapshots,
  METRIC_LABELS,
  type GoalWithProgress,
} from '@/hooks/useGoals';

interface GoalTrackerWidgetProps {
  clientId: string | undefined;
  maxGoals?: number;
  className?: string;
}

const STATUS_CONFIG = {
  achieved: {
    label: 'Achieved',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  on_track: {
    label: 'On Track',
    color: 'text-chart-2',
    bg: 'bg-chart-2',
    icon: TrendingUp,
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-500',
    icon: AlertTriangle,
  },
  behind: {
    label: 'Behind',
    color: 'text-destructive',
    bg: 'bg-destructive',
    icon: TrendingDown,
  },
} as const;

function formatMetricValue(metricKey: string, value: number): string {
  if (metricKey.includes('dollar') || metricKey === 'ad_spend' || metricKey === 'commitment_dollars' || metricKey === 'funded_dollars') {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (metricKey.includes('pct') || metricKey === 'cost_of_capital_pct' || metricKey === 'show_pct') {
    return `${value.toFixed(1)}%`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function GoalRow({ goal }: { goal: GoalWithProgress }) {
  const status = goal.status || 'on_track';
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const progressPct = Math.min(goal.progress_pct ?? 0, 100);
  const metricLabel = goal.metric_label || METRIC_LABELS[goal.metric_key] || goal.metric_key;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('flex-shrink-0', config.color)}>
                  <StatusIcon className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {config.label}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-sm font-medium truncate">{metricLabel}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {goal.current_value !== undefined
              ? formatMetricValue(goal.metric_key, goal.current_value)
              : '\u2014'}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs font-medium tabular-nums">
            {formatMetricValue(goal.metric_key, goal.target_value)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Progress
          value={progressPct}
          className={cn('h-2 flex-1', '[&>div]:transition-all [&>div]:duration-500')}
          style={
            {
              '--progress-bg': `var(--${status === 'achieved' ? 'emerald-500' : status === 'on_track' ? 'chart-2' : status === 'at_risk' ? 'yellow-500' : 'destructive'})`,
            } as React.CSSProperties
          }
        />
        <span className={cn('text-xs font-semibold tabular-nums w-10 text-right', config.color)}>
          {progressPct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function GoalRowWithSnapshots({
  goal,
}: {
  goal: GoalWithProgress;
}) {
  const { data: snapshots } = useGoalSnapshots(goal.id, 1);

  const enrichedGoal = useMemo<GoalWithProgress>(() => {
    if (snapshots && snapshots.length > 0) {
      const latest = snapshots[0];
      return {
        ...goal,
        current_value: goal.current_value ?? latest.current_value,
        progress_pct: goal.progress_pct ?? latest.progress_pct,
        status: goal.status ?? latest.status,
      };
    }
    return goal;
  }, [goal, snapshots]);

  return <GoalRow goal={enrichedGoal} />;
}

export function GoalTrackerWidget({
  clientId,
  maxGoals = 6,
  className,
}: GoalTrackerWidgetProps) {
  const { data: goals, isLoading, error } = useGoals(clientId);

  const displayGoals = useMemo(() => {
    if (!goals) return [];
    return goals.slice(0, maxGoals);
  }, [goals, maxGoals]);

  const statusSummary = useMemo(() => {
    if (!goals) return null;
    const counts = { achieved: 0, on_track: 0, at_risk: 0, behind: 0 };
    goals.forEach((g) => {
      const status = (g as GoalWithProgress).status;
      if (status && status in counts) {
        counts[status]++;
      }
    });
    return counts;
  }, [goals]);

  if (!clientId) return null;

  return (
    <Card className={cn('col-span-1', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">KPI Goals</CardTitle>
          </div>
          {statusSummary && goals && goals.length > 0 && (
            <div className="flex items-center gap-1.5">
              {statusSummary.achieved > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {statusSummary.achieved} hit
                </span>
              )}
              {statusSummary.at_risk + statusSummary.behind > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive tabular-nums">
                  {statusSummary.at_risk + statusSummary.behind} need attention
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-4 w-20 bg-muted rounded" />
                </div>
                <div className="h-2 w-full bg-muted rounded-full" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">Failed to load goals.</p>
        )}

        {!isLoading && !error && displayGoals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Target className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No active goals set.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add KPI targets to track progress.
            </p>
          </div>
        )}

        {!isLoading && !error && displayGoals.length > 0 && (
          <div className="space-y-4">
            {displayGoals.map((goal) => (
              <GoalRowWithSnapshots key={goal.id} goal={goal as GoalWithProgress} />
            ))}
            {goals && goals.length > maxGoals && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{goals.length - maxGoals} more goals
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
