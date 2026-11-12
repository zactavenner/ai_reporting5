/**
 * "Meta System User Token" row: status, which token pulls use, and
 * Upload / Replace / Remove / Re-check. The pasted token lives only in the
 * dialog's local state and is cleared as soon as it is submitted or closed.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';
import {
  metaSystemTokenKey,
  submitMetaSystemToken,
  useMetaSystemTokenAction,
  useMetaSystemTokenStatus,
} from '@/hooks/useMetaSystemToken';
import { TOKEN_PILL, tokenDetailLines, type MetaSystemTokenStatus } from '@/lib/metaSystemTokenDisplay';

export function MetaSystemTokenPill({ status }: { status?: MetaSystemTokenStatus | null }) {
  const pill = TOKEN_PILL[status?.status ?? 'not_set'];
  return (
    <Badge variant="outline" className={cn('h-5 text-[10px] font-medium', pill.className)}>
      {pill.label}
    </Badge>
  );
}

export function MetaSystemTokenDetail({ status }: { status?: MetaSystemTokenStatus | null }) {
  const lines = tokenDetailLines(status);
  return (
    <div className="space-y-0.5">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      {status?.last_error && status.status !== 'active' && (
        <div className="text-rose-600 truncate max-w-[520px]" title={status.last_error}>
          {status.last_error}
        </div>
      )}
    </div>
  );
}

function UploadDialog({
  clientId,
  open,
  replacing,
  onOpenChange,
}: {
  clientId: string;
  open: boolean;
  replacing: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const close = (o: boolean) => {
    if (!o) {
      setValue('');
      setResult(null);
    }
    onOpenChange(o);
  };

  const save = async () => {
    const token = value.trim();
    setValue(''); // cleared immediately; the only copy is the one in flight
    if (!token) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await submitMetaSystemToken(clientId, token);
      qc.setQueryData(metaSystemTokenKey(clientId), r.status);
      qc.invalidateQueries({ queryKey: ['connection-audit', clientId] });
      if (!r.saved) {
        setResult({ ok: false, text: `Invalid — not saved. ${r.message ?? ''} Pulls keep using the ${replacing ? 'current token' : 'user token'}.` });
      } else if (r.status.status === 'needs_attention') {
        setResult({ ok: true, text: `Saved, but needs attention: ${r.status.last_error ?? 'some ad accounts are not reachable'}.` });
        toast.warning('System user token saved — some ad accounts need access');
      } else {
        toast.success('System user token saved — Meta pulls now use it');
        close(false);
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : 'Could not save the token' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{replacing ? 'Replace' : 'Upload'} Meta system user token</DialogTitle>
          <DialogDescription>
            Meta Business Settings → System users → Generate token (ads_read, ads_management, business_management).
            Stored encrypted; never shown again.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-2"
        >
          <Label htmlFor="meta-system-token-input">Token</Label>
          <Input
            id="meta-system-token-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste the token"
            disabled={busy}
          />
          {result && (
            <p className={cn('text-xs', result.ok ? 'text-amber-600' : 'text-rose-600')}>{result.text}</p>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
              {result?.ok ? 'Done' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check & save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Upload / Replace / Remove / Re-check buttons + their dialogs. */
export function MetaSystemTokenControls({ clientId, status }: { clientId: string; status?: MetaSystemTokenStatus | null }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const action = useMetaSystemTokenAction(clientId);
  const isSet = !!status && status.status !== 'not_set';

  return (
    <>
      {isSet ? (
        <>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={action.isPending} onClick={() => action.mutate('revalidate')}>
            {action.isPending && action.variables === 'revalidate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-check
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Replace
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={action.isPending} onClick={() => setConfirmRemove(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={!status} onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
      )}

      <UploadDialog clientId={clientId} open={uploadOpen} replacing={isSet} onOpenChange={setUploadOpen} />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the system user token?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes it from Reporting 5.0 — Meta pulls go back to the user token. Nothing is revoked at Meta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => action.mutate('delete')}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Stand-alone card row used in the Connections section / client Settings tab. */
export function MetaSystemTokenRow({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useMetaSystemTokenStatus(clientId);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <KeyRound className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">Meta System User Token</span>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : data && <MetaSystemTokenPill status={data} />}
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              {error ? <span className="text-rose-600">Could not load token status: {(error as Error).message}</span> : <MetaSystemTokenDetail status={data} />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <MetaSystemTokenControls clientId={clientId} status={data} />
        </div>
      </div>
    </Card>
  );
}
