/**
 * Collapsible "Connections & Settings" section.
 *
 * Rendered inside each Daily Huddle client card (collapsed by default, summary
 * chips in the header) and reused expanded in the client dashboard Settings tab.
 * Both surfaces share the SAME panels and the SAME records.
 *
 * In the Huddle, the full offer editor (offer details + offer files) and the
 * client file uploads are consolidated here so operators manage everything in
 * one place.
 */
import { Suspense, lazy, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Link2, Upload } from 'lucide-react';
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
import { AgentApiPanel } from './AgentApiPanel';

const ClientOffersSection = lazy(() =>
  import('@/components/offers/ClientOffersSection').then((m) => ({ default: m.ClientOffersSection })),
);
const ClientUploadPortal = lazy(() =>
  import('@/components/uploads/ClientUploadPortal').then((m) => ({ default: m.ClientUploadPortal })),
);

export interface ConnectionsClientInfo {
  name: string;
  description?: string | null;
  offer_description?: string | null;
  website_url?: string | null;
  industry?: string | null;
  client_type?: string | null;
  brand_colors?: string[] | null;
  brand_fonts?: string[] | null;
}

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

function OfferAndFilesPanel({ clientId, client }: { clientId: string; client: ConnectionsClientInfo }) {
  const [showUploads, setShowUploads] = useState(false);
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading offers…</div>}>
          <ClientOffersSection
            clientId={clientId}
            clientName={client.name}
            isPublicView={false}
            brandColors={client.brand_colors ?? null}
            brandFonts={client.brand_fonts ?? null}
            clientDescription={client.description ?? null}
            offerDescription={client.offer_description ?? null}
            websiteUrl={client.website_url ?? null}
            industry={client.industry ?? null}
            clientType={client.client_type ?? null}
          />
        </Suspense>
      </Card>

      <Card className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowUploads((o) => !o)}
          aria-expanded={showUploads}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Upload className="h-4 w-4" />
            Files &amp; uploads
          </div>
          {showUploads ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showUploads && (
          <div className="border-t p-4">
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading files…</div>}>
              <ClientUploadPortal clientId={clientId} clientName={client.name} isPublicView={false} />
            </Suspense>
          </div>
        )}
      </Card>
    </div>
  );
}

export function ClientConnectionsPanelGroup({
  clientId,
  source,
  showAudit = true,
  showApiCopy = false,
  client,
}: {
  clientId: string;
  source: SettingsSource;
  showAudit?: boolean;
  showApiCopy?: boolean;
  /** When provided, the full offer editor + files/uploads replace the compact offers list. */
  client?: ConnectionsClientInfo;
}) {
  const { rollup } = useConnectionsSummary(clientId);
  return (
    <div className="space-y-3">
      <RollupSummaryCard rollup={rollup} />
      {client ? (
        <>
          <OfferAndFilesPanel clientId={clientId} client={client} />
          <GhlPanel clientId={clientId} source={source} />
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <OffersPanel clientId={clientId} source={source} />
          <GhlPanel clientId={clientId} source={source} />
        </div>
      )}
      <MetaPanel clientId={clientId} source={source} />
      {showAudit && <ConnectionAuditPanel clientId={clientId} />}
      {showApiCopy && <AgentApiPanel />}
    </div>
  );
}


export function ClientConnectionsSection({
  clientId,
  source = 'huddle',
  defaultOpen = false,
  client,
}: {
  clientId: string;
  source?: SettingsSource;
  defaultOpen?: boolean;
  client?: ConnectionsClientInfo;
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
            Connections, Offer &amp; Files
          </div>
          <SummaryChips clientId={clientId} />
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 pointer-events-none">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </button>
      {open && (
        <div className="border-t p-4">
          <ClientConnectionsPanelGroup clientId={clientId} source={source} client={client} />
        </div>
      )}
    </Card>
  );
}
