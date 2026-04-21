import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Loader2, Play, ImageIcon, ExternalLink, DollarSign, Eye, MousePointerClick, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

interface Props {
  clientId: string;
  clientName: string;
}

interface MetaAdRow {
  id: string;
  meta_ad_id: string;
  name: string;
  effective_status: string | null;
  status: string | null;
  thumbnail_url: string | null;
  full_image_url: string | null;
  image_url: string | null;
  video_thumbnail_url: string | null;
  video_source_url: string | null;
  media_type: string | null;
  preview_url: string | null;
  headline: string | null;
  body: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  attributed_leads: number | null;
  cost_per_lead: number | null;
  synced_at: string | null;
}

const fmtMoney = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtNum = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
const fmtPct = (n: number | null) => (n == null ? '—' : `${(n).toFixed(2)}%`);

export function MetaTopCreatives({ clientId, clientName }: Props) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [previewing, setPreviewing] = useState<MetaAdRow | null>(null);
  const autoSyncedRef = useRef<string | null>(null);
  const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

  const sevenDaysAgo = subDays(new Date(), 7).toISOString();

  const { data: ads = [], isLoading, refetch } = useQuery({
    queryKey: ['meta-top-creatives', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meta_ads')
        .select('*')
        .eq('client_id', clientId)
        .gte('synced_at', sevenDaysAgo)
        .gt('spend', 0)
        .order('spend', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as MetaAdRow[];
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    const startDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');
    try {
      toast.info('Syncing last 7 days from Meta…');
      const { data, error } = await supabase.functions.invoke('sync-meta-ads', {
        body: { clientId, startDate, endDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Sync complete — ${data?.ads ?? 0} ads, ${data?.dailyMetrics ?? 0} day rows`);
      await refetch();
      qc.invalidateQueries({ queryKey: ['meta-top-creatives', clientId] });
      // Backfill HD media (videos + full-res images) for any ads missing it
      try {
        await supabase.functions.invoke('fetch-ad-media-hd', { body: { clientId } });
        await refetch();
      } catch (hdErr) {
        console.warn('HD media backfill skipped:', hdErr);
      }
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync on mount if data is stale or missing
  useEffect(() => {
    if (!clientId || isLoading) return;
    if (autoSyncedRef.current === clientId) return;

    const newest = ads.reduce<number>((max, a) => {
      const t = a.synced_at ? new Date(a.synced_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    const isStale = ads.length === 0 || Date.now() - newest > STALE_MS;

    if (isStale && !syncing) {
      autoSyncedRef.current = clientId;
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isLoading, ads.length]);

  const totals = ads.reduce(
    (acc, a) => {
      acc.spend += Number(a.spend || 0);
      acc.impressions += Number(a.impressions || 0);
      acc.clicks += Number(a.clicks || 0);
      acc.leads += Number(a.attributed_leads || 0);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, leads: 0 },
  );
  const blendedCPL = totals.leads > 0 ? totals.spend / totals.leads : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Top Creatives — Last 7 Days</h3>
          <p className="text-xs text-muted-foreground">
            Pulled from {clientName}'s Meta ad account. HD media + performance.
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing} size="sm">
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {syncing ? 'Syncing…' : 'Sync Last 7 Days'}
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <SummaryStat icon={DollarSign} label="Spend" value={fmtMoney(totals.spend)} />
        <SummaryStat icon={Eye} label="Impressions" value={fmtNum(totals.impressions)} />
        <SummaryStat icon={MousePointerClick} label="Clicks" value={fmtNum(totals.clicks)} />
        <SummaryStat icon={Users} label="Leads" value={fmtNum(totals.leads)} />
        <SummaryStat icon={TrendingUp} label="Blended CPL" value={fmtMoney(blendedCPL)} />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No creatives found in the last 7 days. Click <strong>Sync Last 7 Days</strong> to pull from Meta.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ads.map((ad) => (
            <CreativeCard key={ad.id} ad={ad} onPreview={() => setPreviewing(ad)} />
          ))}
        </div>
      )}

      {/* HD Preview modal (lightweight) */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewing(null)}
        >
          <div
            className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{previewing.name}</p>
                <p className="text-xs text-muted-foreground truncate">{previewing.headline || '—'}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewing(null)}>Close</Button>
            </div>
            <div className="p-4 space-y-3">
              {previewing.media_type === 'video' && previewing.video_source_url ? (
                <video src={previewing.video_source_url} controls className="w-full rounded" />
              ) : (
                <img
                  src={previewing.full_image_url || previewing.image_url || previewing.thumbnail_url || ''}
                  alt={previewing.name}
                  className="w-full rounded"
                />
              )}
              {previewing.body && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{previewing.body}</p>
              )}
              {previewing.preview_url && (
                <a
                  href={previewing.preview_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open Meta preview <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-base font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function CreativeCard({ ad, onPreview }: { ad: MetaAdRow; onPreview: () => void }) {
  const isVideo = ad.media_type === 'video' && !!ad.video_source_url;
  const thumb = ad.video_thumbnail_url || ad.full_image_url || ad.image_url || ad.thumbnail_url;
  const isActive = (ad.effective_status || ad.status || '').toUpperCase() === 'ACTIVE';

  return (
    <Card className="overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-square bg-muted overflow-hidden group"
      >
        {thumb ? (
          <img src={thumb} alt={ad.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="bg-white/90 rounded-full p-3">
              <Play className="h-5 w-5 text-black fill-black" />
            </div>
          </div>
        )}
        <Badge
          variant={isActive ? 'default' : 'secondary'}
          className="absolute top-2 left-2 text-[10px]"
        >
          {isActive ? 'Active' : (ad.effective_status || ad.status || 'Inactive')}
        </Badge>
      </button>
      <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
        <p className="text-sm font-medium line-clamp-2" title={ad.name}>{ad.name}</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs mt-auto">
          <Stat label="Spend" value={fmtMoney(ad.spend)} />
          <Stat label="CPL" value={fmtMoney(ad.cost_per_lead)} highlight />
          <Stat label="Leads" value={fmtNum(ad.attributed_leads)} />
          <Stat label="CTR" value={fmtPct(ad.ctr)} />
          <Stat label="Impr." value={fmtNum(ad.impressions)} />
          <Stat label="Clicks" value={fmtNum(ad.clicks)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-primary' : 'font-medium'}>{value}</span>
    </div>
  );
}