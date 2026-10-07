import { Badge } from '@/components/ui/badge';

export const MILESTONE_LABEL: Record<string, string> = {
  verified_qualified_lead: 'Verified qualified lead',
  verified_qualified_booking: 'Verified qualified booking',
  attended_qualified_call: 'Attended qualified call',
  verified_funded: 'Verified funded (internal)',
};

export const STATUS_LABEL: Record<string, string> = {
  eligible: 'Would qualify', withheld: 'Withheld', needs_review: 'Needs review', excluded: 'Excluded',
  pending: 'Pending', claimed: 'Sending', accepted: 'Accepted by Meta', failed_retryable: 'Retrying',
  failed_permanent: 'Failed', held: 'Held', cancelled: 'Cancelled',
};

export function ModeBadge({ mode }: { mode: string }) {
  const v = mode === 'live' ? 'default' : mode === 'preview' ? 'secondary' : 'outline';
  return <Badge variant={v as any}>{mode === 'live' ? 'Live' : mode === 'preview' ? 'Preview' : 'Off'}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'eligible' || status === 'accepted' ? 'border-primary/40 text-primary'
    : status === 'excluded' || status === 'failed_permanent' ? 'border-destructive/40 text-destructive' : 'text-muted-foreground';
  return <Badge variant="outline" className={`text-xs ${tone}`}>{STATUS_LABEL[status] ?? status}</Badge>;
}
