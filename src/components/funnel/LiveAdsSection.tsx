import { useState } from 'react';
import { RefreshCw, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveAdCard } from './LiveAdCard';
import { ScrapeAdsModal } from './ScrapeAdsModal';
import { useLiveAds } from '@/hooks/useLiveAds';
import { formatDistanceToNow } from 'date-fns';

interface LiveAdsSectionProps {
  clientId: string;
  isPublicView?: boolean;
}

export function LiveAdsSection({ clientId, isPublicView = false }: LiveAdsSectionProps) {
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const { data: ads = [], isLoading, refetch } = useLiveAds(clientId);

  const lastScrapedAt = ads.length > 0 
    ? new Date(Math.max(...ads.map(ad => new Date(ad.scraped_at).getTime())))
    : null;

  return (
    <>
      <Card className="border-2 border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg font-bold">Live Ads</CardTitle>
              <Badge variant="outline" className="text-xs">
                {ads.length} {ads.length === 1 ? 'ad' : 'ads'}
              </Badge>
              {lastScrapedAt && (
                <span className="text-xs text-muted-foreground">
                  Last synced {formatDistanceToNow(lastScrapedAt, { addSuffix: true })}
                </span>
              )}
            </div>
            {!isPublicView && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setScrapeModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Sync from Ads Library
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Active ads from Facebook Ads Library for creative inspiration and AI analysis
          </p>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ExternalLink className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">No live ads synced yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Sync ads from Facebook Ads Library to preview and analyze them
              </p>
              {!isPublicView && (
                <Button onClick={() => setScrapeModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Sync Your First Ads
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {ads.map((ad) => (
                <LiveAdCard key={ad.id} ad={ad} isPublicView={isPublicView} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ScrapeAdsModal
        clientId={clientId}
        open={scrapeModalOpen}
        onOpenChange={setScrapeModalOpen}
      />
    </>
  );
}
