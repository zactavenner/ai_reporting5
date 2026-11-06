import { describe, expect, it } from 'vitest';
import { assertAnnuityDatabaseTarget } from './production-guard';
import { parseUtmSearch, resolveExplicitPrice } from './rules';
import {
  createSandbox,
  runVisibleProof,
  sandboxAdmin,
  sandboxBuyerInputs,
  sandboxConsent,
  sandboxEast,
  sandboxIntake,
  sandboxNorth,
  sandboxSouth,
} from './sandbox';
import { AnnuityService } from './service';
import { PRODUCTION_SUPABASE_PROJECT_ID } from './types';

async function sandbox() {
  return createSandbox();
}

describe('annuity synthetic end-to-end', () => {
  it('refuses the live Reporting Supabase project', () => {
    expect(PRODUCTION_SUPABASE_PROJECT_ID).toBe('jgwwmtuvjlmzapwqiabu');
    expect(() => assertAnnuityDatabaseTarget('https://jgwwmtuvjlmzapwqiabu.supabase.co')).toThrow(/refuses/);
    expect(() => assertAnnuityDatabaseTarget('https://example.supabase.co')).toThrow(/inactive/);
  });

  it('requires an explicit band price and keeps per-lead prices inside $80–$200', async () => {
    const { service } = await sandbox();
    const program = await service.getProgram(sandboxAdmin);
    expect(program.ok && program.value.cogsPerLeadCents).toBe(3700);
    expect(program.ok && program.value.bands.find((band) => band.id === 'band_b')).toBeTruthy();
    expect(resolveExplicitPrice(program.ok ? program.value.prices : [], 'per_lead', 'band_b').code).toBe('price_not_configured');

    const low = await service.configure(sandboxAdmin, {
      prices: [{ product: 'per_lead', capitalBandId: 'band_a', amountCents: 7900 }],
    });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.code).toBe('price_out_of_range');
    const still = await service.getProgram(sandboxAdmin);
    expect(still.ok && still.value.prices.some((row) => row.product === 'per_lead' && row.amountCents === 12_000)).toBe(true);

    const high = await service.configure(sandboxAdmin, {
      prices: [{ product: 'per_lead', capitalBandId: 'band_a', amountCents: 20_001 }],
    });
    expect(high.ok).toBe(false);

    const edge = await service.configure(sandboxAdmin, {
      prices: [
        { product: 'per_lead', capitalBandId: 'band_a', amountCents: 8000 },
        { product: 'per_lead', capitalBandId: 'band_a', amountCents: 20_000 },
      ],
    });
    expect(edge.ok).toBe(false);
    if (!edge.ok) expect(edge.code).toBe('price_ambiguous');
  });

  it('blocks unverified candidates, live delivery, sends, and unresolved commercial flags', async () => {
    const { service } = await sandbox();
    const candidate = await service.configure(sandboxAdmin, {
      buyers: [{ ...sandboxBuyerInputs[3], deliveryEnabled: true, active: true }],
    });
    expect(candidate.ok).toBe(false);
    if (!candidate.ok) expect(candidate.code).toBe('buyer_not_routable');
    expect((await service.configure(sandboxAdmin, { sendsEnabled: true })).ok).toBe(false);
    expect((await service.configure(sandboxAdmin, { liveDeliveryEnabled: true })).ok).toBe(false);
    const brand = await service.configure(sandboxAdmin, { activateUnresolved: 'brand' });
    expect(brand.ok).toBe(false);
    if (!brand.ok) expect(brand.code).toBe('unresolved_inactive');
    const program = await service.getProgram(sandboxAdmin);
    expect(program.ok && program.value.unresolved.brand.selected).toBeNull();
    expect(program.ok && program.value.unresolved.payoutIllustrations.status).toBe('inactive');
    expect(program.ok && program.value.sendsEnabled).toBe(false);
  });

  it('runs intake, exclusive offer, reject, retry, accept, and ledger recognition', async () => {
    const { service } = await sandbox();
    const intake = await service.intake(sandboxAdmin, sandboxIntake({ email: 'ledger@example.test', phone: '5125550101' }));
    expect(intake.ok).toBe(true);
    if (!intake.ok) return;
    expect(intake.value.lead.utm.content).toBe('B1');
    expect(intake.value.lead.utm.startFlag).toBe(true);
    expect(intake.value.lead.phoneE164).toBe('+15125550101');
    expect(intake.value.lead.capitalBandId).toBe('band_a');

    const offeredLedger = await service.ledger(sandboxAdmin);
    expect(offeredLedger.ok && offeredLedger.value.unrecognized.cogsCents).toBe(3700);
    expect(offeredLedger.ok && offeredLedger.value.realized.contributionCents).toBe(0);

    const routed = await service.route(sandboxAdmin, intake.value.lead.id, 'per_lead');
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(routed.value.offers.map((row) => row.buyerId)).toEqual(['buyer_north']);
    expect(routed.value.offers[0].channel).toBe('sandbox_noop');
    expect(routed.value.blocked.some((row) => row.buyerId === 'buyer_south' && row.reason === 'exclusive_priority')).toBe(true);
    expect(routed.value.blocked.some((row) => row.buyerId === 'buyer_candidate')).toBe(true);

    const openLedger = await service.ledger(sandboxAdmin);
    expect(openLedger.ok && openLedger.value.unrecognized.revenueCents).toBe(12_000);
    expect(openLedger.ok && openLedger.value.realized.revenueCents).toBe(0);

    const rejected = await service.decide(sandboxNorth, routed.value.offers[0].id, 'reject', 'reject-1');
    expect(rejected.ok && rejected.value.delivery.state).toBe('rejected');
    const retry = await service.retry(sandboxAdmin, intake.value.lead.id, 'per_lead', 'retry-1');
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.state).toBe('offered');
    expect(retry.value.offers.map((row) => row.buyerId)).toEqual(['buyer_south']);
    const retryReplay = await service.retry(sandboxAdmin, intake.value.lead.id, 'per_lead', 'retry-1');
    expect(retryReplay.ok && retryReplay.value.offers.map((row) => row.id)).toEqual(retry.value.offers.map((row) => row.id));

    const accepted = await service.decide(sandboxSouth, retry.value.offers[0].id, 'accept', 'accept-1');
    expect(accepted.ok && accepted.value.replayed).toBe(false);
    const replay = await service.decide(sandboxSouth, retry.value.offers[0].id, 'accept', 'accept-1');
    expect(replay.ok && replay.value.replayed).toBe(true);
    const otherKey = await service.decide(sandboxSouth, retry.value.offers[0].id, 'accept', 'accept-2');
    expect(otherKey.ok).toBe(false);
    if (!otherKey.ok) expect(otherKey.code).toBe('illegal_transition');

    const ledger = await service.ledger(sandboxAdmin);
    expect(ledger.ok && ledger.value.realized).toMatchObject({ revenueCents: 12_000, cogsCents: 3700, refundCents: 0, contributionCents: 8300 });
    expect(ledger.ok && ledger.value.unrecognized).toMatchObject({ revenueCents: 0, cogsCents: 0 });
    const revenueLines = ledger.ok ? ledger.value.lines.filter((line) => line.kind === 'revenue' && line.recognition === 'realized' && line.status === 'open') : [];
    expect(revenueLines).toHaveLength(1);

    const refund = await service.postRefund(sandboxAdmin, retry.value.offers[0].id, 1500, 'refund-1');
    expect(refund.ok).toBe(true);
    const refunded = await service.ledger(sandboxAdmin);
    expect(refunded.ok && refunded.value.realized).toMatchObject({ revenueCents: 12_000, cogsCents: 3700, refundCents: 1500, contributionCents: 6800 });
  });

  it('keeps booked revenue separate from verified-show revenue', async () => {
    const { service } = await sandbox();
    const intake = await service.intake(sandboxAdmin, sandboxIntake({ email: 'show@example.test', phone: '5125550102' }));
    if (!intake.ok) throw new Error(intake.message);
    const perLead = await service.route(sandboxAdmin, intake.value.lead.id, 'per_lead');
    if (!perLead.ok) throw new Error(perLead.message);
    await service.decide(sandboxAdmin, perLead.value.offers[0].id, 'accept', 'pl');

    const bookedTooSoon = await service.route(sandboxAdmin, intake.value.lead.id, 'booked');
    expect(bookedTooSoon.ok).toBe(false);
    if (!bookedTooSoon.ok) expect(bookedTooSoon.code).toBe('booking_required');

    await service.recordBooking(sandboxAdmin, intake.value.lead.id, '2026-11-12T16:00:00.000Z');
    const afterBook = await service.ledger(sandboxAdmin);
    expect(afterBook.ok && afterBook.value.realized.revenueCents).toBe(12_000);

    const showEarly = await service.route(sandboxAdmin, intake.value.lead.id, 'verified_show');
    expect(showEarly.ok).toBe(false);
    if (!showEarly.ok) expect(showEarly.code).toBe('show_not_verified');
    expect(afterBook.ok && (await service.ledger(sandboxAdmin)).ok).toBe(true);

    const booked = await service.route(sandboxAdmin, intake.value.lead.id, 'booked');
    if (!booked.ok) throw new Error(booked.message);
    expect(booked.value.offers[0].product).toBe('booked');
    expect(booked.value.offers[0].priceCents).toBe(18_000);
    await service.decide(sandboxAdmin, booked.value.offers[0].id, 'accept', 'bk');
    const afterBookedSale = await service.ledger(sandboxAdmin);
    expect(afterBookedSale.ok && afterBookedSale.value.realized).toMatchObject({ revenueCents: 30_000, cogsCents: 3700, contributionCents: 26_300 });

    const unqualified = await service.markQualified(sandboxAdmin, intake.value.lead.id, { capitalConfirmed: false, ageBand: null });
    expect(unqualified.ok).toBe(false);
    const advisor = await service.intake(sandboxAdmin, sandboxIntake({ email: 'advisor@example.test', phone: '5125550103', isAdvisor: true }));
    if (!advisor.ok) throw new Error(advisor.message);
    await service.recordBooking(sandboxAdmin, advisor.value.lead.id, '2026-11-12T16:00:00.000Z');
    const blockedAdvisor = await service.markQualified(sandboxAdmin, advisor.value.lead.id, { capitalConfirmed: true, ageBand: '55-65' });
    expect(blockedAdvisor.ok).toBe(false);

    const qualified = await service.markQualified(sandboxAdmin, intake.value.lead.id, { capitalConfirmed: true, ageBand: '55-65' });
    expect(qualified.ok && qualified.value.disposition).toBe('completed_qualified');
    const show = await service.route(sandboxAdmin, intake.value.lead.id, 'verified_show');
    if (!show.ok) throw new Error(show.message);
    expect(show.value.offers[0].priceCents).toBe(20_000);
    await service.decide(sandboxAdmin, show.value.offers[0].id, 'accept', 'show');
    const finalLedger = await service.ledger(sandboxAdmin);
    const products = finalLedger.ok
      ? finalLedger.value.lines.filter((line) => line.recognition === 'realized' && line.kind === 'revenue' && line.status === 'open').map((line) => line.product)
      : [];
    expect(products.sort()).toEqual(['booked', 'per_lead', 'verified_show']);
    expect(finalLedger.ok && finalLedger.value.realized).toMatchObject({ revenueCents: 50_000, cogsCents: 3700, contributionCents: 46_300 });
  });

  it('dedupes normalized contacts and serializes concurrent intake', async () => {
    const { service } = await sandbox();
    const first = await service.intake(sandboxAdmin, sandboxIntake({ email: 'Dup@Example.test', phone: '512-555-0104' }));
    if (!first.ok) throw new Error(first.message);
    const byEmail = await service.intake(sandboxAdmin, sandboxIntake({ email: 'dup@example.test', phone: '5125550198' }));
    expect(byEmail.ok && byEmail.value.duplicate).toBe(true);
    expect(byEmail.ok && byEmail.value.lead.id).toBe(first.value.lead.id);
    const byPhone = await service.intake(sandboxAdmin, sandboxIntake({ email: 'other@example.test', phone: '+1 (512) 555-0104' }));
    expect(byPhone.ok && byPhone.value.duplicate && byPhone.value.lead.id).toBe(first.value.lead.id);

    const burst = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.submitQuiz(sandboxIntake({ email: 'race@example.test', phone: '5125550105', firstName: 'Race' })),
      ),
    );
    const created = burst.filter((result) => result.ok && result.value.next === 'received');
    const duplicates = burst.filter((result) => result.ok && result.value.next === 'duplicate');
    expect(created).toHaveLength(1);
    expect(duplicates).toHaveLength(11);
    const counts = await service.counts(sandboxAdmin);
    const raceLeads = counts.ok ? counts.value.leads : 0;
    expect(raceLeads).toBe(2);
    const ledger = await service.ledger(sandboxAdmin);
    const cogs = ledger.ok ? ledger.value.lines.filter((line) => line.kind === 'cogs') : [];
    expect(cogs).toHaveLength(2);
  });

  it('enforces budget, capacity, exclusivity, and not-a-fit', async () => {
    const { service } = await sandbox();
    await service.configure(sandboxAdmin, {
      buyers: [{ ...sandboxBuyerInputs[0], budgetRemainingCents: 1000, dailyCapacity: 1 }],
    });
    const poor = await service.intake(sandboxAdmin, sandboxIntake({ email: 'budget@example.test', phone: '5125550106' }));
    if (!poor.ok) throw new Error(poor.message);
    const budgetRoute = await service.route(sandboxAdmin, poor.value.lead.id, 'per_lead');
    expect(budgetRoute.ok).toBe(true);
    if (!budgetRoute.ok) return;
    expect(budgetRoute.value.offers.map((row) => row.buyerId)).toEqual(['buyer_south']);
    expect(budgetRoute.value.blocked.some((row) => row.buyerId === 'buyer_north' && row.reason === 'budget')).toBe(true);

    await service.configure(sandboxAdmin, {
      buyers: [{ ...sandboxBuyerInputs[0], budgetRemainingCents: 500_000, dailyCapacity: 1, active: true, deliveryEnabled: true }],
    });
    const first = await service.intake(sandboxAdmin, sandboxIntake({ email: 'cap1@example.test', phone: '5125550107' }));
    const second = await service.intake(sandboxAdmin, sandboxIntake({ email: 'cap2@example.test', phone: '5125550108' }));
    if (!first.ok || !second.ok) throw new Error('intake failed');
    const firstRoute = await service.route(sandboxAdmin, first.value.lead.id, 'per_lead');
    if (!firstRoute.ok) throw new Error(firstRoute.message);
    await service.decide(sandboxAdmin, firstRoute.value.offers[0].id, 'accept', 'cap');
    const secondRoute = await service.route(sandboxAdmin, second.value.lead.id, 'per_lead');
    expect(secondRoute.ok && secondRoute.value.offers[0]?.buyerId).toBe('buyer_south');
    expect(secondRoute.ok && secondRoute.value.blocked.some((row) => row.reason === 'capacity')).toBe(true);

    await service.configure(sandboxAdmin, { buyers: [{ ...sandboxBuyerInputs[0], dailyCapacity: 5, budgetRemainingCents: 500_000 }] });
    const sharedOnly = await service.intake(sandboxAdmin, sandboxIntake({ email: 'share@example.test', phone: '5125550109' }));
    if (!sharedOnly.ok) throw new Error(sharedOnly.message);
    await service.configure(sandboxAdmin, {
      shareCap: null,
      buyers: [{ ...sandboxBuyerInputs[0], active: false, deliveryEnabled: false }],
    });
    const missingCap = await service.route(sandboxAdmin, sharedOnly.value.lead.id, 'per_lead');
    expect(missingCap.ok).toBe(false);
    if (!missingCap.ok) expect(missingCap.code).toBe('share_cap_not_configured');

    const lowCapital = await service.intake(sandboxAdmin, sandboxIntake({ email: 'low@example.test', phone: '5125550110', capitalAmountCents: 100 }));
    expect(lowCapital.ok && lowCapital.value.lead.fit).toBe('not_fit');
    const lowRoute = await service.route(sandboxAdmin, lowCapital.ok ? lowCapital.value.lead.id : '', 'per_lead');
    expect(lowRoute.ok && lowRoute.value.blocked.some((row) => row.reason === 'not_fit')).toBe(true);

    const unpriced = await service.intake(sandboxAdmin, sandboxIntake({ email: 'high@example.test', phone: '5125550111', capitalAmountCents: 60_000_000 }));
    expect(unpriced.ok && unpriced.value.lead.capitalBandId).toBe('band_b');
    const unpricedRoute = await service.route(sandboxAdmin, unpriced.ok ? unpriced.value.lead.id : '', 'per_lead');
    expect(unpricedRoute.ok).toBe(false);
    if (!unpricedRoute.ok) expect(unpricedRoute.code).toBe('price_not_configured');
  });

  it('validates consent and contact before storing a lead', async () => {
    const { service } = await sandbox();
    const noConsent = await service.submitQuiz(sandboxIntake({ consent: null, email: 'noconsent@example.test' }));
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.code).toBe('consent_missing');
    const thinConsent = await service.submitQuiz(
      sandboxIntake({
        email: 'thin@example.test',
        consent: { textVersion: '', capturedAt: '2026-11-09T21:00:00.000Z', purposes: ['contact'], evidenceRef: null },
      }),
    );
    expect(thinConsent.ok).toBe(false);
    const badContact = await service.submitQuiz(sandboxIntake({ email: 'not-an-email', phone: '123' }));
    expect(badContact.ok).toBe(false);
    if (!badContact.ok) expect(badContact.code).toBe('contact_invalid');
    const counts = await service.counts(sandboxAdmin);
    expect(counts.ok && counts.value.leads).toBe(0);

    const bare = AnnuityService.create();
    const noCountry = await bare.intake(sandboxAdmin, sandboxIntake());
    expect(noCountry.ok).toBe(false);
    if (!noCountry.ok) expect(noCountry.code).toBe('phone_country_not_configured');
  });

  it('holds quiet hours, cancels stale reminders, and does not send', async () => {
    const { service, clock } = await sandbox();
    clock.set('2026-11-08T18:00:00.000Z');
    const sunday = await service.intake(sandboxAdmin, sandboxIntake({ email: 'sunday@example.test', phone: '5125550112' }));
    if (!sunday.ok) throw new Error(sunday.message);
    const sundayMessages = await service.planFollowUps(sandboxAdmin, sunday.value.lead.id, 'unbooked');
    expect(sundayMessages.ok && sundayMessages.value[0].status).toBe('held_quiet_hours');

    clock.set('2026-11-10T02:30:00.000Z');
    const evening = await service.intake(sandboxAdmin, sandboxIntake({ email: 'evening@example.test', phone: '5125550113' }));
    if (!evening.ok) throw new Error(evening.message);
    const eveningMessages = await service.planFollowUps(sandboxAdmin, evening.value.lead.id, 'unbooked');
    expect(eveningMessages.ok && eveningMessages.value[0].status).toBe('held_quiet_hours');

    clock.set('2026-11-09T21:00:00.000Z');
    const inside = await service.intake(sandboxAdmin, sandboxIntake({ email: 'inside@example.test', phone: '5125550114' }));
    if (!inside.ok) throw new Error(inside.message);
    const insideMessages = await service.planFollowUps(sandboxAdmin, inside.value.lead.id, 'unbooked');
    expect(insideMessages.ok && insideMessages.value[0].status).toBe('queued_suppressed');
    const dispatch = await service.dispatchDue(sandboxAdmin);
    expect(dispatch.ok && dispatch.value).toMatchObject({ blockedReason: 'sends_disabled', sent: 0 });
    const stillQueued = await service.listMessages(sandboxAdmin, inside.value.lead.id);
    expect(stillQueued.ok && stillQueued.value[0].status).toBe('queued_suppressed');

    await service.recordBooking(sandboxAdmin, inside.value.lead.id, '2026-11-12T18:00:00.000Z');
    const bookedMessages = await service.planFollowUps(sandboxAdmin, inside.value.lead.id, 'booked');
    expect(bookedMessages.ok && bookedMessages.value[0].status).toBe('queued_suppressed');
    await service.markNoShow(sandboxAdmin, inside.value.lead.id);
    const afterNoShow = await service.listMessages(sandboxAdmin, inside.value.lead.id);
    const bookedStatus = afterNoShow.ok ? afterNoShow.value.find((message) => message.templateKey === 'sandbox_booked')?.status : '';
    expect(bookedStatus).toBe('cancelled_stale');
    const noShowPlan = await service.planFollowUps(sandboxAdmin, inside.value.lead.id, 'no_show');
    expect(noShowPlan.ok && noShowPlan.value[0].status).toBe('queued_suppressed');
    await service.recordBooking(sandboxAdmin, inside.value.lead.id, '2026-11-13T18:00:00.000Z');
    const afterRebook = await service.listMessages(sandboxAdmin, inside.value.lead.id);
    expect(afterRebook.ok && afterRebook.value.find((message) => message.templateKey === 'sandbox_noshow')?.status).toBe('cancelled_stale');
    const rebookedPlan = await service.planFollowUps(sandboxAdmin, inside.value.lead.id, 'booked');
    expect(rebookedPlan.ok && rebookedPlan.value[0].status).toBe('queued_suppressed');

    const stopped = await service.optOutWithStopToken(inside.value.lead.stopToken);
    expect(stopped.ok && stopped.value.cancelled).toBeGreaterThan(0);
    const afterStop = await service.listMessages(sandboxAdmin, inside.value.lead.id);
    expect(afterStop.ok && afterStop.value.every((message) => message.status === 'cancelled_opt_out' || message.status === 'cancelled_stale')).toBe(true);
    const replan = await service.planFollowUps(sandboxAdmin, inside.value.lead.id, 'unbooked');
    expect(replan.ok && replan.value).toHaveLength(0);
    const counts = await service.counts(sandboxAdmin);
    expect(counts.ok && counts.value.messagesSent).toBe(0);

    const unconfigured = AnnuityService.create({ clock });
    await unconfigured.configure(sandboxAdmin, { phoneDefaultCountry: 'US', sequences: { unbooked: [{ templateKey: 'hold', channel: 'sms', offsetMinutes: 0, sequence: 'unbooked' }] } });
    const heldLead = await unconfigured.intake(sandboxAdmin, sandboxIntake({ email: 'hold@example.test', phone: '5125550115', consent: sandboxConsent() }));
    if (!heldLead.ok) throw new Error(heldLead.message);
    const held = await unconfigured.planFollowUps(sandboxAdmin, heldLead.value.lead.id, 'unbooked');
    expect(held.ok && held.value[0].status).toBe('held_configuration_incomplete');
  });

  it('denies buyer, anonymous, and cross-tenant access without leaking the lead', async () => {
    const { service } = await sandbox();
    const intake = await service.intake(sandboxAdmin, sandboxIntake({ email: 'secret-email@example.test', phone: '5125550116' }));
    if (!intake.ok) throw new Error(intake.message);
    const routed = await service.route(sandboxAdmin, intake.value.lead.id, 'per_lead');
    if (!routed.ok) throw new Error(routed.message);
    const florida = await service.intake(sandboxAdmin, sandboxIntake({ email: 'florida@example.test', phone: '3055550117', state: 'FL' }));
    if (!florida.ok) throw new Error(florida.message);
    const floridaRoute = await service.route(sandboxAdmin, florida.value.lead.id, 'per_lead');
    if (!floridaRoute.ok) throw new Error(floridaRoute.message);
    expect(floridaRoute.value.offers[0].buyerId).toBe('buyer_east');

    expect((await service.listLeads({ kind: 'anonymous' })).ok).toBe(false);
    expect((await service.route(sandboxNorth, intake.value.lead.id, 'per_lead')).ok).toBe(false);
    expect((await service.configure(sandboxSouth, { shareCap: 9 })).ok).toBe(false);
    const cross = await service.decide(sandboxSouth, routed.value.offers[0].id, 'accept', 'steal');
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.code).toBe('tenant_isolation');
    expect(JSON.stringify(cross)).not.toContain('secret-email');
    const southDeliveries = await service.listDeliveries(sandboxSouth, 'buyer_north');
    expect(southDeliveries.ok).toBe(false);
    if (!southDeliveries.ok) expect(southDeliveries.code).toBe('tenant_isolation');
    const own = await service.listDeliveries(sandboxNorth);
    expect(own.ok && own.value.every((row) => row.buyerId === 'buyer_north')).toBe(true);
    const hidden = await service.getLead(sandboxEast, intake.value.lead.id);
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.code).toBe('tenant_isolation');
    expect(JSON.stringify(hidden)).not.toContain('secret-email');
    const buyerLedger = await service.ledger(sandboxNorth, 'buyer_south');
    expect(buyerLedger.ok).toBe(false);
    const northLedger = await service.ledger(sandboxNorth);
    expect(northLedger.ok && northLedger.value.lines.every((line) => line.buyerId === 'buyer_north')).toBe(true);
    expect(northLedger.ok && northLedger.value.cogsVisible).toBe(false);
    expect(northLedger.ok && northLedger.value.lines.some((line) => line.kind === 'cogs')).toBe(false);

    const deliveryState = await service.listDeliveries(sandboxAdmin, 'buyer_north');
    expect(deliveryState.ok && deliveryState.value[0].state).toBe('offered');
  });

  it('parses UTM attribution without inventing missing fields', () => {
    expect(parseUtmSearch('?start=1&utm_content=R3&utm_source=meta')).toMatchObject({
      content: 'R3',
      source: 'meta',
      medium: null,
      startFlag: true,
    });
  });

  it('runs the visible sandbox proof', async () => {
    const lines = await runVisibleProof(await sandbox());
    expect(lines.join('\n')).toContain('cross-tenant accept tenant_isolation');
    expect(lines.join('\n')).toContain('show before qualification show_not_verified');
    expect(lines.join('\n')).toContain('dispatch=sends_disabled sent=0');
    expect(lines.join('\n')).toContain('duplicate quiz next=duplicate');
    expect(lines.join('\n')).toContain('contribution=8300');
    expect(lines.join('\n')).toContain('revenue=50000');
  });
});
