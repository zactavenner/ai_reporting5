import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Upload,
  FileText,
  Image,
  Film,
  Wand2,
  User,
  Radar,
  Instagram,
  Scissors,
  Trophy,
  Palette,
  History,
  Download,
  Calendar,
  BarChart3,
  Headphones,
  Camera,
  Target,
  Rocket,
  ArrowRight,
  Zap,
  PenTool,
  Globe,
  Eye,
  ChevronRight,
  Layers,
  Monitor,
  ArrowUpRight,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';

interface CommandCenterProps {
  onNavigate: (section: string) => void;
  statusCounts: {
    all: number;
    pending: number;
    approved: number;
    launched: number;
    revisions: number;
    rejected: number;
  };
}

const WORKFLOWS = [
  {
    id: 'new-ad-campaign',
    label: 'New Ad Campaign',
    description: 'Script, visuals, and variations from your offer',
    steps: ['Select offer', 'AI generates scripts', 'Create visuals', 'Launch'],
    icon: Rocket,
    gradient: 'from-violet-500 to-indigo-600',
    firstStep: 'ai-scripts',
  },
  {
    id: 'podcast-campaign',
    label: 'Podcast Ad Suite',
    description: 'Host-read, video clips, and audiograms',
    steps: ['Choose style', 'Generate script', 'Produce audio', 'Export'],
    icon: Headphones,
    gradient: 'from-orange-500 to-rose-600',
    firstStep: 'podcast-ads',
  },
  {
    id: 'creative-refresh',
    label: 'Creative Refresh',
    description: 'New angles and variations on winning ads',
    steps: ['Analyze top performers', 'Generate variations', 'Review & approve'],
    icon: Wand2,
    gradient: 'from-cyan-500 to-blue-600',
    firstStep: 'winning-ads',
  },
  {
    id: 'client-review',
    label: 'Client Review',
    description: 'Review pending creatives and approve for launch',
    steps: ['View queue', 'Approve or revise', 'Share with client'],
    icon: Eye,
    gradient: 'from-emerald-500 to-teal-600',
    firstStep: 'approvals',
  },
];

const AI_TOOLS = [
  {
    id: 'ai-scripts',
    label: 'AI Script Writer',
    description: 'Generate DR scripts from offers & marketing angles. PAS, AIDA, Story Hook, and more.',
    icon: PenTool,
    gradient: 'from-violet-500 to-purple-600',
    tag: 'Most Used',
    stat: 'Avg 3.2x CTR lift',
  },
  {
    id: 'podcast-ads',
    label: 'Podcast Ads',
    description: 'Host-reads, interview clips, narratives, dynamic inserts & video podcast clips.',
    icon: Headphones,
    gradient: 'from-orange-500 to-amber-600',
    tag: 'Rising',
    stat: '6 ad styles',
  },
  {
    id: 'hyper-realistic',
    label: 'Hyper-Realistic Visuals',
    description: 'Photorealistic AI imagery for scroll-stopping ads across all platforms.',
    icon: Camera,
    gradient: 'from-cyan-500 to-blue-600',
    tag: 'Popular',
    stat: 'HD + 4K output',
  },
  {
    id: 'direct-response',
    label: 'Direct Response Toolkit',
    description: 'Proven hooks, headlines, body copy & CTAs engineered for conversion.',
    icon: Target,
    gradient: 'from-rose-500 to-pink-600',
    tag: 'Essential',
    stat: '8 DR frameworks',
  },
];

const CREATE_TOOLS = [
  { id: 'briefs', label: 'Briefs & Scripts', icon: FileText, description: 'AI creative briefs from performance data' },
  { id: 'static-ads', label: 'Static Ads', icon: Image, description: 'Branded image ads at scale' },
  { id: 'batch-video', label: 'Batch Video', icon: Film, description: 'Multi-clip video generation' },
  { id: 'ad-variations', label: 'A/B Variations', icon: Wand2, description: 'Test colors, copy & layouts' },
  { id: 'avatars', label: 'AI Avatars', icon: User, description: 'Digital presenters & UGC' },
  { id: 'broll', label: 'B-Roll Library', icon: Film, description: 'AI-generated stock footage' },
  { id: 'video-editor', label: 'Video Editor', icon: Scissors, description: 'Trim, caption & compose' },
];

const RESEARCH_TOOLS = [
  { id: 'ad-scraping', label: 'Ad Intelligence', icon: Radar, description: 'Spy on competitor ads' },
  { id: 'instagram-intel', label: 'IG Intel', icon: Instagram, description: 'Content performance data' },
  { id: 'winning-ads', label: 'Winning Ads', icon: Trophy, description: 'Top performer gallery' },
  { id: 'platform-intel', label: 'Platform Intel', icon: Globe, description: 'What works on each platform' },
];

const MANAGE_TOOLS = [
  { id: 'manage-styles', label: 'Brand Styles', icon: Palette },
  { id: 'calendar', label: 'Content Calendar', icon: Calendar },
  { id: 'history', label: 'History', icon: History },
  { id: 'export', label: 'Export Hub', icon: Download },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export function CreativeCommandCenter({ onNavigate, statusCounts }: CommandCenterProps) {
  const { data: clients = [] } = useClients();
  const [selectedClient, setSelectedClient] = useState<string>('all');

  return (
    <div className="space-y-12">
      {/* ===== HERO SECTION — Apple-style cinematic header ===== */}
      <div className="relative overflow-hidden rounded-[32px] bg-[#0a0a0a]">
        {/* Ambient gradient mesh */}
        <div className="absolute inset-0">
          <div className="absolute top-[-40%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-br from-violet-600/25 via-blue-500/15 to-transparent rounded-full blur-[100px]" />
          <div className="absolute bottom-[-50%] left-[10%] w-[600px] h-[600px] bg-gradient-to-tr from-cyan-500/15 via-indigo-500/10 to-transparent rounded-full blur-[100px]" />
          <div className="absolute top-[20%] left-[-10%] w-[400px] h-[400px] bg-gradient-to-r from-rose-500/10 to-transparent rounded-full blur-[80px]" />
        </div>

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        <div className="relative z-10 p-10 md:p-14">
          {/* Top Row */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-white/90 tracking-wide">Creative Studio</span>
                <span className="text-[10px] text-white/30 ml-2 font-medium">by HPA</span>
              </div>
            </div>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-[200px] h-10 rounded-2xl bg-white/[0.06] border-white/[0.08] text-white text-sm hover:bg-white/[0.10] transition-all duration-300 backdrop-blur-xl">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hero Text */}
          <div className="max-w-2xl">
            <h1 className="text-5xl md:text-6xl font-bold tracking-[-0.04em] text-white mb-4 leading-[1.05]">
              Create ads that<br />
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-300 bg-clip-text text-transparent">
                convert.
              </span>
            </h1>
            <p className="text-[17px] text-white/35 max-w-lg leading-relaxed font-normal">
              AI-powered scripts, podcast ads, hyper-realistic visuals, and direct response tools.
              Everything your agency needs in one studio.
            </p>
          </div>

          {/* Pipeline Status — Frosted glass pills */}
          <div className="flex items-center gap-3 mt-12 flex-wrap">
            {statusCounts.pending > 0 && (
              <button
                onClick={() => onNavigate('approvals')}
                className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-2xl border border-white/[0.06] transition-all duration-300 group"
              >
                <div className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[13px] font-semibold text-white/90">{statusCounts.pending} Pending Review</span>
                <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all" />
              </button>
            )}
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-2xl border border-white/[0.06] transition-all duration-300"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
              <span className="text-[13px] font-semibold text-white/90">{statusCounts.approved} Approved</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-2xl border border-white/[0.06] transition-all duration-300"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
              <span className="text-[13px] font-semibold text-white/90">{statusCounts.launched} Launched</span>
            </button>
            <span className="text-[13px] text-white/20 ml-2 font-medium">{statusCounts.all} total</span>
          </div>
        </div>
      </div>

      {/* ===== GUIDED WORKFLOWS — Apple "Start Here" cards ===== */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Start a Workflow</h2>
            <p className="text-sm text-muted-foreground/60 mt-0.5">Guided step-by-step creative production</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORKFLOWS.map(wf => {
            const Icon = wf.icon;
            return (
              <button
                key={wf.id}
                onClick={() => onNavigate(wf.firstStep)}
                className="group relative overflow-hidden rounded-[20px] p-6 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-black/8 hover:scale-[1.02] active:scale-[0.98] border border-border/40 bg-card"
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${wf.gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />
                <div className="relative z-10">
                  <div className={`h-11 w-11 rounded-[14px] bg-gradient-to-br ${wf.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-[15px] font-semibold mb-1">{wf.label}</h3>
                  <p className="text-[12px] text-muted-foreground/60 leading-relaxed mb-4">{wf.description}</p>

                  {/* Step indicators */}
                  <div className="flex items-center gap-1.5">
                    {wf.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20 group-hover:bg-primary/40 transition-colors" />
                        {i < wf.steps.length - 1 && (
                          <div className="w-3 h-px bg-muted-foreground/10" />
                        )}
                      </div>
                    ))}
                    <span className="text-[10px] text-muted-foreground/40 ml-1">{wf.steps.length} steps</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== AI CREATIVE TOOLS — Large feature cards ===== */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500/15 to-blue-500/15 flex items-center justify-center">
              <Zap className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">AI Creative Tools</h2>
              <p className="text-sm text-muted-foreground/60">Generate scripts, ads & visuals with AI</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[11px] font-medium gap-1.5 px-3 py-1.5 rounded-full border-primary/20">
            <Sparkles className="h-3 w-3 text-primary" /> AI-Powered
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AI_TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.id)}
                className="group relative overflow-hidden rounded-[20px] text-left transition-all duration-300 hover:shadow-2xl hover:shadow-black/10 hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient}`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                <div className="relative z-10 p-6 text-white">
                  <div className="flex items-center justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:bg-white/20 transition-all duration-300">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge className="bg-white/15 text-white border-0 text-[10px] font-semibold backdrop-blur-sm rounded-full px-2.5">
                      {tool.tag}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-semibold mb-1.5 leading-tight">{tool.label}</h3>
                  <p className="text-[12px] text-white/50 leading-relaxed mb-4">{tool.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35 font-medium">{tool.stat}</span>
                    <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/70 group-hover:text-white transition-colors">
                      <span>Open</span>
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== QUICK ACTIONS — Agency-focused workflow shortcuts ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('approvals')}
          className="group flex items-center gap-4 p-5 rounded-[20px] bg-amber-500/[0.04] border border-amber-500/10 hover:bg-amber-500/[0.08] hover:border-amber-500/20 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/15 transition-colors">
            <Upload className="h-5 w-5 text-amber-600" />
          </div>
          <div className="text-left flex-1">
            <p className="text-[14px] font-semibold">Review & Approve</p>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">
              {statusCounts.pending > 0 ? `${statusCounts.pending} creatives awaiting review` : 'All caught up — nice work'}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('ai-scripts')}
          className="group flex items-center gap-4 p-5 rounded-[20px] bg-violet-500/[0.04] border border-violet-500/10 hover:bg-violet-500/[0.08] hover:border-violet-500/20 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-violet-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-500/15 transition-colors">
            <PenTool className="h-5 w-5 text-violet-600" />
          </div>
          <div className="text-left flex-1">
            <p className="text-[14px] font-semibold">Quick Script</p>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">Generate ad scripts from any offer in seconds</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('platform-intel')}
          className="group flex items-center gap-4 p-5 rounded-[20px] bg-blue-500/[0.04] border border-blue-500/10 hover:bg-blue-500/[0.08] hover:border-blue-500/20 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/15 transition-colors">
            <Globe className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-left flex-1">
            <p className="text-[14px] font-semibold">Platform Intel</p>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">What's working across Meta, TikTok, YouTube</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>

      {/* ===== CREATE & RESEARCH TOOLS — Clean grid layout ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Create Tools — Takes 3 cols */}
        <div className="lg:col-span-3">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-6 w-6 rounded-md bg-muted/80 flex items-center justify-center">
              <Layers className="h-3.5 w-3.5 text-muted-foreground/70" />
            </div>
            <h2 className="text-[15px] font-semibold text-foreground/80">Create</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {CREATE_TOOLS.map(tool => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigate(tool.id)}
                  className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/40 bg-card hover:bg-muted/30 hover:shadow-md hover:shadow-black/[0.03] hover:border-primary/15 transition-all duration-200 text-left active:scale-[0.98]"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/60 flex items-center justify-center group-hover:bg-primary/10 transition-colors duration-200">
                    <Icon className="h-5 w-5 text-muted-foreground/70 group-hover:text-primary transition-colors duration-200" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{tool.label}</p>
                    <p className="text-[11px] text-muted-foreground/50 leading-relaxed mt-0.5">{tool.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Research & Manage — Takes 2 cols */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <div className="h-6 w-6 rounded-md bg-muted/80 flex items-center justify-center">
                <Eye className="h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              <h2 className="text-[15px] font-semibold text-foreground/80">Research & Insights</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {RESEARCH_TOOLS.map(tool => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => onNavigate(tool.id)}
                    className="group flex items-center gap-3 p-3.5 rounded-2xl border border-border/40 bg-card hover:bg-muted/30 hover:shadow-md hover:shadow-black/[0.03] hover:border-primary/15 transition-all duration-200 text-left active:scale-[0.98]"
                  >
                    <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                      <Icon className="h-4 w-4 text-muted-foreground/70 group-hover:text-primary transition-colors duration-200" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{tool.label}</p>
                      <p className="text-[10px] text-muted-foreground/50 truncate">{tool.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="h-6 w-6 rounded-md bg-muted/80 flex items-center justify-center">
                <Monitor className="h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              <h2 className="text-[15px] font-semibold text-foreground/80">Manage</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {MANAGE_TOOLS.map(tool => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => onNavigate(tool.id)}
                    className="group flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border/40 bg-card hover:bg-muted/30 hover:border-primary/15 transition-all duration-200 active:scale-[0.98]"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors duration-200" />
                    <span className="text-[13px] font-medium text-foreground/70 group-hover:text-foreground transition-colors">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===== PLATFORM BEST PRACTICES — Compact intel bar ===== */}
      <div className="rounded-[20px] border border-border/40 bg-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Globe className="h-4 w-4 text-muted-foreground/60" />
          <h3 className="text-[14px] font-semibold text-foreground/80">Platform Quick Tips</h3>
          <button onClick={() => onNavigate('platform-intel')} className="ml-auto text-[12px] text-primary/70 hover:text-primary font-medium flex items-center gap-1 transition-colors">
            View all <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { platform: 'Meta', tip: 'Hook in first 3s. UGC-style outperforms polished. 15-60s vertical.', color: 'bg-blue-500' },
            { platform: 'TikTok', tip: 'Native-feel only. Text overlays required. Use trending sounds.', color: 'bg-pink-500' },
            { platform: 'YouTube', tip: 'Hook in 5s then deliver value. Problem→Solution→CTA. 30-90s.', color: 'bg-red-500' },
            { platform: 'Podcast', tip: 'Host-read converts 2x. Sound authentic. 30-60s optimal length.', color: 'bg-orange-500' },
          ].map(item => (
            <div key={item.platform} className="flex items-start gap-3 p-3 rounded-xl bg-muted/20">
              <div className={`h-2 w-2 rounded-full ${item.color} mt-1.5 flex-shrink-0`} />
              <div>
                <p className="text-[12px] font-semibold mb-0.5">{item.platform}</p>
                <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{item.tip}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
