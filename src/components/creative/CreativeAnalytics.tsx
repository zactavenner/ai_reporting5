import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Image, Video, TrendingUp, CheckCircle, Clock, XCircle, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClients } from '@/hooks/useClients';
import { subDays } from 'date-fns';

interface MetricCard {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

export function CreativeAnalytics({ embedded = false }: { embedded?: boolean }) {
  const { data: clients = [] } = useClients();

  const { data: creatives = [] } = useQuery({
    queryKey: ['analytics-creatives'],
    queryFn: async () => {
      const { data } = await supabase
        .from('creatives')
        .select('id, type, status, platform, created_at, source, aspect_ratio, client_id, ai_performance_score');
      return data || [];
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['analytics-assets'],
    queryFn: async () => {
      const { data } = await supabase
        .from('assets')
        .select('id, type, status, created_at, client_id')
        .eq('status', 'completed');
      return data || [];
    },
  });

  const last30Days = subDays(new Date(), 30);
  const last7Days = subDays(new Date(), 7);

  const stats = useMemo(() => {
    const recentCreatives = creatives.filter(c => new Date(c.created_at) >= last30Days);
    const weekCreatives = creatives.filter(c => new Date(c.created_at) >= last7Days);
    const approved = creatives.filter(c => c.status === 'approved' || c.status === 'launched');
    const pending = creatives.filter(c => c.status === 'pending');
    const rejected = creatives.filter(c => c.status === 'rejected' || c.status === 'revisions');
    const images = creatives.filter(c => c.type === 'image');
    const videos = creatives.filter(c => c.type === 'video');
    const aiBatch = creatives.filter(c => c.source === 'ai_batch');
    const approvalRate = creatives.length > 0
      ? Math.round((approved.length / creatives.length) * 100)
      : 0;

    const clientBreakdown = clients
      .filter(c => c.status === 'active')
      .map(client => {
        const clientCreatives = creatives.filter(c => c.client_id === client.id);
        const clientRecent = clientCreatives.filter(c => new Date(c.created_at) >= last30Days);
        const clientApproved = clientCreatives.filter(c => c.status === 'approved' || c.status === 'launched');
        return {
          id: client.id,
          name: client.name,
          total: clientCreatives.length,
          recent: clientRecent.length,
          approved: clientApproved.length,
          approvalRate: clientCreatives.length > 0 ? Math.round((clientApproved.length / clientCreatives.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.total - a.total);

    const platformCounts: Record<string, number> = {};
    creatives.forEach(c => {
      const p = c.platform || 'unknown';
      platformCounts[p] = (platformCounts[p] || 0) + 1;
    });

    return {
      total: creatives.length,
      recentCount: recentCreatives.length,
      weekCount: weekCreatives.length,
      approved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      images: images.length,
      videos: videos.length,
      aiBatch: aiBatch.length,
      approvalRate,
      clientBreakdown,
      platformCounts,
      generatedAssets: assets.length,
    };
  }, [creatives, assets, clients, last30Days, last7Days]);

  const metrics: MetricCard[] = [
    { label: 'Total Creatives', value: stats.total, subtitle: `${stats.weekCount} this week`, icon: <BarChart3 className="h-4 w-4" />, color: 'text-primary' },
    { label: 'Approval Rate', value: `${stats.approvalRate}%`, subtitle: `${stats.approved} approved`, icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-500' },
    { label: 'Pending Review', value: stats.pending, subtitle: 'awaiting action', icon: <Clock className="h-4 w-4" />, color: 'text-amber-500' },
    { label: 'AI Generated', value: stats.aiBatch, subtitle: `${stats.generatedAssets} assets`, icon: <Sparkles className="h-4 w-4" />, color: 'text-violet-500' },
    { label: 'Images', value: stats.images, icon: <Image className="h-4 w-4" />, color: 'text-blue-500' },
    { label: 'Videos', value: stats.videos, icon: <Video className="h-4 w-4" />, color: 'text-pink-500' },
    { label: 'Revisions/Rejected', value: stats.rejected, icon: <XCircle className="h-4 w-4" />, color: 'text-red-500' },
    { label: 'Last 30 Days', value: stats.recentCount, subtitle: 'new creatives', icon: <TrendingUp className="h-4 w-4" />, color: 'text-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map(m => (
          <Card key={m.label} className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={m.color}>{m.icon}</span>
              </div>
              <p className="text-2xl font-bold">{m.value}</p>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              {m.subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{m.subtitle}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Creative Output by Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.clientBreakdown.slice(0, 10).map(client => (
              <div key={client.id} className="flex items-center justify-between text-sm">
                <span className="font-medium truncate max-w-[200px]">{client.name}</span>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{client.recent} this month</span>
                  <span className="text-green-600">{client.approvalRate}% approved</span>
                  <span className="font-medium text-foreground">{client.total} total</span>
                </div>
              </div>
            ))}
            {stats.clientBreakdown.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No creative data yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Platform Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            {Object.entries(stats.platformCounts).map(([platform, count]) => (
              <div key={platform} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <span className="text-xs font-medium capitalize">{platform === 'meta' ? 'Meta/IG' : platform}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
