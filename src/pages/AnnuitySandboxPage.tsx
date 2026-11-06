import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { annuityRuntimeStatus } from '@/modules/annuity/production-guard';
import { formatCents } from '@/modules/annuity/rules';
import {
  createSandbox,
  runVisibleProof,
  sandboxAdmin,
  sandboxEast,
  sandboxIntake,
  sandboxNorth,
  sandboxSouth,
  type SandboxBundle,
} from '@/modules/annuity/sandbox';
import type { Actor, Delivery, LedgerReport, ProgramConfig } from '@/modules/annuity/types';

const actors: Record<string, Actor> = {
  admin: sandboxAdmin,
  north: sandboxNorth,
  south: sandboxSouth,
  east: sandboxEast,
};

function syntheticPreviewEnabled() {
  return import.meta.env.DEV || import.meta.env.VITE_ANNUITY_SYNTHETIC_PREVIEW === 'true';
}

export default function AnnuitySandboxPage({ embedded = false }: { embedded?: boolean }) {
  if (!syntheticPreviewEnabled()) {
    return <InactiveAnnuityNotice embedded={embedded} />;
  }
  return <AnnuitySandbox embedded={embedded} />;
}

function InactiveAnnuityNotice({ embedded }: { embedded: boolean }) {
  const status = annuityRuntimeStatus();
  return (
    <div className={embedded ? '' : 'min-h-screen bg-background p-6'}>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Annuities module is installed and inactive</CardTitle>
          <CardDescription>
            Live intake, delivery, and messaging stay off in this build. Pending SQL has not been applied to Supabase project {status.repositoryMatch.supabaseProjectId}. Current Lovable hosting is sufficient; Vercel is not required.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Brand, call format, specialist roster, Katie identity, Blueprint delivery, and payout illustrations remain unresolved.</p>
          <p>Buyer candidates are not loaded as contracted buyers.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AnnuitySandbox({ embedded }: { embedded: boolean }) {
  const [bundle, setBundle] = useState<SandboxBundle | null>(null);
  const [actorKey, setActorKey] = useState('admin');
  const [program, setProgram] = useState<ProgramConfig | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [ledger, setLedger] = useState<LedgerReport | null>(null);
  const [proof, setProof] = useState<string[]>([]);
  const [notice, setNotice] = useState('Synthetic memory only. No live send, charge, or buyer delivery.');
  const [form, setForm] = useState({
    firstName: 'Preview',
    lastName: 'Lead',
    email: 'preview.lead@example.test',
    phone: '(512) 555-0190',
    state: 'TX',
    capital: '250000',
    consent: true,
    utmContent: 'B1',
  });

  async function refresh(next: SandboxBundle, key = actorKey) {
    const actor = actors[key];
    const programResult = await next.service.getProgram(actor);
    setProgram(programResult.ok ? programResult.value : null);
    const deliveryResult = await next.service.listDeliveries(actor);
    setDeliveries(deliveryResult.ok ? deliveryResult.value : []);
    if (!deliveryResult.ok) setNotice(deliveryResult.message);
    const ledgerResult = await next.service.ledger(actor);
    setLedger(ledgerResult.ok ? ledgerResult.value : null);
  }

  useEffect(() => {
    let cancelled = false;
    createSandbox().then((next) => {
      if (cancelled) return;
      setBundle(next);
      void refresh(next);
    });
    return () => {
      cancelled = true;
    };
    // The sandbox is created once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onActor(key: string) {
    setActorKey(key);
    if (bundle) await refresh(bundle, key);
  }

  async function onProof() {
    if (!bundle) return;
    const lines = await runVisibleProof(bundle);
    setProof(lines);
    setNotice('Synthetic proof finished. Sends stayed disabled.');
    await refresh(bundle);
  }

  async function onIntake(event: React.FormEvent) {
    event.preventDefault();
    if (!bundle) return;
    const capitalAmountCents = Math.round(Number(form.capital) * 100);
    const result = await bundle.service.intake(actors[actorKey], sandboxIntake({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      state: form.state,
      capitalAmountCents,
      utm: { ...sandboxIntake().utm, content: form.utmContent || null },
      consent: form.consent ? sandboxIntake().consent : null,
    }));
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    if (result.value.lead.fit === 'in_band') {
      const routed = await bundle.service.route(sandboxAdmin, result.value.lead.id, 'per_lead');
      setNotice(routed.ok
        ? `Stored ${result.value.lead.id}. Offered to ${routed.value.offers.map((row) => row.buyerId).join(', ') || 'nobody'}.`
        : routed.message);
    } else {
      setNotice(`Stored ${result.value.lead.id} as not-a-fit. No delivery was offered.`);
    }
    await refresh(bundle);
  }

  async function onDecision(delivery: Delivery, decision: 'accept' | 'reject') {
    if (!bundle) return;
    const actor = actors[actorKey];
    const result = await bundle.service.decide(actor, delivery.id, decision, `${decision}-${delivery.id}-${Date.now()}`);
    setNotice(result.ok ? `${decision} recorded for ${delivery.buyerId}.` : result.message);
    await refresh(bundle);
  }

  const status = annuityRuntimeStatus();

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-background p-6 space-y-4'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Annuities</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Module inside Reporting 5.0. Data on this screen is synthetic. Project {status.repositoryMatch.supabaseProjectId} is not connected. {notice}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Live delivery off</Badge>
          <Badge variant="outline">Sends off</Badge>
          <Badge variant="outline">Migration not applied</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="actor-switcher">
        {Object.keys(actors).map((key) => (
          <Button key={key} type="button" size="sm" variant={actorKey === key ? 'default' : 'outline'} onClick={() => void onActor(key)}>
            {key === 'admin' ? 'Platform admin' : `Buyer ${key}`}
          </Button>
        ))}
        <Button type="button" size="sm" onClick={() => void onProof()} data-testid="run-synthetic-proof">
          Run synthetic proof
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4" data-testid="ledger-summary">
        <Summary label="Realized contribution" value={ledger ? formatCents(ledger.realized.contributionCents) : '—'} />
        <Summary label="Realized revenue" value={ledger ? formatCents(ledger.realized.revenueCents) : '—'} />
        <Summary label="Realized COGS" value={ledger ? (ledger.cogsVisible ? formatCents(ledger.realized.cogsCents) : 'Hidden') : '—'} />
        <Summary label="Unrecognized revenue" value={ledger ? formatCents(ledger.unrecognized.revenueCents) : '—'} />
      </div>

      <Tabs defaultValue="intake">
        <TabsList>
          <TabsTrigger value="intake">Intake</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="proof">Proof</TabsTrigger>
        </TabsList>
        <TabsContent value="intake">
          <Card>
            <CardHeader>
              <CardTitle>Quiz intake</CardTitle>
              <CardDescription>UTM content is stored as submitted. Capital bands do not imply a price. Consent is required.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={onIntake}>
                <Input aria-label="First name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
                <Input aria-label="Last name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
                <Input aria-label="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                <Input aria-label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                <Input aria-label="State" value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
                <Input aria-label="Capital dollars" value={form.capital} onChange={(event) => setForm({ ...form, capital: event.target.value })} />
                <Input aria-label="UTM content" value={form.utmContent} onChange={(event) => setForm({ ...form, utmContent: event.target.value })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} />
                  Consent version sandbox-consent-v1 for contact and buyer delivery
                </label>
                <Button type="submit" data-testid="submit-intake">Store synthetic lead</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="delivery">
          <Card>
            <CardHeader>
              <CardTitle>Deliveries visible to this actor</CardTitle>
              <CardDescription>Accept and reject update the sandbox ledger only. Channel is sandbox_noop.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {deliveries.length === 0 && <p className="text-sm text-muted-foreground">No deliveries for this actor.</p>}
              {deliveries.map((delivery) => (
                <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-md p-3">
                  <div className="text-sm">
                    <div className="font-medium">{delivery.buyerId} · {delivery.product} · {formatCents(delivery.priceCents)}</div>
                    <div className="text-muted-foreground">{delivery.state} · {delivery.distribution} · {delivery.channel}</div>
                  </div>
                  {delivery.state === 'offered' && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void onDecision(delivery, 'accept')}>Accept</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void onDecision(delivery, 'reject')}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle>Explicit configuration</CardTitle>
              <CardDescription>Default COGS is $37. Per-lead prices exist only where a row was saved. Band B has no price on purpose.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>COGS default: {program ? formatCents(program.cogsPerLeadCents) : '—'}</p>
              {program?.bands.map((band) => (
                <div key={band.id} className="border rounded-md p-2">
                  <div className="font-medium">{band.label}</div>
                  <div className="text-muted-foreground">
                    {formatCents(band.minCents)} to {band.maxCents === null ? 'no maximum' : formatCents(band.maxCents)}
                    {' · '}
                    {program.prices.filter((price) => price.capitalBandId === band.id).map((price) => `${price.product} ${formatCents(price.amountCents)}`).join(', ') || 'No explicit price'}
                  </div>
                </div>
              ))}
              <p className="text-muted-foreground">Unresolved: brand, call format, specialist states, Katie identity, Blueprint, payout illustrations.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="proof">
          <Card>
            <CardHeader>
              <CardTitle>Last synthetic proof</CardTitle>
              <CardDescription>These lines are the in-memory result, not a production run.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre data-testid="proof-transcript" className="text-xs whitespace-pre-wrap">{proof.join('\n') || 'Run the synthetic proof to fill this transcript.'}</pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
