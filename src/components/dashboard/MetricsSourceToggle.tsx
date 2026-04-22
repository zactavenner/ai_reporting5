import { Database, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MetricsSource } from '@/hooks/useMetricsSourcePreference';

interface MetricsSourceToggleProps {
  source: MetricsSource;
  onChange: (s: MetricsSource) => void;
  hasSheet: boolean;
  lastSyncedAt?: string;
  rowCount?: number;
  onRefresh?: () => void;
  isLoading?: boolean;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function MetricsSourceToggle({
  source, onChange, hasSheet, lastSyncedAt, rowCount, onRefresh, isLoading,
}: MetricsSourceToggleProps) {
  if (!hasSheet) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-2 py-1.5 text-xs">
      <span className="text-muted-foreground font-medium pl-1">Data Source:</span>
      <div className="flex items-center rounded-md bg-muted p-0.5">
        <button
          type="button"
          onClick={() => onChange('sheet')}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
            source === 'sheet'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileSpreadsheet className="h-3 w-3" />
          Sheet (live)
        </button>
        <button
          type="button"
          onClick={() => onChange('database')}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
            source === 'database'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Database className="h-3 w-3" />
          Database
        </button>
      </div>
      {source === 'sheet' && lastSyncedAt && (
        <span className="text-muted-foreground hidden md:inline">
          {rowCount !== undefined ? `${rowCount} rows · ` : ''}synced {timeAgo(lastSyncedAt)}
        </span>
      )}
      {source === 'sheet' && onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
        </Button>
      )}
    </div>
  );
}