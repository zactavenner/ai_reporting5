import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, CheckCircle, XCircle, Clock, AlertTriangle, Database, Radio, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SyncStats {
  totalClients: number;
  metaHealthy: number;
  metaStale: number;
  metaError: number;
  metaNotConfigured: number;
  ghlHealthy: number;
  ghlStale: number;
  ghlError: number;
  ghlNotConfigured: number;
}

function StatCard({ title, icon: Icon, value, subtitle, color }: { title: string; icon: React.ElementType; value: string | number; subtitle?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <Icon className={`h-4 w-4 ${color || 'text-muted-foreground'}`} />
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function IntegrationHealthBar({ label, healthy, stale, error, notConfigured, total }: { label: string; healthy: number; stale: number; error: number; notConfigured: number; total: number }) {
  const healthPct = total > 0 ? (healthy / total) * 100 : 0;
  const stalePct = total > 0 ? (stale / total) * 100 : 0;
  const errorPct = total > 0 ? (error / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-chart-2" />{healthy}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-chart-4" />{stale}</span>
          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" />{error}</span>
          {notConfigured > 0 && <span className="text-muted-foreground">{notConfigured} unconfigured</span>}
        </div>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden flex">
        {healthPct > 0 && <div className="bg-chart-2 h-full transition-all" style={{ width: `${healthPct}%` }} />}
        {stalePct > 0 && <div className="bg-chart-4 h-full transition-all" style={{ width: `${stalePct}%` }} />}
        {errorPct > 0 && <div className="bg-destructive h-full transition-all" style={{ width: `${errorPct}%` }} />}
      </div>
    </div>
  );
}

export function SyncOverviewTab() {
  // Client sync statuses
  const { data: clients = [] } = useQuery({
    queryKey: ['sync-overview-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status, ghl_location_id, ghl_api_key, ghl_sync_status, last_ghl_sync_at, meta_ad_account_id, hubspot_portal_id')
        .in('status', ['active', 'onboarding']);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clientSettings = [] } = useQuery({
    queryKey: ['sync-overview-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_settings')
        .select('client_id, meta_ads_last_sync, meta_ads_sync_enabled');
      if (error) throw error;
      return data || [];
    },
  });

  // Recent sync log stats
  const { data: recentSyncs } = useQuery({
    queryKey: ['sync-overview-recent'],
    queryFn: async () => {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data, error } = await supabase
        .from('sync_logs')
        .select('sync_type, status, records_synced')
        .gte('started_at', since.toISOString());
      if (error) throw error;
      const total = data?.length || 0;
      const successful = data?.filter(d => d.status === 'success').length || 0;
      const failed = data?.filter(d => d.status === 'failed').length || 0;
      const records = data?.reduce((sum, d) => sum + (d.records_synced || 0), 0) || 0;
      return { total, successful, failed, records };
    },
  });

  // Recent webhook stats
  const { data: webhookStats } = useQuery({
    queryKey: ['sync-overview-webhooks'],
    queryFn: async () => {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('status')
        .gte('processed_at', since.toISOString());
      if (error) throw error;
      const total = data?.length || 0;
      const success = data?.filter(d => d.status === 'success').length || 0;
      return { total, success, errorCount: total - success };
    },
  });

  // Sync errors (last 24h)
  const { data: errorCount = 0 } = useQuery({
    queryKey: ['sync-overview-errors'],
    queryFn: async () => {
      const since = new Date();
      since.setHours(since.getHours() - 24);
      const { count, error } = await supabase
        .from('sync_errors')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since.toISOString());
      if (error) throw error;
      return count || 0;
    },
  });

  // Calculate stats
  const settingsMap = new Map(clientSettings.map(s => [s.client_id, s]));
  const now = Date.now();

  function getTimeStatus(lastSync: string | null, hasCredentials: boolean, thresholdH = 26) {
    if (!hasCredentials || !lastSync) return 'not_configured';
    const hours = (now - new Date(lastSync).getTime()) / 3600000;
    if (hours <= thresholdH) return 'healthy';
    if (hours <= 72) return 'stale';
    return 'error';
  }

  const stats: SyncStats = {
    totalClients: clients.length,
    metaHealthy: 0, metaStale: 0, metaError: 0, metaNotConfigured: 0,
    ghlHealthy: 0, ghlStale: 0, ghlError: 0, ghlNotConfigured: 0,
  };

  clients.forEach(c => {
    const s = settingsMap.get(c.id);
    const metaStatus = getTimeStatus(s?.meta_ads_last_sync, !!(c as any).meta_ad_account_id);
    const ghlStatus = c.ghl_sync_status === 'error' ? 'error' : getTimeStatus(c.last_ghl_sync_at, !!(c.ghl_location_id && c.ghl_api_key), 4);

    if (metaStatus === 'healthy') stats.metaHealthy++;
    else if (metaStatus === 'stale') stats.metaStale++;
    else if (metaStatus === 'error') stats.metaError++;
    else stats.metaNotConfigured++;

    if (ghlStatus === 'healthy') stats.ghlHealthy++;
    else if (ghlStatus === 'stale') stats.ghlStale++;
    else if (ghlStatus === 'error') stats.ghlError++;
    else stats.ghlNotConfigured++;
  });

  const overallHealth = stats.totalClients > 0
    ? Math.round(((stats.metaHealthy + stats.ghlHealthy) / ((stats.totalClients - stats.metaNotConfigured) + (stats.totalClients - stats.ghlNotConfigured))) * 100)
    : 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Overall Health"
            icon={Activity}
            value={`${isNaN(overallHealth) ? 0 : overallHealth}%`}
            subtitle={`${stats.totalClients} active clients`}
            color={overallHealth >= 80 ? 'text-chart-2' : overallHealth >= 50 ? 'text-chart-4' : 'text-destructive'}
          />
          <StatCard
            title="Syncs (24h)"
            icon={Database}
            value={recentSyncs?.total ?? '—'}
            subtitle={`${recentSyncs?.successful ?? 0} successful · ${recentSyncs?.failed ?? 0} failed`}
            color={recentSyncs && recentSyncs.failed === 0 ? 'text-chart-2' : 'text-chart-4'}
          />
          <StatCard
            title="Webhooks (24h)"
            icon={Radio}
            value={webhookStats?.total ?? '—'}
            subtitle={`${webhookStats?.success ?? 0} processed · ${webhookStats?.errorCount ?? 0} errors`}
            color={webhookStats && webhookStats.errorCount === 0 ? 'text-chart-2' : 'text-chart-4'}
          />
          <StatCard
            title="API Errors (24h)"
            icon={AlertTriangle}
            value={errorCount}
            subtitle="Across all integrations"
            color={errorCount === 0 ? 'text-chart-2' : 'text-destructive'}
          />
        </div>

        {/* Integration Health Bars */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Integration Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <IntegrationHealthBar
              label="Meta Ads"
              healthy={stats.metaHealthy}
              stale={stats.metaStale}
              error={stats.metaError}
              notConfigured={stats.metaNotConfigured}
              total={stats.totalClients}
            />
            <IntegrationHealthBar
              label="GoHighLevel (CRM)"
              healthy={stats.ghlHealthy}
              stale={stats.ghlStale}
              error={stats.ghlError}
              notConfigured={stats.ghlNotConfigured}
              total={stats.totalClients}
            />
          </CardContent>
        </Card>

        {/* Per-Client Status Grid */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Client Sync Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {clients.map(c => {
                const s = settingsMap.get(c.id);
                const metaStatus = getTimeStatus(s?.meta_ads_last_sync, !!(c as any).meta_ad_account_id);
                const ghlStatus = c.ghl_sync_status === 'error' ? 'error' : getTimeStatus(c.last_ghl_sync_at, !!(c.ghl_location_id && c.ghl_api_key), 4);
                const isFullyHealthy = metaStatus === 'healthy' && ghlStatus === 'healthy';
                const hasIssue = metaStatus === 'error' || ghlStatus === 'error';

                return (
                  <div
                    key={c.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      hasIssue ? 'border-destructive/40 bg-destructive/5' :
                      isFullyHealthy ? 'border-chart-2/30 bg-chart-2/5' :
                      'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 shrink-0 ml-2">
                        {c.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Meta:</span>
                            {metaStatus === 'healthy' && <CheckCircle className="h-3.5 w-3.5 text-chart-2" />}
                            {metaStatus === 'stale' && <Clock className="h-3.5 w-3.5 text-chart-4" />}
                            {metaStatus === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                            {metaStatus === 'not_configured' && <span className="text-muted-foreground">—</span>}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {metaStatus === 'not_configured' ? 'Not configured' : 
                           s?.meta_ads_last_sync ? `Last sync: ${formatDistanceToNow(new Date(s.meta_ads_last_sync), { addSuffix: true })}` : 'Never synced'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">GHL:</span>
                            {ghlStatus === 'healthy' && <CheckCircle className="h-3.5 w-3.5 text-chart-2" />}
                            {ghlStatus === 'stale' && <Clock className="h-3.5 w-3.5 text-chart-4" />}
                            {ghlStatus === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                            {ghlStatus === 'not_configured' && <span className="text-muted-foreground">—</span>}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {ghlStatus === 'not_configured' ? 'Not configured' :
                           c.last_ghl_sync_at ? `Last sync: ${formatDistanceToNow(new Date(c.last_ghl_sync_at), { addSuffix: true })}` : 'Never synced'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
