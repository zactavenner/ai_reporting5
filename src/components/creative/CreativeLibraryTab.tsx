import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders } from '@/lib/dashboardAuthHeaders';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  RefreshCw,
  Video,
  Image as ImageIcon,
  Copy,
  Loader2,
  FileText,
  Sparkles,
} from 'lucide-react';

interface LibraryAd {
  id: string;
  client_id: string;
  meta_ad_id: string | null;
  name: string | null;
  media_type: string | null;
  image_url: string | null;
  full_image_url: string | null;
  video_thumbnail_url: string | null;
  video_source_url: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  attributed_leads: number | null;
  cost_per_lead: number | null;
  ctr: number | null;
  headline: string | null;
  body: string | null;
  transcript: string | null;
  transcript_status: string | null;
  generation_prompt: string | null;
  generation_source: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const PAGE_SIZE = 24;

const shortDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

async function downloadAsset(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

type MediaFilter = 'all' | 'video' | 'image';
type SortKey = 'cpl_asc' | 'cpl_desc' | 'spend_desc' | 'leads_desc' | 'newest';

const money = (v: number | null | undefined) =>
  v == null ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function mediaKind(ad: LibraryAd): 'video' | 'image' {
  if (ad.video_source_url || ad.video_thumbnail_url) return 'video';
  if ((ad.media_type || '').toLowerCase().includes('video')) return 'video';
  return 'image';
}

export function CreativeLibraryTab({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const queryClient = useQueryClient();
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('cpl_asc');
  const [maxCpl, setMaxCpl] = useState('');
  const [minSpend, setMinSpend] = useState('');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [detailAd, setDetailAd] = useState<LibraryAd | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [recreateAd, setRecreateAd] = useState<LibraryAd | null>(null);
  const [targetClient, setTargetClient] = useState('');
  const [notes, setNotes] = useState('');
  const [aspect, setAspect] = useState('1:1');
  const [recreating, setRecreating] = useState(false);
  const [result, setResult] = useState<{
    angle?: string | null;
    headline?: string | null;
    primaryText?: string | null;
    script?: string;
    imageUrl?: string | null;
    imageError?: string | null;
  } | null>(null);

  const { data: ads, isLoading } = useQuery({
    queryKey: ['creative-library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_ads')
        .select(
          'id, client_id, meta_ad_id, name, media_type, image_url, full_image_url, video_thumbnail_url, video_source_url, spend, impressions, clicks, attributed_leads, cost_per_lead, ctr, headline, body, transcript, transcript_status, generation_prompt, generation_source, status, created_at, updated_at',
        )
        .order('spend', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as LibraryAd[];
    },
  });

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || 'Unknown client';

  const filtered = useMemo(() => {
    let rows = ads || [];
    if (clientFilter !== 'all') rows = rows.filter((a) => a.client_id === clientFilter);
    if (mediaFilter !== 'all') rows = rows.filter((a) => mediaKind(a) === mediaFilter);
    const cplCap = parseFloat(maxCpl);
    if (!Number.isNaN(cplCap)) {
      rows = rows.filter((a) => a.cost_per_lead != null && a.cost_per_lead <= cplCap);
    }
    const spendFloor = parseFloat(minSpend);
    if (!Number.isNaN(spendFloor)) rows = rows.filter((a) => (a.spend || 0) >= spendFloor);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) =>
        [a.name, a.headline, a.body, a.transcript, a.generation_prompt]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'cpl_asc': {
          const av = a.cost_per_lead ?? Number.POSITIVE_INFINITY;
          const bv = b.cost_per_lead ?? Number.POSITIVE_INFINITY;
          return av - bv;
        }
        case 'cpl_desc':
          return (b.cost_per_lead ?? -1) - (a.cost_per_lead ?? -1);
        case 'leads_desc':
          return (b.attributed_leads ?? 0) - (a.attributed_leads ?? 0);
        case 'newest':
          return (
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
        default:
          return (b.spend ?? 0) - (a.spend ?? 0);
      }
    });
    return sorted;
  }, [ads, clientFilter, mediaFilter, maxCpl, minSpend, search, sortKey]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [clientFilter, mediaFilter, maxCpl, minSpend, search, sortKey]);


  const runSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('creative-library-sync', {
        body: {
          ...(clientFilter !== 'all' ? { clientIds: [clientFilter] } : {}),
        },
        headers: dashboardAuthHeaders(),
      });
      if (error) throw error;
      toast.success(
        `Pulled ads for ${data?.clients ?? 0} clients · ${data?.transcribed ?? 0} videos transcribed`,
      );
      queryClient.invalidateQueries({ queryKey: ['creative-library'] });
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const runRecreate = async () => {
    if (!recreateAd || !targetClient) return;
    setRecreating(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('creative-recreate', {
        body: {
          adId: recreateAd.id,
          targetClientId: targetClient,
          notes,
          aspectRatio: aspect,
        },
        headers: dashboardAuthHeaders(),
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
      toast.success('New script and image ready');
    } catch (e: any) {
      toast.error(e?.message || 'Recreate failed');
    } finally {
      setRecreating(false);
    }
  };

  const videoCount = (ads || []).filter((a) => mediaKind(a) === 'video').length;
  const transcribedCount = (ads || []).filter((a) => a.transcript).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-bold">Creative Library</h2>
          <p className="text-sm text-muted-foreground">
            {(ads || []).length} ads · {videoCount} videos · {transcribedCount} transcribed
          </p>
        </div>
        <Button onClick={runSync} disabled={syncing} className="min-h-[44px]">
          {syncing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Pull latest from Meta
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label className="text-xs">Client</Label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={mediaFilter} onValueChange={(v) => setMediaFilter(v as MediaFilter)}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="image">Static</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sort</Label>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpl_asc">Best cost per lead</SelectItem>
                <SelectItem value="cpl_desc">Worst cost per lead</SelectItem>
                <SelectItem value="spend_desc">Most spend</SelectItem>
                <SelectItem value="leads_desc">Most leads</SelectItem>
                <SelectItem value="newest">Newest added</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Max cost/lead</Label>
            <Input
              className="min-h-[44px]"
              inputMode="decimal"
              placeholder="e.g. 60"
              value={maxCpl}
              onChange={(e) => setMaxCpl(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Min spend</Label>
            <Input
              className="min-h-[44px]"
              inputMode="decimal"
              placeholder="e.g. 250"
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value)}
            />
          </div>
          <div className="md:col-span-6">
            <Label className="text-xs">Search name, copy, transcript or prompt</Label>
            <Input
              className="min-h-[44px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No ads match these filters. Use “Pull latest from Meta” to bring ads in.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, visibleCount).map((ad) => {
            const kind = mediaKind(ad);
            const thumb = ad.video_thumbnail_url || ad.full_image_url || ad.image_url;
            const downloadUrl =
              kind === 'video'
                ? ad.video_source_url || thumb
                : ad.full_image_url || ad.image_url;
            const hovering = hoveredId === ad.id;
            return (
              <Card
                key={ad.id}
                className="group overflow-hidden flex flex-col"
                onMouseEnter={() => setHoveredId(ad.id)}
                onMouseLeave={() => setHoveredId((c) => (c === ad.id ? null : c))}
              >
                <button
                  type="button"
                  className="relative aspect-square w-full bg-muted"
                  onClick={() => setDetailAd(ad)}
                >
                  {kind === 'video' && hovering && ad.video_source_url ? (
                    <video
                      src={ad.video_source_url}
                      poster={thumb || undefined}
                      className="h-full w-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : thumb ? (
                    <img
                      src={thumb}
                      alt={ad.name || 'Ad creative'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      {kind === 'video' ? <Video className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
                    </div>
                  )}
                  <Badge className="absolute left-2 top-2" variant="secondary">
                    {kind === 'video' ? 'Video' : 'Static'}
                  </Badge>
                  {ad.transcript && (
                    <Badge className="absolute right-2 top-2" variant="outline">
                      <FileText className="mr-1 h-3 w-3" /> Transcript
                    </Badge>
                  )}
                </button>
                <CardContent className="flex flex-1 flex-col gap-2 p-3">
                  <p className="line-clamp-2 text-sm font-medium">{ad.name || 'Untitled ad'}</p>
                  <p className="text-xs text-muted-foreground">{clientName(ad.client_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    Added {shortDate(ad.created_at)}
                  </p>
                  <div className="grid grid-cols-3 gap-1 text-center text-xs">
                    <div>
                      <p className="font-semibold">{money(ad.cost_per_lead)}</p>
                      <p className="text-muted-foreground">CPL</p>
                    </div>
                    <div>
                      <p className="font-semibold">{ad.attributed_leads ?? 0}</p>
                      <p className="text-muted-foreground">Leads</p>
                    </div>
                    <div>
                      <p className="font-semibold">{money(ad.spend)}</p>
                      <p className="text-muted-foreground">Spend</p>
                    </div>
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[40px]"
                      onClick={() => {
                        setRecreateAd(ad);
                        setResult(null);
                        setNotes('');
                        setTargetClient('');
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy & recreate
                    </Button>
                    {downloadUrl && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-[40px]"
                        aria-label="Download creative"
                        onClick={() =>
                          downloadAsset(
                            downloadUrl,
                            `${(ad.name || 'creative').replace(/[^\w.-]+/g, '-')}.${kind === 'video' ? 'mp4' : 'jpg'}`,
                          )
                        }
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail */}
      <Dialog open={!!detailAd} onOpenChange={(o) => !o && setDetailAd(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{detailAd?.name || 'Ad creative'}</DialogTitle>
          </DialogHeader>
          {detailAd && (
            <div className="space-y-4">
              {detailAd.video_source_url ? (
                <video
                  src={detailAd.video_source_url}
                  controls
                  poster={detailAd.video_thumbnail_url || undefined}
                  className="w-full rounded-lg bg-black"
                />
              ) : (
                (detailAd.full_image_url || detailAd.image_url) && (
                  <img
                    src={detailAd.full_image_url || detailAd.image_url || ''}
                    alt={detailAd.name || 'Ad creative'}
                    className="w-full rounded-lg"
                  />
                )
              )}
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground text-xs">Client</p>
                  <p>{clientName(detailAd.client_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Cost per lead</p>
                  <p>{money(detailAd.cost_per_lead)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Leads</p>
                  <p>{detailAd.attributed_leads ?? 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Spend</p>
                  <p>{money(detailAd.spend)}</p>
                </div>
              </div>
              {detailAd.headline && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Headline</p>
                  <p className="text-sm">{detailAd.headline}</p>
                </div>
              )}
              {detailAd.body && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Primary text</p>
                  <p className="whitespace-pre-wrap text-sm">{detailAd.body}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Transcript</p>
                <p className="whitespace-pre-wrap text-sm">
                  {detailAd.transcript ||
                    (detailAd.transcript_status === 'failed'
                      ? 'Could not transcribe this video.'
                      : mediaKind(detailAd) === 'video'
                        ? 'Not transcribed yet — runs automatically on the next pull.'
                        : 'Static ad — no audio to transcribe.')}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Prompt that created it
                </p>
                <p className="whitespace-pre-wrap text-sm">
                  {detailAd.generation_prompt || 'No matching prompt on record.'}
                </p>
              </div>
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  setRecreateAd(detailAd);
                  setDetailAd(null);
                  setResult(null);
                  setNotes('');
                  setTargetClient('');
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copy & recreate for another client
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Recreate */}
      <Dialog open={!!recreateAd} onOpenChange={(o) => !o && setRecreateAd(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Copy & recreate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              Based on: {recreateAd?.name || 'this ad'}
            </p>
            <div>
              <Label className="text-xs">Recreate for</Label>
              <Select value={targetClient} onValueChange={setTargetClient}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Pick a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter((c) => c.id !== recreateAd?.client_id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Image format</Label>
              <Select value={aspect} onValueChange={setAspect}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">Square 1:1</SelectItem>
                  <SelectItem value="4:5">Portrait 4:5</SelectItem>
                  <SelectItem value="9:16">Vertical 9:16</SelectItem>
                  <SelectItem value="16:9">Wide 16:9</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes for the AI (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Angle, audience, must-say points…"
                rows={3}
              />
            </div>
            {result && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                {result.angle && (
                  <p className="text-sm">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    {result.angle}
                  </p>
                )}
                {result.imageUrl ? (
                  <img src={result.imageUrl} alt="New creative" className="w-full rounded-lg" />
                ) : (
                  result.imageError && (
                    <p className="text-xs text-destructive">Image failed: {result.imageError}</p>
                  )
                )}
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">New script</p>
                  <p className="whitespace-pre-wrap text-sm">{result.script}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={runRecreate}
              disabled={!targetClient || recreating}
              className="min-h-[44px]"
            >
              {recreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {result ? 'Generate another version' : 'Generate script + image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
