import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useScrapeAds } from '@/hooks/useLiveAds';
import { supabase } from '@/integrations/supabase/client';

interface ScrapeAdsModalProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScrapeAdsModal({ clientId, open, onOpenChange }: ScrapeAdsModalProps) {
  const [pageId, setPageId] = useState('');
  const [adsLibraryUrl, setAdsLibraryUrl] = useState('');
  const [inputMode, setInputMode] = useState<'pageId' | 'url'>('pageId');
  const scrapeAds = useScrapeAds();

  // Load saved page ID from client settings
  useEffect(() => {
    if (open && clientId) {
      loadSavedSettings();
    }
  }, [open, clientId]);

  const loadSavedSettings = async () => {
    const { data } = await supabase
      .from('client_settings')
      .select('ads_library_page_id, ads_library_url')
      .eq('client_id', clientId)
      .single();

    if (data?.ads_library_page_id) {
      setPageId(data.ads_library_page_id);
      setInputMode('pageId');
    } else if (data?.ads_library_url) {
      setAdsLibraryUrl(data.ads_library_url);
      setInputMode('url');
    }
  };

  const handleSubmit = async () => {
    // Save settings for future use
    await supabase
      .from('client_settings')
      .update({
        ads_library_page_id: inputMode === 'pageId' ? pageId : null,
        ads_library_url: inputMode === 'url' ? adsLibraryUrl : null,
      })
      .eq('client_id', clientId);

    // Scrape the ads
    await scrapeAds.mutateAsync({
      clientId,
      pageId: inputMode === 'pageId' ? pageId : undefined,
      adsLibraryUrl: inputMode === 'url' ? adsLibraryUrl : undefined,
    });

    onOpenChange(false);
  };

  const extractPageIdFromUrl = (url: string): string | null => {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('view_all_page_id') || urlObj.searchParams.get('id');
    } catch {
      return null;
    }
  };

  const handleUrlChange = (url: string) => {
    setAdsLibraryUrl(url);
    // Auto-extract page ID if present
    const extractedId = extractPageIdFromUrl(url);
    if (extractedId) {
      setPageId(extractedId);
    }
  };

  const generatedUrl = pageId
    ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=${pageId}`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Ads from Facebook Ads Library</DialogTitle>
          <DialogDescription>
            Enter a Facebook Page ID or full Ads Library URL to scrape active ads
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Input Mode Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={inputMode === 'pageId' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputMode('pageId')}
            >
              Page ID
            </Button>
            <Button
              type="button"
              variant={inputMode === 'url' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputMode('url')}
            >
              Full URL
            </Button>
          </div>

          {inputMode === 'pageId' ? (
            <div className="space-y-2">
              <Label htmlFor="pageId">Facebook Page ID</Label>
              <Input
                id="pageId"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="e.g., 584060471449732"
              />
              <p className="text-xs text-muted-foreground">
                Find this in the Ads Library URL after "view_all_page_id="
              </p>
              {generatedUrl && (
                <div className="pt-2">
                  <Label className="text-xs text-muted-foreground">Generated URL:</Label>
                  <a
                    href={generatedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Preview in Ads Library
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="adsLibraryUrl">Ads Library URL</Label>
              <Input
                id="adsLibraryUrl"
                value={adsLibraryUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.facebook.com/ads/library/..."
              />
              <p className="text-xs text-muted-foreground">
                Paste the full URL from Facebook Ads Library
              </p>
            </div>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Using the official Meta Marketing API to sync active ads including images, videos, and ad copy.
              This may take a few seconds depending on the number of ads.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                scrapeAds.isPending ||
                (inputMode === 'pageId' && !pageId.trim()) ||
                (inputMode === 'url' && !adsLibraryUrl.trim())
              }
            >
              {scrapeAds.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                'Sync Ads'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
