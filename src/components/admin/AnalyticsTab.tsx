import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, Users, Zap, Activity, Database } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { format, subDays } from 'date-fns';

function MetricCard({ title, value, subtitle, icon: Icon, color }: { title: string; value: string | number; subtitle?: string; icon: React.ElementType; color: string }) {
  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          <div className={`p-1.5 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export function AnalyticsTab() {
  const now = new Date();

  const { data: apiUsage = [] } = useQuery({
    queryKey: ['analytics-api-usage'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(now, 30).toISOString();
      const { data } = await supabase
        .from('api_usage')
        .select('id, created_at, service, success, cost_usd')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ['analytics-sync-logs'],
    queryFn: async () => {
      const sevenDaysAgo = subDays(now, 7).toISOString();
      const { data } = await supabase
        .from('sync_logs')
        .select('id, started_at, status, records_synced, sync_type')
        .gte('started_at', sevenDaysAgo);
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['analytics-clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, status');
      return data || [];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['analytics-leads-30d'],
    queryFn: async () => {
      const thirtyDaysAgo = subDays(now, 30).toISOString();
      const { data } = await supabase
        .from('leads')
        .select('id, created_at')
        .gte('created_at', thirtyDaysAgo);
      return data || [];
    },
  });

  // Charts data
  const apiChartData = (() => {
    const dailyMap = new Map<string, { calls: number; errors: number }>();
    for (let i = 29; i >= 0; i--) {
      dailyMap.set(format(subDays(now, i), 'yyyy-MM-dd'), { calls: 0, errors: 0 });
    }
    apiUsage.forEach(r => {
      const date = format(new Date(r.created_at), 'yyyy-MM-dd');
      const entry = dailyMap.get(date);
      if (entry) {
        entry.calls++;
        if (!r.success) entry.errors++;
      }
    });
    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date: format(new Date(date), 'MMM d'),
      ...data,
    }));
  })();

  const leadsChartData = (() => {
    const dailyMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      dailyMap.set(format(subDays(now, i), 'yyyy-MM-dd'), 0);
    }
    leads.forEach(l => {
      const date = format(new Date(l.created_at), 'yyyy-MM-dd');
      if (dailyMap.has(date)) dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
    });
    return Array.from(dailyMap.entries()).map(([date, count]) => ({
      date: format(new Date(date), 'MMM d'),
      leads: count,
    }));
  })();

  const totalApiCalls = apiUsage.length;
  const totalErrors = apiUsage.filter(a => !a.success).length;
  const errorRate = totalApiCalls > 0 ? ((totalErrors / totalApiCalls) * 100).toFixed(1) : '0';
  const totalSyncs = syncLogs.length;
  const syncSuccessRate = totalSyncs > 0 ? ((syncLogs.filter(s => s.status === 'success').length / totalSyncs) * 100).toFixed(0) : '0';
  const activeClients = clients.filter(c => c.status === 'active').length;

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--background))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold">Analytics</h2>
        <p className="text-muted-foreground text-sm">Platform usage metrics and performance insights</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="API Calls (30d)" value={totalApiCalls.toLocaleString()} subtitle={`${errorRate}% error rate`} icon={Zap} color="bg-primary/10 text-primary" />
        <MetricCard title="Sync Success" value={`${syncSuccessRate}%`} subtitle={`${totalSyncs} syncs this week`} icon={Activity} color="bg-chart-2/10 text-chart-2" />
        <MetricCard title="Active Clients" value={activeClients} subtitle={`${clients.length} total`} icon={Users} color="bg-chart-4/10 text-chart-4" />
        <MetricCard title="Leads (30d)" value={leads.length.toLocaleString()} icon={TrendingUp} color="bg-blue-500/10 text-blue-500" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* API Usage Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              API Usage (30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={apiChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={4} />
                  <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Calls" />
                  <Bar dataKey="errors" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} name="Errors" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Leads Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Lead Volume (30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={leadsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={4} />
                  <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <defs>
                    <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="leads" stroke="hsl(var(--primary))" fill="url(#leadGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
