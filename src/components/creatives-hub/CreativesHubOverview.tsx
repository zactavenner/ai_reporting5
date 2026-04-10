import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PenTool,
  Film,
  Image,
  Radar,
  CheckCircle,
  TrendingUp,
  Clock,
  Rocket,
  ArrowRight,
  Sparkles,
  Eye,
  Headphones,
  Camera,
  Target,
  Layers,
  BarChart3,
  FileText,
  Zap,
} from 'lucide-react';
import type { Client } from '@/hooks/useClients';
import type { HubSection } from '@/pages/CreativesHubPage';

interface Creative {
  id: string;
  title: string;
  type: string;
  status: string;
  platform: string;
  file_url: string | null;
  client_id: string | null;
  ai_performance_score: number | null;
  created_at: string;
}

interface OverviewProps {
  clients: Client[];
  creatives: Creative[];
  statusCounts: {
    all: number;
    pending: number;
    approved: number;
    launched: number;
    revisions: number;
    rejected: number;
  };
  onNavigate: (section: HubSection) => void;
}

const QUICK_ACTIONS = [
  {
    id: 'scripts',
    label: 'AI Script Writer',
    description: 'Generate DR scripts from offers & angles',
    icon: PenTool,
    gradient: 'from-violet-500 to-purple-600',
    section: 'scripts' as HubSection,
  },
  {
    id: 'podcast',
    label: 'Podcast Video Ads',
    description: 'Host-reads, interview clips & audio ads',
    icon: Headphones,
    gradient: 'from-orange-500 to-amber-600',
    section: 'video' as HubSection,
  },
  {
    id: 'hyper',
    label: 'Hyper-Realistic Ads',
    description: 'Photorealistic AI imagery & video',
    icon: Camera,
    gradient: 'from-cyan-500 to-blue-600',
    section: 'video' as HubSection,
  },
  {
    id: 'dr',
    label: 'DR Toolkit',
    description: 'Hooks, headlines, CTAs & body copy',
    icon: Target,
    gradient: 'from-rose-500 to-pink-600',
    section: 'scripts' as HubSection,
  },
  {
    id: 'static',
    label: 'Static Ads',
    description: 'Generate image creatives at scale',
    icon: Image,
    gradient: 'from-emerald-500 to-green-600',
    section: 'static' as HubSection,
  },
  {
    id: 'research',
    label: 'Ad Research',
    description: 'Scrape & analyze competitor ads',
    icon: Radar,
    gradient: 'from-indigo-500 to-blue-600',
    section: 'research' as HubSection,
  },
];

export function CreativesHubOverview({ clients, creatives, statusCounts, onNavigate }: OverviewProps) {
  const recentCreatives = useMemo(() => {
    return [...creatives]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);
  }, [creatives]);

  const topPerformers = useMemo(() => {
    return creatives
      .filter(c => c.ai_performance_score && c.ai_performance_score > 0)
      .sort((a, b) => (b.ai_performance_score || 0) - (a.ai_performance_score || 0))
      .slice(0, 4);
  }, [creatives]);

  const getClientName = (clientId: string | null) => {
    if (!clientId) return 'Unassigned';
    return clients.find(c => c.id === clientId)?.name || 'Unknown';
  };

  return (
    <div className="space-y-8">
      {/* Status cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: statusCounts.all, icon: Layers, color: 'text-foreground' },
          { label: 'Pending Review', value: statusCounts.pending, icon: Clock, color: 'text-amber-500' },
          { label: 'Approved', value: statusCounts.approved, icon: CheckCircle, color: 'text-emerald-500' },
          { label: 'Launched', value: statusCounts.launched, icon: Rocket, color: 'text-blue-500' },
          { label: 'Revisions', value: statusCounts.revisions, icon: Eye, color: 'text-orange-500' },
          { label: 'Top Score', value: topPerformers[0]?.ai_performance_score || '-', icon: TrendingUp, color: 'text-primary' },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Creative Tools - Apple-style grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">AI Creative Tools</h2>
            <p className="text-sm text-muted-foreground">Generate ad creatives with AI across every format</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => onNavigate(action.section)}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 text-left transition-all duration-300 hover:shadow-lg hover:border-border hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 h-12 w-12 rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-sm`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-0.5 group-hover:text-primary transition-colors">
                    {action.label}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {action.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Two column: Recent + Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent creatives */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Recent Creatives</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => onNavigate('review')}
            >
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-2">
            {recentCreatives.length === 0 ? (
              <Card className="border-dashed border-border/50 p-8 text-center">
                <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No creatives yet. Use the tools above to start generating.</p>
              </Card>
            ) : (
              recentCreatives.map((creative) => (
                <Card key={creative.id} className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {creative.file_url ? (
                        <img src={creative.file_url} alt="" className="h-full w-full object-cover rounded-xl" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{creative.title}</p>
                      <p className="text-[11px] text-muted-foreground">{getClientName(creative.client_id)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-[10px] capitalize">{creative.type}</Badge>
                      <Badge
                        className={`text-[10px] capitalize ${
                          creative.status === 'approved' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' :
                          creative.status === 'pending' ? 'bg-amber-500/15 text-amber-600 border-amber-500/20' :
                          creative.status === 'launched' ? 'bg-blue-500/15 text-blue-600 border-blue-500/20' :
                          creative.status === 'revisions' ? 'bg-orange-500/15 text-orange-600 border-orange-500/20' :
                          creative.status === 'rejected' ? 'bg-red-500/15 text-red-600 border-red-500/20' :
                          'bg-muted text-muted-foreground'
                        }`}
                        variant="outline"
                      >
                        {creative.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* Top performers */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Top Performers</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => onNavigate('performance')}
            >
              All analytics <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          {topPerformers.length === 0 ? (
            <Card className="border-dashed border-border/50 p-8 text-center">
              <BarChart3 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Performance data will appear once creatives are launched.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {topPerformers.map((creative, idx) => (
                <Card key={creative.id} className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm group hover:shadow-md transition-all">
                  <div className="relative aspect-square bg-muted/30">
                    {creative.file_url ? (
                      <img
                        src={creative.file_url}
                        alt={creative.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <Image className="h-8 w-8" />
                      </div>
                    )}
                    {idx < 3 && (
                      <div className="absolute top-2 left-2">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-foreground text-background text-[10px] font-bold shadow-sm">
                          {idx + 1}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[10px] gap-1 font-semibold">
                        <TrendingUp className="h-3 w-3 text-primary" />
                        {creative.ai_performance_score}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium truncate">{creative.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{getClientName(creative.client_id)}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-[9px] capitalize">{creative.platform}</Badge>
                      <Badge variant="secondary" className="text-[9px] capitalize">{creative.type}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Workflow pipeline */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Creative Workflow</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { step: 1, label: 'Research', desc: 'Analyze competitors & trends', icon: Radar, section: 'research' as HubSection },
            { step: 2, label: 'Script', desc: 'AI-generate scripts & copy', icon: PenTool, section: 'scripts' as HubSection },
            { step: 3, label: 'Create', desc: 'Produce static & video ads', icon: Film, section: 'video' as HubSection },
            { step: 4, label: 'Review', desc: 'Client approvals & feedback', icon: CheckCircle, section: 'review' as HubSection },
            { step: 5, label: 'Optimize', desc: 'Analyze & iterate', icon: TrendingUp, section: 'performance' as HubSection },
          ].map((item, idx) => (
            <button
              key={item.step}
              onClick={() => onNavigate(item.section)}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 text-left transition-all hover:shadow-md hover:border-border"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-foreground/5 text-[10px] font-bold text-muted-foreground">
                  {item.step}
                </span>
                <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="text-sm font-semibold mb-0.5">{item.label}</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
