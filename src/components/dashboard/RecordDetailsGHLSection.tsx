import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ExternalLink, RefreshCw, Loader2, StickyNote, Link2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Lead, GHLNote } from '@/hooks/useLeadsAndCalls';

interface RecordDetailsGHLSectionProps {
  record: any;
  recordType: string;
  ghlLocationId: string | null;
  onSync?: () => void;
  isSyncing?: boolean;
  linkedLead?: Lead | null;
}

// GHL contact link URL builder
const getGHLContactUrl = (locationId: string, contactId: string) => {
  return `https://app.gohighlevel.com/location/${locationId}/contacts/detail/${contactId}`;
};

// Check if a record can be synced from GHL
const canSyncFromGHL = (externalId: string | undefined, hasGhlLocation: boolean) => {
  return hasGhlLocation && 
         externalId && 
         !externalId.startsWith('wh_') && 
         !externalId.startsWith('manual-');
};

// Format relative time for last sync
const formatLastSync = (syncedAt: string | null | undefined): string => {
  if (!syncedAt) return 'Never synced';
  try {
    return formatDistanceToNow(new Date(syncedAt), { addSuffix: true });
  } catch {
    return 'Never synced';
  }
};

export function RecordDetailsGHLSection({
  record,
  recordType,
  ghlLocationId,
  onSync,
  isSyncing = false,
  linkedLead,
}: RecordDetailsGHLSectionProps) {
  // Determine which record to use for GHL info
  const ghlRecord = recordType === 'lead' ? record : linkedLead;
  const externalId = ghlRecord?.external_id || record?.external_id;
  const ghlSyncedAt = ghlRecord?.ghl_synced_at || record?.ghl_synced_at;
  const ghlNotes = ghlRecord?.ghl_notes as GHLNote[] | null | undefined;
  
  const hasGhlLocation = !!ghlLocationId;
  const canSync = canSyncFromGHL(externalId, hasGhlLocation);
  
  if (!hasGhlLocation || !externalId) {
    return null;
  }
  
  const isValidGhlId = !externalId.startsWith('wh_') && !externalId.startsWith('manual-');
  
  if (!isValidGhlId) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* GHL Integration Header */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          GHL Integration
        </h4>
        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
          {/* GHL Link */}
          <div className="flex items-center justify-between">
            <a
              href={getGHLContactUrl(ghlLocationId!, externalId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in GHL
            </a>
            {canSync && onSync && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSync}
                disabled={isSyncing}
                className="h-7 px-2"
              >
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1 text-xs">Sync</span>
              </Button>
            )}
          </div>
          
          {/* Last Sync Status */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Last Sync:</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`${
                  !ghlSyncedAt 
                    ? 'text-muted-foreground' 
                    : new Date(ghlSyncedAt) < new Date(Date.now() - 24 * 60 * 60 * 1000)
                      ? 'text-amber-500'
                      : 'text-chart-2'
                }`}>
                  {formatLastSync(ghlSyncedAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">
                  {ghlSyncedAt ? new Date(ghlSyncedAt).toLocaleString() : 'Never synced from GHL'}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          
          {/* GHL Contact ID */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">GHL ID:</span>
            <code className="bg-background px-1.5 py-0.5 rounded text-[10px] font-mono truncate max-w-[150px]">
              {externalId}
            </code>
          </div>
        </div>
      </div>

      {/* GHL Notes Section */}
      {ghlNotes && Array.isArray(ghlNotes) && ghlNotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            GHL Notes
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {ghlNotes.length}
            </Badge>
          </h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {ghlNotes.map((note, idx) => (
              <div 
                key={note.id || idx} 
                className="bg-muted/50 p-2 rounded text-sm border-l-2 border-primary/30"
              >
                <p className="text-foreground">{note.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {note.dateAdded ? formatDistanceToNow(new Date(note.dateAdded), { addSuffix: true }) : 'Unknown date'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface LinkedContactInfoProps {
  lead: Lead | null;
  showHeader?: boolean;
}

export function LinkedContactInfo({ lead, showHeader = true }: LinkedContactInfoProps) {
  if (!lead) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No linked lead found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Contact Info */}
      {(lead.name || lead.email || lead.phone) && (
        <div className="space-y-1 text-sm">
          {showHeader && (
            <h4 className="text-sm font-medium">Linked Contact</h4>
          )}
          {lead.name && (
            <p><span className="text-muted-foreground">Name:</span> {lead.name}</p>
          )}
          {lead.email && (
            <p>
              <span className="text-muted-foreground">Email:</span>{' '}
              <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                {lead.email}
              </a>
            </p>
          )}
          {lead.phone && (
            <p>
              <span className="text-muted-foreground">Phone:</span>{' '}
              <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                {lead.phone}
              </a>
            </p>
          )}
          {lead.source && (
            <p><span className="text-muted-foreground">Source:</span> {lead.source}</p>
          )}
        </div>
      )}

      {/* Attribution */}
      {(lead.utm_source || lead.utm_campaign || lead.campaign_name) && (
        <div className="space-y-1 text-sm">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Attribution</h4>
          {lead.campaign_name && (
            <p><span className="text-muted-foreground">Campaign:</span> {lead.campaign_name}</p>
          )}
          {lead.ad_set_name && (
            <p><span className="text-muted-foreground">Ad Set:</span> {lead.ad_set_name}</p>
          )}
          {lead.ad_id && (
            <p><span className="text-muted-foreground">Ad ID:</span> {lead.ad_id}</p>
          )}
          {lead.utm_source && (
            <p><span className="text-muted-foreground">UTM Source:</span> {lead.utm_source}</p>
          )}
          {lead.utm_medium && (
            <p><span className="text-muted-foreground">UTM Medium:</span> {lead.utm_medium}</p>
          )}
          {lead.utm_campaign && !lead.campaign_name && (
            <p><span className="text-muted-foreground">UTM Campaign:</span> {lead.utm_campaign}</p>
          )}
        </div>
      )}

      {/* Survey Questions */}
      {lead.questions && Array.isArray(lead.questions) && lead.questions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Form Questions</h4>
          <div className="space-y-1.5">
            {lead.questions.map((q: any, idx: number) => (
              <div key={idx} className="bg-muted/50 p-2 rounded text-sm">
                <p className="text-muted-foreground text-xs">{q.question}</p>
                <p className="font-medium">{String(q.answer)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
