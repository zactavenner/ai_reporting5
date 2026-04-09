import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '@/hooks/useClients';
import { useAllCreatives } from '@/hooks/useAllCreatives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  PenTool,
  Headphones,
  Camera,
  Target,
  Upload,
  LayoutGrid,
  Palette,
  BarChart3,
  Film,
  Image,
  Video,
  Wand2,
  User,
  Scissors,
  Radar,
  Instagram,
  Globe,
  History,
  Download,
  ChevronRight,
  Zap,
  Layers,
  Monitor,
  Eye,
  FileText,
  Trophy,
  ArrowRight,
  Loader2,
  Home,
  BookOpen,
} from 'lucide-react';

// Lazy load heavy sub-views
const AIScriptWriter = lazy(() => import('@/components/creative/AIScriptWriter').then(m => ({ default: m.AIScriptWriter })));
const PodcastAdsGenerator = lazy(() => import('@/components/creative/PodcastAdsGenerator').then(m => ({ default: m.PodcastAdsGenerator })));
const HyperRealisticAds = lazy(() => import('@/components/creative/HyperRealisticAds').then(m => ({ default: m.HyperRealisticAds })));
const DirectResponseToolkit = lazy(() => import('@/components/creative/DirectResponseToolkit').then(m => ({ default: m.DirectResponseToolkit })));
const CreativeAnalytics = lazy(() => import('@/components/creative/CreativeAnalytics').then(m => ({ default: m.CreativeAnalytics })));
const BrandKitManager = lazy(() => import('@/components/creative/BrandKitManager').then(m => ({ default: m.BrandKitManager })));
const TemplateLibrary = lazy(() => import('@/components/creative/TemplateLibrary').then(m => ({ default: m.TemplateLibrary })));

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── Sidebar Navigation Structure ───────────────────────────────────────────

const SIDEBAR_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { id: 'home', label: 'Creative Studio', icon: Home, color: 'text-violet-500' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, color: 'text-blue-500' },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { id: 'ai-scripts', label: 'Script Writer', icon: PenTool, color: 'text-violet-500' },
      { id: 'podcast-ads', label: 'Podcast Ads', icon: Headphones, color: 'text-orange-500' },
      { id: 'hyper-realistic', label: 'Hyper-Realistic', icon: Camera, color: 'text-cyan-500' },
      { id: 'direct-response', label: 'DR Toolkit', icon: Target, color: 'text-rose-500' },
    ],
  },
  {
    label: 'Create',
    items: [
      { id: 'templates', label: 'Templates', icon: BookOpen, color: 'text-emerald-500' },
      { id: 'static-ads', label: 'Static Ads', icon: Image, color: 'text-indigo-500', route: '/static-ads' },
      { id: 'batch-video', label: 'Batch Video', icon: Video, color: 'text-purple-500', route: '/batch-video' },
      { id: 'ad-variations', label: 'Variations', icon: Wand2, color: 'text-pink-500', route: '/ad-variations' },
      { id: 'avatars', label: 'AI Avatars', icon: User, color: 'text-sky-500', route: '/avatars' },
      { id: 'broll', label: 'B-Roll', icon: Film, color: 'text-teal-500', route: '/broll' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'approvals', label: 'Approvals', icon: Upload, color: 'text-amber-500' },
      { id: 'brand-kits', label: 'Brand Kits', icon: Palette, color: 'text-fuchsia-500' },
    ],
  },
  {
    label: 'Intel',
    items: [
      { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar, color: 'text-emerald-500', route: '/ad-scraping' },
      { id: 'ig-intel', label: 'Instagram Intel', icon: Instagram, color: 'text-pink-500', route: '/instagram-intel' },
    ],
  },
];

// ─── Main Hub Page ──────────────────────────────────────────────────────────

export default function CreativesHubPage() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const { data: allCreatives = [] } = useAllCreatives();
  const [activeSection, setActiveSection] = useState('home');
  const [selectedClient, setSelectedClient] = useState<string>('all');

  // Status counts for the hero
  const statusCounts = {
    all: allCreatives.length,
    pending: allCreatives.filter(c => c.status === 'pending').length,
    approved: allCreatives.filter(c => c.status === 'approved').length,
    launched: allCreatives.filter(c => c.status === 'launched').length,
    revisions: allCreatives.filter(c => c.status === 'revisions').length,
    rejected: allCreatives.filter(c => c.status === 'rejected').length,
  };

  const handleNavigate = (id: string) => {
    // Check if this item has a direct route
    const item = SIDEBAR_SECTIONS.flatMap(s => s.items).find(i => i.id === id);
    if (item && 'route' in item && item.route) {
      navigate(item.route as string);
      return;
    }
    setActiveSection(id);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ─── Apple-Style Sidebar ─────────────────────────────────────────── */}
      <aside className="w-[260px] border-r border-border/50 bg-card/50 backdrop-blur-xl flex-shrink-0 hidden lg:flex flex-col">
        {/* Logo / Title */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">Creative Studio</h1>
              <p className="text-[10px] text-muted-foreground/60 font-medium">AI-Powered Platform</p>
            </div>
          </div>
        </div>

        {/* Client Switcher */}
        <div className="px-4 pb-4">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="h-9 rounded-xl bg-muted/40 border-border/30 text-xs font-medium hover:bg-muted/60 transition-colors">
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

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3">
          <nav className="space-y-5 pb-6">
            {SIDEBAR_SECTIONS.map(section => (
              <div key={section.label}>
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map(item => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    const hasRoute = 'route' in item && item.route;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavigate(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all duration-200 group ${
                          isActive
                            ? 'bg-foreground/[0.06] text-foreground font-medium shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                        }`}
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? item.color : 'text-muted-foreground/60 group-hover:text-muted-foreground'}`} />
                        <span className="text-[13px] truncate">{item.label}</span>
                        {item.id === 'approvals' && statusCounts.pending > 0 && (
                          <span className="ml-auto text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md">
                            {statusCounts.pending}
                          </span>
                        )}
                        {hasRoute && (
                          <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Bottom branding */}
        <div className="px-5 py-4 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground/40 font-medium">Creative Studio v6.0</p>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 lg:px-10 lg:py-8">
          {/* Mobile nav bar */}
          <div className="lg:hidden mb-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-lg font-bold">Creative Studio</h1>
            </div>
            <ScrollArea className="w-full">
              <div className="flex gap-1.5 pb-2">
                {SIDEBAR_SECTIONS.flatMap(s => s.items).filter(i => !('route' in i && i.route)).map(item => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-foreground text-background'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Content sections */}
          <Suspense fallback={<SectionLoader />}>
            {activeSection === 'home' && (
              <HomeView
                statusCounts={statusCounts}
                onNavigate={handleNavigate}
                selectedClient={selectedClient}
                clients={clients}
              />
            )}
            {activeSection === 'ai-scripts' && <AIScriptWriter />}
            {activeSection === 'podcast-ads' && <PodcastAdsGenerator />}
            {activeSection === 'hyper-realistic' && <HyperRealisticAds />}
            {activeSection === 'direct-response' && <DirectResponseToolkit />}
            {activeSection === 'analytics' && <CreativeAnalytics embedded />}
            {activeSection === 'brand-kits' && <BrandKitManager clientId={selectedClient === 'all' ? undefined : selectedClient} />}
            {activeSection === 'templates' && <TemplateLibrary />}
            {activeSection === 'approvals' && <ApprovalsRedirect />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

// ─── Home View (Command Center) ─────────────────────────────────────────────

interface HomeViewProps {
  statusCounts: { all: number; pending: number; approved: number; launched: number; revisions: number; rejected: number };
  onNavigate: (section: string) => void;
  selectedClient: string;
  clients: any[];
}

const AI_TOOLS = [
  { id: 'ai-scripts', label: 'AI Script Writer', description: 'DR scripts from offers & angles', icon: PenTool, gradient: 'from-violet-500 to-purple-600', tag: 'Most Used' },
  { id: 'podcast-ads', label: 'Podcast Ads', description: 'Host-reads, interviews & audiograms', icon: Headphones, gradient: 'from-orange-500 to-amber-600', tag: 'New' },
  { id: 'hyper-realistic', label: 'Hyper-Realistic', description: 'Photorealistic AI ad visuals', icon: Camera, gradient: 'from-cyan-500 to-blue-600', tag: 'Popular' },
  { id: 'direct-response', label: 'DR Toolkit', description: 'Hooks, headlines, CTAs & copy', icon: Target, gradient: 'from-rose-500 to-pink-600', tag: 'Essential' },
];

const QUICK_CREATE = [
  { id: 'static-ads', label: 'Static Ads', icon: Image, description: 'Generate images' },
  { id: 'batch-video', label: 'Batch Video', icon: Film, description: 'Video at scale' },
  { id: 'ad-variations', label: 'Variations', icon: Wand2, description: 'A/B test ads' },
  { id: 'avatars', label: 'AI Avatars', icon: User, description: 'Digital presenters' },
  { id: 'broll', label: 'B-Roll', icon: Film, description: 'Stock footage' },
  { id: 'templates', label: 'Templates', icon: BookOpen, description: 'Start from template' },
];

const RESEARCH_TOOLS = [
  { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar, description: 'Spy on competitors' },
  { id: 'ig-intel', label: 'IG Intel', icon: Instagram, description: 'Content analysis' },
];

function HomeView({ statusCounts, onNavigate }: HomeViewProps) {
  return (
    <div className="space-y-10">
      {/* ─── Apple-Style Hero ─── */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1d1d1f] via-[#2d2d30] to-[#1d1d1f] p-10 md:p-12">
        <div className="relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3 leading-[1.1]">
            Create. Optimize.<br />
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Launch faster.
            </span>
          </h1>
          <p className="text-lg text-white/40 max-w-xl leading-relaxed">
            AI-powered creative tools for direct response ads.
            Scripts, visuals, podcasts, and performance copy — all in one studio.
          </p>

          {/* Status Pills */}
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

        {/* Decorative orbs */}
        <div className="absolute top-[-20%] right-[-5%] w-[500px] h-[500px] bg-gradient-to-br from-violet-500/15 via-blue-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-[-30%] left-[20%] w-[400px] h-[400px] bg-gradient-to-tr from-cyan-500/10 via-blue-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-10 right-10 w-32 h-32 border border-white/[0.04] rounded-full" />
        <div className="absolute top-5 right-5 w-44 h-44 border border-white/[0.03] rounded-full" />
      </div>

      {/* ─── AI Creative Tools Grid ─── */}
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

      {/* ─── Quick Workflow Actions ─── */}
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
          onClick={() => onNavigate('brand-kits')}
          className="group flex items-center gap-4 p-5 rounded-2xl bg-fuchsia-500/5 border border-fuchsia-500/15 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/25 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-fuchsia-500/15 flex items-center justify-center flex-shrink-0">
            <Palette className="h-5 w-5 text-fuchsia-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Brand Kits</p>
            <p className="text-xs text-muted-foreground mt-0.5">Manage brand assets & guidelines</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 ml-auto group-hover:text-fuchsia-500 group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={() => onNavigate('analytics')}
          className="group flex items-center gap-4 p-5 rounded-2xl bg-blue-500/5 border border-blue-500/15 hover:bg-blue-500/10 hover:border-blue-500/25 transition-all duration-300"
        >
          <div className="h-12 w-12 rounded-2xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Creative Analytics</p>
            <p className="text-xs text-muted-foreground mt-0.5">Performance insights & trends</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 ml-auto group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
        </button>
      </div>

      {/* ─── Create & Research Grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Create */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-muted-foreground">Quick Create</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {QUICK_CREATE.map(tool => {
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

        {/* Research & Intel */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-muted-foreground">Research & Intel</h2>
          </div>
          <div className="space-y-2.5">
            {RESEARCH_TOOLS.map(tool => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onNavigate(tool.id)}
                  className="group w-full flex items-center gap-3 p-4 rounded-2xl border bg-card hover:bg-muted/40 hover:shadow-sm hover:border-primary/20 transition-all duration-200 text-left active:scale-[0.98]"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/70 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors duration-200">
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors duration-200" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{tool.label}</p>
                    <p className="text-[11px] text-muted-foreground/70 truncate">{tool.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors" />
                </button>
              );
            })}
          </div>

          {/* DR Frameworks Quick Reference */}
          <div className="mt-6 p-5 rounded-2xl bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/10">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-violet-500" />
              <p className="text-sm font-semibold">DR Frameworks</p>
            </div>
            <div className="space-y-2">
              {[
                { abbr: 'PAS', name: 'Problem-Agitate-Solve' },
                { abbr: 'AIDA', name: 'Attention-Interest-Desire-Action' },
                { abbr: 'BAB', name: 'Before-After-Bridge' },
                { abbr: 'HSO', name: 'Hook-Story-Offer' },
                { abbr: 'FAB', name: 'Features-Advantages-Benefits' },
              ].map(fw => (
                <div key={fw.abbr} className="flex items-center gap-2.5">
                  <Badge variant="outline" className="text-[10px] font-bold rounded-md px-1.5 w-11 justify-center">
                    {fw.abbr}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{fw.name}</span>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-xs gap-1.5 rounded-xl text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
              onClick={() => onNavigate('ai-scripts')}
            >
              <PenTool className="h-3 w-3" />
              Generate Scripts with Frameworks
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Approvals Redirect (shows inline approval) ────────────────────────────

function ApprovalsRedirect() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1d1d1f] via-[#2a2a2e] to-[#1d1d1f] p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Upload className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Creative Approvals</h2>
              <p className="text-sm text-white/40">Review, approve, and manage creatives for your clients</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clients.map(client => (
          <button
            key={client.id}
            onClick={() => navigate(`/client/${client.id}/creatives`)}
            className="group flex items-center gap-4 p-5 rounded-2xl border bg-card hover:bg-muted/30 hover:border-primary/20 hover:shadow-md transition-all duration-200 text-left active:scale-[0.98]"
          >
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0 font-bold text-primary text-sm">
              {client.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{client.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">View & manage creatives</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>

      {clients.length === 0 && (
        <div className="text-center py-16">
          <Upload className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">No clients yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Add a client to start managing creatives</p>
        </div>
      )}
    </div>
  );
}
