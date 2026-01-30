import { useState } from 'react';
import { ExternalLink, Trash2, Sparkles, MoreHorizontal, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LiveAd, useDeleteLiveAd, useAnalyzeLiveAd } from '@/hooks/useLiveAds';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';

interface LiveAdCardProps {
  ad: LiveAd;
  isPublicView?: boolean;
}

export function LiveAdCard({ ad, isPublicView = false }: LiveAdCardProps) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const deleteAd = useDeleteLiveAd();
  const analyzeAd = useAnalyzeLiveAd();

  const handleDelete = () => {
    if (confirm('Remove this ad from your library?')) {
      deleteAd.mutate({ adId: ad.id, clientId: ad.client_id });
    }
  };

  const handleAnalyze = () => {
    analyzeAd.mutate({ ad });
  };

  const openInLibrary = () => {
    if (ad.ad_library_url) {
      window.open(ad.ad_library_url, '_blank');
    }
  };

  // Format the start date
  const formattedDate = ad.started_running_on 
    ? format(new Date(ad.started_running_on), 'MMM d, yyyy')
    : ad.scraped_at 
      ? format(new Date(ad.scraped_at), 'MMM d, yyyy')
      : null;

  // Get the display image
  const displayImage = ad.thumbnail_url || (ad.media_urls && ad.media_urls.length > 0 ? ad.media_urls[0] : null);

  // Get page initials for avatar
  const pageInitials = ad.page_name 
    ? ad.page_name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
    : 'AD';

  return (
    <>
      <Card className="overflow-hidden border border-border bg-card max-w-sm">
        {/* Facebook-style Header */}
        <div className="flex items-start gap-3 p-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {pageInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{ad.page_name || 'Ad Library'}</p>
            <p className="text-xs text-muted-foreground">Sponsored</p>
          </div>
          {!isPublicView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openInLibrary}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Ads Library
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAnalyze} disabled={analyzeAd.isPending}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze with AI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Primary Text - Full Ad Copy */}
        {ad.primary_text && (
          <div className="px-3 pb-3">
            <p className="text-sm whitespace-pre-line leading-relaxed">
              {ad.primary_text}
            </p>
          </div>
        )}

        {/* Ad Creative Image */}
        <div className="relative bg-muted">
          {displayImage ? (
            <img
              src={displayImage}
              alt={ad.headline || ad.page_name || 'Ad creative'}
              className="w-full h-auto"
            />
          ) : (
            <div className="aspect-square flex items-center justify-center text-muted-foreground">
              <span className="text-sm">No image available</span>
            </div>
          )}
          
          {/* Media type badge */}
          {ad.media_type && ad.media_type !== 'image' && (
            <Badge 
              variant="secondary" 
              className="absolute top-2 right-2 text-xs capitalize"
            >
              {ad.media_type}
            </Badge>
          )}

          {/* Analyzing overlay */}
          {analyzeAd.isPending && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Analyzing...</span>
              </div>
            </div>
          )}
        </div>

        {/* CTA Bar (if headline or CTA exists) */}
        {(ad.headline || ad.cta_type) && (
          <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              {ad.headline && (
                <p className="text-sm font-semibold truncate">{ad.headline}</p>
              )}
            </div>
            {ad.cta_type && (
              <Button size="sm" variant="secondary" className="shrink-0 text-xs h-8">
                {ad.cta_type}
              </Button>
            )}
          </div>
        )}

        {/* Meta Info Footer */}
        <div className="px-3 py-2 border-t border-border bg-muted/20 space-y-2">
          {/* Date */}
          {formattedDate && (
            <p className="text-xs text-muted-foreground">
              Started running on {formattedDate}
            </p>
          )}

          {/* Platform Badges */}
          {ad.platforms && ad.platforms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ad.platforms.map((platform) => (
                <Badge
                  key={platform}
                  variant="outline"
                  className="text-[10px] capitalize"
                >
                  {platform}
                </Badge>
              ))}
            </div>
          )}

          {/* AI Analysis indicator */}
          {ad.ai_analysis && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-7 text-primary"
              onClick={() => setAnalysisOpen(true)}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              View AI Analysis
            </Button>
          )}
        </div>
      </Card>

      {/* Analysis Modal */}
      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Analysis - {ad.page_name || 'Live Ad'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {ad.ai_analysis?.audit ? (
                <ReactMarkdown>{String(ad.ai_analysis.audit)}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">No analysis available</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
