import { useMemo } from 'react';
import { Client } from '@/hooks/useClients';
import { AggregatedMetrics } from '@/hooks/useMetrics';
import { ClientSettings } from '@/hooks/useClientSettings';
import { Calendar, Users, TrendingUp, CheckCircle } from 'lucide-react';

interface DataIntegrityBannerProps {
  clients: Client[];
  metrics: Record<string, AggregatedMetrics>;
  fullSettings: Record<string, ClientSettings>;
}

interface IntegrityIssue {
  clientId: string;
  clientName: string;
  type: 'no_crm_leads' | 'no_ghl_credentials' | 'no_tracked_calendars' | 'no_meta_account';
  detail: string;
}

export function DataIntegrityBanner({ clients, metrics, fullSettings }: DataIntegrityBannerProps) {
  const issues = useMemo(() => {
    const result: IntegrityIssue[] = [];

    for (const client of clients) {
      const m = metrics[client.id];
      const s = fullSettings[client.id];
      const hasAdSpend = (m?.totalAdSpend || 0) > 0;
      const hasCrmLeads = (m?.crmLeads || 0) > 0;
      const hasGhlCredentials = !!(client.ghl_api_key && client.ghl_location_id);
      const hasHubspotCredentials = !!(client.hubspot_portal_id && client.hubspot_access_token);
      const hasCrmCredentials = hasGhlCredentials || hasHubspotCredentials;
      const hasTrackedCalendars = (s?.tracked_calendar_ids || []).length > 0;
      const hasMetaAccount = !!client.meta_ad_account_id;

      if (hasAdSpend && !hasCrmLeads && !hasCrmCredentials) {
        result.push({
          clientId: client.id,
          clientName: client.name,
          type: 'no_ghl_credentials',
          detail: `$${m.totalAdSpend.toFixed(0)} ad spend but no GHL/HubSpot credentials configured`,
        });
      } else if (hasAdSpend && !hasCrmLeads && hasCrmCredentials) {
        result.push({
          clientId: client.id,
          clientName: client.name,
          type: 'no_crm_leads',
          detail: `$${m.totalAdSpend.toFixed(0)} ad spend but 0 CRM leads — run master sync or check API key`,
        });
      }

      if (hasCrmCredentials && !hasTrackedCalendars && hasAdSpend) {
        result.push({
          clientId: client.id,
          clientName: client.name,
          type: 'no_tracked_calendars',
          detail: 'No tracked calendars — booked calls and show calls will not sync',
        });
      }

      if (!hasMetaAccount && client.status === 'active') {
        result.push({
          clientId: client.id,
          clientName: client.name,
          type: 'no_meta_account',
          detail: 'No Meta Ad Account ID configured — ad spend will not sync',
        });
      }
    }

    return result;
  }, [clients, metrics, fullSettings]);

  const crmIssues = issues.filter(i => i.type === 'no_crm_leads' || i.type === 'no_ghl_credentials');
  const calendarIssues = issues.filter(i => i.type === 'no_tracked_calendars');
  const metaIssues = issues.filter(i => i.type === 'no_meta_account');

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-md bg-chart-2/10 border border-chart-2/20">
        <CheckCircle className="h-4 w-4 text-chart-2 shrink-0" />
        <span className="text-xs text-chart-2 font-medium">
          All clients have properly configured integrations for the selected date range
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 mb-3">
      {crmIssues.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20">
          <Users className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-destructive">
              {crmIssues.length} client{crmIssues.length > 1 ? 's' : ''} with ad spend but no CRM leads:
            </span>
            <span className="text-destructive/80 ml-1">
              {crmIssues.map(i => i.clientName).join(', ')}
            </span>
            <span className="text-muted-foreground ml-1">
              — {crmIssues.some(i => i.type === 'no_ghl_credentials') ? 'add GHL credentials in settings' : 'run master sync or check GHL API key'}
            </span>
          </div>
        </div>
      )}

      {calendarIssues.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <Calendar className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-yellow-600 dark:text-yellow-400">
              {calendarIssues.length} client{calendarIssues.length > 1 ? 's' : ''} missing tracked calendars:
            </span>
            <span className="text-yellow-600/80 dark:text-yellow-400/80 ml-1">
              {calendarIssues.map(i => i.clientName).join(', ')}
            </span>
            <span className="text-muted-foreground ml-1">
              — add calendar IDs in client settings to sync booked/show calls
            </span>
          </div>
        </div>
      )}

      {metaIssues.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20">
          <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {metaIssues.length} active client{metaIssues.length > 1 ? 's' : ''} without Meta Ad Account:
            </span>
            <span className="text-blue-600/80 dark:text-blue-400/80 ml-1">
              {metaIssues.map(i => i.clientName).join(', ')}
            </span>
            <span className="text-muted-foreground ml-1">
              — add Meta Ad Account ID to sync ad spend
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
