import { useState, lazy, Suspense } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { useAllCreatives } from '@/hooks/useAllCreatives';
import { useClients, Client } from '@/hooks/useClients';
import { Creative, useUpdateCreativeStatus, useDeleteCreative, useCreateCreative, uploadCreativeFile, detectAspectRatio } from '@/hooks/useCreatives';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreativeHorizontalPreview } from './CreativeHorizontalPreview';
import { CreativeAIActions } from './CreativeAIActions';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import {
  Search,
  Image,
  Video,
  FileText,
  Upload,
  Clock,
  Check,
  X,
  Rocket,
  RefreshCw,
  MessageSquare,
  Trash2,
  Eye,
  Sparkles,
  CheckSquare,
  Download,
  Film,
  Wand2,
  User,
  Radar,
  Instagram,
  Scissors,
  History,
  Plus,
  Calendar,
  BarChart3,
  Trophy,
  Palette,
  Headphones,
  Camera,
  Target,
  PenTool,
  LayoutDashboard,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Lazy-load sub-section page components
const CreativeBriefs = lazy(() => import('@/pages/CreativeBriefs'));
const StaticCreativesPage = lazy(() => import('@/pages/StaticCreativesPage'));
const BatchVideoWorkflow = lazy(() => import('@/components/batch-video/BatchVideoWorkflow').then(m => ({ default: m.BatchVideoWorkflow })));
const AdVariationsPage = lazy(() => import('@/pages/AdVariationsPage'));
const AvatarsPage = lazy(() => import('@/pages/AvatarsPage'));
const AdScrapingPage = lazy(() => import('@/pages/AdScrapingPage'));
const InstagramIntelPage = lazy(() => import('@/pages/InstagramIntelPage'));
const VideoEditorPage = lazy(() => import('@/pages/VideoEditorPage'));
const BrollPage = lazy(() => import('@/pages/BrollPage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const ExportHubPage = lazy(() => import('@/pages/ExportHubPage'));
const CreativeCalendarLazy = lazy(() => import('@/components/creative/CreativeCalendar').then(m => ({ default: m.CreativeCalendar })));
const CreativeAnalyticsLazy = lazy(() => import('@/components/creative/CreativeAnalytics').then(m => ({ default: m.CreativeAnalytics })));
const WinningAdsGalleryLazy = lazy(() => import('@/components/creative/WinningAdsGallery').then(m => ({ default: m.WinningAdsGallery })));
const ManageStylesTabLazy = lazy(() => import('@/components/creative/ManageStylesTab').then(m => ({ default: m.ManageStylesTab })));

// New AI Tools
const CreativeCommandCenter = lazy(() => import('@/components/creative/CreativeCommandCenter').then(m => ({ default: m.CreativeCommandCenter })));
const AIScriptWriter = lazy(() => import('@/components/creative/AIScriptWriter').then(m => ({ default: m.AIScriptWriter })));
const PodcastAdsGenerator = lazy(() => import('@/components/creative/PodcastAdsGenerator').then(m => ({ default: m.PodcastAdsGenerator })));
const HyperRealisticAds = lazy(() => import('@/components/creative/HyperRealisticAds').then(m => ({ default: m.HyperRealisticAds })));
const DirectResponseToolkit = lazy(() => import('@/components/creative/DirectResponseToolkit').then(m => ({ default: m.DirectResponseToolkit })));

interface CreativeWithClient extends Creative {
  clientName?: string;
}

// Sidebar navigation structure — Apple-style grouped sections
const NAV_SECTIONS = [
  {
    title: '',
    items: [
      { id: 'command-center', label: 'Command Center', icon: LayoutDashboard },
    ],
  },
  {
    title: 'AI Tools',
    items: [
      { id: 'ai-scripts', label: 'Script Writer', icon: PenTool, isNew: true },
      { id: 'podcast-ads', label: 'Podcast Ads', icon: Headphones, isNew: true },
      { id: 'hyper-realistic', label: 'Hyper-Realistic', icon: Camera, isNew: true },
      { id: 'direct-response', label: 'DR Toolkit', icon: Target, isNew: true },
    ],
  },
  {
    title: 'Create',
    items: [
      { id: 'approvals', label: 'Approvals', icon: Upload, showBadge: true },
      { id: 'briefs', label: 'Briefs & Scripts', icon: FileText },
      { id: 'static-ads', label: 'Static Ads', icon: Image },
      { id: 'batch-video', label: 'Batch Video', icon: Film },
      { id: 'ad-variations', label: 'Ad Variations', icon: Wand2 },
      { id: 'avatars', label: 'Avatars', icon: User },
      { id: 'broll', label: 'B-Roll', icon: Film },
      { id: 'video-editor', label: 'Video Editor', icon: Scissors },
    ],
  },
  {
    title: 'Research',
    items: [
      { id: 'ad-scraping', label: 'Ad Scraping', icon: Radar },
      { id: 'instagram-intel', label: 'IG Intel', icon: Instagram },
      { id: 'winning-ads', label: 'Winning Ads', icon: Trophy },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'manage-styles', label: 'Styles', icon: Palette },
      { id: 'calendar', label: 'Calendar', icon: Calendar },
      { id: 'history', label: 'History', icon: History },
      { id: 'export', label: 'Export', icon: Download },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

export function CreativesTab() {
  const [activeSection, setActiveSection] = useState('command-center');
  const { data: creatives = [], isLoading: creativesLoading } = useAllCreatives();
  const { data: clients = [] } = useClients();
  const updateStatus = useUpdateCreativeStatus();
  const deleteCreative = useDeleteCreative();

  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCreative, setSelectedCreative] = useState<CreativeWithClient | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Map client names to creatives
  const clientMap = clients.reduce((acc, client) => {
    acc[client.id] = client.name;
    return acc;
  }, {} as Record<string, string>);

  const creativesWithClients: CreativeWithClient[] = creatives.map(c => ({
    ...c,
    clientName: clientMap[c.client_id] || 'Unknown Client',
  }));

  // Filter creatives
  const filteredCreatives = creativesWithClients.filter((creative) => {
    const matchesSearch =
      creative.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      creative.clientName?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClient = clientFilter === 'all' || creative.client_id === clientFilter;
    const matchesStatus = statusFilter === 'all' || creative.status === statusFilter;
    return matchesSearch && matchesClient && matchesStatus;
  });

  // Group by status for activity feed
  const recentActivity = creativesWithClients
    .slice(0, 20)
    .map(c => ({
      ...c,
      activityType: c.status === 'pending' ? 'uploaded' : c.status,
    }));

  const statusCounts = {
    all: creativesWithClients.length,
    draft: creativesWithClients.filter(c => c.status === 'draft').length,
    pending: creativesWithClients.filter(c => c.status === 'pending').length,
    approved: creativesWithClients.filter(c => c.status === 'approved').length,
    launched: creativesWithClients.filter(c => c.status === 'launched').length,
    revisions: creativesWithClients.filter(c => c.status === 'revisions').length,
    rejected: creativesWithClients.filter(c => c.status === 'rejected').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400';
      case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'launched': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'revisions': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'approved': return <Check className="h-4 w-4" />;
      case 'launched': return <Rocket className="h-4 w-4" />;
      case 'revisions': return <RefreshCw className="h-4 w-4" />;
      case 'rejected': return <X className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'copy': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const handleStatusChange = (creative: CreativeWithClient, status: 'approved' | 'revisions' | 'rejected' | 'launched') => {
    updateStatus.mutate({
      id: creative.id,
      status,
      clientId: creative.client_id,
      creativeTitle: creative.title
    });
  };

  const handleDelete = (creative: CreativeWithClient) => {
    if (confirm('Are you sure you want to delete this creative?')) {
      deleteCreative.mutate({ id: creative.id, clientId: creative.client_id });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCreatives.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCreatives.map(c => c.id)));
    }
  };

  const handleBulkAction = (status: 'approved' | 'rejected') => {
    const selected = filteredCreatives.filter(c => selectedIds.has(c.id));
    selected.forEach(creative => {
      updateStatus.mutate({
        id: creative.id,
        status,
        clientId: creative.client_id,
        creativeTitle: creative.title,
      });
    });
    toast.success(`${selected.length} creative(s) ${status}`);
    setSelectedIds(new Set());
  };

  if (creativesLoading) {
    return <CashBagLoader message="Loading creatives..." />;
  }

  const pendingCount = statusCounts.pending;
  const SuspenseFallback = <CashBagLoader message="Loading section..." />;

  const renderContent = () => {
    switch (activeSection) {
      case 'command-center':
        return (
          <Suspense fallback={SuspenseFallback}>
            <CreativeCommandCenter onNavigate={setActiveSection} statusCounts={statusCounts} />
          </Suspense>
        );
      case 'ai-scripts':
        return <Suspense fallback={SuspenseFallback}><AIScriptWriter /></Suspense>;
      case 'podcast-ads':
        return <Suspense fallback={SuspenseFallback}><PodcastAdsGenerator /></Suspense>;
      case 'hyper-realistic':
        return <Suspense fallback={SuspenseFallback}><HyperRealisticAds /></Suspense>;
      case 'direct-response':
        return <Suspense fallback={SuspenseFallback}><DirectResponseToolkit /></Suspense>;
      case 'approvals':
        return renderApprovalsSection();
      case 'briefs':
        return <Suspense fallback={SuspenseFallback}><CreativeBriefs /></Suspense>;
      case 'static-ads':
        return <Suspense fallback={SuspenseFallback}><StaticCreativesPage /></Suspense>;
      case 'batch-video':
        return <Suspense fallback={SuspenseFallback}><BatchVideoWorkflow /></Suspense>;
      case 'ad-variations':
        return <Suspense fallback={SuspenseFallback}><AdVariationsPage /></Suspense>;
      case 'avatars':
        return <Suspense fallback={SuspenseFallback}><AvatarsPage /></Suspense>;
      case 'ad-scraping':
        return <Suspense fallback={SuspenseFallback}><AdScrapingPage /></Suspense>;
      case 'instagram-intel':
        return <Suspense fallback={SuspenseFallback}><InstagramIntelPage /></Suspense>;
      case 'video-editor':
        return <Suspense fallback={SuspenseFallback}><VideoEditorPage /></Suspense>;
      case 'broll':
        return <Suspense fallback={SuspenseFallback}><BrollPage /></Suspense>;
      case 'winning-ads':
        return <Suspense fallback={SuspenseFallback}><WinningAdsGalleryLazy embedded /></Suspense>;
      case 'manage-styles':
        return <Suspense fallback={SuspenseFallback}><ManageStylesTabLazy embedded /></Suspense>;
      case 'history':
        return <Suspense fallback={SuspenseFallback}><HistoryPage /></Suspense>;
      case 'export':
        return <Suspense fallback={SuspenseFallback}><ExportHubPage /></Suspense>;
      case 'calendar':
        return <Suspense fallback={SuspenseFallback}><CreativeCalendarLazy embedded /></Suspense>;
      case 'analytics':
        return <Suspense fallback={SuspenseFallback}><CreativeAnalyticsLazy embedded /></Suspense>;
      default:
        return null;
    }
  };

  const renderApprovalsSection = () => (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search creatives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px] h-11 rounded-xl">
            <SelectValue placeholder="Filter by client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] h-11 rounded-xl">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="launched">Launched</SelectItem>
            <SelectItem value="revisions">Revisions</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl backdrop-blur-sm">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" variant="default" onClick={() => handleBulkAction('approved')} className="rounded-lg">
            <Check className="h-3 w-3 mr-1" />
            Approve All
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleBulkAction('rejected')} className="rounded-lg">
            <X className="h-3 w-3 mr-1" />
            Reject All
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="rounded-lg">
            Clear
          </Button>
        </div>
      )}

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Total', count: statusCounts.all, bg: 'bg-muted/50', color: '' },
          { label: 'Pending', count: statusCounts.pending, bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600' },
          { label: 'Approved', count: statusCounts.approved, bg: 'bg-green-50 dark:bg-green-900/20', color: 'text-green-600' },
          { label: 'Launched', count: statusCounts.launched, bg: 'bg-blue-50 dark:bg-blue-900/20', color: 'text-blue-600' },
          { label: 'Revisions', count: statusCounts.revisions, bg: 'bg-orange-50 dark:bg-orange-900/20', color: 'text-orange-600' },
          { label: 'Rejected', count: statusCounts.rejected, bg: 'bg-red-50 dark:bg-red-900/20', color: 'text-red-600' },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Creatives Grid */}
      {filteredCreatives.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            checked={selectedIds.size === filteredCreatives.length && filteredCreatives.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm text-muted-foreground">Select all</span>
        </div>
      )}

      {filteredCreatives.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">No creatives found</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Upload creatives from individual client dashboards
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCreatives.map((creative) => (
            <Card key={creative.id} className="overflow-hidden rounded-2xl hover:shadow-lg hover:border-primary/30 transition-all duration-300 relative group">
              {/* Checkbox overlay */}
              <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(creative.id)}
                  onCheckedChange={() => toggleSelect(creative.id)}
                />
              </div>
              <div className="aspect-video bg-muted relative overflow-hidden">
                {creative.type === 'image' && creative.file_url ? (
                  <img
                    src={creative.file_url}
                    alt={creative.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : creative.type === 'video' && creative.file_url ? (
                  <video
                    src={creative.file_url}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {getTypeIcon(creative.type)}
                    <span className="ml-2 text-sm text-muted-foreground capitalize">{creative.type}</span>
                  </div>
                )}
                <Badge className={`absolute top-3 right-3 ${getStatusColor(creative.status)} rounded-lg`}>
                  {getStatusIcon(creative.status)}
                  <span className="ml-1 capitalize">{creative.status}</span>
                </Badge>
                {creative.source === 'ai-auto' && (
                  <Badge className="absolute bottom-3 right-3 bg-violet-600 text-white dark:bg-violet-500 text-[10px] gap-1 rounded-lg">
                    <Sparkles className="h-3 w-3" />
                    AI Generated
                  </Badge>
                )}
              </div>
              <CardContent className="p-4">
                <h4 className="font-semibold truncate">{creative.title}</h4>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{creative.clientName}</p>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs rounded-lg">
                      {creative.platform}
                    </Badge>
                    {creative.comments.length > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {creative.comments.length}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {creative.file_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = creative.file_url!;
                          link.download = creative.title || 'creative';
                          link.target = '_blank';
                          link.rel = 'noreferrer';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-lg"
                      onClick={() => setSelectedCreative(creative)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-lg"
                      onClick={() => handleDelete(creative)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(creative.created_at), { addSuffix: true })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Creative Detail Modal */}
      <Dialog open={!!selectedCreative} onOpenChange={(open) => !open && setSelectedCreative(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCreative && getTypeIcon(selectedCreative.type)}
              {selectedCreative?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedCreative && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getStatusColor(selectedCreative.status)}>
                  {selectedCreative.status}
                </Badge>
                <Badge variant="outline">{selectedCreative.platform}</Badge>
                <span className="text-sm text-muted-foreground">
                  Client: {selectedCreative.clientName}
                </span>
              </div>

              <CreativeHorizontalPreview
                creative={selectedCreative}
                clientName={selectedCreative.clientName || 'Unknown Client'}
              />

              <div className="flex items-center gap-2 flex-wrap border-t pt-4">
                {selectedCreative.file_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-xl"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = selectedCreative.file_url!;
                      link.download = selectedCreative.title || 'creative';
                      link.target = '_blank';
                      link.rel = 'noreferrer';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      toast.success('Download started');
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                )}
                <Sparkles className="h-4 w-4 text-primary ml-2" />
                <span className="text-sm font-medium mr-1">AI Tools:</span>
                <CreativeAIActions creative={selectedCreative} />
              </div>

              <div className="flex gap-2 flex-wrap border-t pt-4">
                {selectedCreative.status === 'pending' && (
                  <>
                    <Button
                      variant="default"
                      className="rounded-xl"
                      onClick={() => handleStatusChange(selectedCreative, 'approved')}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => handleStatusChange(selectedCreative, 'revisions')}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Revisions
                    </Button>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      onClick={() => handleStatusChange(selectedCreative, 'rejected')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
                {selectedCreative.status === 'approved' && (
                  <Button
                    variant="default"
                    className="rounded-xl"
                    onClick={() => handleStatusChange(selectedCreative, 'launched')}
                  >
                    <Rocket className="h-4 w-4 mr-1" />
                    Launch
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => handleDelete(selectedCreative)}
                >
                  <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                  Delete
                </Button>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  History
                </h4>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground/70">Created:</span>
                    <span>{format(new Date(selectedCreative.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground/70">Last Updated:</span>
                    <span>{format(new Date(selectedCreative.updated_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground/70">Current Status:</span>
                    <Badge className={`${getStatusColor(selectedCreative.status)} text-xs`}>
                      {selectedCreative.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Comments ({selectedCreative.comments.length})
                </h4>
                {selectedCreative.comments.length > 0 ? (
                  <ScrollArea className="h-[200px] border rounded-xl p-3 mb-2">
                    <div className="space-y-2">
                      {selectedCreative.comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-xl text-sm ${
                            comment.author === 'Client'
                              ? 'bg-primary/10 ml-4'
                              : 'bg-muted mr-4'
                          }`}
                        >
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium">{comment.author}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.createdAt), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p>{comment.text}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground mb-2">No comments yet</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <div className="flex gap-0 -mx-2 -mt-2">
      {/* Apple-style Sidebar Navigation */}
      <div className={`flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-14' : 'w-56'}`}>
        <div className="sticky top-0 h-[calc(100vh-120px)]">
          <ScrollArea className="h-full">
            <div className={`py-4 ${sidebarCollapsed ? 'px-1.5' : 'px-2.5'} space-y-5`}>
              {NAV_SECTIONS.map((section, sectionIdx) => (
                <div key={sectionIdx}>
                  {section.title && !sidebarCollapsed && (
                    <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-[0.12em] px-3 mb-2">
                      {section.title}
                    </p>
                  )}
                  <div className="space-y-px">
                    {section.items.map(item => {
                      const isActive = activeSection === item.id;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(item.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-[10px] text-[13px] transition-all duration-200 ${
                            isActive
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                          } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
                          title={sidebarCollapsed ? item.label : undefined}
                        >
                          <Icon className={`h-[15px] w-[15px] flex-shrink-0 ${isActive ? 'text-primary' : 'opacity-60'}`} />
                          {!sidebarCollapsed && (
                            <>
                              <span className="truncate">{item.label}</span>
                              {'isNew' in item && item.isNew && (
                                <span className="ml-auto text-[9px] font-semibold px-1.5 py-px rounded-full bg-violet-500/15 text-violet-500">
                                  NEW
                                </span>
                              )}
                              {'showBadge' in item && item.showBadge && pendingCount > 0 && (
                                <span className="ml-auto min-w-[20px] text-center text-[10px] font-semibold px-1.5 py-px rounded-full bg-amber-500 text-white">
                                  {pendingCount}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 border-l border-border/50 pl-6 pr-2">
        {renderContent()}
      </div>
    </div>
  );
}
