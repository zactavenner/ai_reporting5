import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdCard } from '@/components/ad-scraping/AdCard';
import { AssignToClientDialog } from '@/components/ad-scraping/AssignToClientDialog';
import { WinningTemplatesSection } from '@/components/ad-scraping/WinningTemplatesSection';
import { AIIterationsSection } from '@/components/ad-scraping/AIIterationsSection';
import { AdGenerationBar } from '@/components/ad-scraping/AdGenerationBar';
import { CustomAdsUploadSection } from '@/components/ad-scraping/CustomAdsUploadSection';
import { ViralVideosSection } from '@/components/ad-scraping/ViralVideosSection';
import { BrandGuidelinesBar } from '@/components/ad-scraping/BrandGuidelinesBar';
import { OrganicViralContentTab } from '@/components/ad-scraping/OrganicViralContentTab';
import { ReInspiredCreativePanel } from '@/components/ad-scraping/ReInspiredCreativePanel';
import { SwipeFileTab } from '@/components/ad-scraping/SwipeFileTab';
import { VideoIntelligenceDialog, type VideoIntelligenceItem } from '@/components/ad-scraping/VideoIntelligenceDialog';
import {
  useScrapedAds,
  useMonitoringTargets,
  useStartTracking,
  useDeleteMonitoringTarget,
  useDeleteScrapedAd,
  useBulkDeleteScrapedAds,
  type ScrapedAd,
} from '@/hooks/useAdScraping';
import { useSwipeFileIds, useAddToSwipeFile, useRemoveFromSwipeFile } from '@/hooks/useSwipeFile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Search,
  SlidersHorizontal,
  X,
  Plus,
  Loader2,
  Radar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Tag,
  Globe,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Users,
  Star,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { formatDistanceToNow, format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

const CATEGORIES = [
  'Real Estate Investment',
  'Alternative Investments',
  'Financial Services',
  'Business Services',
  'E-commerce & Retail',
  'Health & Wellness',
];

const PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn', 'TikTok'];
const FORMATS = ['Static', 'Video', 'Carousel'];
const STATUSES = ['Active', 'Paused', 'Ended'];
const ADS_PER_PAGE = 12;

type SortKey = 'date' | 'reach' | 'saves' | 'views';

export default function AdScrapingPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [assignAd, setAssignAd] = useState<ScrapedAd | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [iteratedFilter, setIteratedFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clientFilter, setClientFilter] = useState('all');
  const [libraryTab, setLibraryTab] = useState('competitor');

  // Brand guidelines state
  const [brandEnabled, setBrandEnabled] = useState(false);
  const [brandClientId, setBrandClientId] = useState('');
  const [brandTone, setBrandTone] = useState('Professional');

  // Re-inspired creative
  const [reInspiredAd, setReInspiredAd] = useState<ScrapedAd | null>(null);

  // Video intelligence
  const [analyzeItem, setAnalyzeItem] = useState<VideoIntelligenceItem | null>(null);

  const { data: ads = [], isLoading: adsLoading } = useScrapedAds();
  const { data: targets = [] } = useMonitoringTargets();
  const { data: clients = [] } = useClients();
  const startTracking = useStartTracking();
  const deleteTarget = useDeleteMonitoringTarget();
  const deleteAd = useDeleteScrapedAd();
  const bulkDelete = useBulkDeleteScrapedAds();

  // Swipe file
  const { adIds: swipedAdIds, videoIds: swipedVideoIds, items: swipeItems } = useSwipeFileIds();
  const addToSwipe = useAddToSwipeFile();
  const removeFromSwipe = useRemoveFromSwipeFile();

  // Date range filter
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [hasIntelligenceFilter, setHasIntelligenceFilter] = useState(false);

  // Fetch client-ad assignments for filtering
  const { data: clientAssignments = [] } = useQuery({
    queryKey: ['client-ad-assignments-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_ad_assignments')
        .select('creative_id, client_id');
      if (error) throw error;
      return (data || []).map((d: any) => ({ ad_id: d.creative_id, client_id: d.client_id })) as { ad_id: string; client_id: string }[];
    },
  });

  // Build a map: ad_id -> client_ids for filtering
  const adClientMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of clientAssignments) {
      if (!map.has(a.ad_id)) map.set(a.ad_id, new Set());
      map.get(a.ad_id)!.add(a.client_id);
    }
    return map;
  }, [clientAssignments]);

  const { data: monStatus } = useQuery({
    queryKey: ['monitoring-status'],
    queryFn: async () => {
      const { data } = await supabase.from('monitoring_status').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  const keywordTargets = targets.filter((t) => t.type === 'keyword');
  const domainTargets = targets.filter((t) => t.type === 'domain');

  const toggleFilter = <T,>(list: T[], item: T, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    setter((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === paginatedAds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedAds.map((a) => a.id)));
    }
  };

  const filteredAds = useMemo(() => {
    let result = ads.filter((ad) => {
      if (selectedCategory && ad.category !== selectedCategory) return false;
      if (selectedPlatforms.length && !selectedPlatforms.includes(ad.platform)) return false;
      if (selectedFormats.length && !selectedFormats.includes(ad.ad_format)) return false;
      if (selectedStatuses.length && !selectedStatuses.includes(ad.status)) return false;
      if (statusFilter !== 'all' && ad.status !== statusFilter) return false;
      if (formatFilter !== 'all' && ad.ad_format !== formatFilter) return false;
      if (iteratedFilter === 'iterated' && !(ad as any).iterated) return false;
      if (iteratedFilter === 'not_iterated' && (ad as any).iterated) return false;
      // Date range filter
      if (dateFrom) {
        const adDate = new Date(ad.scraped_at);
        if (isBefore(adDate, startOfDay(dateFrom))) return false;
      }
      if (dateTo) {
        const adDate = new Date(ad.scraped_at);
        if (isAfter(adDate, endOfDay(dateTo))) return false;
      }
      // Has video intelligence filter (iterated ads have been analyzed)
      if (hasIntelligenceFilter && ad.ad_format !== 'Video') return false;
      if (clientFilter !== 'all') {
        if (clientFilter === 'unassigned') {
          if (adClientMap.has(ad.id)) return false;
        } else {
          const clientIds = adClientMap.get(ad.id);
          if (!clientIds || !clientIds.has(clientFilter)) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          ad.company.toLowerCase().includes(q) ||
          ad.headline.toLowerCase().includes(q) ||
          (ad.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date': cmp = new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime(); break;
        case 'reach': cmp = ((b as any).reach || 0) - ((a as any).reach || 0); break;
        case 'saves': cmp = (b.saves || 0) - (a.saves || 0); break;
        case 'views': cmp = (b.views || 0) - (a.views || 0); break;
      }
      return sortAsc ? -cmp : cmp;
    });

    return result;
  }, [ads, selectedCategory, selectedPlatforms, selectedFormats, selectedStatuses, statusFilter, formatFilter, iteratedFilter, clientFilter, adClientMap, search, sortKey, sortAsc, dateFrom, dateTo, hasIntelligenceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAds.length / ADS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAds = filteredAds.slice((safePage - 1) * ADS_PER_PAGE, safePage * ADS_PER_PAGE);

  const hasFilters =
    selectedCategory || selectedPlatforms.length || selectedFormats.length || selectedStatuses.length;

  const handleTrack = async (type: 'keyword' | 'domain', value: string, clear: () => void) => {
    const v = value.trim();
    if (!v) {
      toast.error(`Enter a ${type}`);
      return;
    }
    try {
      const result = await startTracking.mutateAsync({ type, value: v });
      toast.success(`Scraped ${result.adsCount} ads for "${v}"`);
      clear();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to scrape ads');
    }
  };

  const lastUpdateLabel = monStatus?.last_update
    ? `Last update: ${formatDistanceToNow(new Date(monStatus.last_update))} ago`
    : targets.length > 0
    ? `Last update: ${formatDistanceToNow(new Date(Math.max(...targets.filter(t => t.last_scraped_at).map(t => new Date(t.last_scraped_at!).getTime()), 0)))} ago`
    : null;

  const nextUpdateLabel = monStatus?.next_update
    ? `Next: in ${formatDistanceToNow(new Date(monStatus.next_update))}`
    : null;

  const handleOpenReInspired = () => {
    const firstSelectedAd = ads.find((a) => selectedIds.has(a.id));
    if (firstSelectedAd) setReInspiredAd(firstSelectedAd);
  };

  const handleToggleSwipeAd = (ad: ScrapedAd) => {
    if (swipedAdIds.has(ad.id)) {
      const item = swipeItems.find(i => i.ad_id === ad.id);
      if (item) removeFromSwipe.mutate(item.id, { onSuccess: () => toast.success('Removed from Swipe File') });
    } else {
      addToSwipe.mutate({ ad_id: ad.id }, { onSuccess: () => toast.success('Saved to Swipe File') });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ad Scraping Engine</h1>
            <p className="text-muted-foreground mt-1">
              Track competitors' winning ads and assign them to clients for inspiration
            </p>
          </div>
          {(lastUpdateLabel || nextUpdateLabel) && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {lastUpdateLabel && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {lastUpdateLabel}
                </span>
              )}
              {nextUpdateLabel && (
                <span className="text-primary/70">{nextUpdateLabel}</span>
              )}
            </div>
          )}
        </div>

        {/* ADDITION 1: Brand Guidelines Bar */}
        <BrandGuidelinesBar
          enabled={brandEnabled}
          onEnabledChange={setBrandEnabled}
          selectedClientId={brandClientId}
          onClientChange={setBrandClientId}
          selectedTone={brandTone}
          onToneChange={setBrandTone}
        />

        {/* Monitoring Targets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Track by Keyword */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Track by Keyword
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. real estate investing"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrack('keyword', newKeyword, () => setNewKeyword(''))}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => handleTrack('keyword', newKeyword, () => setNewKeyword(''))}
                disabled={startTracking.isPending}
              >
                {startTracking.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                <span className="ml-1">Add</span>
              </Button>
            </div>
            {keywordTargets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywordTargets.map((t) => (
                  <Badge key={t.id} variant="secondary" className="gap-1 pr-1 text-xs">
                    {t.value}
                    <button
                      onClick={() => deleteTarget.mutate(t.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Track by Domain */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Track by Domain
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. fundrise.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrack('domain', newDomain, () => setNewDomain(''))}
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={() => handleTrack('domain', newDomain, () => setNewDomain(''))}
                disabled={startTracking.isPending}
              >
                {startTracking.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                <span className="ml-1">Add</span>
              </Button>
            </div>
            {domainTargets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {domainTargets.map((t) => (
                  <Badge key={t.id} variant="secondary" className="gap-1 pr-1 text-xs">
                    {t.value}
                    <button
                      onClick={() => deleteTarget.mutate(t.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scanning indicator */}
        {startTracking.isPending && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">Scanning now...</span>
            <span className="text-muted-foreground">Scraping Facebook Ad Library for new ads</span>
          </div>
        )}

        {/* ADDITION 2: Tabbed Library */}
        <Tabs value={libraryTab} onValueChange={setLibraryTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="competitor">Competitor Ads</TabsTrigger>
              <TabsTrigger value="organic">Organic Viral Content</TabsTrigger>
              <TabsTrigger value="swipefile" className="gap-1">
                <Star className="h-3 w-3" /> Swipe File
                {swipeItems.length > 0 && <Badge variant="secondary" className="ml-1 h-5 text-[10px] px-1.5">{swipeItems.length}</Badge>}
              </TabsTrigger>
            </TabsList>
            {libraryTab === 'competitor' && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {filteredAds.length} ad{filteredAds.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            )}
          </div>

          {/* Competitor Ads Tab */}
          <TabsContent value="competitor" className="space-y-4 mt-4">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Keywords or competitors…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={formatFilter} onValueChange={(v) => { setFormatFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="All Ads" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ads</SelectItem>
                  {FORMATS.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={iteratedFilter} onValueChange={(v) => { setIteratedFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="All Ads" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ads</SelectItem>
                  <SelectItem value="not_iterated">Not Iterated</SelectItem>
                  <SelectItem value="iterated">Iterated</SelectItem>
                </SelectContent>
              </Select>
              {/* Date range filters */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {dateFrom ? format(dateFrom, 'MMM d') : 'From'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setCurrentPage(1); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {dateTo ? format(dateTo, 'MMM d') : 'To'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setCurrentPage(1); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setCurrentPage(1); }}>
                  <X className="h-3 w-3" />
                </Button>
              )}
              <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[160px] h-9">
                  <Users className="h-3 w-3 mr-1" /><SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[120px] h-9">
                  <ArrowUpDown className="h-3 w-3 mr-1" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="reach">Reach</SelectItem>
                  <SelectItem value="saves">Saves</SelectItem>
                  <SelectItem value="views">Views</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSortAsc(!sortAsc)} title={sortAsc ? 'Ascending' : 'Descending'}>
                {sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </Button>
            </div>

            {/* ADDITION 3: Re-Inspired Creative Panel */}
            {reInspiredAd && (
              <ReInspiredCreativePanel
                ad={reInspiredAd}
                brandActive={brandEnabled}
                brandClientId={brandClientId}
                onClose={() => setReInspiredAd(null)}
              />
            )}

            <div className="flex gap-6">
              {/* Sidebar filters */}
              <aside className="w-52 shrink-0 space-y-5 hidden lg:block">
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <SlidersHorizontal className="h-3 w-3" /> Categories
                  </h3>
                  <div className="space-y-0.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => { setSelectedCategory(selectedCategory === cat ? null : cat); setCurrentPage(1); }}
                        className={cn(
                          'w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors',
                          selectedCategory === cat
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform</h3>
                  <div className="flex flex-wrap gap-1">
                    {PLATFORMS.map((p) => (
                      <Badge
                        key={p}
                        variant={selectedPlatforms.includes(p) ? 'default' : 'outline'}
                        className="cursor-pointer text-[10px]"
                        onClick={() => { toggleFilter(selectedPlatforms, p, setSelectedPlatforms); setCurrentPage(1); }}
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ad Format</h3>
                  <div className="flex flex-wrap gap-1">
                    {FORMATS.map((f) => (
                      <Badge
                        key={f}
                        variant={selectedFormats.includes(f) ? 'default' : 'outline'}
                        className="cursor-pointer text-[10px]"
                        onClick={() => { toggleFilter(selectedFormats, f, setSelectedFormats); setCurrentPage(1); }}
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h3>
                  <div className="flex flex-wrap gap-1">
                    {STATUSES.map((s) => (
                      <Badge
                        key={s}
                        variant={selectedStatuses.includes(s) ? 'default' : 'outline'}
                        className="cursor-pointer text-[10px]"
                        onClick={() => { toggleFilter(selectedStatuses, s, setSelectedStatuses); setCurrentPage(1); }}
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs w-full"
                    onClick={() => {
                      setSelectedCategory(null);
                      setSelectedPlatforms([]);
                      setSelectedFormats([]);
                      setSelectedStatuses([]);
                      setCurrentPage(1);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" /> Clear Filters
                  </Button>
                )}
              </aside>

              {/* Main content */}
              <div className="flex-1 space-y-4">
                {/* Select all bar */}
                {filteredAds.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                      {selectedIds.size === paginatedAds.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    {selectedIds.size > 0 && (
                      <>
                        <span>{selectedIds.size} selected</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs ml-2"
                          onClick={handleOpenReInspired}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Re-Inspired Creative
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {adsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : paginatedAds.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {paginatedAds.map((ad) => (
                      <AdCard
                        key={ad.id}
                        ad={ad}
                        onAssign={setAssignAd}
                        onDelete={(ad) => {
                          deleteAd.mutate(ad.id, {
                            onSuccess: () => toast.success('Ad deleted'),
                          });
                        }}
                        onAnalyze={(ad) => setAnalyzeItem({
                          id: ad.id,
                          title: ad.headline || ad.company,
                          description: ad.description,
                          platform: ad.platform,
                          source_url: ad.source_url,
                          image_url: ad.image_url,
                          thumbnail_url: ad.image_url,
                          views: ad.views || undefined,
                        })}
                        selectable
                        selected={selectedIds.has(ad.id)}
                        onSelectChange={() => toggleSelect(ad.id)}
                        isSwiped={swipedAdIds.has(ad.id)}
                        onToggleSwipe={handleToggleSwipeAd}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    <Radar className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">
                      {ads.length === 0 ? 'No ads scraped yet' : 'No ads match your filters'}
                    </p>
                    <p className="text-sm mt-1">
                      {ads.length === 0
                        ? 'Enter a keyword or domain above and click "Add" to start scraping'
                        : 'Try adjusting your search or filters'}
                    </p>
                  </div>
                )}

                {/* Pagination */}
                {filteredAds.length > ADS_PER_PAGE && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">
                      Showing {(safePage - 1) * ADS_PER_PAGE + 1}-{Math.min(safePage * ADS_PER_PAGE, filteredAds.length)} of {filteredAds.length} ads
                    </span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)}>
                        <ChevronLeft className="h-3 w-3 mr-1" /> Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)}>
                        Next <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Organic Viral Content Tab */}
          <TabsContent value="organic" className="mt-4">
            <OrganicViralContentTab />
          </TabsContent>

          {/* Swipe File Tab */}
          <TabsContent value="swipefile" className="mt-4">
            <SwipeFileTab />
          </TabsContent>
        </Tabs>

        <Separator />
        <WinningTemplatesSection />
        <Separator />
        <AIIterationsSection />
        <Separator />
        <CustomAdsUploadSection />
        <Separator />
        <ViralVideosSection />
      </div>

      <AssignToClientDialog
        ad={assignAd}
        open={!!assignAd}
        onOpenChange={(open) => !open && setAssignAd(null)}
      />

      <VideoIntelligenceDialog
        open={!!analyzeItem}
        onOpenChange={(open) => !open && setAnalyzeItem(null)}
        item={analyzeItem}
      />

      <AdGenerationBar
        selectedIds={selectedIds}
        ads={ads}
        onClearSelection={() => setSelectedIds(new Set())}
        onAssignSelected={() => {
          const firstAd = ads.find(a => selectedIds.has(a.id));
          if (firstAd) setAssignAd(firstAd);
        }}
        onDeleteSelected={() => {
          bulkDelete.mutate(Array.from(selectedIds), {
            onSuccess: () => {
              toast.success(`Deleted ${selectedIds.size} ads`);
              setSelectedIds(new Set());
            },
          });
        }}
      />
    </AppLayout>
  );
}
