import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  Play,
  FileText,
  Image,
  Video,
  MessageSquare,
  Mail,
  Bot,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  created_at: string;
}

interface FulfillmentStep {
  id: string;
  run_id: string;
  phase: string;
  step_name: string;
  step_type: string;
  status: string;
  output_data: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface ClientOnboardingData {
  clientId: string;
  clientName: string;
  clientStatus: string;
  runs: FulfillmentRun[];
  steps: FulfillmentStep[];
}

const stepTypeIcon: Record<string, any> = {
  research: Bot,
  copy: FileText,
  email: Mail,
  sms: MessageSquare,
  static_ad: Image,
  video: Video,
  avatar: Bot,
};

const statusConfig: Record<string, { color: string; icon: any }> = {
  completed: { color: 'text-green-500', icon: CheckCircle2 },
  running: { color: 'text-blue-500', icon: Loader2 },
  pending: { color: 'text-muted-foreground', icon: Clock },
  failed: { color: 'text-destructive', icon: XCircle },
  queued: { color: 'text-yellow-500', icon: Clock },
};

export function OnboardingTab() {
  const navigate = useNavigate();
  const { data: allClients = [] } = useClients();
  const [clientData, setClientData] = useState<ClientOnboardingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  // Filter to onboarding clients
  const onboardingClients = allClients.filter(c => c.status === 'onboarding');

  useEffect(() => {
    if (onboardingClients.length === 0) {
      setClientData([]);
      setLoading(false);
      return;
    }
    fetchAllFulfillment();
  }, [onboardingClients.length]);

  async function fetchAllFulfillment() {
    setLoading(true);
    try {
      const clientIds = onboardingClients.map(c => c.id);

      const { data: runs } = await supabase
        .from('fulfillment_runs')
        .select('*')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false });

      const runIds = (runs || []).map(r => r.id);

      let steps: FulfillmentStep[] = [];
      if (runIds.length > 0) {
        const { data: stepsData } = await supabase
          .from('fulfillment_steps')
          .select('*')
          .in('run_id', runIds)
          .order('sort_order', { ascending: true });
        steps = (stepsData || []) as FulfillmentStep[];
      }

      const grouped: ClientOnboardingData[] = onboardingClients.map(client => ({
        clientId: client.id,
        clientName: client.name,
        clientStatus: client.status,
        runs: (runs || []).filter(r => r.client_id === client.id) as FulfillmentRun[],
        steps: steps.filter(s => (runs || []).find(r => r.id === s.run_id && r.client_id === client.id)),
      }));

      setClientData(grouped);
    } catch (err) {
      console.error('Failed to fetch fulfillment data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (onboardingClients.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Client Onboarding</h2>
          <p className="text-sm text-muted-foreground">Track onboarding progress and review generated assets</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No clients currently onboarding</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clients with "onboarding" status will appear here with their fulfillment progress
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Client Onboarding</h2>
          <p className="text-sm text-muted-foreground">
            {onboardingClients.length} client{onboardingClients.length !== 1 ? 's' : ''} in onboarding pipeline
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAllFulfillment}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-3">
        {clientData.map((client) => {
          const latestRun = client.runs[0];
          const progress = latestRun
            ? latestRun.total_steps > 0
              ? Math.round((latestRun.completed_steps / latestRun.total_steps) * 100)
              : 0
            : 0;
          const runSteps = client.steps.filter(s => s.run_id === latestRun?.id);
          const isExpanded = expandedClient === client.clientId;

          // Group steps by phase
          const phases: Record<string, FulfillmentStep[]> = {};
          runSteps.forEach(s => {
            if (!phases[s.phase]) phases[s.phase] = [];
            phases[s.phase].push(s);
          });

          return (
            <Card key={client.clientId} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpandedClient(isExpanded ? null : client.clientId)}
                      className="hover:bg-muted rounded p-1 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div>
                      <CardTitle className="text-base">{client.clientName}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={latestRun?.status === 'completed' ? 'default' : latestRun?.status === 'running' ? 'secondary' : 'outline'}>
                          {latestRun?.status || 'No runs'}
                        </Badge>
                        {latestRun && (
                          <span className="text-xs text-muted-foreground">
                            {latestRun.completed_steps}/{latestRun.total_steps} steps
                            {latestRun.failed_steps > 0 && (
                              <span className="text-destructive ml-1">({latestRun.failed_steps} failed)</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/fulfillment-review/${client.clientId}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Review Assets
                    </Button>
                  </div>
                </div>
                {latestRun && (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{latestRun.current_phase || 'Pipeline'}</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}
              </CardHeader>

              {isExpanded && runSteps.length > 0 && (
                <CardContent className="pt-0 border-t">
                  <div className="space-y-4 pt-3">
                    {Object.entries(phases).map(([phase, phaseSteps]) => (
                      <div key={phase}>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          {phase}
                        </h4>
                        <div className="space-y-1">
                          {phaseSteps.map((step) => {
                            const config = statusConfig[step.status] || statusConfig.pending;
                            const Icon = config.icon;
                            const TypeIcon = stepTypeIcon[step.step_type] || FileText;
                            return (
                              <div
                                key={step.id}
                                className={cn(
                                  'flex items-center gap-3 py-1.5 px-2 rounded-md text-sm',
                                  step.status === 'completed' && 'text-muted-foreground'
                                )}
                              >
                                <Icon className={cn('h-4 w-4 shrink-0', config.color, step.status === 'running' && 'animate-spin')} />
                                <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className={cn(step.status === 'completed' && 'line-through')}>{step.step_name}</span>
                                {step.error_message && (
                                  <span className="text-xs text-destructive ml-auto truncate max-w-[200px]" title={step.error_message}>
                                    {step.error_message}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}

              {isExpanded && runSteps.length === 0 && (
                <CardContent className="pt-0 border-t">
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No fulfillment steps found. Start the pipeline from the client's offer page.
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
