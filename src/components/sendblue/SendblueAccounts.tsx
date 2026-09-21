import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CheckCircle2, Loader2, Plus, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import {
  SendblueAccount,
  SendblueCoverage,
  SendblueDiscoveredLine,
  SendblueLine,
  useDiscoverSendblueLines,
  useImportSendblueLines,
  useSaveSendblueAccount,
  useUpdateSendblueAccount,
  useVerifySendblueAccount,
} from '@/hooks/useSendblue';

interface Props {
  accounts: SendblueAccount[];
  lines: SendblueLine[];
  coverage?: SendblueCoverage;
  webhookConfigured: boolean;
  clientId?: string;
  clients?: { id: string; name: string }[];
}

const statusText: Record<string, { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  connected: { text: 'Credentials verified', variant: 'default' },
  unverified: { text: 'Saved, not verified', variant: 'secondary' },
  credentials_rejected: { text: 'Sendblue rejected these keys', variant: 'destructive' },
  error: { text: 'Could not reach Sendblue', variant: 'destructive' },
  disabled: { text: 'Switched off', variant: 'outline' },
};

export function SendblueAccounts({ accounts, lines, coverage, webhookConfigured, clientId, clients }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', api_key_id: '', api_secret: '', client_id: clientId ?? '' });
  const [discovered, setDiscovered] = useState<Record<string, SendblueDiscoveredLine[]>>({});
  const [discoverNote, setDiscoverNote] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});

  const save = useSaveSendblueAccount();
  const update = useUpdateSendblueAccount();
  const verify = useVerifySendblueAccount();
  const discover = useDiscoverSendblueLines();
  const importLines = useImportSendblueLines();

  const clientName = (id: string | null) => (id ? clients?.find((c) => c.id === id)?.name || 'Client' : 'Agency');

  const togglePick = (accountId: string, phone: string) => {
    setPicked((prev) => {
      const next = new Set(prev[accountId] ?? []);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return { ...prev, [accountId]: next };
    });
  };

  const runDiscover = (accountId: string) => {
    discover.mutate(
      { account_id: accountId },
      {
        onSuccess: (res) => {
          setDiscovered((prev) => ({ ...prev, [accountId]: res.lines || [] }));
          setDiscoverNote((prev) => ({
            ...prev,
            [accountId]: res.detail || (res.lines?.length ? '' : 'No numbers came back from Sendblue.'),
          }));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {coverage && !clientId && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{coverage.accounts_total} Sendblue accounts saved</Badge>
          <Badge variant={coverage.accounts_verified === coverage.accounts_total && coverage.accounts_total > 0 ? 'secondary' : 'outline'}>
            {coverage.accounts_verified} verified
          </Badge>
          <Badge variant="outline">{coverage.clients_with_account} of {coverage.clients_total} clients connected</Badge>
          {coverage.clients_missing_account > 0 && (
            <Badge variant="destructive">{coverage.clients_missing_account} clients still without an account</Badge>
          )}
          <Badge variant={webhookConfigured ? 'secondary' : 'destructive'}>
            {webhookConfigured ? 'Incoming messages can be verified' : 'Incoming message secret missing'}
          </Badge>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" /> Add Sendblue account
        </Button>
      </div>

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a Sendblue account</CardTitle>
            <CardDescription>
              In Sendblue, open Settings then API Keys and copy the API Key ID and API Secret Key. Paste them below and
              save — they are stored on the server only, shown masked afterwards, and checked against Sendblue straight
              away. Nothing is sent to anybody.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Account name</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="AMT Sendblue"
              />
            </div>
            {!clientId && clients && (
              <div className="space-y-2">
                <Label>Belongs to</Label>
                <Select
                  value={form.client_id || 'agency'}
                  onValueChange={(v) => setForm({ ...form, client_id: v === 'agency' ? '' : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agency">Agency (no client)</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>API Key ID</Label>
              <Input
                value={form.api_key_id}
                onChange={(e) => setForm({ ...form, api_key_id: e.target.value })}
                placeholder="From Sendblue → Settings → API Keys"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>API Secret Key</Label>
              <Input
                type="password"
                value={form.api_secret}
                onChange={(e) => setForm({ ...form, api_secret: e.target.value })}
                placeholder="Kept on the server, never shown again"
                autoComplete="new-password"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <Button
                size="sm"
                disabled={save.isPending || !form.label || !form.api_key_id || !form.api_secret}
                onClick={() =>
                  save.mutate(
                    {
                      label: form.label,
                      api_key_id: form.api_key_id,
                      api_secret: form.api_secret,
                      client_id: clientId ?? (form.client_id || null),
                    },
                    {
                      onSuccess: () => {
                        setForm({ label: '', api_key_id: '', api_secret: '', client_id: clientId ?? '' });
                        setAdding(false);
                      },
                    },
                  )
                }
              >
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save and check
              </Button>
              <span className="text-sm text-muted-foreground">
                Saving does not connect anything on its own — the check result is shown on the account below.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Sendblue accounts saved yet.</p>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {accounts.map((account) => {
            const status = statusText[account.status] || statusText.unverified;
            const accountLines = lines.filter((l) => l.account_id === account.id);
            const found = discovered[account.id];
            const pickedSet = picked[account.id] ?? new Set<string>();
            return (
              <Card key={account.id}>
                <AccordionItem value={account.id} className="border-0">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{account.label}</CardTitle>
                        <CardDescription>
                          {clientName(account.client_id)} · key {account.api_key_masked || '••••'} ·{' '}
                          {accountLines.length} number{accountLines.length === 1 ? '' : 's'} imported
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={status.variant}>{status.text}</Badge>
                        <Switch
                          checked={account.active}
                          onCheckedChange={(checked) => update.mutate({ account_id: account.id, active: checked })}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={account.status === 'connected' ? 'secondary' : 'outline'}>
                        {account.status === 'connected'
                          ? `Credentials verified ${account.verified_at ? new Date(account.verified_at).toLocaleString() : ''}`
                          : 'Credentials not verified'}
                      </Badge>
                      <Badge variant={account.webhook_health?.receive_hook_registered ? 'secondary' : 'outline'}>
                        {account.webhook_health?.receive_hook_registered
                          ? 'Incoming webhook registered with Sendblue'
                          : 'Incoming webhook not registered'}
                      </Badge>
                      <Badge variant={account.webhook_health?.outbound_hook_registered ? 'secondary' : 'outline'}>
                        {account.webhook_health?.outbound_hook_registered
                          ? 'Delivery webhook registered with Sendblue'
                          : 'Delivery webhook not registered'}
                      </Badge>
                      <Badge variant={accountLines.some((l) => l.first_inbound_at) ? 'secondary' : 'outline'}>
                        {accountLines.some((l) => l.first_inbound_at) ? 'Incoming message received' : 'No incoming message yet'}
                      </Badge>
                      <Badge variant={accountLines.some((l) => l.last_delivered_at) ? 'secondary' : 'outline'}>
                        {accountLines.some((l) => l.last_delivered_at) ? 'Outgoing delivery confirmed' : 'No outgoing delivery yet'}
                      </Badge>
                    </div>
                    {account.last_error && <p className="text-destructive">{account.last_error}</p>}
                    <p className="text-muted-foreground">
                      Last checked: {account.last_checked_at ? new Date(account.last_checked_at).toLocaleString() : 'never'}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => verify.mutate({ account_id: account.id })}
                        disabled={verify.isPending}
                      >
                        {verify.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Test connection
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => runDiscover(account.id)} disabled={discover.isPending}>
                        {discover.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                        Find this account's numbers
                      </Button>
                      <AccordionTrigger className="px-2 py-1 text-sm hover:no-underline">Numbers</AccordionTrigger>
                    </div>

                    <AccordionContent className="space-y-3 pt-2">
                      {discoverNote[account.id] && (
                        <p className="text-muted-foreground">{discoverNote[account.id]}</p>
                      )}
                      {found && found.length > 0 && (
                        <div className="space-y-2">
                          {found.map((line) => (
                            <div key={line.phone_e164} className="flex items-center gap-3 rounded-md border p-2">
                              <Checkbox
                                checked={pickedSet.has(line.phone_e164)}
                                disabled={line.already_imported}
                                onCheckedChange={() => togglePick(account.id, line.phone_e164)}
                              />
                              <div className="flex-1">
                                <p className="font-medium">{line.phone_e164}</p>
                                {line.label && <p className="text-muted-foreground">{line.label}</p>}
                              </div>
                              {line.already_imported ? (
                                <Badge variant="secondary" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Already added
                                </Badge>
                              ) : (
                                <Badge variant="outline">Not added yet</Badge>
                              )}
                            </div>
                          ))}
                          <Button
                            size="sm"
                            disabled={importLines.isPending || pickedSet.size === 0}
                            onClick={() =>
                              importLines.mutate(
                                {
                                  account_id: account.id,
                                  phones: Array.from(pickedSet),
                                  client_id: clientId ?? account.client_id,
                                },
                                { onSuccess: () => { setPicked((p) => ({ ...p, [account.id]: new Set() })); runDiscover(account.id); } },
                              )
                            }
                          >
                            {importLines.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add {pickedSet.size || ''} selected number{pickedSet.size === 1 ? '' : 's'}
                          </Button>
                        </div>
                      )}

                      {accountLines.length > 0 && (
                        <div className="space-y-1">
                          <p className="font-medium">Imported numbers</p>
                          {accountLines.map((l) => (
                            <p key={l.id} className="text-muted-foreground">
                              {l.phone_e164} · {l.label} ·{' '}
                              {l.status === 'connected' ? 'credentials verified' : 'not verified'}
                            </p>
                          ))}
                        </div>
                      )}
                      {!found && accountLines.length === 0 && (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <XCircle className="h-4 w-4" /> No numbers added yet — run “Find this account's numbers”, or add one
                          by hand from the Numbers tab.
                        </p>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => verify.mutate({ account_id: account.id })}
                        disabled={verify.isPending}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" /> Re-check credentials
                      </Button>
                    </AccordionContent>
                  </CardContent>
                </AccordionItem>
              </Card>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

export default SendblueAccounts;
