import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Mic,
  TrendingUp,
  Clock,
  Check,
  Rocket,
  ArrowRight,
  Zap,
  PenTool,
  Play,
  Monitor,
  Smartphone,
  Globe,
  Eye,
  Star,
  Users,
  Shield,
  Lightbulb,
  ChevronRight,
  Activity,
  LayoutGrid,
} from 'lucide-react';

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

const QUICK_ACTIONS = [
  { id: 'ai-scripts', label: 'AI Script Writer', description: 'Generate scripts from offers, angles & frameworks', icon: PenTool, gradient: 'from-violet-500 to-purple-600', section: 'ai-scripts' },
  { id: 'podcast-ads', label: 'Podcast Ads', description: 'Host-reads, interview clips & dynamic inserts', icon: Headphones, gradient: 'from-orange-500 to-amber-600', section: 'podcast-ads' },
  { id: 'hyper-realistic', label: 'Hyper-Realistic', description: 'Photorealistic AI visuals & product shots', icon: Camera, gradient: 'from-cyan-500 to-blue-600', section: 'hyper-realistic' },
  { id: 'direct-response', label: 'DR Toolkit', description: 'Hooks, CTAs, headlines & funnel copy', icon: Target, gradient: 'from-rose-500 to-pink-600', section: 'direct-response' },
];

const PLATFORM_INSIGHTS = [
  {
    platform: 'Meta (FB/IG)',
    icon: Globe,
    bestFor: ['UGC Video Ads', 'Carousel Creatives', 'Story Ads'],
    topFormat: 'Short-form UGC (15-30s)',
    avgCTR: '1.2-2.8%',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/15',
  },
  {
    platform: 'YouTube',
    icon: Play,
    bestFor: ['Pre-Roll Ads', 'VSL-Style', 'Podcast Clips'],
    topFormat: 'Long-form direct response (60-120s)',
    avgCTR: '0.5-1.5%',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
    borderColor: 'border-red-500/15',
  },
  {
    platform: 'TikTok',
    icon: Smartphone,
    bestFor: ['Native UGC', 'Trending Audio', 'POV Hooks'],
    topFormat: 'Native vertical video (15-45s)',
    avgCTR: '1.5-3.5%',
    color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-500/15',
  },
  {
    platform: 'LinkedIn',
    icon: Monitor,
    bestFor: ['Authority Content', 'Case Studies', 'Thought Leadership'],
    topFormat: 'Document ads & video testimonials',
    avgCTR: '0.4-0.8%',
    color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    borderColor: 'border-sky-500/15',
  },
];

const AGENCY_WORKFLOWS = [
  {
    id: 'new-campaign',
    label: 'New Campaign',
    description: 'Brief → Script → Creative → Review → Launch',
    steps: ['briefs', 'ai-scripts', 'static-ads', 'approvals'],
    icon: Rocket,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  {
    id: 'creative-refresh',
    label: 'Creative Refresh',
    description: 'Audit → Variations → Test → Optimize',
    steps: ['direct-response', 'ad-variations', 'analytics'],
    icon: Wand2,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
  },
  {
    id: 'client-review',
    label: 'Client Review',
    description: 'Review pending creatives and provide feedback',
    steps: ['approvals'],
    icon: Eye,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    id: 'scale-winners',
    label: 'Scale Winners',
    description: 'Analyze top performers → Create variations → Deploy',
    steps: ['winning-ads', 'ad-variations', 'batch-video'],
    icon: TrendingUp,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
];

const TOOL_CATEGORIES = [
  {
    title: 'Create',
    items: [
      { id: 'briefs', label: 'Briefs & Scripts', icon: FileText, description: 'AI-powered creative briefs' },
      { id: 'static-ads', label: 'Static Ads', icon: Image, description: 'Image ad generation' },
      { id: 'batch-video', label: 'Batch Video', icon: Film, description: 'Video production at scale' },
      { id: 'ad-variations', label: 'Ad Variations', icon: Wand2, description: 'A/B test copy & visuals' },
      { id: 'avatars', label: 'AI Avatars', icon: User, description: 'Spokesperson avatars' },
      { id: 'broll', label: 'B-Roll', icon: Film, description: 'Stock footage library' },
      { id: 'video-editor', label: 'Video Editor', icon: Scissors, description: 'Post-production tools' },
    ],
  },
  {
    title: 'Research',
    items: [
      { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar, description: 'Competitive intelligence' },
      { id: 'instagram-intel', label: 'IG Intel', icon: Instagram, description: 'Platform insights' },
      { id: 'winning-ads', label: 'Winning Ads', icon: Trophy, description: 'Top performer gallery' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'manage-styles', label: 'Styles', icon: Palette, description: 'Brand templates' },
      { id: 'calendar', label: 'Calendar', icon: Calendar, description: 'Production timeline' },
      { id: 'history', label: 'History', icon: History, description: 'Audit trail' },
      { id: 'export', label: 'Export', icon: Download, description: 'Batch downloads' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Performance metrics' },
    ],
  },
];

export function CreativeCommandCenter({ onNavigate, statusCounts }: CommandCenterProps) {
  return (
    <div className="space-y-12 pb-8">
      {/* Hero — Apple-style minimal with frosted glass */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 dark:from-black dark:via-slate-950 dark:to-black p-12 text-white">
        <div className="relative z-10 max-w-2xl">
          <p className="text-[13px] font-medium text-white/40 tracking-[0.2em] uppercase mb-4">
            Creative Studio
          </p>
          <h1 className="text-[42px] font-bold tracking-tight leading-[1.1] mb-3">
            Your creative<br />command center.
          </h1>
          <p className="text-[17px] text-white/50 leading-relaxed max-w-lg">
            AI-powered tools for direct response ads, podcast scripts, hyper-realistic visuals, and full-funnel creative production.
          </p>

          {/* Status Indicators */}
          <div className="flex items-center gap-3 mt-10">
            <button
              onClick={() => onNavigate('approvals')}
              className="group flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.12] backdrop-blur-xl border border-white/[0.06] transition-all duration-300"
            >
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[13px] font-medium text-white/80">{statusCounts.pending} Pending Review</span>
              <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-white/60 transition-colors" />
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.05] hover:bg-white/[0.08] transition-all duration-300"
            >
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-[13px] font-medium text-white/60">{statusCounts.approved} Approved</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.05] hover:bg-white/[0.08] transition-all duration-300"
            >
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-[13px] font-medium text-white/60">{statusCounts.launched} Launched</span>
            </button>
            <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03]">
              <Activity className="h-3.5 w-3.5 text-white/20" />
              <span className="text-[12px] text-white/30">{statusCounts.all} Total Assets</span>
            </div>
          </div>
        </div>

        {/* Decorative — subtle concentric rings */}
        <div className="absolute top-1/2 right-12 -translate-y-1/2">
          <div className="w-[280px] h-[280px] rounded-full border border-white/[0.04]" />
          <div className="absolute inset-8 rounded-full border border-white/[0.06]" />
          <div className="absolute inset-16 rounded-full border border-white/[0.08]" />
          <div className="absolute inset-24 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 blur-xl" />
        </div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      {/* AI Creative Tools — Featured Cards */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">AI Creative Tools</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Powered by AI — generate scripts, visuals, audio, and copy in seconds</p>
          </div>
          <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            4 Tools
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onNavigate(action.section)}
                className="group relative overflow-hidden rounded-[20px] p-6 text-left transition-all duration-500 hover:shadow-2xl hover:shadow-black/10 dark:hover:shadow-black/30 hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-90 group-hover:opacity-100 transition-opacity`} />
                <div className="relative z-10 text-white">
                  <div className="h-11 w-11 rounded-[14px] bg-white/20 backdrop-blur-sm flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-[17px] font-semibold mb-1 tracking-tight">{action.label}</h3>
                  <p className="text-[13px] text-white/60 leading-relaxed">{action.description}</p>
                  <div className="flex items-center gap-1.5 mt-4 text-[12px] font-medium text-white/40 group-hover:text-white/70 transition-colors">
                    <span>Open tool</span>
                    <ArrowRight className="h-3 w-3 -translate-x-1 group-hover:translate-x-0 transition-transform duration-300" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agency Workflows — Quick Start */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Quick Start Workflows</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Pre-built flows for agencies and creative teams</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {AGENCY_WORKFLOWS.map(workflow => {
            const Icon = workflow.icon;
            return (
              <button
                key={workflow.id}
                onClick={() => onNavigate(workflow.steps[0])}
                className="group flex flex-col p-5 rounded-[18px] border bg-card hover:bg-muted/40 transition-all duration-300 text-left hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/20"
              >
                <div className={`h-10 w-10 rounded-[12px] ${workflow.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`h-5 w-5 ${workflow.color}`} />
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight mb-1">{workflow.label}</h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed flex-1">{workflow.description}</p>
                <div className="flex items-center gap-1 mt-4">
                  {workflow.steps.map((_, i) => (
                    <div key={i} className="h-1 flex-1 rounded-full bg-muted group-hover:bg-primary/30 transition-colors duration-300" style={{ transitionDelay: `${i * 75}ms` }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform Intelligence */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Platform Intelligence</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Best-performing creative formats by platform</p>
          </div>
          <Badge variant="outline" className="gap-1.5 px-3 py-1 text-xs font-medium">
            <Globe className="h-3 w-3" />
            4 Platforms
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLATFORM_INSIGHTS.map(platform => {
            const Icon = platform.icon;
            return (
              <div
                key={platform.platform}
                className={`rounded-[18px] border ${platform.borderColor} bg-card p-5 hover:shadow-lg hover:shadow-black/[0.03] dark:hover:shadow-black/20 transition-all duration-300`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-9 w-9 rounded-[10px] ${platform.color} flex items-center justify-center`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold tracking-tight">{platform.platform}</p>
                    <p className="text-[11px] text-muted-foreground">Avg CTR: {platform.avgCTR}</p>
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Best Creative Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {platform.bestFor.map(format => (
                      <span key={format} className="text-[11px] px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground">
                        {format}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Top format:</span> {platform.topFormat}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All Tools Grid — Clean Apple Style */}
      {TOOL_CATEGORIES.map(category => (
        <div key={category.title}>
          <h2 className="text-lg font-semibold tracking-tight mb-1">{category.title}</h2>
          <p className="text-[13px] text-muted-foreground mb-4">
            {category.title === 'Create' && 'Build creatives from scratch or remix existing assets'}
            {category.title === 'Research' && 'Discover winning ads and competitive insights'}
            {category.title === 'Manage' && 'Organize, schedule, and export your creative library'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {category.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="group flex flex-col p-4 rounded-[16px] border bg-card hover:bg-muted/40 hover:shadow-md hover:shadow-black/[0.03] dark:hover:shadow-black/20 transition-all duration-300 text-left active:scale-[0.97]"
                >
                  <div className="h-10 w-10 rounded-[12px] bg-muted/80 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors duration-300">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <p className="text-[14px] font-medium tracking-tight">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
