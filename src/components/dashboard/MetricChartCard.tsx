import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { DailyMetric } from '@/hooks/useMetrics';
import { format } from 'date-fns';

interface MetricChartCardProps {
  title: string;
  data: DailyMetric[];
  metricKey: 'ad_spend' | 'leads' | 'calls' | 'showed_calls' | 'funded_investors' | 'funded_dollars';
  color?: string;
  prefix?: string;
  suffix?: string;
}

export function MetricChartCard({ 
  title, 
  data, 
  metricKey, 
  color = 'hsl(var(--primary))',
  prefix = '',
  suffix = ''
}: MetricChartCardProps) {
  const chartData = useMemo(() => {
    // Sort by date ascending for chart display
    const sorted = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    return sorted.map(d => ({
      date: d.date,
      formattedDate: format(new Date(d.date), 'MMM d'),
      value: metricKey === 'ad_spend' || metricKey === 'funded_dollars' 
        ? Number(d[metricKey]) || 0 
        : d[metricKey] || 0
    }));
  }, [data, metricKey]);

  const total = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.value, 0);
  }, [chartData]);

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0;

  const formatValue = (val: number) => {
    if (prefix === '$') {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${val.toLocaleString()}${suffix}`;
  };

  return (
    <div className="border border-border bg-card p-4 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">{title}</h4>
      </div>
      
      <div className="mb-3">
        <p className="text-2xl font-semibold tabular-nums text-primary">
          {formatValue(total)}
        </p>
        <p className="text-xs text-muted-foreground">Total</p>
      </div>

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <XAxis 
              dataKey="formattedDate" 
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              tickFormatter={(val) => prefix === '$' ? `$${val}` : val}
              width={40}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [formatValue(value), title]}
              labelFormatter={(label) => label}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5, fill: color }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: color }}></span>
        <span>{title}</span>
      </div>
    </div>
  );
}