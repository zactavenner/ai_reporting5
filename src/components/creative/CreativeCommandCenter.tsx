import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ChevronRight,
  Star,
  Layers,
  Monitor,
} from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useAllCreatives } from '@/hooks/useAllCreatives';

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

const AI_TOOLS = [
  {
    id: 'ai-scripts',
    label: 'AI Script Writer',
    description: 'Generate DR scripts from offers & marketing angles',
    icon: PenTool,
    gradient: 'from-violet-500 to-purple-600',
    tag: 'Most Used',
  },
  {
    id: 'podcast-ads',
    label: 'Podcast Ads',
    description: 'Host-reads, interview clips & audio ads',
    icon: Headphones,
    gradient: 'from-orange-500 to-amber-600',
    tag: 'New',
  },
  {
    id: 'hyper-realistic',
    label: 'Hyper-Realistic Visuals',
    description: 'Photorealistic AI imagery for ads',
    icon: Camera,
    gradient: 'from-cyan-500 to-blue-600',
    tag: 'Popular',
  },
  {
    id: 'direct-response',
    label: 'DR Toolkit',
    description: 'Hooks, headlines, CTAs & body copy',
    icon: Target,
    gradient: 'from-rose-500 to-pink-600',
    tag: 'Essential',
  },
];

const CREATE_TOOLS = [
  { id: 'briefs', label: 'Briefs & Scripts', icon: FileText, description: 'Creative briefs' },
  { id: 'static-ads', label: 'Static Ads', icon: Image, description: 'Generate images' },
  { id: 'batch-video', label: 'Batch Video', icon: Film, description: 'Video at scale' },
  { id: 'ad-variations', label: 'Variations', icon: Wand2, description: 'A/B test ads' },
  { id: 'avatars', label: 'AI Avatars', icon: User, description: 'Digital presenters' },
  { id: 'broll', label: 'B-Roll', icon: Film, description: 'Stock footage' },
  { id: 'video-editor', label: 'Video Editor', icon: Scissors, description: 'Edit & trim' },
];

const RESEARCH_TOOLS = [
  { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar, description: 'Spy on competitors' },
  { id: 'instagram-intel', label: 'IG Intel', icon: Instagram, description: 'Content analysis' },
  { id: 'winning-ads', label: 'Winning Ads', icon: Trophy, description: 'Top performers' },
  { id: 'platform-intel', label: 'Platform Intel', icon: Globe, description: 'Best practices' },
];

const MANAGE_TOOLS = [
  { id: 'manage-styles', label: 'Styles', icon: Palette },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'history', label: 'History', icon: History },
  { id: 'export', label: 'Export', icon: Download },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export function CreativeCommandCenter({ onNavigate, statusCounts }: CommandCenterProps) {
  const { data: clients = [] } = useClients();
  const [selectedClient, setSelectedClient] = useState<string>('all');

  return (
    <div className="space-y-10">
      {/* Apple-Style Hero */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1d1d1f] via-[#2d2d30] to-[#1d1d1f] p-10 md:p-12">
        <div className="relative z-10">
          {/* Top Row: Badge + Client Switcher */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-white/80 tracking-wide">Creative Studio</span>
            </div>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-[200px] h-9 rounded-full bg-white/10 border-white/10 text-white text-sm hover:bg-white/15 transition-colors">
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

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3 leading-[1.1]">
            Create. Optimize.<br />
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Launch faster.
            </span>
          </h1>
          <p className="text-lg text-white/40 max-w-xl leading-relaxed">
            AI-powered creative tools for agencies and brands.
            Scripts, visuals, podcasts, and direct response — all in one studio.
          </p>

          {/* Status Pills — Apple-style frosted glass */}
          <div className="flex items-center gap-3 mt-10 flex-wrap">
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] backdrop-blur-xl border border-white/[0.08] transition-all duration-300 group"
            >
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-sm font-medium text-white/90">{statusCounts.pending} Pending Review</span>
              <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] backdrop-blur-xl border border-white/[0.08] transition-all duration-300"
            >
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-white/90">{statusCounts.approved} Approved</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] backdrop-blur-xl border border-white/[0.08] transition-all duration-300"
            >
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-sm font-medium text-white/90">{statusCounts.launched} Launched</span>
            </button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full">
              <span className="text-sm text-white/25">{statusCounts.all} total creatives</span>
            </div>
          </div>
        </div>

        {/* Decorative - Subtle Apple-style gradient orbs */}
        <div className="absolute top-[-20%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-violet-500/15 via-blue-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-[-30%] left-[20%] w-[400px] h-[400px] bg-gradient-to-tr from-cyan-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-10 right-10 w-32 h-32 border border-white/[0.04] rounded-full" />
        <div className="absolute top-5 right-5 w-44 h-44 border border-white/[0.03] rounded-full" />
      </div>

      {/* AI Creative Tools — Prominent Cards */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
              <Zap className="h-4 w-4 text-violet-500" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">AI Creative Tools</h2>
          </div>
          <Badge variant="outline" className="text-xs font-medium gap-1 px-3 py-1 rounded-full">
            <Sparkles className="h-3 w-3" /> Powered by AI
          </Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AI_TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.id)}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-black/10 hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-[0.92]`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                <div className="relative z-10 text-white">
                  <div className="flex items-center justify-between mb-5">
                    <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge className="bg-white/20 text-white border-0 text-[10px] font-semibold backdrop-blur-sm">
                      {tool.tag}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-semibold mb-1.5">{tool.label}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{tool.description}</p>
                  <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                    <span>Open tool</span>
                    <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Workflow Actions — Agency-focused */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('approvals')}
          className="group flex items-center gap-4 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/15 hover:bg-amber-500/10 hover:border-amber-500/25 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <Upload className="h-5 w-5 text-amber-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Review & Approve</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {statusCounts.pending > 0 ? `${statusCounts.pending} creatives awaiting approval` : 'All caught up'}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 ml-auto group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('ai-scripts')}
          className="group flex items-center gap-4 p-5 rounded-2xl bg-violet-500/5 border border-violet-500/15 hover:bg-violet-500/10 hover:border-violet-500/25 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <PenTool className="h-5 w-5 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Quick Script</p>
            <p className="text-xs text-muted-foreground mt-0.5">Generate a new ad script in seconds</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 ml-auto group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('platform-intel')}
          className="group flex items-center gap-4 p-5 rounded-2xl bg-blue-500/5 border border-blue-500/15 hover:bg-blue-500/10 hover:border-blue-500/25 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <Globe className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Platform Intel</p>
            <p className="text-xs text-muted-foreground mt-0.5">What's working across Meta, TikTok, YouTube</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 ml-auto group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>

      {/* Create & Research Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Tools */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-muted-foreground">Create</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {CREATE_TOOLS.map(tool => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigate(tool.id)}
                  className="group flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted/40 hover:shadow-sm hover:border-primary/20 transition-all duration-200 text-left active:scale-[0.98]"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/70 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tool.label}</p>
                    <p className="text-[11px] text-muted-foreground/70 truncate">{tool.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Research & Manage */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-muted-foreground">Research & Insights</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {RESEARCH_TOOLS.map(tool => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => onNavigate(tool.id)}
                    className="group flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted/40 hover:shadow-sm hover:border-primary/20 transition-all duration-200 text-left active:scale-[0.98]"
                  >
                    <div className="h-10 w-10 rounded-xl bg-muted/70 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                      <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tool.label}</p>
                      <p className="text-[11px] text-muted-foreground/70 truncate">{tool.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-muted-foreground">Manage</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {MANAGE_TOOLS.map(tool => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => onNavigate(tool.id)}
                    className="group flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card hover:bg-muted/40 hover:border-primary/20 transition-all duration-200 active:scale-[0.98]"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
                    <span className="text-sm font-medium">{tool.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
