import { AnnuityService, frozenClock } from './service';
import { emptyUtm } from './rules';
import type { Actor, Buyer, CapitalBand, ConsentEvidence, IntakeInput, QuietHours } from './types';

export const sandboxAdmin: Actor = { kind: 'platform_admin', id: 'admin_sandbox' };
export const sandboxNorth: Actor = { kind: 'buyer', id: 'user_north', buyerId: 'buyer_north' };
export const sandboxSouth: Actor = { kind: 'buyer', id: 'user_south', buyerId: 'buyer_south' };
export const sandboxEast: Actor = { kind: 'buyer', id: 'user_east', buyerId: 'buyer_east' };

export const sandboxBands: CapitalBand[] = [
  { id: 'band_a', label: 'Sandbox band A', minCents: 10_000_000, maxCents: 50_000_000, routable: true, active: true },
  { id: 'band_b', label: 'Sandbox band B (no price)', minCents: 50_000_000, maxCents: null, routable: true, active: true },
];

export const sandboxBuyerInputs: Array<Omit<Buyer, 'liveDeliveryEnabled'>> = [
  {
    id: 'buyer_north',
    name: 'Synthetic Buyer North',
    verificationStatus: 'verified_configuration_only',
    licensedStates: ['TX'],
    capitalBandIds: ['band_a'],
    dailyCapacity: 3,
    budgetRemainingCents: 500_000,
    distribution: 'exclusive',
    deliveryEnabled: true,
    active: true,
  },
  {
    id: 'buyer_south',
    name: 'Synthetic Buyer South',
    verificationStatus: 'verified_configuration_only',
    licensedStates: ['TX'],
    capitalBandIds: ['band_a'],
    dailyCapacity: 3,
    budgetRemainingCents: 500_000,
    distribution: 'shared',
    deliveryEnabled: true,
    active: true,
  },
  {
    id: 'buyer_east',
    name: 'Synthetic Buyer East',
    verificationStatus: 'verified_configuration_only',
    licensedStates: ['FL'],
    capitalBandIds: ['band_a'],
    dailyCapacity: 3,
    budgetRemainingCents: 500_000,
    distribution: 'shared',
    deliveryEnabled: true,
    active: true,
  },
  {
    id: 'buyer_candidate',
    name: 'Unverified candidate (not a contract)',
    verificationStatus: 'unverified_candidate',
    licensedStates: ['TX'],
    capitalBandIds: ['band_a'],
    dailyCapacity: 10,
    budgetRemainingCents: 500_000,
    distribution: 'shared',
    deliveryEnabled: false,
    active: false,
  },
];

export const sandboxQuietHours: QuietHours = {
  configured: true,
  timeZone: 'America/Chicago',
  days: [1, 2, 3, 4, 5, 6],
  startMinute: 9 * 60,
  endMinute: 19 * 60,
  appliesTo: ['unbooked', 'booked', 'no_show'],
};

export function sandboxConsent(capturedAt = '2026-11-09T21:00:00.000Z'): ConsentEvidence {
  return {
    textVersion: 'sandbox-consent-v1',
    capturedAt,
    purposes: ['contact', 'automated_messages', 'delivery_to_buyer'],
    evidenceRef: 'synthetic-evidence',
  };
}

export function sandboxIntake(overrides: Partial<IntakeInput> = {}): IntakeInput {
  return {
    firstName: 'Synthetic',
    lastName: 'Prospect',
    email: 'synthetic.prospect@example.test',
    phone: '(512) 555-0100',
    state: 'TX',
    capitalAmountCents: 25_000_000,
    utm: emptyUtm({ source: 'synthetic', medium: 'preview', campaign: 'sandbox', content: 'B1', landingPath: '/annuity/sandbox', startFlag: true }),
    consent: sandboxConsent(),
    ...overrides,
  };
}

export interface SandboxBundle {
  service: AnnuityService;
  clock: ReturnType<typeof frozenClock>;
}

export async function createSandbox(): Promise<SandboxBundle> {
  const clock = frozenClock('2026-11-09T21:00:00.000Z');
  const service = AnnuityService.create({ clock });
  const configured = await service.configure(sandboxAdmin, {
    phoneDefaultCountry: 'US',
    cogsPerLeadCents: 3700,
    shareCap: 1,
    quietHours: sandboxQuietHours,
    qualification: {
      configured: true,
      requireCapitalConfirm: true,
      requireAgeBand: true,
      blockAdvisors: true,
      blockExistingClients: true,
    },
    sequences: {
      unbooked: [{ templateKey: 'sandbox_unbooked', channel: 'sms', offsetMinutes: 0, sequence: 'unbooked' }],
      booked: [{ templateKey: 'sandbox_booked', channel: 'sms', offsetMinutes: 0, sequence: 'booked' }],
      no_show: [{ templateKey: 'sandbox_noshow', channel: 'email', offsetMinutes: 0, sequence: 'no_show' }],
    },
    bands: sandboxBands,
    prices: [
      { product: 'per_lead', capitalBandId: 'band_a', amountCents: 12_000 },
      { product: 'booked', capitalBandId: 'band_a', amountCents: 18_000 },
      { product: 'verified_show', capitalBandId: 'band_a', amountCents: 20_000 },
    ],
    buyers: sandboxBuyerInputs,
  });
  if (!configured.ok) throw new Error(configured.message);
  return { service, clock };
}

export async function runVisibleProof(bundle: SandboxBundle): Promise<string[]> {
  const { service } = bundle;
  const lines: string[] = [];
  const note = (text: string) => lines.push(text);
  const intake = await service.intake(sandboxAdmin, sandboxIntake());
  if (!intake.ok) throw new Error(intake.message);
  note(`intake ${intake.value.lead.id} fit=${intake.value.lead.fit} utm=${intake.value.lead.utm.content} duplicate=${intake.value.duplicate}`);

  const before = await service.ledger(sandboxAdmin);
  if (!before.ok) throw new Error(before.message);
  note(`before accept unrecognized COGS=${before.value.unrecognized.cogsCents} realized contribution=${before.value.realized.contributionCents}`);

  const routed = await service.route(sandboxAdmin, intake.value.lead.id, 'per_lead');
  if (!routed.ok) throw new Error(routed.message);
  const offer = routed.value.offers[0];
  note(`offered ${offer?.buyerId ?? 'none'} channel=${offer?.channel ?? 'none'} blocked=${routed.value.blocked.map((row) => row.reason).join(',')}`);

  const denied = await service.decide(sandboxSouth, offer.id, 'accept', 'cross-tenant');
  note(`cross-tenant accept ${denied.ok ? 'unexpected-success' : denied.code}`);

  const accepted = await service.decide(sandboxNorth, offer.id, 'accept', 'accept-north');
  if (!accepted.ok) throw new Error(accepted.message);
  const replay = await service.decide(sandboxNorth, offer.id, 'accept', 'accept-north');
  if (!replay.ok) throw new Error(replay.message);
  note(`accept replayed=${replay.value.replayed}`);

  const afterLead = await service.ledger(sandboxAdmin);
  if (!afterLead.ok) throw new Error(afterLead.message);
  note(
    `per-lead realized revenue=${afterLead.value.realized.revenueCents} cogs=${afterLead.value.realized.cogsCents} contribution=${afterLead.value.realized.contributionCents} unrecognizedRevenue=${afterLead.value.unrecognized.revenueCents}`,
  );

  const duplicate = await service.submitQuiz(sandboxIntake({ phone: '5125550199' }));
  if (!duplicate.ok) throw new Error(duplicate.message);
  note(`duplicate quiz next=${duplicate.value.next}`);

  await service.recordBooking(sandboxAdmin, intake.value.lead.id, '2026-11-12T15:00:00.000Z');
  const showTooSoon = await service.route(sandboxAdmin, intake.value.lead.id, 'verified_show');
  note(`show before qualification ${showTooSoon.ok ? 'unexpected-success' : showTooSoon.code}`);
  const bookedRoute = await service.route(sandboxAdmin, intake.value.lead.id, 'booked');
  if (!bookedRoute.ok) throw new Error(bookedRoute.message);
  await service.decide(sandboxAdmin, bookedRoute.value.offers[0].id, 'accept', 'accept-booked');

  await service.markQualified(sandboxAdmin, intake.value.lead.id, { capitalConfirmed: true, ageBand: 'configured-band' });
  const showRoute = await service.route(sandboxAdmin, intake.value.lead.id, 'verified_show');
  if (!showRoute.ok) throw new Error(showRoute.message);
  await service.decide(sandboxAdmin, showRoute.value.offers[0].id, 'accept', 'accept-show');
  const showLedger = await service.ledger(sandboxAdmin);
  if (!showLedger.ok) throw new Error(showLedger.message);
  note(`after booked+show revenue=${showLedger.value.realized.revenueCents} contribution=${showLedger.value.realized.contributionCents}`);

  const planned = await service.planFollowUps(sandboxAdmin, intake.value.lead.id, 'booked');
  if (!planned.ok) throw new Error(planned.message);
  const dispatch = await service.dispatchDue(sandboxAdmin);
  if (!dispatch.ok) throw new Error(dispatch.message);
  note(`follow-up status=${planned.value[0]?.status ?? 'none'} dispatch=${dispatch.value.blockedReason} sent=${dispatch.value.sent}`);

  const southView = await service.listDeliveries(sandboxSouth);
  if (!southView.ok) throw new Error(southView.message);
  note(`south visible deliveries=${southView.value.length}`);
  const southLead = await service.getLead(sandboxSouth, intake.value.lead.id);
  note(`south lead read ${southLead.ok ? 'unexpected-success' : southLead.code}`);
  return lines;
}
