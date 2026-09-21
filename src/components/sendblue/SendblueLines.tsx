import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, PlugZap, RefreshCw } from 'lucide-react';
import {
  SendblueLine,
  useCreateSendblueLine,
  useRegisterSendblueLine,
  useTestSendblueLine,
  useUpdateSendblueLine,
} from '@/hooks/useSendblue';

interface Props {
  lines: SendblueLine[];
  clientId?: string;
  clients?: { id: string; name: string }[];
}

const statusLabel: Record<string, { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  connected: { text: 'Connected', variant: 'default' },
  unverified: { text: 'Not checked yet', variant: 'secondary' },
  credentials_rejected: { text: 'Credentials rejected', variant: 'destructive' },
  error: { text: 'Error', variant: 'destructive' },
  disabled: { text: 'Off', variant: 'outline' },
};

export function SendblueLines({ lines, clientId, clients }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: '',
    phone_e164: '',
    plan_type: 'inbound_only' as 'inbound_only' | 'outbound',
    api_key_id: '',
    api_secret: '',
    client_id: clientId ?? '',
  });

  const register = useRegisterSendblueLine();
  const update = useUpdateSendblueLine();
  const test = useTestSendblueLine();
  const create = useCreateSendblueLine();

  const clientName = (id: string | null) => {
    if (!id) return 'Agency';
    return clients?.find((c) => c.id === id)?.name || 'Client';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowForm((v) => !v)} variant="default" size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add existing number
        </Button>
        <Button
          onClick={() => create.mutate({ client_id: clientId ?? null, label: 'New Sendblue line' })}
          variant="outline"
          size="sm"
          disabled={create.isPending}
        >
          {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
          Request a new number
        </Button>
      </div>

      {create.data && !create.data.ok && (
        <p className="text-sm text-muted-foreground">{create.data.reason}</p>
      )}
      {create.data?.stage === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A new number can be created</CardTitle>
            <CardDescription>Confirm to add it to your Sendblue account and this client.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              size="sm"
              onClick={() => create.mutate({ client_id: clientId ?? null, confirm: true, label: form.label || 'New Sendblue line' })}
              disabled={create.isPending}
            >
              Confirm and create
            </Button>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Register a Sendblue number</CardTitle>
            <CardDescription>
              Paste the number and its keys. Keys are stored on the server and shown masked afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="AMT main line" />
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <Input value={form.phone_e164} onChange={(e) => setForm({ ...form, phone_e164: e.target.value })} placeholder="+1 555 123 4567" />
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={form.plan_type} onValueChange={(v: any) => setForm({ ...form, plan_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound_only">Replies only (inbound line)</SelectItem>
                  <SelectItem value="outbound">Can start conversations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!clientId && clients && (
              <div className="space-y-2">
                <Label>Belongs to</Label>
                <Select value={form.client_id || 'agency'} onValueChange={(v) => setForm({ ...form, client_id: v === 'agency' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agency">Agency</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>API key id</Label>
              <Input value={form.api_key_id} onChange={(e) => setForm({ ...form, api_key_id: e.target.value })} placeholder="Optional — falls back to the agency keys" />
            </div>
            <div className="space-y-2">
              <Label>API secret</Label>
              <Input type="password" value={form.api_secret} onChange={(e) => setForm({ ...form, api_secret: e.target.value })} placeholder="Optional" />
            </div>
            <div className="md:col-span-2">
              <Button
                size="sm"
                disabled={register.isPending || !form.label || !form.phone_e164}
                onClick={() =>
                  register.mutate(
                    {
                      label: form.label,
                      phone_e164: form.phone_e164,
                      plan_type: form.plan_type,
                      client_id: clientId ?? (form.client_id || null),
                      api_key_id: form.api_key_id || undefined,
                      api_secret: form.api_secret || undefined,
                    },
                    { onSuccess: () => setShowForm(false) },
                  )
                }
              >
                {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save line
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No texting numbers yet.</p>
      ) : (
        <div className="grid gap-3">
          {lines.map((line) => {
            const status = statusLabel[line.status] || statusLabel.unverified;
            return (
              <Card key={line.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{line.label}</span>
                      <Badge variant={status.variant}>{status.text}</Badge>
                      <Badge variant="outline">
                        {line.plan_type === 'outbound' ? 'Can start conversations' : 'Replies only'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {line.phone_e164} · {clientName(line.client_id)}
                      {line.api_key_masked ? ` · key ${line.api_key_masked}` : ' · agency keys'}
                    </p>
                    {line.last_error && <p className="text-sm text-destructive">{line.last_error}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={line.active}
                        onCheckedChange={(checked) => update.mutate({ line_id: line.id, active: checked })}
                      />
                      <span className="text-sm text-muted-foreground">On</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => test.mutate({ line_id: line.id })} disabled={test.isPending}>
                      {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Test connection
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
