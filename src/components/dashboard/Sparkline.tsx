import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  invertTrend?: boolean;
}

export function Sparkline({ data, height = 24, invertTrend = false }: SparklineProps) {
  const chartData = useMemo(() => {
    return data.map((value, index) => ({ value, index }));
  }, [data]);

  if (data.length < 2) {
    return <div className="h-6 flex items-center justify-center text-xs text-muted-foreground">-</div>;
  }

  // Determine trend color
  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const trendUp = secondAvg > firstAvg;
  // For cost metrics (invertTrend), up is bad (red), down is good (green)
  const isPositive = invertTrend ? !trendUp : trendUp;
  const trendColor = isPositive ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))';

  return (
    <div style={{ height, width: '100%', minWidth: 60 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
