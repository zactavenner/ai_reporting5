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
  { id: 'ai-scripts', label: 'AI Script Writer', description: 'Scripts from offers & angles', icon: PenTool, gradient: 'from-violet-500 to-purple-600', section: 'ai-scripts' },
  { id: 'podcast-ads', label: 'Podcast Ads', description: 'Host-reads & audio ads', icon: Headphones, gradient: 'from-orange-500 to-amber-600', section: 'podcast-ads' },
  { id: 'hyper-realistic', label: 'Hyper-Realistic', description: 'Photorealistic AI visuals', icon: Camera, gradient: 'from-cyan-500 to-blue-600', section: 'hyper-realistic' },
  { id: 'direct-response', label: 'DR Toolkit', description: 'Hooks, CTAs & copy tools', icon: Target, gradient: 'from-rose-500 to-pink-600', section: 'direct-response' },
];

const TOOL_CATEGORIES = [
  {
    title: 'Create',
    items: [
      { id: 'briefs', label: 'Briefs & Scripts', icon: FileText, badge: null },
      { id: 'static-ads', label: 'Static Ads', icon: Image, badge: null },
      { id: 'batch-video', label: 'Batch Video', icon: Film, badge: null },
      { id: 'ad-variations', label: 'Ad Variations', icon: Wand2, badge: null },
      { id: 'avatars', label: 'AI Avatars', icon: User, badge: null },
      { id: 'broll', label: 'B-Roll', icon: Film, badge: null },
      { id: 'video-editor', label: 'Video Editor', icon: Scissors, badge: null },
    ],
  },
  {
    title: 'Research',
    items: [
      { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar, badge: null },
      { id: 'instagram-intel', label: 'IG Intel', icon: Instagram, badge: null },
      { id: 'winning-ads', label: 'Winning Ads', icon: Trophy, badge: null },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'manage-styles', label: 'Styles', icon: Palette, badge: null },
      { id: 'calendar', label: 'Calendar', icon: Calendar, badge: null },
      { id: 'history', label: 'History', icon: History, badge: null },
      { id: 'export', label: 'Export', icon: Download, badge: null },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, badge: null },
    ],
  },
];

export function CreativeCommandCenter({ onNavigate, statusCounts }: CommandCenterProps) {
  return (
    <div className="space-y-10">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-10 text-white">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-violet-400" />
            <span className="text-sm font-medium text-violet-400 tracking-wide uppercase">Creative Studio</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Command Center
          </h1>
          <p className="text-lg text-white/60 max-w-xl">
            Create, manage, and optimize AI-powered creatives for your clients. From scripts to hyper-realistic visuals — everything in one place.
          </p>

          {/* Status Pills */}
          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-sm transition-all duration-200"
            >
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium">{statusCounts.pending} Pending</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-sm transition-all duration-200"
            >
              <Check className="h-4 w-4 text-green-400" />
              <span className="text-sm font-medium">{statusCounts.approved} Approved</span>
            </button>
            <button
              onClick={() => onNavigate('approvals')}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-sm transition-all duration-200"
            >
              <Rocket className="h-4 w-4 text-blue-400" />
              <span className="text-sm font-medium">{statusCounts.launched} Launched</span>
            </button>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5">
              <span className="text-sm text-white/40">{statusCounts.all} Total</span>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-32 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -top-10 -right-10 w-40 h-40 border border-white/5 rounded-full" />
        <div className="absolute -top-20 -right-20 w-60 h-60 border border-white/5 rounded-full" />
      </div>

      {/* AI Quick Actions — Featured Tools */}
      <div>
        <div className="flex items-center gap-2 mb-5">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">AI Creative Tools</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => onNavigate(action.section)}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-300 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-90`} />
                <div className="relative z-10 text-white">
                  <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{action.label}</h3>
                  <p className="text-sm text-white/70">{action.description}</p>
                  <ArrowRight className="h-5 w-5 mt-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* All Tools Grid */}
      {TOOL_CATEGORIES.map(category => (
        <div key={category.title}>
          <h2 className="text-lg font-semibold tracking-tight mb-4 text-muted-foreground">{category.title}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {category.items.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="group flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted/50 hover:shadow-sm transition-all duration-200 text-left active:scale-[0.98]"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
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
