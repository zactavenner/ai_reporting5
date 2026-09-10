/**
 * Reusable Connections & Settings panels.
 *
 * These exact components render in BOTH the Daily Huddle client card and the
 * client dashboard Settings tab — there is no second implementation and no
 * second settings store. Every write goes through useClientConnections, which
 * calls the guarded `client-connections` edge function.
 *
 * Credentials are never rendered: only status, masked last four, scopes when
 * known, and timestamps.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Facebook,
  HelpCircle,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Unplug,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  archivedOffers,
  resolveConnectionStatusView,
  visibleOffers,
  type ConnectionStatusView,
} from '@/lib/connectionsDisplay';
import {
  useAddAdAccount,
  useClientAdAccounts,
  useClientIntegrations,
  useConnectionAudit,
  useConnectionOffers,
  useDisconnectAdAccount,
  usePatchAdAccount,
  useReplaceCredential,
  useRevokeCredential,
  useSaveOffer,
  useSyncAdAccount,
  useTestConnection,
  type ClientAdAccount,
  type ConnectionOffer,
  type RollupSummary,
  type SettingsSource,
} from '@/hooks/useClientConnections';

/** Editing is server-enforced; the UI hides controls when no operator session exists. */
export function useCanEditConnections(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    try {
      setCan(!!localStorage.getItem('dashboard_session_token'));
    } catch {
      setCan(false);
    }
  }, []);
  return can;
}

const nOrDash = (v: number | null | undefined) => (typeof v === 'number' ? v.toLocaleString() : '—');
const ago = (t?: string | null) => (t ? formatDistanceToNow(new Date(t), { addSuffix: true }) : 'never');

export function HealthBadge({ health }: { health: RollupSummary['health'] }) {
  const map: Record<RollupSummary['health'], { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    healthy: { cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', label: 'Reporting current', Icon: CheckCircle2 },
    partial: { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: 'Partial data', Icon: AlertTriangle },
    stale: { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30', label: 'Stale sync', Icon: AlertTriangle },
    error: { cls: 'bg-rose-500/10 text-rose-600 border-rose-500/30', label: 'Sync error', Icon: XCircle },
    unknown: { cls: 'bg-muted text-muted-foreground border-border', label: 'Not verified', Icon: HelpCircle },
  };
  const { cls, label, Icon } = map[health];
  return (
    <Badge variant="outline" className={cn('gap-1', cls)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

const STATE_LABELS: Record<string, string> = {
  saved: 'Saved (not verified)',
  verification_pending: 'Verification pending',
  verified: 'Verified',
  sync_queued: 'Initial sync queued',
  sync_running: 'Sync running',
  reporting_current: 'Reporting current',
  partial: 'Partial',
  failed: 'Failed',
};

/**
 * Terminal state renderer for connection status. Loaded is handled by the
 * caller; every other outcome (unauthorized, unavailable, sanitized error)
 * ends here so no panel can spin forever.
 */
function ConnectionStatusMessage({ view, onRetry }: { view: ConnectionStatusView; onRetry?: () => void }) {
  if (view.kind === 'loaded') return null;
  const failed = view.kind === 'unavailable' || view.kind === 'error';
  return (
    <div className={cn('text-xs flex items-center gap-2 flex-wrap', failed ? 'text-amber-600' : 'text-muted-foreground')}>
      {view.kind === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {failed && <AlertTriangle className="h-3.5 w-3.5" />}
      <span>{view.message}</span>
      {failed && onRetry && (
        <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onRetry}>
          <RefreshCw className="h-3 w-3" /> Retry
        </Button>
      )}
    </div>
  );
}


/* ────────────────────────────── Roll-up card ────────────────────────────── */

export function RollupSummaryCard({ rollup }: { rollup: RollupSummary }) {
  const stats = [
    { label: 'Ad accounts', value: rollup.accounts_connected },
    { label: 'In roll-up', value: rollup.accounts_in_rollup },
    { label: 'Total ads', value: rollup.ads_total },
    { label: 'Active ads', value: rollup.ads_active },
    { label: 'Paused ads', value: rollup.ads_paused },
  ];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold">Roll-up across enabled accounts</div>
        <HealthBadge health={rollup.health} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="text-lg font-semibold tabular-nums">{nOrDash(s.value as number)}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground mt-3 space-y-1">
        <div>Last successful sync: {ago(rollup.last_successful_sync)}</div>
        {rollup.accounts_missing_counts > 0 && (
          <div className="text-amber-600">
            {rollup.accounts_missing_counts} account{rollup.accounts_missing_counts === 1 ? '' : 's'} have no counts yet — shown as “—”, not zero.
          </div>
        )}
        {rollup.accounts_with_errors > 0 && (
          <div className="text-rose-600">{rollup.accounts_with_errors} account(s) reported a sync error.</div>
        )}
      </div>
    </Card>
  );
}

/* ──────────────────────────────── Offers ────────────────────────────────── */

export function OffersPanel({ clientId, source }: { clientId: string; source: SettingsSource }) {
  const canEdit = useCanEditConnections();
  const { data: offers = [], isLoading } = useConnectionOffers(clientId);
  const [editing, setEditing] = useState<ConnectionOffer | 'new' | null>(null);
  const active = visibleOffers(offers);
  const archived = archivedOffers(offers);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Offers</div>
        {canEdit && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" />
            Add offer
          </Button>
        )}
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading offers…</div>}
      {!isLoading && active.length === 0 && (
        <div className="text-xs text-muted-foreground">No offers recorded for this client yet.</div>
      )}

      <div className="space-y-2">
        {active.map((o) => (
          <div key={o.id} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{o.title}</span>
                {o.is_primary && (
                  <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                    <Star className="h-3 w-3" /> Primary
                  </Badge>
                )}
                <Badge variant="outline" className="capitalize">{o.status}</Badge>
                {o.offer_type && <span className="text-[11px] text-muted-foreground">{o.offer_type}</span>}
              </div>
              {o.notes && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.notes}</div>}
              <div className="text-[11px] text-muted-foreground mt-1">
                Updated {ago(o.updated_at)}
                {o.updated_by ? ` by ${o.updated_by}` : ''}
              </div>
            </div>
            {canEdit && (
              <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={() => setEditing(o)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="text-xs text-muted-foreground pt-1">
          {archived.length} archived offer{archived.length === 1 ? '' : 's'} kept on record (never deleted).
        </div>
      )}

      <OfferDialog
        clientId={clientId}
        source={source}
        offer={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Card>
  );
}

function OfferDialog({
  clientId,
  source,
  offer,
  open,
  onOpenChange,
}: {
  clientId: string;
  source: SettingsSource;
  offer: ConnectionOffer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveOffer(clientId, source);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('active');
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(offer?.title || '');
    setType(offer?.offer_type || 'offer');
    setNotes(offer?.notes || '');
    setStatus(offer?.status || 'active');
    setIsPrimary(!!offer?.is_primary);
  }, [open, offer]);

  const submit = async () => {
    await save.mutateAsync({
      offer_id: offer?.id,
      title,
      offer_type: type,
      notes: notes || null,
      status,
      is_primary: isPrimary,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{offer ? 'Edit offer' : 'Add offer'}</DialogTitle>
          <DialogDescription>
            Offers are shared by the Huddle and the client Settings tab. Archiving keeps the record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="offer-title">Offer name</Label>
            <Input id="offer-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fund II — Multifamily" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offer-type">Funnel / type</Label>
            <Input id="offer-type" value={type} onChange={(e) => setType(e.target.value)} placeholder="webinar, VSL, application…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="offer-notes">Notes (optional)</Label>
            <Textarea id="offer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="offer-primary">Primary offer</Label>
            <Switch id="offer-primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
          </div>
          <div className="flex gap-2">
            {['active', 'paused', 'archived'].map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={status === s ? 'default' : 'outline'}
                className="capitalize gap-1"
                onClick={() => setStatus(s)}
              >
                {s === 'archived' && <Archive className="h-3.5 w-3.5" />}
                {s}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending || !title.trim()}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Meta accounts + connection ───────────────────── */

export function MetaPanel({ clientId, source }: { clientId: string; source: SettingsSource }) {
  const canEdit = useCanEditConnections();
  const { data: accounts = [], isLoading } = useClientAdAccounts(clientId);
  const integrationsQuery = useClientIntegrations(clientId, canEdit);
  const integrations = integrationsQuery.data;
  const statusView = resolveConnectionStatusView({
    canEdit,
    hasData: !!integrations,
    isPending: integrationsQuery.isPending || integrationsQuery.isFetching,
    isError: integrationsQuery.isError,
    error: integrationsQuery.error,
  });
  const patch = usePatchAdAccount(clientId, source);
  const disconnect = useDisconnectAdAccount(clientId, source);
  const test = useTestConnection(clientId, source);
  const sync = useSyncAdAccount(clientId, source);
  const [adding, setAdding] = useState(false);
  const [confirmOff, setConfirmOff] = useState<ClientAdAccount | null>(null);
  const [credential, setCredential] = useState(false);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Facebook className="h-4 w-4 text-[#1877F2]" /> Meta &amp; ad accounts
        </div>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => test.mutate({ integration: 'meta' })} disabled={test.isPending}>
              <RefreshCw className={cn('h-3.5 w-3.5', test.isPending && 'animate-spin')} /> Test connection
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Link ad account
            </Button>
          )}
        </div>
      </div>

      {/* Connection (token) status — masked only */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
        {integrations ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium capitalize">Meta connection: {integrations.meta.status}</span>
              {integrations.meta.secret_present ? (
                <Badge variant="outline" className="font-mono">••••{integrations.meta.last4}</Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">No token</Badge>
              )}
              <span className="text-muted-foreground">token: {integrations.meta.token_label || integrations.meta.token_source}</span>
            </div>
            <div className="text-muted-foreground">Last verified: {ago(integrations.meta.last_verified_at)}</div>
            {canEdit && (
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => setCredential(true)}>
                  <KeyRound className="h-3.5 w-3.5" /> Replace token
                </Button>
                <RevokeButton clientId={clientId} source={source} integration="meta" />
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground">
            {canEdit ? 'Loading connection status…' : 'Sign in as an agency operator to see connection status.'}
          </div>
        )}
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading ad accounts…</div>}
      {!isLoading && accounts.length === 0 && (
        <div className="text-xs text-muted-foreground">No ad accounts linked yet.</div>
      )}

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-md border px-3 py-2 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{a.account_name || 'Unnamed account'}</span>
                  {a.is_primary && <Badge variant="outline" className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>}
                  <Badge variant="outline" className="capitalize">{a.status}</Badge>
                  <Badge variant="outline" className="text-[11px]">{STATE_LABELS[a.connection_state] || a.connection_state}</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">act_{a.provider_account_id}</div>
                <div className="text-[11px] text-muted-foreground">
                  {a.business_id ? `Business ${a.business_id} · ` : ''}
                  {a.currency || '—'} · {a.timezone_name || 'timezone unknown'} · token: {a.token_source || 'client'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Last sync {ago(a.last_sync_at)}
                  {a.last_sync_status ? ` (${a.last_sync_status})` : ''} · verified {ago(a.last_verified_at)}
                </div>
                {a.last_sync_error && (
                  <div className="text-[11px] text-rose-600 truncate" title={a.last_sync_error}>{a.last_sync_error}</div>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => sync.mutate(a.provider_account_id)} disabled={sync.isPending}>
                    <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} /> Sync
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-rose-600" onClick={() => setConfirmOff(a)}>
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              {[
                ['Campaigns', a.campaigns_count],
                ['Ad sets', a.adsets_count],
                ['Total ads', a.ads_total],
                ['Active', a.ads_active],
                ['Paused', a.ads_paused],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded border bg-muted/30 px-2 py-1">
                  <div className="font-semibold tabular-nums text-sm">{nOrDash(value as number)}</div>
                  <div className="text-muted-foreground">{label as string}</div>
                </div>
              ))}
            </div>

            {canEdit && (
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-[11px]">
                  <Switch
                    checked={a.rollup_enabled}
                    onCheckedChange={(v) => patch.mutate({ ad_account_id: a.id, updates: { rollup_enabled: v } })}
                  />
                  In roll-up
                </label>
                {!a.is_primary && a.status !== 'disconnected' && (
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => patch.mutate({ ad_account_id: a.id, updates: { is_primary: true } })}>
                    Make primary
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <AddAdAccountDialog clientId={clientId} source={source} open={adding} onOpenChange={setAdding} />
      <CredentialDialog clientId={clientId} source={source} integration="meta" open={credential} onOpenChange={setCredential} />

      <AlertDialog open={!!confirmOff} onOpenChange={(o) => !o && setConfirmOff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this ad account?</AlertDialogTitle>
            <AlertDialogDescription>
              act_{confirmOff?.provider_account_id} will be removed from the roll-up and from every reporting query for
              this client. Historical records stay; nothing is deleted in Meta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmOff) disconnect.mutate(confirmOff.id);
                setConfirmOff(null);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AddAdAccountDialog({
  clientId,
  source,
  open,
  onOpenChange,
}: {
  clientId: string;
  source: SettingsSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddAdAccount(clientId, source);
  const [accountId, setAccountId] = useState('');
  const [label, setLabel] = useState('');
  const [primary, setPrimary] = useState(false);
  const [rollup, setRollup] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAccountId('');
      setLabel('');
      setPrimary(false);
      setRollup(true);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    try {
      const res: any = await add.mutateAsync({
        provider_account_id: accountId,
        account_name: label || undefined,
        is_primary: primary,
        rollup_enabled: rollup,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link the ad account');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a Meta ad account</DialogTitle>
          <DialogDescription>
            This links an existing Meta ad account to this client for reporting. It does not create a new ad account
            inside Meta Business Manager.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct">Ad account ID</Label>
              <Input id="acct" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="act_1234567890 or 1234567890" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-label">Label (optional)</Label>
              <Input id="acct-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ad account v2" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="acct-primary">Make primary account</Label>
              <Switch id="acct-primary" checked={primary} onCheckedChange={setPrimary} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="acct-rollup">Include in roll-up</Label>
              <Switch id="acct-rollup" checked={rollup} onCheckedChange={setRollup} />
            </div>
            {error && <div className="text-xs text-rose-600">{error}</div>}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="font-medium text-sm">
              {result.idempotent ? 'Already linked — nothing changed' : `Linked act_${result.ad_account?.provider_account_id}`}
            </div>
            <ul className="space-y-1">
              <li>Saved: {result.propagation?.saved ? 'yes' : 'no'}</li>
              <li>Verified with Meta: {result.propagation?.verified ? 'yes' : `no${result.propagation?.verification_error ? ` — ${result.propagation.verification_error}` : ''}`}</li>
              <li>Live counts available: {result.propagation?.counts_available ? 'yes' : 'not yet'}</li>
              <li>Initial sync: {result.propagation?.sync || 'not queued'}{result.propagation?.sync_error ? ` — ${result.propagation.sync_error}` : ''}</li>
              <li>Reporting state: {result.propagation?.reporting_state || '—'}</li>
              <li>Reporting roster now: {(result.propagation?.reporting_roster?.all || []).map((i: string) => `act_${i}`).join(', ') || '—'}</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button onClick={submit} disabled={add.isPending || !accountId.trim()}>
              {add.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Link account
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeButton({ clientId, source, integration }: { clientId: string; source: SettingsSource; integration: 'meta' | 'ghl' }) {
  const revoke = useRevokeCredential(clientId, source);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-rose-600" onClick={() => setOpen(true)}>
        Revoke
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the stored credential?</AlertDialogTitle>
            <AlertDialogDescription>
              Syncs for this client will stop until a new credential is saved. Nothing is revoked on the provider side.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => revoke.mutate(integration)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CredentialDialog({
  clientId,
  source,
  integration,
  open,
  onOpenChange,
}: {
  clientId: string;
  source: SettingsSource;
  integration: 'meta' | 'ghl';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const replace = useReplaceCredential(clientId, source);
  const [value, setValue] = useState('');
  const [locationId, setLocationId] = useState('');

  useEffect(() => {
    if (!open) {
      setValue('');
      setLocationId('');
    }
  }, [open]);

  const submit = async () => {
    await replace.mutateAsync({ integration, value, location_id: locationId || undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{integration === 'meta' ? 'Replace Meta token' : 'Replace GoHighLevel credential'}</DialogTitle>
          <DialogDescription>
            Stored server-side. After saving, only the last four digits are ever shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {integration === 'ghl' && (
            <div className="space-y-1.5">
              <Label htmlFor="loc">Location ID (optional update)</Label>
              <Input id="loc" value={locationId} onChange={(e) => setLocationId(e.target.value)} className="font-mono" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cred">{integration === 'meta' ? 'Access token' : 'Private integration key'}</Label>
            <Input id="cred" type="password" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" autoComplete="off" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={replace.isPending || !value.trim()}>
            {replace.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save credential
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────── GHL ─────────────────────────────────── */

export function GhlPanel({ clientId, source }: { clientId: string; source: SettingsSource }) {
  const canEdit = useCanEditConnections();
  const { data: integrations } = useClientIntegrations(clientId, canEdit);
  const test = useTestConnection(clientId, source);
  const [credential, setCredential] = useState(false);
  const ghl = integrations?.ghl;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold">GoHighLevel</div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => test.mutate({ integration: 'ghl' })} disabled={test.isPending}>
              <RefreshCw className={cn('h-3.5 w-3.5', test.isPending && 'animate-spin')} /> Test connection
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCredential(true)}>
              <KeyRound className="h-3.5 w-3.5" /> Replace credential
            </Button>
          </div>
        )}
      </div>

      {ghl ? (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn(
                'capitalize gap-1',
                ghl.status === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-600 border-rose-500/30',
              )}
            >
              {ghl.status === 'connected' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {ghl.status === 'connected' ? 'Connected' : 'Needs setup'}
            </Badge>
            {ghl.secret_present && <Badge variant="outline" className="font-mono">••••{ghl.last4}</Badge>}
          </div>
          <div className="text-muted-foreground font-mono">{ghl.location_id || 'No location ID'}</div>
          <div className="text-muted-foreground">Last verified: {ago(ghl.last_verified_at)}</div>
          {ghl.last_sync_error && <div className="text-rose-600">{ghl.last_sync_error}</div>}
          {canEdit && <div className="pt-1"><RevokeButton clientId={clientId} source={source} integration="ghl" /></div>}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {canEdit ? 'Loading connection status…' : 'Sign in as an agency operator to see connection status.'}
        </div>
      )}

      <CredentialDialog clientId={clientId} source={source} integration="ghl" open={credential} onOpenChange={setCredential} />
    </Card>
  );
}

/* ─────────────────────────────── Audit panel ────────────────────────────── */

export function ConnectionAuditPanel({ clientId }: { clientId: string }) {
  const { data: entries = [], isLoading } = useConnectionAudit(clientId);
  const rows = useMemo(() => entries.slice(0, 20), [entries]);
  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-semibold">Recent changes</div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading activity…</div>}
      {!isLoading && rows.length === 0 && <div className="text-xs text-muted-foreground">No changes recorded yet.</div>}
      <div className="space-y-1.5">
        {rows.map((e) => (
          <div key={e.id} className="text-xs flex items-start justify-between gap-2 border-b last:border-0 pb-1.5">
            <div className="min-w-0">
              <div className="font-medium">{e.action.replace(/[._]/g, ' ')}</div>
              <div className="text-muted-foreground truncate">{e.actor_label || 'unknown'} · {e.source.replace('_', ' ')}</div>
            </div>
            <div className="text-muted-foreground shrink-0">{ago(e.created_at)}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground">Credential values are never recorded here.</div>
    </Card>
  );
}
