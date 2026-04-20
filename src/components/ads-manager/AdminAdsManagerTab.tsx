import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  RefreshCw, Search, Image as ImageIcon, Video, Play,
  TrendingUp, MousePointerClick, Eye, DollarSign, Target, ExternalLink,
  Layers, Megaphone, FileImage, ChevronRight, Calendar as CalIcon, Plus, Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { CreateAdDialog } from './CreateAdDialog';
import { CreateCampaignDialog } from './CreateCampaignDialog';
import { AdHDPreviewDialog } from './AdHDPreviewDialog';

const fmt$ = (v: number | null | undefined) =>
  !v ? '$0' : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (v: number | null | undefined) =>
  !v ? '0' : Number(v).toLocaleString();
const fmtPct = (v: number | null | undefined) =>
  !v ? '0%' : `${Number(v).toFixed(2)}%`;

interface Props { platform?: 'meta' | 'google' | 'all'; }

export function AdminAdsManagerTab({ platform = 'all' }: Props) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('campaigns');
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({ from: subDays(new Date(), 30), to: new Date() });
  const [datePreset, setDatePreset] = useState<string>('30d');
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createAdContext, setCreateAdContext] = useState<{ adSetId: string; name: string } | null>(null);
  const [previewAd, setPreviewAd] = useState<any | null>(null);

  const applyPreset = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === '7d') setDateRange({ from: subDays(today, 7), to: today });
    else if (preset === '14d') setDateRange({ from: subDays(today, 14), to: today });
    else if (preset === '30d') setDateRange({ from: subDays(today, 30), to: today });
    else if (preset === '90d') setDateRange({ from: subDays(today, 90), to: today });
    else if (preset === 'mtd') setDateRange({ from: startOfMonth(today), to: today });
    else if (preset === 'last-month') {
      const lm = subMonths(today, 1);
      setDateRange({ from: startOfMonth(lm), to: endOfMonth(lm) });
    }
  };

  // Cached campaigns
  const { data: campaigns = [], isLoading: cLoading } = useQuery({
    queryKey: ['admin-meta-campaigns', clientFilter, statusFilter],
    queryFn: async () => {
      let q = (supabase as any).from('meta_campaigns').select('*').order('spend', { ascending: false }).limit(2000);
      if (clientFilter !== 'all') q = q.eq('client_id', clientFilter);
      if (statusFilter !== 'all') q = q.eq('effective_status', statusFilter);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return data || [];
    },
  });

  // Cached ad sets
  const { data: adSets = [] } = useQuery({
    queryKey: ['admin-meta-adsets', clientFilter, selectedCampaignId],
    queryFn: async () => {
      let q = (supabase as any).from('meta_ad_sets').select('*').order('spend', { ascending: false }).limit(2000);
      if (clientFilter !== 'all') q = q.eq('client_id', clientFilter);
      if (selectedCampaignId) q = q.eq('campaign_id', selectedCampaignId);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return data || [];
    },
  });

  // Cached ads
  const { data: ads = [] } = useQuery({
    queryKey: ['admin-meta-ads', clientFilter, selectedAdSetId],
    queryFn: async () => {
      let q = (supabase as any).from('meta_ads').select('*').order('spend', { ascending: false }).limit(2000);
      if (clientFilter !== 'all') q = q.eq('client_id', clientFilter);
      if (selectedAdSetId) q = q.eq('ad_set_id', selectedAdSetId);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return data || [];
    },
  });

  const clientMap = useMemo(() => {
    const m: Record<string, { name: string; meta_ad_account_id: string | null }> = {};
    clients.forEach(c => { m[c.id] = { name: c.name, meta_ad_account_id: (c as any).meta_ad_account_id || null }; });
    return m;
  }, [clients]);

  // Manual sync per client
  const handleSync = async (clientId: string, clientName: string) => {
    if (syncing[clientId]) return;
    setSyncing(s => ({ ...s, [clientId]: true }));
    toast.loading(`Syncing Meta Ads for ${clientName}…`, { id: `sync-${clientId}` });
    try {
      const { data, error } = await supabase.functions.invoke('sync-meta-ads', {
        body: {
          clientId,
          startDate: format(dateRange.from, 'yyyy-MM-dd'),
          endDate: format(dateRange.to, 'yyyy-MM-dd'),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Sync failed');
      toast.success(`${clientName}: ${data.campaigns || 0} campaigns, ${data.ads || 0} ads synced`, { id: `sync-${clientId}` });
      qc.invalidateQueries({ queryKey: ['admin-meta-campaigns'] });
      qc.invalidateQueries({ queryKey: ['admin-meta-adsets'] });
      qc.invalidateQueries({ queryKey: ['admin-meta-ads'] });
    } catch (err: any) {
      toast.error(`${clientName}: ${err.message}`, { id: `sync-${clientId}` });
    } finally {
      setSyncing(s => ({ ...s, [clientId]: false }));
    }
  };

  const handleSyncAll = async () => {
    const eligible = clients.filter(c => (c as any).meta_ad_account_id);
    toast.info(`Dispatching sync for ${eligible.length} clients…`);
    for (const c of eligible) {
      handleSync(c.id, c.name);
      await new Promise(r => setTimeout(r, 800)); // stagger
    }
  };

  // Filter & search
  const filteredCampaigns = useMemo(() => {
    const term = search.toLowerCase();
    return campaigns.filter((c: any) =>
      !term || c.name?.toLowerCase().includes(term) || clientMap[c.client_id]?.name.toLowerCase().includes(term)
    );
  }, [campaigns, search, clientMap]);

  const filteredAdSets = useMemo(() => {
    const term = search.toLowerCase();
    return adSets.filter((a: any) =>
      !term || a.name?.toLowerCase().includes(term)
    );
  }, [adSets, search]);

  const filteredAds = useMemo(() => {
    const term = search.toLowerCase();
    return ads.filter((a: any) =>
      !term || a.name?.toLowerCase().includes(term) || a.headline?.toLowerCase().includes(term)
    );
  }, [ads, search]);

  // KPIs
  const kpis = useMemo(() => {
    const totalSpend = filteredCampaigns.reduce((s: number, c: any) => s + Number(c.spend || 0), 0);
    const totalImpr = filteredCampaigns.reduce((s: number, c: any) => s + Number(c.impressions || 0), 0);
    const totalClicks = filteredCampaigns.reduce((s: number, c: any) => s + Number(c.clicks || 0), 0);
    const totalLeads = filteredCampaigns.reduce((s: number, c: any) => s + Number(c.attributed_leads || 0), 0);
    const ctr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    return { totalSpend, totalImpr, totalClicks, totalLeads, ctr, cpc, cpl, count: filteredCampaigns.length };
  }, [filteredCampaigns]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Ads Manager</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Meta campaigns across all clients · cached data · manual sync only
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Date range picker */}
            <Select value={datePreset} onValueChange={applyPreset}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <CalIcon className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="14d">Last 14 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="mtd">Month to date</SelectItem>
                <SelectItem value="last-month">Last month</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {datePreset === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-xs">
                    {format(dateRange.from, 'MMM d')} – {format(dateRange.to, 'MMM d')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(r: any) => r?.from && r?.to && setDateRange({ from: r.from, to: r.to })}
                    numberOfMonths={2}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}
            <Button
              size="sm"
              variant="default"
              onClick={() => setCreateCampaignOpen(true)}
              disabled={clientFilter === 'all'}
              title={clientFilter === 'all' ? 'Select a client first' : 'Create new campaign'}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Campaign
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncAll}
              disabled={Object.values(syncing).some(Boolean)}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", Object.values(syncing).some(Boolean) && "animate-spin")} />
              Sync All Clients
            </Button>
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <KpiCell icon={DollarSign} label="Spend" value={fmt$(kpis.totalSpend)} />
          <KpiCell icon={Eye} label="Impressions" value={fmtN(kpis.totalImpr)} />
          <KpiCell icon={MousePointerClick} label="Clicks" value={fmtN(kpis.totalClicks)} />
          <KpiCell icon={TrendingUp} label="CTR" value={fmtPct(kpis.ctr)} />
          <KpiCell icon={DollarSign} label="CPC" value={fmt$(kpis.cpc)} />
          <KpiCell icon={Target} label="Leads" value={fmtN(kpis.totalLeads)} />
          <KpiCell icon={DollarSign} label="CPL" value={fmt$(kpis.cpl)} />
        </div>

        {/* Filters */}
        <Card className="p-3 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search campaigns, ad sets, ads…"
              className="pl-8 h-9"
            />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="All Clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients ({clients.length})</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {!(c as any).meta_ad_account_id && '(no Meta)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PAUSED">Paused</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
              <SelectItem value="DELETED">Deleted</SelectItem>
            </SelectContent>
          </Select>
          {clientFilter !== 'all' && clientMap[clientFilter]?.meta_ad_account_id && (
            <Button
              size="sm"
              onClick={() => handleSync(clientFilter, clientMap[clientFilter].name)}
              disabled={syncing[clientFilter]}
            >
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing[clientFilter] && "animate-spin")} />
              Sync from Meta
            </Button>
          )}
        </Card>

        {/* Drilldown breadcrumbs */}
        {(selectedCampaignId || selectedAdSetId) && (
          <div className="flex items-center gap-1.5 text-sm">
            <button onClick={() => { setSelectedCampaignId(null); setSelectedAdSetId(null); setActiveTab('campaigns'); }} className="text-muted-foreground hover:text-foreground">All Campaigns</button>
            {selectedCampaignId && <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button onClick={() => { setSelectedAdSetId(null); setActiveTab('adsets'); }} className="text-muted-foreground hover:text-foreground">
                {campaigns.find((c: any) => c.id === selectedCampaignId)?.name || 'Campaign'}
              </button>
            </>}
            {selectedAdSetId && <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{adSets.find((a: any) => a.id === selectedAdSetId)?.name || 'Ad Set'}</span>
            </>}
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="campaigns" className="gap-1.5">
              <Megaphone className="h-3.5 w-3.5" />Campaigns ({filteredCampaigns.length})
            </TabsTrigger>
            <TabsTrigger value="adsets" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" />Ad Sets ({filteredAdSets.length})
            </TabsTrigger>
            <TabsTrigger value="ads" className="gap-1.5">
              <FileImage className="h-3.5 w-3.5" />Ads ({filteredAds.length})
            </TabsTrigger>
          </TabsList>

          {/* CAMPAIGNS */}
          <TabsContent value="campaigns" className="space-y-3">
            {cLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading campaigns…</div>
            ) : filteredCampaigns.length === 0 ? (
              <EmptyState message="No campaigns in cache. Click 'Sync from Meta' on a client to pull campaigns." />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Objective</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">CPC</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">CPL</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCampaigns.slice(0, 200).map((c: any) => (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => { setSelectedCampaignId(c.id); setSelectedAdSetId(null); setActiveTab('adsets'); }}
                        >
                          <TableCell><StatusDot status={c.status} /></TableCell>
                          <TableCell className="font-medium text-sm max-w-[280px] truncate">{c.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{clientMap[c.client_id]?.name || '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{c.objective || '—'}</Badge></TableCell>
                          <TableCell className="text-right font-medium text-sm">{fmt$(c.spend)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(c.impressions)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(c.clicks)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtPct(c.ctr)}</TableCell>
                          <TableCell className="text-right text-xs">{fmt$(c.cpc)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(c.attributed_leads)}</TableCell>
                          <TableCell className="text-right text-xs">{fmt$(c.cost_per_lead)}</TableCell>
                          <TableCell><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredCampaigns.length > 200 && (
                  <div className="p-2 text-center text-xs text-muted-foreground border-t">
                    Showing first 200 of {filteredCampaigns.length} — narrow filters to see more
                  </div>
                )}
              </Card>
            )}
          </TabsContent>

          {/* AD SETS */}
          <TabsContent value="adsets" className="space-y-3">
            {filteredAdSets.length === 0 ? (
              <EmptyState message={selectedCampaignId ? "No ad sets for this campaign in cache." : "No ad sets in cache. Sync a client first."} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Ad Set</TableHead>
                        <TableHead>Optimization</TableHead>
                        <TableHead className="text-right">Daily Budget</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">Reach</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdSets.slice(0, 200).map((a: any) => (
                        <TableRow
                          key={a.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => { setSelectedAdSetId(a.id); setActiveTab('ads'); }}
                        >
                          <TableCell><StatusDot status={a.status} /></TableCell>
                          <TableCell className="font-medium text-sm max-w-[260px] truncate">{a.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{a.optimization_goal || '—'}</Badge></TableCell>
                          <TableCell className="text-right text-xs">{a.daily_budget ? fmt$(Number(a.daily_budget) / 100) : '—'}</TableCell>
                          <TableCell className="text-right font-medium text-sm">{fmt$(a.spend)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(a.impressions)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(a.clicks)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtPct(a.ctr)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(a.reach)}</TableCell>
                          <TableCell className="text-right text-xs">{fmtN(a.attributed_leads)}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => setCreateAdContext({ adSetId: a.id, name: a.name })}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Ad
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ADS */}
          <TabsContent value="ads" className="space-y-3">
            {filteredAds.length === 0 ? (
              <EmptyState message={selectedAdSetId ? "No ads for this ad set in cache." : "No ads in cache. Sync a client first."} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredAds.slice(0, 60).map((ad: any) => (
                  <AdCard
                    key={ad.id}
                    ad={ad}
                    clientName={clientMap[ad.client_id]?.name}
                    onClick={() => setPreviewAd(ad)}
                  />
                ))}
              </div>
            )}
            {filteredAds.length > 60 && (
              <div className="text-center text-xs text-muted-foreground">
                Showing first 60 of {filteredAds.length} — narrow filters to see more
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        {clientFilter !== 'all' && (
          <CreateCampaignDialog
            open={createCampaignOpen}
            onOpenChange={setCreateCampaignOpen}
            clientId={clientFilter}
          />
        )}
        {createAdContext && clientFilter !== 'all' && (
          <CreateAdDialog
            open={!!createAdContext}
            onOpenChange={(v) => !v && setCreateAdContext(null)}
            clientId={clientFilter}
            adSetId={createAdContext.adSetId}
            adSetName={createAdContext.name}
          />
        )}
        {previewAd && (
          <AdHDPreviewDialog
            open={!!previewAd}
            onOpenChange={(v) => !v && setPreviewAd(null)}
            ad={previewAd}
            clientId={previewAd.client_id}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

function KpiCell({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3 w-3" />{label}
      </div>
      <p className="text-base font-bold mt-1 tabular-nums">{value}</p>
    </Card>
  );
}

function StatusDot({ status }: { status: string | null }) {
  const s = (status || '').toUpperCase();
  const color =
    s === 'ACTIVE' ? 'bg-chart-2' :
    s === 'PAUSED' ? 'bg-yellow-500' :
    s === 'ARCHIVED' || s === 'DELETED' ? 'bg-muted-foreground' :
    'bg-muted';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("h-2 w-2 rounded-full", color)} />
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{status || 'Unknown'}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
      <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function AdCard({ ad, clientName, onClick }: { ad: any; clientName?: string; onClick?: () => void }) {
  const thumb = ad.thumbnail_url || ad.image_url;
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <div className="aspect-square bg-muted relative overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={ad.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <StatusDot status={ad.status} />
        </div>
        {ad.preview_url && (
          <a
            href={ad.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 right-2 bg-background/90 backdrop-blur rounded-md p-1.5 hover:bg-background"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="p-2.5 space-y-1.5">
        <p className="text-xs font-medium truncate" title={ad.name}>{ad.name}</p>
        {clientName && <p className="text-[10px] text-muted-foreground truncate">{clientName}</p>}
        {ad.headline && <p className="text-[11px] line-clamp-1 text-foreground/80">{ad.headline}</p>}
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/50">
          <span className="text-muted-foreground">Spend</span>
          <span className="font-semibold tabular-nums">{fmt$(ad.spend)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">CTR · CPC</span>
          <span className="font-semibold tabular-nums">{fmtPct(ad.ctr)} · {fmt$(ad.cpc)}</span>
        </div>
        {ad.attributed_leads > 0 && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Leads · CPL</span>
            <span className="font-semibold tabular-nums text-chart-2">{fmtN(ad.attributed_leads)} · {fmt$(ad.cost_per_lead)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
