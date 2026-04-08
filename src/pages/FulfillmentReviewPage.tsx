import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Clock, RefreshCw, Play, Pause, Image, Video, FileText, Bot, Globe } from "lucide-react";
import { toast } from "sonner";

interface FulfillmentRun {
  id: string;
  client_id: string;
  offer_id: string | null;
  status: string;
  current_phase: string | null;
  total_steps: number;
  completed_steps: number;
  failed_steps: number;
  started_at: string | null;
  completed_at: string | null;
  config: any;
  created_at: string;
}

interface FulfillmentStep {
  id: string;
  run_id: string;
  phase: string;
  step_name: string;
  step_type: string;
  status: string;
  function_name: string | null;
  output_data: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface BrowserTask {
  id: string;
  task_type: string;
  task_group: string | null;
  status: string;
  priority: number;
  error_message: string | null;
  claimed_by: string | null;
}

const PHASE_ORDER = ['intake', 'research', 'content', 'static_ads', 'avatar', 'video', 'browser_tasks', 'review'];
const PHASE_LABELS: Record<string, string> = {
  intake: '📥 Intake & Brand Scraping',
  research: '📊 Research & Angles',
  content: '✍️ Content Generation',
  static_ads: '🎨 Static Ad Creatives',
  avatar: '🧑 AI Avatar Generation',
  video: '🎬 Video Generation',
  browser_tasks: '🌐 Browser Automation',
  review: '✅ Review',
  visuals_queued: '⏳ Visuals Queued',
};
const PHASE_ICONS: Record<string, any> = {
  intake: Globe, research: FileText, content: FileText,
  static_ads: Image, avatar: Bot, video: Video,
  browser_tasks: Globe, review: CheckCircle2,
};

const STATUS_ICON: Record<string, any> = {
  completed: CheckCircle2, failed: XCircle, running: Loader2,
  pending: Clock, queued: Clock, skipped: XCircle, retry: RefreshCw,
};
const STATUS_COLOR: Record<string, string> = {
  completed: 'text-green-500', failed: 'text-red-500', running: 'text-blue-500 animate-spin',
  pending: 'text-muted-foreground', queued: 'text-muted-foreground',
};

export default function FulfillmentReviewPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<FulfillmentRun | null>(null);
  const [steps, setSteps] = useState<FulfillmentStep[]>([]);
  const [browserTasks, setBrowserTasks] = useState<BrowserTask[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState('');

  const fetchData = async () => {
    if (!clientId) return;

    const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).single();
    if (client) setClientName(client.name);

    const { data: runs } = await supabase
      .from('fulfillment_runs')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (runs?.[0]) {
      setRun(runs[0] as any);
      const { data: stepsData } = await supabase
        .from('fulfillment_steps')
        .select('*')
        .eq('run_id', runs[0].id)
        .order('sort_order', { ascending: true });
      setSteps((stepsData || []) as any[]);

      const { data: tasks } = await supabase
        .from('browser_tasks')
        .select('*')
        .eq('fulfillment_run_id', runs[0].id)
        .order('priority', { ascending: true });
      setBrowserTasks((tasks || []) as any[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Realtime subscriptions
    const runChannel = supabase
      .channel('fulfillment-runs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fulfillment_runs', filter: `client_id=eq.${clientId}` }, () => fetchData())
      .subscribe();

    const stepChannel = supabase
      .channel('fulfillment-steps')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fulfillment_steps' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(runChannel);
      supabase.removeChannel(stepChannel);
    };
  }, [clientId]);

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(phase) ? next.delete(phase) : next.add(phase);
      return next;
    });
  };

  const retryFailed = async () => {
    if (!run) return;
    toast.info('Retry not yet implemented — re-trigger the pipeline manually.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground">No fulfillment run found for this client.</CardContent></Card>
      </div>
    );
  }

  const progress = run.total_steps > 0 ? Math.round((run.completed_steps / run.total_steps) * 100) : 0;
  const stepsByPhase = PHASE_ORDER.reduce((acc, phase) => {
    acc[phase] = steps.filter(s => s.phase === phase);
    return acc;
  }, {} as Record<string, FulfillmentStep[]>);

  const duration = run.started_at
    ? Math.round(((run.completed_at ? new Date(run.completed_at).getTime() : Date.now()) - new Date(run.started_at).getTime()) / 60000)
    : 0;

  const statusBadge = (status: string) => {
    const variant = status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : status === 'running' ? 'secondary' : 'outline';
    return <Badge variant={variant as any}>{status}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{clientName} — Fulfillment Review</h1>
          <p className="text-sm text-muted-foreground">Run {run.id.slice(0, 8)} · {duration}min elapsed</p>
        </div>
        {statusBadge(run.status)}
      </div>

      {/* Progress Card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span>{run.completed_steps}/{run.total_steps} steps complete</span>
            <span>{run.failed_steps > 0 && <span className="text-red-500">{run.failed_steps} failed</span>}</span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>Phase: {PHASE_LABELS[run.current_phase || ''] || run.current_phase}</span>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {run.failed_steps > 0 && (
          <Button variant="outline" size="sm" onClick={retryFailed}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry Failed Steps
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Phase Sections */}
      {PHASE_ORDER.map(phase => {
        const phaseSteps = stepsByPhase[phase] || [];
        if (phaseSteps.length === 0 && phase !== 'browser_tasks') return null;

        const completedInPhase = phaseSteps.filter(s => s.status === 'completed').length;
        const failedInPhase = phaseSteps.filter(s => s.status === 'failed').length;
        const isExpanded = expandedPhases.has(phase);
        const PhaseIcon = PHASE_ICONS[phase] || FileText;

        return (
          <Collapsible key={phase} open={isExpanded} onOpenChange={() => togglePhase(phase)}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <PhaseIcon className="h-5 w-5" />
                      <CardTitle className="text-base">{PHASE_LABELS[phase] || phase}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {completedInPhase > 0 && <Badge variant="outline" className="text-green-600">{completedInPhase} ✓</Badge>}
                      {failedInPhase > 0 && <Badge variant="destructive">{failedInPhase} ✗</Badge>}
                      <span className="text-muted-foreground">{phaseSteps.length} steps</span>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-2">
                  {phase === 'browser_tasks' && browserTasks.length > 0 ? (
                    browserTasks.map(task => {
                      const Icon = STATUS_ICON[task.status] || Clock;
                      return (
                        <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-accent/30">
                          <Icon className={`h-4 w-4 ${STATUS_COLOR[task.status] || ''}`} />
                          <span className="flex-1 text-sm">{task.task_type.replace(/_/g, ' ')}</span>
                          {statusBadge(task.status)}
                          {task.claimed_by && <span className="text-xs text-muted-foreground">by {task.claimed_by}</span>}
                        </div>
                      );
                    })
                  ) : (
                    phaseSteps.map(step => {
                      const Icon = STATUS_ICON[step.status] || Clock;
                      const hasImage = step.output_data?.imageUrl;
                      return (
                        <div key={step.id} className="space-y-1">
                          <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-accent/30">
                            <Icon className={`h-4 w-4 flex-shrink-0 ${STATUS_COLOR[step.status] || ''}`} />
                            <span className="flex-1 text-sm">{step.step_name}</span>
                            {step.completed_at && step.started_at && (
                              <span className="text-xs text-muted-foreground">
                                {Math.round((new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000)}s
                              </span>
                            )}
                            {statusBadge(step.status)}
                          </div>
                          {step.error_message && (
                            <p className="text-xs text-red-500 pl-10">{step.error_message}</p>
                          )}
                          {hasImage && (
                            <div className="pl-10">
                              <img src={step.output_data.imageUrl} alt={step.step_name} className="h-20 w-20 object-cover rounded border" />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
