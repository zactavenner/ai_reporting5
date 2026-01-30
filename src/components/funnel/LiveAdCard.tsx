import { useState } from 'react';
import { MoreHorizontal, ExternalLink, Sparkles, Trash2, Loader2, Globe, Image as ImageIcon, Video, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LiveAd, useDeleteLiveAd, useAnalyzeLiveAd } from '@/hooks/useLiveAds';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';

interface LiveAdCardProps {
  ad: LiveAd;
  isPublicView?: boolean;
}

// Helper to get the best available image
function getBestImageUrl(ad: LiveAd): string | null {
  // Prefer larger images from media_urls (sorted by quality in edge function)
  if (ad.media_urls && ad.media_urls.length > 0) {
    // Find the first URL that looks like a larger image (600+)
    const largeImage = ad.media_urls.find(url => 
      /600|720|1080|1200|scontent/i.test(url)
    );
    if (largeImage) return largeImage;
    return ad.media_urls[0];
  }
  return ad.thumbnail_url;
}

// Get initials from page name
function getInitials(name: string | null): string {
  if (!name) return 'AD';
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Platform icon component
function PlatformIcon({ platform }: { platform: string }) {
  const iconClass = "h-3 w-3";
  switch (platform.toLowerCase()) {
    case 'facebook':
      return <span className={iconClass}>f</span>;
    case 'instagram':
      return <span className={iconClass}>IG</span>;
    case 'messenger':
      return <span className={iconClass}>M</span>;
    default:
      return <Globe className={iconClass} />;
  }
}

// Media type icon
function MediaTypeIcon({ type }: { type: string | null }) {
  const iconClass = "h-3.5 w-3.5";
  switch (type?.toLowerCase()) {
    case 'video':
      return <Video className={iconClass} />;
    case 'carousel':
      return <Layers className={iconClass} />;
    default:
      return <ImageIcon className={iconClass} />;
  }
}

export function LiveAdCard({ ad, isPublicView = false }: LiveAdCardProps) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const deleteMutation = useDeleteLiveAd();
  const analyzeMutation = useAnalyzeLiveAd();

  const bestImage = getBestImageUrl(ad);
  const pageName = ad.page_name || 'Facebook Ad';
  const initials = getInitials(ad.page_name);
  const hasAnalysis = ad.ai_analysis && Object.keys(ad.ai_analysis).length > 0;

  const handleAnalyze = () => {
    analyzeMutation.mutate({ ad });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ adId: ad.id, clientId: ad.client_id });
  };

  const openAdsLibrary = () => {
    if (ad.ad_library_url) {
      window.open(ad.ad_library_url, '_blank');
    }
  };

  return (
    <>
      <Card className="group overflow-hidden border border-border hover:border-primary/30 transition-all duration-200 bg-card max-w-md">
        {/* Header - Facebook Style */}
        <div className="p-3 flex items-start justify-between">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Avatar className="h-10 w-10 shrink-0 bg-primary/10">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground truncate leading-tight">
                {pageName}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                Sponsored · <Globe className="h-3 w-3" />
              </p>
            </div>
          </div>
          
          {!isPublicView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openAdsLibrary}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Ads Library
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAnalyze} disabled={analyzeMutation.isPending}>
                  {analyzeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  AI Analysis
                </DropdownMenuItem>
                {hasAnalysis && (
                  <DropdownMenuItem onClick={() => setAnalysisOpen(true)}>
                    <Sparkles className="h-4 w-4 mr-2 text-primary" />
                    View Analysis
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleDelete} 
                  className="text-destructive"
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Primary Text (Ad Copy) */}
        {ad.primary_text && (
          <div className="px-3 pb-3">
            <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4 leading-relaxed">
              {ad.primary_text}
            </p>
          </div>
        )}

        {/* Creative Image */}
        <div 
          className="relative bg-muted aspect-square cursor-pointer"
          onClick={openAdsLibrary}
        >
          {bestImage ? (
            <img
              src={bestImage}
              alt={`${pageName} ad creative`}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to thumbnail if best image fails
                if (ad.thumbnail_url && e.currentTarget.src !== ad.thumbnail_url) {
                  e.currentTarget.src = ad.thumbnail_url;
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
          
          {/* Media type badge */}
          {ad.media_type && ad.media_type !== 'image' && (
            <Badge 
              variant="secondary" 
              className="absolute top-2 left-2 text-xs gap-1 bg-background/80 backdrop-blur-sm"
            >
              <MediaTypeIcon type={ad.media_type} />
              {ad.media_type}
            </Badge>
          )}

          {/* Analysis indicator */}
          {hasAnalysis && (
            <Badge 
              variant="default" 
              className="absolute top-2 right-2 text-xs gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Analyzed
            </Badge>
          )}
        </div>

        {/* Headline & CTA Section */}
        {(ad.headline || ad.cta_type) && (
          <div className="px-3 py-2.5 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                {ad.headline && (
                  <p className="font-medium text-sm text-foreground truncate">
                    {ad.headline}
                  </p>
                )}
              </div>
              {ad.cta_type && (
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="shrink-0 text-xs h-7 px-3"
                  onClick={openAdsLibrary}
                >
                  {ad.cta_type}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Metadata Footer */}
        <CardContent className="p-3 pt-2.5 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {ad.started_running_on && (
                <span className="text-xs text-muted-foreground">
                  Started {format(new Date(ad.started_running_on), 'MMM d, yyyy')}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1.5">
              {ad.platforms && ad.platforms.length > 0 && ad.platforms.map((platform, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="text-xs px-1.5 py-0.5 capitalize gap-1"
                >
                  <PlatformIcon platform={platform} />
                  {platform === 'facebook' ? 'FB' : platform === 'instagram' ? 'IG' : platform}
                </Badge>
              ))}
            </div>
          </div>

          {/* View in Ads Library button - always visible */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={openAdsLibrary}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            View Original in Ads Library
          </Button>
        </CardContent>
      </Card>

      {/* AI Analysis Dialog */}
      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Analysis: {pageName}
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {ad.ai_analysis?.audit ? (
              <ReactMarkdown>{String(ad.ai_analysis.audit)}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground">No analysis available yet.</p>
            )}
          </div>
          {ad.last_analyzed_at && (
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
              Analyzed {format(new Date(ad.last_analyzed_at), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
