import { useMemo } from 'react';
import { DailyMetric } from '@/hooks/useMetrics';
import { MetricChartCard } from './MetricChartCard';

interface MetricChartsGridProps {
  dailyMetrics: DailyMetric[];
}

export function MetricChartsGrid({ dailyMetrics }: MetricChartsGridProps) {
  // Calculate computed metrics (CPL, Cost/Call, Cost/Show) for each day
  const metricsWithComputed = useMemo(() => {
    return dailyMetrics.map(m => ({
      ...m,
      cpl: m.leads && m.leads > 0 ? Number(m.ad_spend || 0) / m.leads : 0,
      cost_per_call: m.calls && m.calls > 0 ? Number(m.ad_spend || 0) / m.calls : 0,
      cost_per_show: m.showed_calls && m.showed_calls > 0 ? Number(m.ad_spend || 0) / m.showed_calls : 0,
    }));
  }, [dailyMetrics]);

  return (
    <section className="border-2 border-border bg-card p-4">
      <h3 className="font-bold text-lg mb-1">Performance Trends</h3>
      <p className="text-sm text-muted-foreground mb-4">Visual metrics over selected date range</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricChartCard 
          title="Ad Spend" 
          data={dailyMetrics} 
          metricKey="ad_spend"
          color="hsl(var(--chart-1))"
          prefix="$"
        />
        <MetricChartCard 
          title="Leads" 
          data={dailyMetrics} 
          metricKey="leads"
          color="hsl(var(--chart-2))"
        />
        <MetricChartCard 
          title="CPL" 
          data={metricsWithComputed} 
          metricKey="cpl"
          color="hsl(var(--chart-3))"
          prefix="$"
        />
        <MetricChartCard 
          title="Calls" 
          data={dailyMetrics} 
          metricKey="calls"
          color="hsl(var(--chart-4))"
        />
        <MetricChartCard 
          title="Cost/Call" 
          data={metricsWithComputed} 
          metricKey="cost_per_call"
          color="hsl(var(--chart-5))"
          prefix="$"
        />
        <MetricChartCard 
          title="Showed" 
          data={dailyMetrics} 
          metricKey="showed_calls"
          color="hsl(var(--primary))"
        />
        <MetricChartCard 
          title="Cost/Show" 
          data={metricsWithComputed} 
          metricKey="cost_per_show"
          color="hsl(var(--chart-1))"
          prefix="$"
        />
        <MetricChartCard 
          title="Reconnect Calls" 
          data={dailyMetrics} 
          metricKey="reconnect_calls"
          color="hsl(var(--chart-2))"
        />
        <MetricChartCard 
          title="Reconnect Showed" 
          data={dailyMetrics} 
          metricKey="reconnect_showed"
          color="hsl(var(--chart-3))"
        />
        <MetricChartCard 
          title="Investors" 
          data={dailyMetrics} 
          metricKey="funded_investors"
          color="hsl(var(--chart-4))"
        />
        <MetricChartCard 
          title="Funded $" 
          data={dailyMetrics} 
          metricKey="funded_dollars"
          color="hsl(var(--chart-5))"
          prefix="$"
        />
      </div>
    </section>
  );
}
