import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  CircleDot,
  ArrowUpRight,
  LayoutGrid,
  Workflow,
  Send,
  Plus,
  Lightbulb,
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
  { id: 'ai-scripts', label: 'AI Script Writer', description: 'Generate DR scripts from offers & marketing angles', icon: PenTool, gradient: 'from-violet-500 to-purple-600', tag: 'Most Used', stat: 'Scripts' },
  { id: 'podcast-ads', label: 'Podcast Ads', description: 'Host-reads, interview clips & audio ads', icon: Headphones, gradient: 'from-orange-500 to-amber-600', tag: 'New', stat: 'Audio' },
  { id: 'hyper-realistic', label: 'Hyper-Realistic Visuals', description: 'Photorealistic AI imagery for ads', icon: Camera, gradient: 'from-cyan-500 to-blue-600', tag: 'Popular', stat: 'Visuals' },
  { id: 'direct-response', label: 'DR Toolkit', description: 'Hooks, headlines, CTAs & body copy', icon: Target, gradient: 'from-rose-500 to-pink-600', tag: 'Essential', stat: 'Copy' },
];

const QUICK_START_FLOWS = [
  { id: 'new-campaign', label: 'New Campaign', description: 'Brief → Script → Creative → Review → Launch', icon: Rocket, color: 'bg-violet-500', steps: ['Write Brief', 'Generate Script', 'Create Visuals', 'Client Review', 'Launch'] },
  { id: 'quick-ad', label: 'Quick Ad', description: 'Skip the brief — go straight to generating', icon: Zap, color: 'bg-amber-500', steps: ['Select Client', 'Pick Tool', 'Generate', 'Export'] },
  { id: 'batch-refresh', label: 'Batch Refresh', description: 'Refresh creatives for existing campaigns at scale', icon: Wand2, color: 'bg-cyan-500', steps: ['Select Campaign', 'Choose Variations', 'Generate Batch', 'Review'] },
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

  const approvalRate = statusCounts.all > 0 ? Math.round(((statusCounts.approved + statusCounts.launched) / statusCounts.all) * 100) : 0;

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1e] to-[#0d0d10] p-10 md:p-12">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20"><Sparkles className="h-5 w-5 text-white" /></div>
              <div><span className="text-sm font-semibold text-white/90 tracking-wide block">Creative Studio</span><span className="text-[11px] text-white/30">AI-Powered Creative Operations</span></div>
            </div>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-[200px] h-9 rounded-full bg-white/[0.06] border-white/[0.08] text-white text-sm hover:bg-white/[0.1] transition-colors backdrop-blur-sm"><SelectValue placeholder="All Clients" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Clients</SelectItem>{clients.map(client => (<SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3 leading-[1.08]">Create. Optimize.<br /><span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">Launch faster.</span></h1>
          <p className="text-base text-white/35 max-w-lg leading-relaxed">AI-powered creative tools for agencies and brands. Scripts, visuals, podcasts, and direct response &mdash; all in one studio.</p>
          <div className="mt-10 grid grid-cols-5 gap-0">
            {[
              { label: 'Draft', count: (statusCounts as any).draft || 0, color: 'bg-slate-400', active: false },
              { label: 'Pending', count: statusCounts.pending, color: 'bg-amber-400', active: statusCounts.pending > 0 },
              { label: 'Revisions', count: statusCounts.revisions, color: 'bg-orange-400', active: statusCounts.revisions > 0 },
              { label: 'Approved', count: statusCounts.approved, color: 'bg-green-400', active: false },
              { label: 'Launched', count: statusCounts.launched, color: 'bg-blue-400', active: false },
            ].map((stage, idx) => (
              <button key={stage.label} onClick={() => onNavigate('approvals')} className="group relative text-center py-3 transition-all duration-300">
                <div className="flex items-center justify-center gap-2 mb-2"><div className={`h-2.5 w-2.5 rounded-full ${stage.color} ${stage.active ? 'animate-pulse shadow-lg' : 'opacity-60'}`} />{idx < 4 && <div className="absolute top-[22px] left-[60%] w-[80%] h-px bg-white/[0.06]" />}</div>
                <p className="text-2xl font-bold text-white/90 group-hover:text-white transition-colors">{stage.count}</p>
                <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mt-0.5">{stage.label}</p>
              </button>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] backdrop-blur-sm border border-white/[0.06]"><TrendingUp className="h-3.5 w-3.5 text-green-400" /><span className="text-xs font-medium text-white/70">{approvalRate}% approval rate</span></div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] backdrop-blur-sm border border-white/[0.06]"><BarChart3 className="h-3.5 w-3.5 text-blue-400" /><span className="text-xs font-medium text-white/70">{statusCounts.all} total creatives</span></div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] backdrop-blur-sm border border-white/[0.06]"><UsersIcon className="h-3.5 w-3.5 text-violet-400" /><span className="text-xs font-medium text-white/70">{clients.length} active clients</span></div>
          </div>
        </div>
        <div className="absolute top-[-20%] right-[-5%] w-[600px] h-[600px] bg-gradient-to-br from-violet-500/12 via-blue-500/8 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-[-30%] left-[15%] w-[500px] h-[500px] bg-gradient-to-tr from-cyan-500/8 via-blue-500/4 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-10 right-10 w-32 h-32 border border-white/[0.03] rounded-full" />
        <div className="absolute top-5 right-5 w-48 h-48 border border-white/[0.02] rounded-full" />
      </div>

      <div>
        <div className="flex items-center gap-2.5 mb-5"><div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center"><Workflow className="h-4 w-4 text-amber-500" /></div><h2 className="text-xl font-semibold tracking-tight">Quick Start</h2><span className="text-xs text-muted-foreground/50 ml-1">Choose your workflow</span></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {QUICK_START_FLOWS.map(flow => { const Icon = flow.icon; return (
            <button key={flow.id} onClick={() => { if (flow.id === 'new-campaign') onNavigate('briefs'); else if (flow.id === 'quick-ad') onNavigate('ai-scripts'); else onNavigate('batch-video'); }} className="group relative p-6 rounded-2xl border bg-card hover:bg-muted/30 hover:shadow-lg hover:border-primary/15 transition-all duration-300 text-left active:scale-[0.98]">
              <div className="flex items-start justify-between mb-4"><div className={`h-11 w-11 rounded-2xl ${flow.color}/15 flex items-center justify-center`}><Icon className={`h-5 w-5 ${flow.color.replace('bg-', 'text-')}`} /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" /></div>
              <h3 className="text-sm font-semibold mb-1">{flow.label}</h3>
              <p className="text-xs text-muted-foreground/60 leading-relaxed mb-4">{flow.description}</p>
              <div className="flex items-center gap-1.5">{flow.steps.map((step, idx) => (<div key={step} className="flex items-center gap-1.5"><span className="text-[9px] font-medium text-muted-foreground/40 uppercase tracking-wider">{step}</span>{idx < flow.steps.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/20" />}</div>))}</div>
            </button>); })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-2.5"><div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center"><Zap className="h-4 w-4 text-violet-500" /></div><h2 className="text-xl font-semibold tracking-tight">AI Creative Tools</h2></div><Badge variant="outline" className="text-xs font-medium gap-1 px-3 py-1 rounded-full"><Sparkles className="h-3 w-3" /> Powered by AI</Badge></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AI_TOOLS.map(tool => { const Icon = tool.icon; return (
            <button key={tool.id} onClick={() => onNavigate(tool.id)} className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-2xl hover:shadow-black/10 hover:scale-[1.02] active:scale-[0.98]">
              <div className={`absolute inset-0 bg-gradient-to-br ${tool.gradient} opacity-[0.92]`} /><div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
              <div className="relative z-10 text-white">
                <div className="flex items-center justify-between mb-5"><div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300"><Icon className="h-6 w-6" /></div><Badge className="bg-white/20 text-white border-0 text-[10px] font-semibold backdrop-blur-sm">{tool.tag}</Badge></div>
                <h3 className="text-lg font-semibold mb-1.5">{tool.label}</h3><p className="text-sm text-white/60 leading-relaxed">{tool.description}</p>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-medium text-white/80 group-hover:text-white transition-colors"><span>Open tool</span><ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" /></div>
              </div>
            </button>); })}
        </div>
      </div>

      {(statusCounts.pending > 0 || statusCounts.revisions > 0) && (
        <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-r from-amber-500/[0.03] to-transparent p-6">
          <div className="flex items-center gap-2.5 mb-4"><div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center"><Clock className="h-4 w-4 text-amber-500" /></div><h2 className="text-base font-semibold">Needs Attention</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {statusCounts.pending > 0 && (<button onClick={() => onNavigate('approvals')} className="group flex items-center gap-4 p-4 rounded-xl bg-background border border-amber-500/10 hover:border-amber-500/25 hover:shadow-md transition-all duration-300"><div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0"><Upload className="h-5 w-5 text-amber-600" /></div><div className="text-left flex-1"><p className="text-sm font-semibold">{statusCounts.pending} Pending Review</p><p className="text-[11px] text-muted-foreground/60">Creatives awaiting client approval</p></div><ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" /></button>)}
            {statusCounts.revisions > 0 && (<button onClick={() => onNavigate('approvals')} className="group flex items-center gap-4 p-4 rounded-xl bg-background border border-orange-500/10 hover:border-orange-500/25 hover:shadow-md transition-all duration-300"><div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0"><Eye className="h-5 w-5 text-orange-600" /></div><div className="text-left flex-1"><p className="text-sm font-semibold">{statusCounts.revisions} Need Revisions</p><p className="text-[11px] text-muted-foreground/60">Client feedback to address</p></div><ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" /></button>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4"><Layers className="h-4 w-4 text-muted-foreground" /><h2 className="text-base font-semibold text-muted-foreground">Create</h2></div>
          <div className="grid grid-cols-2 gap-2.5">
            {CREATE_TOOLS.map(tool => { const Icon = tool.icon; return (<button key={tool.id} onClick={() => onNavigate(tool.id)} className="group flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted/40 hover:shadow-sm hover:border-primary/20 transition-all duration-200 text-left active:scale-[0.98]"><div className="h-10 w-10 rounded-xl bg-muted/70 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200"><Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" /></div><div className="min-w-0"><p className="text-sm font-medium truncate">{tool.label}</p><p className="text-[11px] text-muted-foreground/70 truncate">{tool.description}</p></div></button>); })}
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4"><Eye className="h-4 w-4 text-muted-foreground" /><h2 className="text-base font-semibold text-muted-foreground">Research & Insights</h2></div>
            <div className="grid grid-cols-2 gap-2.5">
              {RESEARCH_TOOLS.map(tool => { const Icon = tool.icon; return (<button key={tool.id} onClick={() => onNavigate(tool.id)} className="group flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted/40 hover:shadow-sm hover:border-primary/20 transition-all duration-200 text-left active:scale-[0.98]"><div className="h-10 w-10 rounded-xl bg-muted/70 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200"><Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" /></div><div className="min-w-0"><p className="text-sm font-medium truncate">{tool.label}</p><p className="text-[11px] text-muted-foreground/70 truncate">{tool.description}</p></div></button>); })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4"><Monitor className="h-4 w-4 text-muted-foreground" /><h2 className="text-base font-semibold text-muted-foreground">Manage</h2></div>
            <div className="flex flex-wrap gap-2">
              {MANAGE_TOOLS.map(tool => { const Icon = tool.icon; return (<button key={tool.id} onClick={() => onNavigate(tool.id)} className="group flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card hover:bg-muted/40 hover:border-primary/20 transition-all duration-200 active:scale-[0.98]"><Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-200" /><span className="text-sm font-medium">{tool.label}</span></button>); })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-muted/20 p-6">
        <div className="flex items-center gap-2.5 mb-4"><Lightbulb className="h-5 w-5 text-amber-500" /><h2 className="text-base font-semibold">Quick Tips</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background/60 border border-border/30"><div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Target className="h-4 w-4 text-blue-500" /></div><div><p className="text-xs font-semibold mb-0.5">Hook-First Strategy</p><p className="text-[11px] text-muted-foreground/60 leading-relaxed">The hook determines 80% of ad performance. Test 5+ hooks per winning body copy before scaling.</p></div></div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background/60 border border-border/30"><div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"><TrendingUp className="h-4 w-4 text-green-500" /></div><div><p className="text-xs font-semibold mb-0.5">UGC Outperforms 2:1</p><p className="text-[11px] text-muted-foreground/60 leading-relaxed">Native UGC-style content consistently beats polished ads on Meta and TikTok. Use AI avatars for scale.</p></div></div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background/60 border border-border/30"><div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Headphones className="h-4 w-4 text-violet-500" /></div><div><p className="text-xs font-semibold mb-0.5">Podcast Ads Rising</p><p className="text-[11px] text-muted-foreground/60 leading-relaxed">Podcast-style video clips are the #1 rising ad format. Host-read authenticity builds trust and converts.</p></div></div>
        </div>
      </div>
    </div>
  );
}

function UsersIcon(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
