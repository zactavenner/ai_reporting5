import { DailyMetric } from '@/hooks/useMetrics';
import { MetricChartCard } from './MetricChartCard';

interface MetricChartsGridProps {
  dailyMetrics: DailyMetric[];
}

export function MetricChartsGrid({ dailyMetrics }: MetricChartsGridProps) {
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
          title="Calls" 
          data={dailyMetrics} 
          metricKey="calls"
          color="hsl(var(--chart-3))"
        />
        <MetricChartCard 
          title="Showed" 
          data={dailyMetrics} 
          metricKey="showed_calls"
          color="hsl(var(--chart-4))"
        />
        <MetricChartCard 
          title="Investors" 
          data={dailyMetrics} 
          metricKey="funded_investors"
          color="hsl(var(--chart-5))"
        />
        <MetricChartCard 
          title="Funded $" 
          data={dailyMetrics} 
          metricKey="funded_dollars"
          color="hsl(var(--primary))"
          prefix="$"
        />
      </div>
    </section>
  );
}