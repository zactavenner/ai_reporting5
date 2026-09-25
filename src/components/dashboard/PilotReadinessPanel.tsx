import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dashboardAuthHeaders, normalizeDashboardError } from '@/lib/dashboardAuthHeaders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { emptyPacket, numericFields } from '../../../supabase/functions/_shared/pilotReadiness';
import type { Blocker, ClientSource, Member, OfferSource, PacketInput, Scope } from '../../../supabase/functions/_shared/pilotReadiness';

type Catalog = { clients: ClientSource[]; offers: OfferSource[]; members: Member[] };
type ReadResult = { packet: { version: number; accepted_at?: string; accepted_by?: string } | null; input: PacketInput; blockers: Blocker[]; status: string; source_changed: boolean };
async function callPilot(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('pilot-readiness', { body, headers: dashboardAuthHeaders() });
  if (error) throw await normalizeDashboardError(error);
  if (data?.error) throw new Error(data.error);
  return data;
}
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const labels: Partial<Record<keyof PacketInput, string>> = {
  deliverables: 'Agreed deliverables', exclusions: 'Excluded work', coverage_hours: 'Coverage hours and days', timezone: 'Coverage timezone',
  qualification_definition: 'Approved qualified-lead definition', sales_capacity_weekly: 'Sales capacity (calls / week)', qualification_lag_days: 'Qualification lag (days)',
  funding_lag_days: 'Funding lag (days)', target_cpql: 'Approved cost per qualified lead', daily_limit: 'Approved daily limit', monthly_limit: 'Approved monthly limit',
  pilot_limit: 'Approved total pilot limit', currency: 'Budget currency', meta_ad_account_id: 'Confirmed Meta account ID', ghl_location_id: 'Confirmed GHL location ID',
  scope_evidence: 'Signed scope / deliverables link', claims_evidence: 'Approved offer and claims link', authority_evidence: 'Execution authority and exclusions link',
  budget_evidence: 'Budget and KPI approval link', account_evidence: 'Account identity verification evidence link', account_verified_at: 'Identity verification date and time (ISO with timezone)',
};
const sections: [string, (keyof PacketInput)[]][] = [
  ['Scope and coverage', ['deliverables', 'exclusions', 'coverage_hours', 'timezone', 'scope_evidence']],
  ['Sales and qualification', ['qualification_definition', 'sales_capacity_weekly', 'qualification_lag_days', 'funding_lag_days']],
  ['Approved limits', ['currency', 'target_cpql', 'daily_limit', 'monthly_limit', 'pilot_limit', 'budget_evidence']],
  ['Account identity and approvals', ['meta_ad_account_id', 'ghl_location_id', 'account_evidence', 'account_verified_at', 'claims_evidence', 'authority_evidence']],
];

export function PilotReadinessPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [clientId, setClientId] = useState('');
  const [scope, setScope] = useState<Scope>('capital_raising');
  const [input, setInput] = useState<PacketInput>(emptyPacket);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [attest, setAttest] = useState(false);
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const loadCatalog = async () => {
    setError(''); setBusy(true);
    try { setCatalog(await callPilot({ action: 'catalog' })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void loadCatalog(); }, []);
  const load = async (id: string, selectedScope: Scope) => {
    const sequence = ++request.current;
    setResult(null); setInput(emptyPacket()); setDirty(false); setAttest(false); setNotice(''); setError('');
    if (!id) { setBusy(false); return; }
    setBusy(true);
    try {
      const data: ReadResult = await callPilot({ action: 'read', client_id: id, scope: selectedScope });
      if (sequence === request.current) { setResult(data); setInput(data.input); }
    } catch (e) { if (sequence === request.current) setError((e as Error).message); }
    finally { if (sequence === request.current) setBusy(false); }
  };
  const switchContext = (id: string, selectedScope: Scope) => {
    if (dirty && !window.confirm('Discard unsaved pilot changes?')) return;
    setClientId(id); setScope(selectedScope); void load(id, selectedScope);
  };
  const edit = (field: keyof PacketInput, value: unknown) => {
    setInput(previous => ({ ...previous, [field]: value })); setDirty(true); setAttest(false); setNotice('');
  };
  const save = async (action: 'save' | 'accept') => {
    setBusy(true); setError(''); setNotice('');
    try {
      await callPilot({ action, client_id: clientId, scope, expected_version: result?.packet?.version || 0, ...(action === 'save' ? { input } : { attest }) });
      // Independent read-back verifies the persisted revision before presenting success.
      const data: ReadResult = await callPilot({ action: 'read', client_id: clientId, scope });
      setResult(data); setInput(data.input); setDirty(false); setAttest(false);
      setNotice(`${action === 'accept' ? 'Accepted' : 'Saved'} and reloaded version ${data.packet?.version}.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const memberSelect = (label: string, value: string, change: (value: string) => void) => <label className="space-y-1 text-sm">
    <span>{label}</span><select aria-label={label} className={selectClass} value={value} onChange={e => change(e.target.value)} disabled={busy}>
      <option value="">Unassigned</option>{catalog?.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  </label>;
  const client = catalog?.clients.find(c => c.id === clientId);
  const offer = catalog?.offers.find(o => o.id === input.offer_id && o.client_id === clientId);
  return <Card>
    <CardHeader><CardTitle>AI rollout · Pilot setup</CardTitle>
      <p className="text-sm text-muted-foreground">Step 1 of 14. Review separate agency acquisition and investor campaigns before expanding the rollout. Acceptance records the setup; it does not launch ads or send messages.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      {error && <div role="alert" className="rounded border border-destructive p-3 text-sm">{error} <Button variant="outline" size="sm" disabled={busy} onClick={() => catalog && clientId ? switchContext(clientId, scope) : loadCatalog()}>Reload</Button></div>}
      {!catalog && !error && <p role="status">Loading authorized client setup…</p>}
      {catalog && <>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Client</span><select aria-label="Client" className={selectClass} value={clientId} disabled={busy} onChange={e => switchContext(e.target.value, scope)}><option value="">Select a pilot client</option>{catalog.clients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Workflow scope</span><select aria-label="Workflow scope" className={selectClass} value={scope} disabled={busy} onChange={e => switchContext(clientId, e.target.value as Scope)}><option value="capital_raising">Client investor acquisition</option><option value="agency_acquisition">Agency customer acquisition</option></select></label>
        </div>
        {busy && <p role="status">Checking saved setup…</p>}
        {result && <>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{dirty ? 'Unsaved changes' : result.status.replaceAll('_', ' ')}</Badge><span className="text-xs text-muted-foreground">Version {result.packet?.version || 0}</span></div>
          {result.source_changed && <p role="alert" className="text-sm text-amber-600">Client, offer, or team details changed since acceptance. Review the current sources and accept a new version.</p>}
          {result.packet?.accepted_at && <p className="text-xs text-muted-foreground">Last acceptance: {new Date(result.packet.accepted_at).toLocaleString()} · {result.packet.accepted_by}</p>}
          <label className="block space-y-1 text-sm"><span>Client offer</span><select aria-label="Client offer" className={selectClass} value={input.offer_id} disabled={busy} onChange={e => edit('offer_id', e.target.value)}><option value="">Select this client’s offer</option>{catalog.offers.filter(o => o.client_id === clientId).map(o => <option key={o.id} value={o.id}>{o.title} · {o.status}</option>)}</select></label>
          <div className="rounded bg-muted/50 p-3 text-xs space-y-1">
            <p>Saved sources (mappings are not proof of provider access)</p>
            <p>Client: {client?.id} · Meta: {[client?.meta_ad_account_id, ...(client?.meta_ad_account_ids || [])].filter(Boolean).join(', ') || 'Missing'} · GHL: {client?.ghl_location_id || 'Missing'}</p>
            <p>Offer: {offer?.id || 'Not selected'} · Meta: {offer?.meta_ad_account_id || 'Not separately mapped'} · GHL: {offer?.ghl_location_id || 'Not separately mapped'}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {memberSelect('Primary owner', input.primary_owner_id, v => edit('primary_owner_id', v))}
            {memberSelect('Backup owner', input.backup_owner_id, v => edit('backup_owner_id', v))}
            {memberSelect('Account identity reviewer', input.account_verified_by, v => edit('account_verified_by', v))}
          </div>
          {sections.map(([title, fields]) => <fieldset key={title} className="rounded border p-4"><legend className="px-1 text-sm font-medium">{title}</legend><div className="grid gap-4 md:grid-cols-2">
            {fields.filter(f => scope === 'capital_raising' || f !== 'funding_lag_days').map(field => {
              const number = (numericFields as readonly string[]).includes(field);
              const multiline = ['deliverables', 'exclusions', 'coverage_hours', 'qualification_definition'].includes(field);
              const label = field === 'qualification_definition' && scope === 'agency_acquisition' ? 'Qualified agency prospect definition' : labels[field] || field;
              return <label key={field} className="space-y-1 text-sm"><span>{label}</span>{multiline
                ? <Textarea aria-label={label} value={String(input[field] ?? '')} disabled={busy} onChange={e => edit(field, e.target.value)} />
                : <Input aria-label={label} type={number ? 'number' : 'text'} min={number ? 0 : undefined} step={number ? 'any' : undefined} value={String(input[field] ?? '')} disabled={busy} onChange={e => edit(field, number ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)} />}</label>;
            })}
          </div></fieldset>)}
          {result.blockers.length > 0 && <div className="space-y-3"><h3 className="font-medium">Inputs to resolve {dirty ? '(save to refresh)' : `(${result.blockers.length})`}</h3>
            {result.blockers.map((b, i) => <div key={`${b.field}-${i}`} className="grid items-center gap-2 rounded border p-3 text-sm md:grid-cols-2"><p>{b.message}</p>{memberSelect(`Owner for ${b.field.replaceAll('_', ' ')}${i ? ` (${i + 1})` : ''}`, input.issue_owners[b.field] || input.primary_owner_id, v => edit('issue_owners', { ...input.issue_owners, [b.field]: v }))}</div>)}
          </div>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => save('save')}>Save draft</Button><Button variant="outline" disabled={busy} onClick={() => switchContext(clientId, scope)}>Reload saved packet</Button></div>
          {!dirty && result.packet && result.blockers.length === 0 && result.status !== 'accepted' && <div className="space-y-3 rounded border p-4">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} disabled={busy} /><span>I reviewed this workflow scope, the account identity evidence, owners, approved limits, and authority. These approvals apply to this client and offer.</span></label>
            <Button disabled={!attest || busy} onClick={() => save('accept')}>Accept reviewed setup</Button>
          </div>}
        </>}
      </>}
    </CardContent>
  </Card>;
}
