import { useState } from 'react';
import { RefreshCw, Loader2, ChevronRight, BarChart3, DollarSign, Eye, MousePointer, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMetaCampaigns, useMetaAdSets, useMetaAds, useSyncMetaAds } from '@/hooks/useMetaAds';
import { useClientSettings } from '@/hooks/useClientSettings';
import { formatDistanceToNow } from 'date-fns';

interface AdsManagerTabProps {
  clientId: string;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || '').toUpperCase();
  const variant = s === 'ACTIVE' ? 'default' : s === 'PAUSED' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="text-[10px] uppercase">{status || 'unknown'}</Badge>;
}

function formatCurrency(val: number | null) {
  if (val == null || val === 0) return '$0';
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(val: number | bigint | null) {
  if (val == null || val === 0) return '0';
  return Number(val).toLocaleString();
}

function MetricPill({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span>{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export function AdsManagerTab({ clientId }: AdsManagerTabProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading: campaignsLoading } = useMetaCampaigns(clientId);
  const { data: adSets = [], isLoading: adSetsLoading } = useMetaAdSets(clientId, selectedCampaignId || undefined);
  const { data: ads = [], isLoading: adsLoading } = useMetaAds(clientId, selectedAdSetId || undefined);
  const { data: settings } = useClientSettings(clientId);
  const syncMutation = useSyncMetaAds();

  const lastSync = (settings as any)?.meta_ads_last_sync
    ? formatDistanceToNow(new Date((settings as any).meta_ads_last_sync), { addSuffix: true })
    : null;

  const selectedCampaign = campaigns.find((c: any) => c.id === selectedCampaignId);
  const selectedAdSet = adSets.find((a: any) => a.id === selectedAdSetId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Ads Manager</h2>
          <Badge variant="outline" className="text-xs">
            {campaigns.length} campaigns
          </Badge>
          {lastSync && (
            <span className="text-xs text-muted-foreground">Last synced {lastSync}</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => syncMutation.mutate(clientId)}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sync Meta Ads
        </Button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => { setSelectedCampaignId(null); setSelectedAdSetId(null); }}>
          Campaigns
        </Button>
        {selectedCampaign && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => setSelectedAdSetId(null)}>
              {selectedCampaign.name}
            </Button>
          </>
        )}
        {selectedAdSet && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{selectedAdSet.name}</span>
          </>
        )}
      </div>

      {/* Content */}
      {!selectedCampaignId && (
        <CampaignList
          campaigns={campaigns}
          isLoading={campaignsLoading}
          onSelect={(id) => { setSelectedCampaignId(id); setSelectedAdSetId(null); }}
        />
      )}

      {selectedCampaignId && !selectedAdSetId && (
        <AdSetList
          adSets={adSets}
          isLoading={adSetsLoading}
          onSelect={setSelectedAdSetId}
        />
      )}

      {selectedAdSetId && (
        <AdsList ads={ads} isLoading={adsLoading} />
      )}
    </div>
  );
}

function CampaignList({ campaigns, isLoading, onSelect }: { campaigns: any[]; isLoading: boolean; onSelect: (id: string) => void }) {
  if (isLoading) return <LoadingState />;
  if (campaigns.length === 0) return <EmptyState label="No campaigns synced yet. Click 'Sync Meta Ads' to pull data." />;

  return (
    <div className="space-y-2">
      {campaigns.map((c: any) => (
        <Card key={c.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSelect(c.id)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{c.name}</span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <MetricPill icon={DollarSign} label="Spend" value={formatCurrency(c.spend)} />
                  <MetricPill icon={Eye} label="Impr" value={formatNumber(c.impressions)} />
                  <MetricPill icon={MousePointer} label="Clicks" value={formatNumber(c.clicks)} />
                  <MetricPill icon={Target} label="Objective" value={c.objective || '—'} />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdSetList({ adSets, isLoading, onSelect }: { adSets: any[]; isLoading: boolean; onSelect: (id: string) => void }) {
  if (isLoading) return <LoadingState />;
  if (adSets.length === 0) return <EmptyState label="No ad sets found for this campaign." />;

  return (
    <div className="space-y-2">
      {adSets.map((a: any) => (
        <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSelect(a.id)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{a.name}</span>
                  <StatusBadge status={a.effective_status || a.status} />
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <MetricPill icon={DollarSign} label="Spend" value={formatCurrency(a.spend)} />
                  <MetricPill icon={Eye} label="Impr" value={formatNumber(a.impressions)} />
                  <MetricPill icon={MousePointer} label="Clicks" value={formatNumber(a.clicks)} />
                  <MetricPill icon={BarChart3} label="CTR" value={`${Number(a.ctr || 0).toFixed(2)}%`} />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdsList({ ads, isLoading }: { ads: any[]; isLoading: boolean }) {
  if (isLoading) return <LoadingState />;
  if (ads.length === 0) return <EmptyState label="No ads found for this ad set." />;

  return (
    <div className="space-y-2">
      {ads.map((a: any) => (
        <Card key={a.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {a.thumbnail_url && (
                <img src={a.thumbnail_url} alt="" className="w-16 h-16 rounded object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{a.name}</span>
                  <StatusBadge status={a.effective_status || a.status} />
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <MetricPill icon={DollarSign} label="Spend" value={formatCurrency(a.spend)} />
                  <MetricPill icon={Eye} label="Impr" value={formatNumber(a.impressions)} />
                  <MetricPill icon={MousePointer} label="Clicks" value={formatNumber(a.clicks)} />
                  <MetricPill icon={BarChart3} label="CTR" value={`${Number(a.ctr || 0).toFixed(2)}%`} />
                  {Number(a.conversions) > 0 && (
                    <MetricPill icon={Target} label="Conv" value={formatNumber(a.conversions)} />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <BarChart3 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}
