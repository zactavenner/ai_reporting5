import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPIThreshold {
  yellow: number;
  red: number;
}

interface KPICardProps {
  label: string;
  value: string | number;
  change: number;
  changeLabel?: string;
  clickable?: boolean;
  onClick?: () => void;
  format?: 'currency' | 'percent' | 'number' | 'days';
  threshold?: KPIThreshold;
  /** For cost metrics, higher is worse. For percent metrics like show rate, lower is worse */
  invertThreshold?: boolean;
}

export function KPICard({
  label,
  value,
  change,
  changeLabel = 'vs prior',
  clickable = false,
  onClick,
  format = 'number',
  threshold,
  invertThreshold = false,
}: KPICardProps) {
  const formatValue = (val: string | number): string => {
    if (typeof val === 'string') return val;
    switch (format) {
      case 'currency':
        return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'percent':
        return `${val.toFixed(2)}%`;
      case 'days':
        return `${val.toFixed(1)} days`;
      default:
        return val.toLocaleString();
    }
  };

  const getTrendIcon = () => {
    if (change > 0) return <TrendingUp className="h-3 w-3" />;
    if (change < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };

  const getTrendColor = () => {
    if (change > 0) return 'text-chart-2';
    if (change < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const getThresholdColor = (): string => {
    if (!threshold || typeof value !== 'number') return 'border-border';
    
    const numValue = value;
    
    if (invertThreshold) {
      // For metrics where lower is worse (e.g., show rate %)
      if (numValue <= threshold.red) return 'border-destructive bg-destructive/5';
      if (numValue <= threshold.yellow) return 'border-yellow-500 bg-yellow-500/5';
      return 'border-chart-2 bg-chart-2/5';
    } else {
      // For cost metrics where higher is worse
      if (numValue >= threshold.red) return 'border-destructive bg-destructive/5';
      if (numValue >= threshold.yellow) return 'border-yellow-500 bg-yellow-500/5';
      return 'border-chart-2 bg-chart-2/5';
    }
  };

  return (
    <div
      className={cn(
        'border bg-card p-4 transition-all rounded-lg',
        threshold ? getThresholdColor() : 'border-border',
        clickable && 'cursor-pointer hover:shadow-sm hover:-translate-y-0.5'
      )}
      onClick={clickable ? onClick : undefined}
    >
      <p className="text-sm font-medium text-muted-foreground">
        {label}
        {clickable && <span className="text-muted-foreground/70 ml-1 text-xs">(click to view)</span>}
      </p>
      <p className="text-3xl font-semibold mt-2 tracking-tight tabular-nums">{formatValue(value)}</p>
      <div className={cn('flex items-center gap-1 mt-2 text-sm', getTrendColor())}>
        {getTrendIcon()}
        <span className="tabular-nums">{change > 0 ? '+' : ''}{change.toFixed(1)}%</span>
        <span className="text-muted-foreground">{changeLabel}</span>
      </div>
    </div>
  );
}
