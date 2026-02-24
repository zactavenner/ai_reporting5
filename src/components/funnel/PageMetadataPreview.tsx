import { useState, useEffect, useCallback } from 'react';
import { Globe, FileText, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

interface PageMetadata {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  fetchedAt: string | null;
  cached: boolean;
}

interface PageMetadataPreviewProps {
  url: string;
  stepId?: string;
  className?: string;
}

export function PageMetadataPreview({ url, stepId, className }: PageMetadataPreviewProps) {
  const [metadata, setMetadata] = useState<PageMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [imgError, setImgError] = useState(false);

  const fetchMetadata = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    setImgError(false);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-page-metadata', {
        body: { url, stepId, forceRefresh },
      });
      if (fnError || !data || data.error) {
        setError(true);
      } else {
        setMetadata(data);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [url, stepId]);

  useEffect(() => {
    fetchMetadata(false);
  }, [fetchMetadata]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-3 ${className || ''}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground ml-1.5">Loading metadata…</span>
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className={`text-xs text-muted-foreground text-center py-2 ${className || ''}`}>
        <Globe className="h-3 w-3 inline mr-1" />
        Unable to load metadata
      </div>
    );
  }

  const hasContent = metadata.title || metadata.description;

  if (!hasContent && !metadata.image) {
    return (
      <div className={`text-xs text-muted-foreground text-center py-2 ${className || ''}`}>
        <FileText className="h-3 w-3 inline mr-1" />
        No metadata found
      </div>
    );
  }

  return (
    <div className={`mt-2 rounded-lg border bg-card overflow-hidden max-w-[320px] ${className || ''}`}>
      {/* OG Image */}
      {metadata.image && !imgError && (
        <div className="w-full h-[140px] bg-muted overflow-hidden">
          <img
            src={metadata.image}
            alt={metadata.title || 'Page preview'}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      {/* Text Content */}
      <div className="p-2.5 space-y-1">
        {(metadata.siteName || metadata.favicon) && (
          <div className="flex items-center gap-1.5">
            {metadata.favicon && (
              <img
                src={metadata.favicon}
                alt=""
                className="h-3.5 w-3.5 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            {metadata.siteName && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium truncate">
                {metadata.siteName}
              </span>
            )}
          </div>
        )}

        {metadata.title && (
          <h4 className="text-xs font-semibold text-card-foreground leading-tight line-clamp-2">
            {metadata.title}
          </h4>
        )}

        {metadata.description && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {metadata.description}
          </p>
        )}

        {/* Last updated + manual sync */}
        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-[10px] text-muted-foreground">
            {metadata.fetchedAt
              ? `Updated ${formatDistanceToNow(new Date(metadata.fetchedAt), { addSuffix: true })}`
              : 'Just fetched'}
            {metadata.cached && ' (cached)'}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => fetchMetadata(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="text-xs">Refresh metadata</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
