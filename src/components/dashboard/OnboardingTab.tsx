import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssetInlineChat } from '@/components/onboarding/AssetInlineChat';
import {
  CheckCircle2, Clock, XCircle, Loader2, ChevronDown, ChevronRight,
  Eye, Play, Pause, FileText, Image, Video, MessageSquare, Mail,
  Bot, RefreshCw, Rocket, BarChart3, Target, Megaphone, Globe,
  Sparkles, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

// ─── Types ───

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

interface ClientAsset {
  id: string;
  client_id: string;
  offer_id: string | null;
  asset_type: string;
  title: string;
  content: any;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ClientOffer {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  offer_type: string;
  status: string | null;
}

interface ClientOnboardingData {
  clientId: string;
  clientName: string;
  clientStatus: string;
  offers: ClientOffer[];
  runs: FulfillmentRun[];
  steps: FulfillmentStep[];
  assets: ClientAsset[];
}

// ─── Constants ───

const PHASE_ORDER = ['intake', 'research', 'content', 'static_ads', 'avatar', 'video', 'browser_tasks', 'review'];
const PHASE_LABELS: Record<string, string> = {
  intake: '📥 Brand Intake',
  research: '📊 Research & Angles',
  content: '✍️ Copy & Scripts',
  static_ads: '🎨 Static Ad Creatives',
  avatar: '🧑 AI Avatar',
  video: '🎬 Video Scripts & Generation',
  browser_tasks: '🌐 Platform Setup',
  review: '✅ Final Review',
  visuals_queued: '⏳ Visuals Queued',
};

const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: any; phase: string }> = {
  research: { label: 'Deep Research', icon: BarChart3, phase: 'research' },
  angles: { label: 'Marketing Angles', icon: Target, phase: 'research' },
  emails: { label: 'Email Sequences', icon: Mail, phase: 'content' },
  sms: { label: 'SMS Sequences', icon: MessageSquare, phase: 'content' },
  adcopy: { label: 'Ad Copy', icon: Megaphone, phase: 'content' },
  scripts: { label: 'Video Scripts', icon: Video, phase: 'content' },
  creatives: { label: 'Creative Concepts', icon: Image, phase: 'content' },
  report: { label: 'Special Report', icon: FileText, phase: 'content' },
  funnel: { label: 'Funnel Copy', icon: Globe, phase: 'content' },
  vsl: { label: 'VSL Script', icon: Video, phase: 'content' },
  caller: { label: 'AI Caller Script', icon: Bot, phase: 'content' },
  setter: { label: 'AI Setter Script', icon: Bot, phase: 'content' },
};

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  completed: { color: 'text-green-500', icon: CheckCircle2 },
  running: { color: 'text-blue-500', icon: Loader2 },
  pending: { color: 'text-muted-foreground', icon: Clock },
  failed: { color: 'text-destructive', icon: XCircle },
  queued: { color: 'text-yellow-500', icon: Clock },
};

// ─── Component ───

export function OnboardingTab() {
  const navigate = useNavigate();
  const { data: allClients = [] } = useClients();
  const [clientData, setClientData] = useState<ClientOnboardingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [launchingPipeline, setLaunchingPipeline] = useState<string | null>(null);

  const onboardingClients = useMemo(() =>
    allClients.filter(c => c.status === 'onboarding'),
    [allClients]
  );

  useEffect(() => {
    fetchAllData();
  }, [onboardingClients.length]);

  // Realtime subscriptions
  useEffect(() => {
    if (onboardingClients.length === 0) return;

    const channel = supabase
      .channel('onboarding-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fulfillment_runs' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fulfillment_steps' }, () => fetchAllData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [onboardingClients.length]);

  async function fetchAllData() {
    if (onboardingClients.length === 0) {
      setClientData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const clientIds = onboardingClients.map(c => c.id);

      // Fetch all data in parallel
      const [runsRes, offersRes, assetsRes] = await Promise.all([
        supabase.from('fulfillment_runs').select('*').in('client_id', clientIds).order('created_at', { ascending: false }),
        supabase.from('client_offers').select('id, client_id, title, description, offer_type, status').in('client_id', clientIds).order('created_at', { ascending: false }),
        supabase.from('client_assets' as any).select('*').in('client_id', clientIds).order('created_at', { ascending: false }),
      ]);

      const runs = (runsRes.data || []) as FulfillmentRun[];
      const offers = (offersRes.data || []) as ClientOffer[];
      const assets = ((assetsRes.data || []) as unknown) as ClientAsset[];

      // Fetch steps for all runs
      const runIds = runs.map(r => r.id);
      let steps: FulfillmentStep[] = [];
      if (runIds.length > 0) {
        const { data } = await supabase.from('fulfillment_steps').select('*').in('run_id', runIds).order('sort_order', { ascending: true });
        steps = (data || []) as FulfillmentStep[];
      }

      const grouped = onboardingClients.map(client => ({
        clientId: client.id,
        clientName: client.name,
        clientStatus: client.status,
        offers: offers.filter(o => o.client_id === client.id),
        runs: runs.filter(r => r.client_id === client.id),
        steps: steps.filter(s => runs.some(r => r.id === s.run_id && r.client_id === client.id)),
        assets: assets.filter(a => a.client_id === client.id),
      }));

      setClientData(grouped);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const launchPipeline = async (clientId: string, offerId?: string) => {
    setLaunchingPipeline(clientId);
    try {
      const { data, error } = await supabase.functions.invoke('fulfill-client', {
        body: {
          password: 'HPA1234$',
          client_id: clientId,
          offer_id: offerId || null,
        },
      });
      if (error) throw error;
      toast.success(`Pipeline launched! Run ID: ${data?.run_id?.slice(0, 8)}`);
      await fetchAllData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to launch pipeline');
    } finally {
      setLaunchingPipeline(null);
    }
  };

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
          <h2 className="text-lg font-bold">Client Onboarding Pipeline</h2>
          <p className="text-sm text-muted-foreground">End-to-end onboarding: Research → Copy → Statics → Avatar → Video</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No clients currently onboarding</p>
            <p className="text-sm text-muted-foreground mt-1">
              Set a client's status to "onboarding" to see them here
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
          <h2 className="text-lg font-bold">Client Onboarding Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            {onboardingClients.length} client{onboardingClients.length !== 1 ? 's' : ''} — Research → Copy → 5 Static Ads → AI Avatar → Video Scripts (pause for review)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAllData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {clientData.map(client => (
          <ClientOnboardingCard
            key={client.clientId}
            client={client}
            isExpanded={expandedClient === client.clientId}
            onToggle={() => setExpandedClient(expandedClient === client.clientId ? null : client.clientId)}
            expandedAsset={expandedAsset}
            onToggleAsset={(id) => setExpandedAsset(expandedAsset === id ? null : id)}
            onLaunchPipeline={launchPipeline}
            isLaunching={launchingPipeline === client.clientId}
            onRefresh={fetchAllData}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Client Card ───

interface ClientCardProps {
  client: ClientOnboardingData;
  isExpanded: boolean;
  onToggle: () => void;
  expandedAsset: string | null;
  onToggleAsset: (id: string) => void;
  onLaunchPipeline: (clientId: string, offerId?: string) => void;
  isLaunching: boolean;
  onRefresh: () => void;
}

function ClientOnboardingCard({
  client, isExpanded, onToggle, expandedAsset, onToggleAsset,
  onLaunchPipeline, isLaunching, onRefresh,
}: ClientCardProps) {
  const navigate = useNavigate();
  const latestRun = client.runs[0];
  const progress = latestRun?.total_steps > 0
    ? Math.round((latestRun.completed_steps / latestRun.total_steps) * 100) : 0;
  const primaryOffer = client.offers[0];
  const isPipelineRunning = latestRun?.status === 'running';
  const isPaused = latestRun?.current_phase === 'video' && latestRun?.status === 'completed';

  // Group steps by phase
  const runSteps = client.steps.filter(s => s.run_id === latestRun?.id);
  const phases: Record<string, FulfillmentStep[]> = {};
  runSteps.forEach(s => {
    if (!phases[s.phase]) phases[s.phase] = [];
    phases[s.phase].push(s);
  });

  // Group assets by type
  const assetsByType: Record<string, ClientAsset[]> = {};
  client.assets.forEach(a => {
    if (!assetsByType[a.asset_type]) assetsByType[a.asset_type] = [];
    assetsByType[a.asset_type].push(a);
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onToggle} className="hover:bg-muted rounded p-1 transition-colors">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <div>
              <CardTitle className="text-base">{client.clientName}</CardTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {primaryOffer && (
                  <Badge variant="outline" className="text-xs">
                    {primaryOffer.title}
                  </Badge>
                )}
                <Badge variant={
                  latestRun?.status === 'completed' ? 'default' :
                  isPipelineRunning ? 'secondary' : 'outline'
                }>
                  {isPipelineRunning ? '🔄 Running' : latestRun?.status || 'Not started'}
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
            {!latestRun && (
              <Button
                size="sm"
                onClick={() => onLaunchPipeline(client.clientId, primaryOffer?.id)}
                disabled={isLaunching}
              >
                {isLaunching ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Starting…</>
                ) : (
                  <><Rocket className="h-4 w-4 mr-1" /> Launch Pipeline</>
                )}
              </Button>
            )}
            {latestRun && (
              <Button
                variant="outline" size="sm"
                onClick={() => navigate(`/fulfillment-review/${client.clientId}`)}
              >
                <Eye className="h-4 w-4 mr-1" /> Full Review
              </Button>
            )}
          </div>
        </div>
        {latestRun && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{PHASE_LABELS[latestRun.current_phase || ''] || latestRun.current_phase}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 border-t">
          <Tabs defaultValue="assets" className="mt-3">
            <TabsList className="bg-muted/50 h-8">
              <TabsTrigger value="assets" className="text-xs h-7 gap-1">
                <FileText className="h-3 w-3" /> Assets ({client.assets.length})
              </TabsTrigger>
              <TabsTrigger value="pipeline" className="text-xs h-7 gap-1">
                <Sparkles className="h-3 w-3" /> Pipeline
              </TabsTrigger>
              <TabsTrigger value="offer" className="text-xs h-7 gap-1">
                <Target className="h-3 w-3" /> Offer
              </TabsTrigger>
            </TabsList>

            {/* Assets Tab */}
            <TabsContent value="assets" className="mt-3 space-y-3">
              {client.assets.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No assets generated yet</p>
                  <p className="text-xs mt-1">Launch the pipeline to generate research, copy, ads, and more</p>
                </div>
              ) : (
                Object.entries(assetsByType).map(([type, assets]) => {
                  const config = ASSET_TYPE_CONFIG[type];
                  const Icon = config?.icon || FileText;
                  const label = config?.label || type;
                  const latestAsset = assets[0];
                  const isAssetExpanded = expandedAsset === latestAsset.id;

                  return (
                    <Collapsible key={type} open={isAssetExpanded} onOpenChange={() => onToggleAsset(latestAsset.id)}>
                      <div className="border rounded-lg overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <button className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left">
                            <div className="flex items-center gap-2.5">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{label}</span>
                              <Badge variant="outline" className="text-[10px]">{latestAsset.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {assets.length > 1 && (
                                <span className="text-[10px] text-muted-foreground">{assets.length} versions</span>
                              )}
                              {isAssetExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </div>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t p-3 space-y-3">
                            {/* Asset Preview */}
                            <div className="bg-muted/30 rounded-lg p-3 max-h-64 overflow-y-auto">
                              <AssetPreview content={latestAsset.content} assetType={type} />
                            </div>

                            {/* Inline AI Chat */}
                            <AssetInlineChat
                              assetId={latestAsset.id}
                              assetType={label}
                              onContentUpdated={() => onRefresh()}
                            />
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })
              )}
            </TabsContent>

            {/* Pipeline Tab */}
            <TabsContent value="pipeline" className="mt-3 space-y-2">
              {!latestRun ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Rocket className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Pipeline not started</p>
                  <Button size="sm" className="mt-3" onClick={() => onLaunchPipeline(client.clientId, primaryOffer?.id)} disabled={isLaunching}>
                    <Rocket className="h-4 w-4 mr-1" /> Launch Pipeline
                  </Button>
                </div>
              ) : (
                PHASE_ORDER.map(phase => {
                  const phaseSteps = phases[phase] || [];
                  if (phaseSteps.length === 0) return null;
                  const completed = phaseSteps.filter(s => s.status === 'completed').length;
                  const failed = phaseSteps.filter(s => s.status === 'failed').length;
                  const isVideoPhase = phase === 'video';
                  const isCurrentPhase = latestRun.current_phase === phase;

                  return (
                    <div key={phase} className={cn(
                      'rounded-lg border p-3 space-y-2',
                      isCurrentPhase && 'border-primary/50 bg-primary/5'
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{PHASE_LABELS[phase]}</span>
                          {isCurrentPhase && isPipelineRunning && (
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          {completed > 0 && <Badge variant="outline" className="text-green-600 text-[10px]">{completed}✓</Badge>}
                          {failed > 0 && <Badge variant="destructive" className="text-[10px]">{failed}✗</Badge>}
                          <span className="text-muted-foreground">{phaseSteps.length}</span>
                        </div>
                      </div>
                      {isVideoPhase && !isPipelineRunning && phaseSteps.length > 0 && (
                        <div className="flex items-center gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
                          <Pause className="h-3.5 w-3.5 text-yellow-600" />
                          <span className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                            Video phase — review scripts before generating
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        {phaseSteps.map(step => {
                          const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
                          const Icon = config.icon;
                          return (
                            <div key={step.id} className="flex items-center gap-2 py-1 px-2 text-sm rounded hover:bg-muted/30">
                              <Icon className={cn('h-3.5 w-3.5 shrink-0', config.color, step.status === 'running' && 'animate-spin')} />
                              <span className={cn(step.status === 'completed' && 'text-muted-foreground')}>{step.step_name}</span>
                              {step.error_message && (
                                <span className="text-[10px] text-destructive ml-auto truncate max-w-[150px]" title={step.error_message}>
                                  {step.error_message}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            {/* Offer Tab */}
            <TabsContent value="offer" className="mt-3">
              {client.offers.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No offer linked</p>
                  <p className="text-xs mt-1">Create an offer for this client to use as pipeline input</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {client.offers.map(offer => (
                    <Card key={offer.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">{offer.title}</h4>
                        <Badge variant="outline" className="text-xs">{offer.offer_type}</Badge>
                      </div>
                      {offer.description && (
                        <p className="text-xs text-muted-foreground line-clamp-3">{offer.description}</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm" variant="outline"
                          onClick={() => navigate(`/client/${client.clientId}/offer/${offer.id}`)}
                        >
                          <Eye className="h-3 w-3 mr-1" /> View Offer
                        </Button>
                        {!latestRun && (
                          <Button size="sm" onClick={() => onLaunchPipeline(client.clientId, offer.id)} disabled={isLaunching}>
                            <Rocket className="h-3 w-3 mr-1" /> Launch with this Offer
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Asset Preview ───

function AssetPreview({ content, assetType }: { content: any; assetType: string }) {
  if (!content) return <p className="text-xs text-muted-foreground">No content</p>;

  // Array content (emails, sms, angles, etc.)
  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.slice(0, 5).map((item: any, i: number) => (
          <div key={i} className="border-b border-border/50 pb-2 last:border-0">
            {item.subject && <p className="text-xs font-semibold">{item.subject}</p>}
            {item.title && <p className="text-xs font-semibold">{item.title}</p>}
            {item.hook && <p className="text-xs text-muted-foreground italic">"{item.hook}"</p>}
            {item.message && <p className="text-xs">{item.message}</p>}
            {item.primary_text && <p className="text-xs">{item.primary_text}</p>}
            {item.headline && <p className="text-[10px] text-muted-foreground">{item.headline}</p>}
          </div>
        ))}
        {content.length > 5 && (
          <p className="text-[10px] text-muted-foreground">+{content.length - 5} more items</p>
        )}
      </div>
    );
  }

  // Object content (research, report, funnel, etc.)
  if (typeof content === 'object') {
    const entries = Object.entries(content).slice(0, 6);
    return (
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <div key={key}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
              {key.replace(/_/g, ' ')}
            </p>
            <p className="text-xs line-clamp-3">
              {typeof val === 'string' ? val : Array.isArray(val) ? `${val.length} items` : JSON.stringify(val).slice(0, 200)}
            </p>
          </div>
        ))}
        {Object.keys(content).length > 6 && (
          <p className="text-[10px] text-muted-foreground">+{Object.keys(content).length - 6} more sections</p>
        )}
      </div>
    );
  }

  return <p className="text-xs">{String(content).slice(0, 500)}</p>;
}
