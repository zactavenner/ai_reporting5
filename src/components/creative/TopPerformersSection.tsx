import { useMemo } from 'react';
import { useAllCreatives } from '@/hooks/useAllCreatives';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Eye, MousePointerClick, DollarSign } from 'lucide-react';
import type { Client } from '@/hooks/useClients';

interface TopPerformersSectionProps {
  clients: Client[];
}

export function TopPerformersSection({ clients }: TopPerformersSectionProps) {
  const { data: creatives = [], isLoading } = useAllCreatives();

  const topPerformers = useMemo(() => {
    return creatives
      .filter(c => c.ai_performance_score && c.ai_performance_score > 0)
      .sort((a, b) => (b.ai_performance_score || 0) - (a.ai_performance_score || 0))
      .slice(0, 20);
  }, [creatives]);

  const getClientName = (clientId: string | null) => {
    if (!clientId) return 'Unknown';
    return clients.find(c => c.id === clientId)?.name || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="aspect-square animate-pulse bg-muted/50" />
        ))}
      </div>
    );
  }

  if (topPerformers.length === 0) {
    return (
      <Card className="p-12 text-center">
        <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <h3 className="font-semibold text-muted-foreground">No performance data yet</h3>
        <p className="text-sm text-muted-foreground/70 mt-1">Creatives will appear here once they have performance scores</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {topPerformers.map((creative, idx) => (
        <Card key={creative.id} className="overflow-hidden group hover:ring-1 hover:ring-primary/30 transition-all">
          <div className="relative aspect-square bg-muted/30">
            {creative.file_url ? (
              <img
                src={creative.file_url}
                alt={creative.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                No preview
              </div>
            )}
            {idx < 3 && (
              <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold">
                #{idx + 1}
              </Badge>
            )}
            <div className="absolute top-2 right-2">
              <Badge variant="outline" className="bg-background/80 text-[10px] gap-1">
                <TrendingUp className="h-3 w-3" />
                {creative.ai_performance_score}
              </Badge>
            </div>
          </div>
          <div className="p-3 space-y-1">
            <p className="text-xs font-medium truncate">{creative.title}</p>
            <p className="text-[10px] text-muted-foreground truncate">{getClientName(creative.client_id)}</p>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="secondary" className="text-[9px] capitalize">{creative.platform}</Badge>
              <Badge variant="outline" className="text-[9px] capitalize">{creative.status}</Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
