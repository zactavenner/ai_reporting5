import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, CircleSlash, Info, Loader2, Play, PauseCircle } from 'lucide-react';
import { useQualityAction, useQualityClient } from '@/hooks/useQualityFeedback';
import { MILESTONE_LABEL, ModeBadge, StatusBadge } from './qfUi';

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const join = (a?: string[]) => (a ?? []).join(', ');
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');
const money = (n: number | null) => (n == null ? 'Not enough coverage' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

export function QualityFeedbackClientTab({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useQualityClient(clientId);
  const act = useQualityAction(clientId);
  const [rules, setRules] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [confirmName, setConfirmName] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => { if (data) { setRules(data.rules ?? data.default_rules); setCfg(data.config); } }, [data]);

  if (isLoading || !rules || !cfg) return <div className="flex items-center gap-2 text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (error) return <Card><CardContent className="p-6 text-sm text-destructive">{(error as Error).message}</CardContent></Card>;

  const mode = data.config.mode;
  const records = (data.records ?? []).filter((r: any) => {
    if (filter === 'all') return true;
    return r.milestones.find((m: any) => m.milestone === data.config.milestone)?.status === filter;
  });
  const ms = data.measurement;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Mode</span> <ModeBadge mode={mode} />
            <span className="text-muted-foreground">Global live</span> <span>{data.global?.live_enabled ? 'Enabled' : 'Disabled'}{data.global?.emergency_stop ? ' · Emergency stop' : ''}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={mode === 'off' ? 'secondary' : 'outline'} onClick={() => act.mutate({ action: 'set_mode', mode: 'off' })} className="gap-1"><PauseCircle className="h-4 w-4" /> Off</Button>
            <Button size="sm" variant={mode === 'preview' ? 'secondary' : 'outline'} onClick={() => act.mutate({ action: 'set_mode', mode: 'preview' })}>Preview</Button>
            <Button size="sm" variant="outline" className="gap-1" disabled={act.isPending} onClick={() => act.mutate({ action: 'run_preview', days: 30 })}>
              <Play className="h-4 w-4" /> {mode === 'preview' ? 'Re-evaluate last 30 days' : 'Run isolated simulation'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground flex gap-1"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" /> Preview shows what would be sent. It is not a live test and nothing is delivered to Meta. Pausing stops new and retrying sends; events Meta already accepted cannot be undone.</p>

      <Tabs defaultValue="records">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="records">Preview records</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="destination">Destination & activation</TabsTrigger>
          <TabsTrigger value="delivery">Delivery history</TabsTrigger>
          <TabsTrigger value="measurement">Measurement</TabsTrigger>
          <TabsTrigger value="rollout">Campaign rollout</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Showing {MILESTONE_LABEL[data.config.milestone]}:</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{['all', 'eligible', 'withheld', 'needs_review', 'excluded'].map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All' : s.replace('_', ' ')}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!records.length && <Card><CardContent className="p-6 text-sm text-muted-foreground">No evaluations yet. Switch to Preview or run an isolated simulation.</CardContent></Card>}
          {records.slice(0, 150).map((r: any) => (
            <Card key={r.lead_id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <div className="font-medium">{r.name || 'Unnamed lead'} <span className="text-xs text-muted-foreground">captured {dt(r.captured_at)}</span></div>
                  {r.matching_coverage?.length ? <span className="text-xs text-muted-foreground">Matching: {r.matching_coverage.join(', ')}</span> : null}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {r.milestones.map((m: any) => (
                    <div key={m.milestone} className="rounded-md border border-border/60 p-2 text-xs space-y-1">
                      <div className="flex justify-between gap-2"><span className="font-medium">{MILESTONE_LABEL[m.milestone]}</span><StatusBadge status={m.status} /></div>
                      {m.occurred_at && <div className="text-muted-foreground">Occurred {dt(m.occurred_at)}</div>}
                      <ul className="text-muted-foreground list-disc pl-4">{(m.reasons ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                      {(m.evidence ?? []).length > 0 && <div className="text-muted-foreground">Evidence: {m.evidence.map((e: any) => `${e.detail} (${e.table} ${String(e.id).slice(0, 8)}, ${e.at ? new Date(e.at).toLocaleDateString() : 'no date'})`).join(' · ')}</div>}
                    </div>
                  ))}
                </div>
                {r.prospective_payload && (
                  <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Prospective payload (masked, not sent)</summary>
                    <pre className="mt-2 bg-muted/50 rounded p-2 overflow-x-auto">{JSON.stringify(r.prospective_payload, null, 2)}</pre>
                    {r.payload_errors?.length > 0 && <div className="text-destructive mt-1">Would be blocked: {r.payload_errors.join(' · ')}</div>}
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader><CardTitle className="text-base">Qualification rules · v{data.rules_version || 0}</CardTitle>
              <CardDescription>Only explicitly mapped CRM evidence counts. Bookings, attendance and AI scores never imply qualification on their own.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {[
                ['qualified_dispositions', 'CRM dispositions that verify qualification'],
                ['qualified_stage_ids', 'Pipeline stage IDs that verify qualification'],
                ['disqualify_dispositions', 'Disqualifying dispositions'],
                ['booking_ok_statuses', 'Appointment statuses that count as a successful booking'],
                ['test_markers', 'Test record markers (name/email contains)'],
              ].map(([k, label]) => (
                <div key={k} className="space-y-1"><Label>{label}</Label>
                  <Input value={join(rules[k])} onChange={(e) => setRules({ ...rules, [k]: list(e.target.value) })} placeholder="comma separated" /></div>
              ))}
              <div className="space-y-1"><Label>CRM field rules (one per line: field = value1, value2)</Label>
                <Textarea rows={3} value={(rules.qualified_field_rules ?? []).map((f: any) => `${f.field} = ${f.in.join(', ')}`).join('\n')}
                  onChange={(e) => setRules({ ...rules, qualified_field_rules: e.target.value.split('\n').map((l) => l.split('=')).filter((p) => p.length === 2 && p[0].trim()).map(([f, v]) => ({ field: f.trim(), in: list(v) })) })} /></div>
              <div className="flex items-center gap-2"><Switch checked={rules.attendance_requires_source} onCheckedChange={(v) => setRules({ ...rules, attendance_requires_source: v })} /><Label>Attendance must have a source record</Label></div>
              <div className="flex items-center gap-2"><Label>Contact requirement</Label>
                <Select value={rules.contact_requirement} onValueChange={(v) => setRules({ ...rules, contact_requirement: v })}>
                  <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="email_or_phone">Email or phone</SelectItem><SelectItem value="email_and_phone">Email and phone</SelectItem></SelectContent>
                </Select></div>
              <Button onClick={() => act.mutate({ action: 'save_rules', rules })} disabled={act.isPending}>Save as new version</Button>
              <div className="pt-2 space-y-1 text-xs text-muted-foreground">
                <div className="font-medium text-foreground">Version history</div>
                {(data.versions ?? []).map((v: any) => <div key={v.id}>v{v.version} · {dt(v.created_at)} · {v.created_by || 'unknown'}</div>)}
                {!data.versions?.length && <div>No versions saved.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="destination" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Mapping and destination</CardTitle><CardDescription>Internal milestones stay distinct from the Meta event name. Funded outcomes stay internal.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label>Quality milestone</Label>
                <Select value={cfg.milestone} onValueChange={(v) => setCfg({ ...cfg, milestone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['attended_qualified_call', 'verified_qualified_booking', 'verified_qualified_lead'].map((m) => <SelectItem key={m} value={m}>{MILESTONE_LABEL[m]}{m === 'attended_qualified_call' ? ' (recommended with enough volume)' : ''}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Meta event name</Label><Input value={cfg.meta_event_name ?? ''} onChange={(e) => setCfg({ ...cfg, meta_event_name: e.target.value })} placeholder="e.g. QualifiedCall" /></div>
              <div className="space-y-1"><Label>Event source</Label>
                <Select value={cfg.event_source} onValueChange={(v) => setCfg({ ...cfg, event_source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="crm">CRM feedback (Instant Form / system generated)</SelectItem><SelectItem value="website">Website event (not supported yet)</SelectItem></SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Dataset ID</Label><Input value={cfg.destination_dataset_id ?? ''} onChange={(e) => setCfg({ ...cfg, destination_dataset_id: e.target.value })} /></div>
              <div className="space-y-1"><Label>Ad account</Label><Input value={cfg.destination_ad_account_id ?? ''} onChange={(e) => setCfg({ ...cfg, destination_ad_account_id: e.target.value })} /></div>
              <div className="space-y-1"><Label>Volume advisory (eligible per month)</Label><Input type="number" value={cfg.volume_advisory_monthly} onChange={(e) => setCfg({ ...cfg, volume_advisory_monthly: e.target.value })} /></div>
              <div className="space-y-1"><Label>Data-sharing eligibility</Label>
                <Select value={cfg.sharing_consent_status} onValueChange={(v) => setCfg({ ...cfg, sharing_consent_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="unknown">Unknown (blocked)</SelectItem><SelectItem value="documented">Documented</SelectItem><SelectItem value="refused">Refused</SelectItem></SelectContent>
                </Select></div>
              <div className="space-y-1"><Label>Eligibility evidence</Label><Input value={cfg.sharing_consent_evidence ?? ''} onChange={(e) => setCfg({ ...cfg, sharing_consent_evidence: e.target.value })} placeholder="Where the agreement/consent is documented" /></div>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={() => act.mutate({ action: 'save_config', config: { milestone: cfg.milestone, meta_event_name: cfg.meta_event_name, event_source: cfg.event_source, destination_dataset_id: cfg.destination_dataset_id, destination_ad_account_id: cfg.destination_ad_account_id, volume_advisory_monthly: cfg.volume_advisory_monthly, sharing_consent_status: cfg.sharing_consent_status, sharing_consent_evidence: cfg.sharing_consent_evidence } })}>Save</Button>
                <Button variant="outline" disabled title="Disabled in this build">Validate connection / Test Events</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Readiness</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.readiness.items.map((i: any) => (
                <div key={i.key} className="flex gap-2">
                  {i.ok ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /> : <CircleSlash className={`h-4 w-4 mt-0.5 ${i.advisory ? 'text-muted-foreground' : 'text-destructive'}`} />}
                  <div><div>{i.label}{i.advisory ? ' (advisory)' : ''}</div><div className="text-xs text-muted-foreground">{i.detail}</div></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Live activation — this client only</CardTitle>
              <CardDescription>Only new milestones after activation can be sent. Preview and historical records are never replayed.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>Dataset <span className="font-mono">{data.config.destination_dataset_id || '—'}</span> · Ad account {data.config.destination_ad_account_id || '—'}</div>
              <div>{MILESTONE_LABEL[data.config.milestone]} → {data.config.meta_event_name || 'no event name'} · effective from the moment of confirmation</div>
              {data.readiness.blockers.length > 0 && <div className="text-destructive text-xs">Blocked: {data.readiness.blockers.join(' · ')}</div>}
              <div className="flex gap-2 items-center">
                <Input className="max-w-xs" placeholder={`Type "${data.client.name}" to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
                <Button variant="destructive" disabled={data.readiness.blockers.length > 0 || confirmName !== data.client.name} onClick={() => act.mutate({ action: 'activate_live', confirm_client_name: confirmName })}>Activate Live</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivery">
          <Card><CardContent className="p-4 overflow-x-auto">
            {!data.outbox?.length ? <div className="text-sm text-muted-foreground">No events queued. Nothing has been sent for this client by Quality Feedback.</div> : (
              <Table><TableHeader><TableRow><TableHead>Milestone</TableHead><TableHead>Event</TableHead><TableHead>Occurred</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Detail</TableHead><TableHead>Dispatched</TableHead></TableRow></TableHeader>
                <TableBody>{data.outbox.map((o: any) => (
                  <TableRow key={o.id}><TableCell className="text-xs">{MILESTONE_LABEL[o.milestone]}</TableCell><TableCell className="text-xs">{o.meta_event_name}{o.is_test ? ' (test)' : ''}</TableCell>
                    <TableCell className="text-xs">{dt(o.event_time)}</TableCell><TableCell><StatusBadge status={o.status} /></TableCell><TableCell>{o.attempts}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.hold_reason || o.last_error || (o.receipt ? 'Meta acknowledged receipt (delivery only, not performance)' : '')}</TableCell><TableCell className="text-xs">{dt(o.dispatched_at)}</TableCell></TableRow>
                ))}</TableBody></Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="measurement">
          <Card><CardHeader><CardTitle className="text-base">Last 30 days (leads captured in window)</CardTitle>
            <CardDescription>Verified quality reporting — separate from the legacy lead-quality rollup. No outcome is guaranteed.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 text-sm">
              {[['Raw leads', ms.raw_leads], ['Verified qualified', ms.verified_qualified], ['Qualified booked', ms.qualified_booked], ['Attended qualified', ms.attended_qualified], ['Funded (internal)', ms.funded_internal]].map(([l, v]) => (
                <div key={l as string} className="rounded-md border border-border/60 p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-semibold tabular-nums">{v as number}</div></div>
              ))}
              <div className="rounded-md border border-border/60 p-3"><div className="text-xs text-muted-foreground">Qualified rate</div><div className="font-semibold">{ms.qualified_rate == null ? 'Not enough coverage' : `${(ms.qualified_rate * 100).toFixed(1)}%`}</div></div>
              <div className="rounded-md border border-border/60 p-3"><div className="text-xs text-muted-foreground">Cost / verified qualified</div><div className="font-semibold">{money(ms.cost_per_verified_qualified)}</div></div>
              <div className="rounded-md border border-border/60 p-3"><div className="text-xs text-muted-foreground">Cost / attended qualified</div><div className="font-semibold">{money(ms.cost_per_attended_qualified)}</div></div>
              <div className="rounded-md border border-border/60 p-3"><div className="text-xs text-muted-foreground">Capture → qualified (p50/p95)</div><div className="font-semibold">{ms.capture_to_qualified_hours.median == null ? '—' : `${ms.capture_to_qualified_hours.median.toFixed(0)}h / ${ms.capture_to_qualified_hours.p95.toFixed(0)}h`}</div></div>
              <div className="rounded-md border border-border/60 p-3"><div className="text-xs text-muted-foreground">Evaluation coverage</div><div className="font-semibold">{(ms.evaluation_coverage * 100).toFixed(0)}%</div></div>
              {ms.coverage_note && <div className="sm:col-span-3 lg:col-span-5 text-xs text-muted-foreground">{ms.coverage_note}</div>}
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="rollout">
          <Card><CardHeader><CardTitle className="text-base">Campaign optimization rollout (record only)</CardTitle>
            <CardDescription>Nothing here changes campaigns. Record intent for a later mature-cohort comparison.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {[['test_campaign_ids', 'Test campaign IDs'], ['control_campaign_ids', 'Control campaign IDs'], ['start_date', 'Start date (YYYY-MM-DD)'], ['outcome_window_days', 'Outcome window (days)']].map(([k, l]) => (
                <div key={k} className="space-y-1"><Label>{l}</Label><Input value={cfg.campaign_rollout?.[k] ?? ''} onChange={(e) => setCfg({ ...cfg, campaign_rollout: { ...cfg.campaign_rollout, [k]: e.target.value } })} /></div>
              ))}
              <div className="md:col-span-2 space-y-1"><Label>Notes</Label><Textarea rows={2} value={cfg.campaign_rollout?.notes ?? ''} onChange={(e) => setCfg({ ...cfg, campaign_rollout: { ...cfg.campaign_rollout, notes: e.target.value } })} /></div>
              <div className="flex items-center gap-2"><Switch checked={!!cfg.campaign_rollout?.manually_verified} onCheckedChange={(v) => setCfg({ ...cfg, campaign_rollout: { ...cfg.campaign_rollout, manually_verified: v } })} /><Label>Manually verified in Ads Manager</Label></div>
              <div className="md:col-span-2"><Button onClick={() => act.mutate({ action: 'save_config', config: { campaign_rollout: cfg.campaign_rollout } })}>Save rollout notes</Button></div>
            </CardContent></Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card><CardContent className="p-4 space-y-1 text-xs">
            {(data.audit ?? []).map((a: any, i: number) => <div key={i}>{dt(a.created_at)} · {a.actor || 'unknown'} · {a.action.replace(/_/g, ' ')}{a.details?.blockers?.length ? ` — ${a.details.blockers.join(', ')}` : ''}</div>)}
            {!data.audit?.length && <div className="text-muted-foreground">No changes recorded.</div>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
