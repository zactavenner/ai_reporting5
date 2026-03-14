import { useIntegrationStatuses, useTokenExpiryWarnings, getIntegrationDisplayName, getStatusColor, type IntegrationStatus } from '@/hooks/useIntegrationStatus';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Zap, MessageSquare, CreditCard, BarChart3, Link2, Phone, Mic } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const INTEGRATION_ICONS: Record<string, React.ElementType> = {
  meta_ads: BarChart3,
  ghl: Link2,
  hubspot: Zap,
  meetgeek: MessageSquare,
  stripe: CreditCard,
  sendblue: Phone,
  elevenlabs: Mic,
};

interface IntegrationStatusCardsProps {
  onNavigateToSettings?: () => void;
}

export function IntegrationStatusCards({ onNavigateToSettings }: IntegrationStatusCardsProps) {
  const { data: statuses = [] } = useIntegrationStatuses();
  const warnings = useTokenExpiryWarnings(statuses);

  const integrations = ['meta_ads', 'ghl', 'hubspot', 'meetgeek', 'stripe'];

  const getStatus = (name: string) => statuses.find(s => s.integration_name === name);

  const statusDotClass = (color: 'green' | 'yellow' | 'red') => {
    if (color === 'green') return 'bg-primary';
    if (color === 'yellow') return 'bg-accent-foreground';
    return 'bg-destructive';
  };

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {warnings.map(w => (
              <span key={w.integration} className="block">
                {getIntegrationDisplayName(w.integration)} token expires in {w.daysLeft} day{w.daysLeft !== 1 ? 's' : ''}. Refresh now to avoid sync interruption.
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-5 gap-3">
        {integrations.map(name => {
          const status = getStatus(name);
          const color = getStatusColor(status);
          const Icon = INTEGRATION_ICONS[name] || Link2;
          const tokenWarning = warnings.find(w => w.integration === name);

          return (
            <Card
              key={name}
              className="p-3 cursor-pointer hover:bg-accent/50 transition-colors relative"
              onClick={onNavigateToSettings}
            >
              {tokenWarning && (
                <Badge variant="destructive" className="absolute -top-2 -right-2 text-[10px]">
                  {tokenWarning.daysLeft}d
                </Badge>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium truncate">{getIntegrationDisplayName(name)}</span>
                <div className={`w-2 h-2 rounded-full ml-auto ${statusDotClass(color)}`} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">
                  {status?.last_sync_at
                    ? `Synced ${formatDistanceToNow(new Date(status.last_sync_at), { addSuffix: true })}`
                    : 'Never synced'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {status?.records_synced || 0} records
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
