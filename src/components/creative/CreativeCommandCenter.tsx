import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Globe,
  Play,
  Eye,
  Star,
  ArrowUpRight,
  Layers,
  RefreshCw,
  Users,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Monitor,
  Smartphone,
  Tv,
  ExternalLink,
  Lightbulb,
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
  { id: 'ai-scripts', label: 'AI Script Writer', description: 'Generate direct response scripts from offers & marketing angles', icon: PenTool, gradient: 'from-violet-500 to-purple-600', section: 'ai-scripts' },
  { id: 'podcast-ads', label: 'Podcast Ads', description: 'Host-reads, interview clips, narrative stories & dynamic inserts', icon: Headphones, gradient: 'from-orange-500 to-amber-600', section: 'podcast-ads' },
  { id: 'hyper-realistic', label: 'Hyper-Realistic Ads', description: 'Photorealistic AI visuals — product shots, lifestyle & cinematic', icon: Camera, gradient: 'from-cyan-500 to-blue-600', section: 'hyper-realistic' },
  { id: 'direct-response', label: 'DR Toolkit', description: 'Hooks, headlines, CTAs, body copy & full funnel copywriting', icon: Target, gradient: 'from-rose-500 to-pink-600', section: 'direct-response' },
];

const PLATFORM_INTELLIGENCE = [
  {
    platform: 'Meta (FB/IG)',
    icon: Globe,
    color: 'text-blue-500',
    bg: 'bg-blue-500/8',
    borderColor: 'border-blue-500/15',
    bestFormats: ['UGC Video', 'Carousel', 'Static Image'],
    trending: 'AI-generated UGC with native captions',
    avgCPM: '$8-15',
    topCreativeType: 'Short-form video (15-30s)',
    tip: 'Lead with a pattern interrupt hook in first 3 seconds. Native-looking content outperforms polished ads 2.3x.',
  },
  {
    platform: 'TikTok',
    icon: Smartphone,
    color: 'text-pink-500',
    bg: 'bg-pink-500/8',
    borderColor: 'border-pink-500/15',
    bestFormats: ['Talking Head', 'Green Screen', 'Stitch/Duet Style'],
    trending: 'POV-style ads with AI avatars',
    avgCPM: '$4-10',
    topCreativeType: 'Raw UGC (15-60s)',
    tip: 'Don\'t make ads — make TikToks. Use trending sounds, text overlays, and authentic creator-style delivery.',
  },
  {
    platform: 'YouTube',
    icon: Play,
    color: 'text-red-500',
    bg: 'bg-red-500/8',
    borderColor: 'border-red-500/15',
    bestFormats: ['Pre-Roll', 'Podcast Style', 'VSL'],
    trending: 'Long-form AI podcast ads & mini-documentaries',
    avgCPM: '$10-25',
    topCreativeType: 'Pre-roll (15-30s) & mid-roll podcast',
    tip: 'First 5 seconds decide skip vs watch. Use a strong curiosity gap or bold claim to earn attention.',
  },
  {
    platform: 'Google Display',
    icon: Monitor,
    color: 'text-green-500',
    bg: 'bg-green-500/8',
    borderColor: 'border-green-500/15',
    bestFormats: ['Static Banner', 'Responsive Display', 'HTML5'],
    trending: 'AI-generated hyper-realistic product shots',
    avgCPM: '$2-8',
    topCreativeType: 'Responsive display with AI visuals',
    tip: 'Use high-contrast visuals with minimal text. AI-generated product shots with clean backgrounds convert best.',
  },
  {
    platform: 'LinkedIn',
    icon: Users,
    color: 'text-sky-600',
    bg: 'bg-sky-500/8',
    borderColor: 'border-sky-500/15',
    bestFormats: ['Thought Leadership', 'Carousel Doc', 'Video'],
    trending: 'AI-generated data visualizations & carousel docs',
    avgCPM: '$25-45',
    topCreativeType: 'Document carousel (8-12 slides)',
    tip: 'Lead with authority and data. Educational carousels get 3x the engagement of single image ads.',
  },
  {
    platform: 'Connected TV',
    icon: Tv,
    color: 'text-purple-500',
    bg: 'bg-purple-500/8',
    borderColor: 'border-purple-500/15',
    bestFormats: ['15s Spot', '30s Spot', 'Branded Content'],
    trending: 'AI-produced cinematic spots at fraction of cost',
    avgCPM: '$20-40',
    topCreativeType: 'Cinematic 15-30s spots',
    tip: 'CTV viewers are lean-back. Use storytelling and premium production. AI cinematic tools make this accessible.',
  },
];

const CREATIVE_WORKFLOWS = [
  { step: 1, label: 'Brief', description: 'Define the creative brief & angles', icon: FileText, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { step: 2, label: 'Generate', description: 'AI creates scripts, visuals & copy', icon: Sparkles, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { step: 3, label: 'Review', description: 'Client & team feedback loop', icon: MessageSquare, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { step: 4, label: 'Approve', description: 'Approve or request revisions', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' },
  { step: 5, label: 'Launch', description: 'Deploy across platforms', icon: Rocket, color: 'text-rose-500', bg: 'bg-rose-500/10' },
];

const TOOL_CATEGORIES = [
  {
    title: 'Create',
    items: [
      { id: 'briefs', label: 'Briefs & Scripts', icon: FileText, description: 'Generate creative briefs' },
      { id: 'static-ads', label: 'Static Ads', icon: Image, description: 'Design static creatives' },
      { id: 'batch-video', label: 'Batch Video', icon: Film, description: 'Produce videos at scale' },
      { id: 'ad-variations', label: 'Ad Variations', icon: Wand2, description: 'AI-powered A/B variants' },
      { id: 'avatars', label: 'AI Avatars', icon: User, description: 'Digital spokesperson' },
      { id: 'broll', label: 'B-Roll', icon: Film, description: 'Stock & AI footage' },
      { id: 'video-editor', label: 'Video Editor', icon: Scissors, description: 'Cut & edit video' },
    ],
  },
  {
    title: 'Research',
    items: [
      { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar, description: 'Spy on competitors' },
      { id: 'instagram-intel', label: 'IG Intel', icon: Instagram, description: 'Instagram insights' },
      { id: 'winning-ads', label: 'Winning Ads', icon: Trophy, description: 'Top performers gallery' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'manage-styles', label: 'Styles', icon: Palette, description: 'Brand style library' },
      { id: 'calendar', label: 'Calendar', icon: Calendar, description: 'Content schedule' },
      { id: 'history', label: 'History', icon: History, description: 'Version history' },
      { id: 'export', label: 'Export', icon: Download, description: 'Download & share' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Performance data' },
    ],
  },
];

export function CreativeCommandCenter({ onNavigate, statusCounts }: CommandCenterProps) {
  return (
    <div className="space-y-12">
      {/* Hero Banner — Apple Style */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1d1d1f] via-[#2d2d30] to-[#1d1d1f] p-12 text-white">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm mb-6">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-xs font-medium text-violet-300 tracking-wide">Creative Studio</span>
          </div>
          <h1 className="text-[42px] font-bold tracking-tight leading-[1.1] mb-3">
            Create. Review.<br />
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">Launch.</span>
          </h1>
          <p className="text-[17px] text-white/50 leading-relaxed max-w-lg">
            AI-powered creative tools for your agency and clients. Generate scripts, visuals, and copy — then review, approve, and deploy across every platform.
          </p>

          {/* Status Pills — Frosted Glass */}
          <div className="flex items-center gap-2.5 mt-10 flex-wrap">
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] backdrop-blur-xl transition-all duration-300 group"
            >
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-sm font-medium text-white/80 group-hover:text-white">{statusCounts.pending} Pending Review</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] backdrop-blur-xl transition-all duration-300 group"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              <span className="text-sm font-medium text-white/80 group-hover:text-white">{statusCounts.approved} Approved</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] backdrop-blur-xl transition-all duration-300 group"
            >
              <Rocket className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm font-medium text-white/80 group-hover:text-white">{statusCounts.launched} Live</span>
            </button>
            {statusCounts.revisions > 0 && (
              <button
                onClick={() => onNavigate('approvals')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-orange-500/10 border border-orange-500/20 transition-all duration-300 group"
              >
                <RefreshCw className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-sm font-medium text-orange-300 group-hover:text-orange-200">{statusCounts.revisions} Revisions</span>
              </button>
            )}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full">
              <span className="text-sm text-white/25 font-medium">{statusCounts.all} Total</span>
            </div>
          </div>
        </div>

        {/* Decorative Elements — Refined */}
        <div className="absolute top-1/2 right-12 -translate-y-1/2 hidden lg:block">
          <div className="relative">
            <div className="w-48 h-48 rounded-[32px] bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-white/[0.06] backdrop-blur-xl flex items-center justify-center rotate-6">
              <div className="w-36 h-36 rounded-[24px] bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-white/[0.08] flex items-center justify-center -rotate-3">
                <Sparkles className="h-12 w-12 text-white/30" />
              </div>
            </div>
            <div className="absolute -top-8 -right-8 w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500/20 to-pink-500/20 border border-white/[0.06] flex items-center justify-center rotate-12">
              <Target className="h-6 w-6 text-white/20" />
            </div>
            <div className="absolute -bottom-6 -left-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-white/[0.06] flex items-center justify-center -rotate-12">
              <Headphones className="h-5 w-5 text-white/20" />
            </div>
          </div>
        </div>

        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-500/[0.07] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-blue-500/[0.05] rounded-full blur-[100px]" />
      </div>

      {/* Agency Workflow Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Creative Workflow</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Streamlined pipeline for agencies and clients</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('approvals')} className="gap-1.5 text-muted-foreground hover:text-foreground rounded-xl">
            View all creatives <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="relative">
          <div className="grid grid-cols-5 gap-3">
            {CREATIVE_WORKFLOWS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={step.step} className="relative group">
                  <div className="p-5 rounded-2xl border bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-sm text-center">
                    <div className={`h-11 w-11 rounded-2xl ${step.bg} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`h-5 w-5 ${step.color}`} />
                    </div>
                    <p className="text-sm font-semibold">{step.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                  </div>
                  {idx < CREATIVE_WORKFLOWS.length - 1 && (
                    <ChevronRight className="absolute top-1/2 -right-3 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 z-10 hidden sm:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Creative Tools — Featured */}
      <div>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">AI Creative Tools</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Generate production-ready creatives in minutes</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onNavigate(action.section)}
                className="group relative overflow-hidden rounded-2xl p-7 text-left transition-all duration-500 hover:shadow-2xl hover:shadow-black/5 hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-90 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className="relative z-10 text-white">
                  <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5 group-hover:scale-110 group-hover:bg-white/20 transition-all duration-500">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1.5 tracking-tight">{action.label}</h3>
                  <p className="text-[13px] text-white/60 leading-relaxed line-clamp-2">{action.description}</p>
                  <div className="flex items-center gap-1.5 mt-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-400">
                    <span className="text-xs font-medium text-white/80">Open tool</span>
                    <ArrowRight className="h-3.5 w-3.5 text-white/80" />
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.05] rounded-full blur-2xl group-hover:w-40 group-hover:h-40 transition-all duration-500" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform Intelligence */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Platform Intelligence</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Best practices, formats & trends for each ad platform</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 text-xs px-3 py-1 rounded-full">
            <TrendingUp className="h-3 w-3" />
            Updated weekly
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {PLATFORM_INTELLIGENCE.map(platform => {
            const Icon = platform.icon;
            return (
              <Card key={platform.platform} className={`overflow-hidden rounded-2xl border ${platform.borderColor} hover:shadow-lg hover:shadow-black/[0.03] transition-all duration-300 group`}>
                <CardContent className="p-0">
                  <div className={`p-5 ${platform.bg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-9 w-9 rounded-xl ${platform.bg} flex items-center justify-center`}>
                          <Icon className={`h-4.5 w-4.5 ${platform.color}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{platform.platform}</p>
                          <p className="text-[11px] text-muted-foreground">Avg CPM: {platform.avgCPM}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {platform.bestFormats.map(format => (
                        <Badge key={format} variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full bg-background/60 backdrop-blur-sm font-medium">
                          {format}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Top Creative Type</p>
                      <p className="text-sm font-medium">{platform.topCreativeType}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">What's Trending</p>
                      <p className="text-sm text-muted-foreground">{platform.trending}</p>
                    </div>
                    <div className={`p-3 rounded-xl ${platform.bg} border ${platform.borderColor}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <Lightbulb className="h-3 w-3" />
                        Pro Tip
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{platform.tip}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* All Tools Grid — Clean & Compact */}
      {TOOL_CATEGORIES.map(category => (
        <div key={category.title}>
          <h2 className="text-lg font-semibold tracking-tight mb-4">{category.title}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {category.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="group flex items-center gap-3.5 p-4 rounded-2xl border bg-card hover:bg-muted/40 hover:shadow-sm hover:border-border/80 transition-all duration-300 text-left active:scale-[0.98]"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/60 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-all duration-300">
                    <Icon className="h-[18px] w-[18px] text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
