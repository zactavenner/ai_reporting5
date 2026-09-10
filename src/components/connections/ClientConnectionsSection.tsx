/**
 * Collapsible "Connections & Settings" section.
 *
 * Rendered inside each Daily Huddle client card (collapsed by default, summary
 * chips in the header) and reused expanded in the client dashboard Settings tab.
 * Both surfaces share the SAME panels and the SAME records.
 */
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  ConnectionAuditPanel,
  GhlPanel,
  HealthBadge,
  MetaPanel,
  OffersPanel,
  RollupSummaryCard,
} from './ClientConnectionsPanels';
import { useConnectionsSummary, type SettingsSource } from '@/hooks/useClientConnections';

function SummaryChips({ clientId }: { clientId: string }) {
  const { offersActive, rollup, accounts } = useConnectionsSummary(clientId);
  const ghlish = accounts.length > 0;
  const lastSync = rollup.last_successful_sync
    ? formatDistanceToNow(new Date(rollup.last_successful_sync), { addSuffix: true })
    : 'never';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant="outline">Offers {offersActive}</Badge>
      <Badge variant="outline">Meta accounts {rollup.accounts_connected}</Badge>
      <Badge variant="outline">
        Active ads {typeof rollup.ads_active === 'number' ? rollup.ads_active.toLocaleString() : '—'}
      </Badge>
      <HealthBadge health={rollup.health} />
      <span className="text-[11px] text-muted-foreground">
        {ghlish ? `Last sync ${lastSync}` : 'No ad accounts linked'}
      </span>
    </div>
  );
}

export function ClientConnectionsPanelGroup({
  clientId,
  source,
  showAudit = true,
}: {
  clientId: string;
  source: SettingsSource;
  showAudit?: boolean;
}) {
  const { rollup } = useConnectionsSummary(clientId);
  return (
    <div className="space-y-3">
      <RollupSummaryCard rollup={rollup} />
      <div className="grid gap-3 lg:grid-cols-2">
        <OffersPanel clientId={clientId} source={source} />
        <GhlPanel clientId={clientId} source={source} />
      </div>
      <MetaPanel clientId={clientId} source={source} />
      {showAudit && <ConnectionAuditPanel clientId={clientId} />}
    </div>
  );
}

export function ClientConnectionsSection({
  clientId,
  source = 'huddle',
  defaultOpen = false,
}: {
  clientId: string;
  source?: SettingsSource;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Link2 className="h-4 w-4" />
            Connections &amp; Settings
          </div>
          <SummaryChips clientId={clientId} />
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 pointer-events-none">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </button>
      {open && (
        <div className="border-t p-4">
          <ClientConnectionsPanelGroup clientId={clientId} source={source} />
        </div>
      )}
    </Card>
  );
}
