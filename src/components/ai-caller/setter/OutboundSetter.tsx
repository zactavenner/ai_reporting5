import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CalendarClock, Headphones, ListChecks, Loader2, Mic, MicOff, Phone, PhoneOff, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { setterInvoke, useAiSetterAction, useAiSetterOverview } from '@/hooks/useAiSetter';
import { BrowserSetterSession, type ConnState } from './browserSession';

const BLOCKER_LABEL: Record<string, string> = {
  no_consent: 'No consent', dnc: 'DNC', invalid_phone: 'Invalid phone', country_not_allowed: 'Country',
  outside_calling_hours: 'Outside hours', attempt_limit: 'Attempt limit', active_call: 'Active call',
  already_booked: 'Booked', outbound_disabled: 'Outbound off', campaign_inactive: 'Campaign off',
  caller_number_unverified: 'Caller # unverified', openai_not_ready: 'OpenAI', sip_not_ready: 'SIP',
  outbound_sip_not_enabled: 'Outbound SIP not enabled', demo_never_dials: 'Demo (browser only)',
  settings_missing: 'No settings', campaign_missing: 'No campaign', cross_client: 'Wrong client', bridge_not_ready: 'Bridge',
};

function fmt(iso: string | null | undefined, tz?: string) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
}

function localTime(tz: string) {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(new Date()); }
  catch { return '—'; }
}

function Ready({ label, value }: { label: string; value: string | boolean | null }) {
  const ok = value === 'ready' || value === true;
  const text = value === true ? 'ready' : value === false || value === null ? 'not enabled' : value;
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <Badge variant={ok ? 'default' : value === 'invalid' ? 'destructive' : 'secondary'}>{text}</Badge>
    </div>
  );
}

export function OutboundSetter({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useAiSetterOverview(clientId);
  const act = useAiSetterAction(clientId);

  if (isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading setter…</div>;
  if (error || !data) return (
    <Card><CardContent className="p-6 text-sm text-muted-foreground">
      {(error as Error)?.message || 'Setter unavailable.'} The Outbound Setter is available to agency admins.
    </CardContent></Card>
  );

  const hasDemo = data.queue.some((q) => q.is_demo);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={data.settings?.outbound_enabled ? 'default' : 'secondary'}>
            Outbound {data.settings?.outbound_enabled ? 'on' : 'off'}
          </Badge>
          {data.readiness.outbound_sip_enabled !== true && (
            <span className="flex items-center gap-1 text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> outbound_sip_not_enabled</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ action: 'seed_demo' }, { onSuccess: () => toast.success('Demo data ready') })}>
            <Sparkles className="mr-1 h-4 w-4" /> {hasDemo ? 'Refresh demo' : 'Seed demo'}
          </Button>
          {hasDemo && (
            <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ action: 'reset_demo' }, { onSuccess: () => toast.success('Demo data removed') })}>
              <Trash2 className="mr-1 h-4 w-4" /> Reset demo
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue"><ListChecks className="mr-1 h-4 w-4" />Queue</TabsTrigger>
          <TabsTrigger value="live"><Headphones className="mr-1 h-4 w-4" />Live Console</TabsTrigger>
          <TabsTrigger value="availability"><CalendarClock className="mr-1 h-4 w-4" />Availability</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="settings"><Settings2 className="mr-1 h-4 w-4" />Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="queue"><QueueView data={data} /></TabsContent>
        <TabsContent value="live"><LiveConsole clientId={clientId} data={data} /></TabsContent>
        <TabsContent value="availability"><AvailabilityView data={data} /></TabsContent>
        <TabsContent value="bookings"><BookingsView data={data} /></TabsContent>
        <TabsContent value="settings"><SettingsView clientId={clientId} data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}

function QueueView({ data }: { data: any }) {
  const tzDefault = data.settings?.timezone || 'America/New_York';
  const campaigns = new Map(data.campaigns.map((c: any) => [c.id, c]));
  if (!data.queue.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No leads queued. Seed the demo to try a browser test call.</CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Lead</TableHead><TableHead>Campaign</TableHead><TableHead>Blocked</TableHead>
          <TableHead>Attempts</TableHead><TableHead>Local time</TableHead><TableHead>Consent</TableHead><TableHead>DNC</TableHead><TableHead>Last result</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.queue.map((l: any) => (
            <TableRow key={l.id}>
              <TableCell><div className="font-medium">{l.contact_name}</div><div className="text-xs text-muted-foreground">{l.contact_phone}</div></TableCell>
              <TableCell className="text-sm">{(campaigns.get(l.campaign_id) as any)?.name || '—'}</TableCell>
              <TableCell>
                {l.blockers.length === 0 ? <Badge>Ready</Badge> : (
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {l.blockers.map((b: string) => <Badge key={b} variant="outline" className="text-[10px]">{BLOCKER_LABEL[b] || b}</Badge>)}
                  </div>
                )}
              </TableCell>
              <TableCell>{l.attempts} / {data.settings?.max_attempts ?? 3}</TableCell>
              <TableCell className="text-sm">{localTime(l.timezone || tzDefault)}</TableCell>
              <TableCell className="text-xs">{l.consent_evidence ? `${l.consent_evidence.source}` : '—'}</TableCell>
              <TableCell>{l.dnc ? <Badge variant="destructive">DNC</Badge> : '—'}</TableCell>
              <TableCell className="text-sm">{l.last_result || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function LiveConsole({ clientId, data }: { clientId: string; data: any }) {
  const [leadId, setLeadId] = useState<string>('');
  const [transport, setTransport] = useState<'browser' | 'phone'>('browser');
  const [state, setState] = useState<ConnState>('idle');
  const [lines, setLines] = useState<{ who: string; text: string }[]>([]);
  const [tools, setTools] = useState<{ name: string; status: string; at: string }[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [revision, setRevision] = useState<number>(1);
  const [placing, setPlacing] = useState(false);
  const ref = useRef<BrowserSetterSession | null>(null);

  useEffect(() => () => { ref.current?.end('operator_left'); }, []);

  const lead = data.queue.find((q: any) => q.id === leadId);
  const phoneBlockers: string[] = lead ? lead.blockers : ['lead_missing'];
  const busy = ['requesting_mic', 'connecting', 'active', 'closing'].includes(state);

  const start = async () => {
    if (!lead) return;
    setLines([]); setTools([]); setFailures([]); setRevision(1);
    if (transport === 'browser') {
      const s = new BrowserSetterSession(clientId, {
        onState: setState,
        onTranscript: (who, text) => setLines((p) => [...p, { who, text }]),
        onTool: (name, status, rev) => { setTools((p) => [...p, { name, status, at: new Date().toLocaleTimeString() }]); if (rev) setRevision(rev); },
        onError: (m) => setFailures((p) => [...p, m]),
      });
      ref.current = s;
      await s.start(lead.id);
    } else {
      setPlacing(true);
      try {
        const r: any = await setterInvoke('ai-setter-place-call', { client_id: clientId, queue_id: lead.id });
        toast.success(`Call created (${r.status})`);
      } catch (e: any) {
        const b = e?.payload?.blockers;
        setFailures((p) => [...p, b ? `Blocked: ${b.join(', ')}` : e.message]);
      } finally { setPlacing(false); }
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1"><CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <Label>Lead</Label>
          <Select value={leadId} onValueChange={setLeadId} disabled={busy}>
            <SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger>
            <SelectContent>{data.queue.map((q: any) => <SelectItem key={q.id} value={q.id}>{q.contact_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Transport</Label>
          <Select value={transport} onValueChange={(v) => setTransport(v as any)} disabled={busy}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="browser">Browser Test</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {transport === 'phone' && lead && phoneBlockers.length > 0 && (
          <div className="rounded-md border p-2 text-xs text-muted-foreground">
            Phone disabled: {phoneBlockers.map((b) => BLOCKER_LABEL[b] || b).join(', ')}
          </div>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!lead || busy || placing || (transport === 'phone' && phoneBlockers.length > 0) || (transport === 'browser' && lead?.dnc)} onClick={start}>
            {placing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Phone className="mr-1 h-4 w-4" />} Start
          </Button>
          <Button variant="outline" disabled={!busy} onClick={() => ref.current?.end('operator')}>
            <PhoneOff className="mr-1 h-4 w-4" /> End
          </Button>
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Connection</span><Badge variant="outline">{state}</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Mic</span>
            <span className="flex items-center gap-1">{state === 'active' ? <><Mic className="h-3.5 w-3.5" />live</> : <><MicOff className="h-3.5 w-3.5" />{state === 'mic_denied' ? 'denied' : state === 'mic_unavailable' ? 'unavailable' : 'off'}</>}</span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Preference revision</span><span>{revision}</span></div>
        </div>
        {failures.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/40 p-2 text-xs text-destructive">
            {failures.map((f, i) => <div key={i}>{f}</div>)}
          </div>
        )}
      </CardContent></Card>

      <Card className="lg:col-span-2"><CardContent className="grid gap-4 p-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <h4 className="mb-2 text-sm font-semibold">Transcript</h4>
          <div className="h-80 space-y-2 overflow-y-auto rounded-md border p-3 text-sm">
            {lines.length === 0 ? <p className="text-muted-foreground">Transcript appears here once the call starts.</p> :
              lines.map((l, i) => <p key={i}><span className="font-medium">{l.who}:</span> {l.text}</p>)}
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold">Tool activity</h4>
          <div className="h-80 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
            {tools.length === 0 ? <p className="text-muted-foreground">No tool calls yet.</p> :
              tools.map((t, i) => <div key={i} className="flex justify-between gap-2"><span>{t.name}</span><Badge variant="outline" className="text-[10px]">{t.status}</Badge></div>)}
          </div>
        </div>
      </CardContent></Card>
    </div>
  );
}

function AvailabilityView({ data }: { data: any }) {
  const held = new Map(data.holds.map((h: any) => [h.slot_id, h]));
  const booked = new Set(data.bookings.filter((b: any) => b.status !== 'cancelled' && b.status !== 'failed').map((b: any) => b.slot_id));
  if (!data.slots.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No upcoming slots.</CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Service</TableHead><TableHead>Status</TableHead><TableHead>Hold expires</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.slots.map((s: any) => {
            const h: any = held.get(s.id);
            return (
              <TableRow key={s.id}>
                <TableCell>{fmt(s.starts_at, s.timezone)} <span className="text-xs text-muted-foreground">{s.timezone}</span></TableCell>
                <TableCell className="capitalize">{s.service_type}{s.is_demo ? ' (DEMO)' : ''}</TableCell>
                <TableCell>{booked.has(s.id) ? <Badge>Booked</Badge> : h ? <Badge variant="secondary">Held</Badge> : <Badge variant="outline">Open</Badge>}</TableCell>
                <TableCell className="text-sm">{h ? fmt(h.expires_at) : '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function BookingsView({ data }: { data: any }) {
  if (!data.bookings.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No bookings yet.</CardContent></Card>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Contact</TableHead><TableHead>Client</TableHead><TableHead>Service</TableHead><TableHead>Date / time</TableHead>
          <TableHead>Source call</TableHead><TableHead>Provider ID</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.bookings.map((b: any) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.contact_name}</TableCell>
              <TableCell className="text-sm">{data.client.name}</TableCell>
              <TableCell className="capitalize">{b.service_type}</TableCell>
              <TableCell>{fmt(b.starts_at, b.timezone)} <span className="text-xs text-muted-foreground">{b.timezone}</span></TableCell>
              <TableCell className="font-mono text-xs">{b.session_id ? b.session_id.slice(0, 8) : 'seed'}</TableCell>
              <TableCell className="font-mono text-xs">{b.provider_booking_id || '—'}</TableCell>
              <TableCell><Badge variant={b.status === 'confirmed' ? 'default' : b.status === 'reconciliation_required' ? 'destructive' : 'outline'}>{b.status}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function SettingsView({ clientId, data }: { clientId: string; data: any }) {
  const act = useAiSetterAction(clientId);
  const init = useMemo(() => ({
    business_name: data.settings?.business_name || '',
    candidate_script: data.settings?.candidate_script || '',
    investor_script: data.settings?.investor_script || '',
    approved_questions: (data.settings?.approved_questions || []).join('\n'),
    voice: data.settings?.voice || 'marin',
    timezone: data.settings?.timezone || 'America/New_York',
    call_window_start: data.settings?.call_window_start ?? 9,
    call_window_end: data.settings?.call_window_end ?? 19,
    max_attempts: data.settings?.max_attempts ?? 3,
    daily_call_limit: data.settings?.daily_call_limit ?? 50,
    caller_number: data.settings?.caller_number || '',
  }), [data.settings]);
  const [f, setF] = useState(init);
  useEffect(() => setF(init), [init]);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const save = () => act.mutate({
    action: 'save_settings',
    settings: {
      ...f, approved_questions: f.approved_questions.split('\n').map((s: string) => s.trim()).filter(Boolean),
      call_window_start: Number(f.call_window_start), call_window_end: Number(f.call_window_end),
      max_attempts: Number(f.max_attempts), daily_call_limit: Number(f.daily_call_limit), caller_number: f.caller_number || null,
    },
  }, { onSuccess: () => toast.success('Settings saved') });
  const r = data.readiness;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardContent className="grid gap-3 p-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2"><Label>Business identity</Label><Input value={f.business_name} onChange={(e) => set('business_name', e.target.value)} /></div>
        <div className="space-y-1"><Label>Candidate script</Label><Textarea rows={4} value={f.candidate_script} onChange={(e) => set('candidate_script', e.target.value)} /></div>
        <div className="space-y-1"><Label>Investor script</Label><Textarea rows={4} value={f.investor_script} onChange={(e) => set('investor_script', e.target.value)} /></div>
        <div className="space-y-1 md:col-span-2"><Label>Approved qualification questions (one per line)</Label><Textarea rows={3} value={f.approved_questions} onChange={(e) => set('approved_questions', e.target.value)} /></div>
        <div className="space-y-1"><Label>Voice</Label>
          <Select value={f.voice} onValueChange={(v) => set('voice', v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['marin', 'cedar', 'alloy', 'sage', 'verse'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1"><Label>Timezone</Label><Input value={f.timezone} onChange={(e) => set('timezone', e.target.value)} /></div>
        <div className="space-y-1"><Label>Calling hours (lead local, 24h)</Label>
          <div className="flex gap-2"><Input type="number" value={f.call_window_start} onChange={(e) => set('call_window_start', e.target.value)} /><Input type="number" value={f.call_window_end} onChange={(e) => set('call_window_end', e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label>Attempts per lead / daily limit</Label>
          <div className="flex gap-2"><Input type="number" value={f.max_attempts} onChange={(e) => set('max_attempts', e.target.value)} /><Input type="number" value={f.daily_call_limit} onChange={(e) => set('daily_call_limit', e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label>Caller number (E.164)</Label><Input placeholder="+15555550100" value={f.caller_number} onChange={(e) => set('caller_number', e.target.value)} />
          <p className="text-xs text-muted-foreground">{data.settings?.caller_number_verified ? 'Verified' : 'Not verified — phone calls stay blocked.'}</p></div>
        <div className="flex items-end md:col-span-2"><Button onClick={save} disabled={act.isPending}>Save settings</Button></div>
      </CardContent></Card>

      <div className="space-y-4">
        <Card><CardContent className="space-y-2 p-4">
          <h4 className="text-sm font-semibold">Readiness</h4>
          <Ready label="OpenAI" value={r.openai} />
          <Ready label="SIP trunk" value={r.sip} />
          <Ready label="Voice bridge" value={r.bridge} />
          <Ready label="Outbound SIP enabled" value={r.outbound_sip_enabled} />
          <Ready label="Calendar" value={data.settings?.calendar_provider === 'demo' || !data.settings ? 'ready' : data.settings?.calendar_mapping_verified ? 'ready' : 'missing'} />
          <p className="pt-1 text-xs text-muted-foreground">Models: {r.models.realtime} (browser), {r.models.live} (phone), {r.models.responses} (tools)</p>
        </CardContent></Card>
        <Card><CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div><div className="text-sm font-semibold">Global outbound calling</div><div className="text-xs text-muted-foreground">Off by default. Every readiness gate must also pass.</div></div>
            <Switch checked={!!data.settings?.outbound_enabled} onCheckedChange={(v) => act.mutate({ action: 'save_settings', settings: { outbound_enabled: v } })} />
          </div>
          {data.campaigns.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <span>{c.name}</span>
              <Switch checked={c.active} disabled={c.is_demo} onCheckedChange={(v) => act.mutate({ action: 'set_campaign_active', campaign_id: c.id, active: v })} />
            </div>
          ))}
        </CardContent></Card>
      </div>
    </div>
  );
}
