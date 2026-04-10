import { lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, Image } from 'lucide-react';

const StaticCreativesInline = lazy(() => import('@/pages/StaticCreativesPage'));

export function StaticAdsStudio() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Static Ads Generator</h2>
          <p className="text-sm text-muted-foreground">Generate image creatives at scale with AI</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs"
            onClick={() => window.open('/static-ads', '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Full Page View
          </Button>
        </div>
      </div>

      <Suspense fallback={
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-muted/30 rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 bg-muted/30 rounded-xl" />
            <div className="h-32 bg-muted/30 rounded-xl" />
            <div className="h-32 bg-muted/30 rounded-xl" />
          </div>
        </div>
      }>
        <StaticCreativesInline />
      </Suspense>
    </div>
  );
}
