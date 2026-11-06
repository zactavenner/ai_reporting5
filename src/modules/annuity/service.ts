import { MemoryStore } from './memory-store';
import {
  addMinutes,
  bandsOverlap,
  buyerRoutable,
  classifyBand,
  consentIsComplete,
  dayKey,
  emptyProgram,
  fail,
  messageStatusForSchedule,
  normalizeEmail,
  normalizePhone,
  normalizeState,
  ok,
  resolveExplicitPrice,
  summarizeLedger,
  validatePriceAmount,
} from './rules';
import type {
  Actor,
  AuditEvent,
  Buyer,
  BuyerLeadView,
  CapitalBand,
  ConfigureBatch,
  ConsentEvidence,
  Delivery,
  Disposition,
  FollowSequence,
  FollowUpMessage,
  IntakeInput,
  Lead,
  LedgerLine,
  LedgerReport,
  PriceMapping,
  Product,
  ProgramConfig,
  PublicIntake,
  QualificationEvidence,
  Result,
  RouteResult,
  UtmAttribution,
} from './types';

export interface Clock {
  iso(): string;
}

export function frozenClock(start: string): Clock & { set(iso: string): void } {
  let current = start;
  return {
    iso: () => current,
    set: (iso: string) => {
      current = iso;
    },
  };
}

export function sequentialIds(): () => string {
  let n = 0;
  return () => `a${(n += 1).toString(36)}`;
}

const TERMINAL_MESSAGE = new Set(['cancelled_stale', 'cancelled_opt_out']);

export class AnnuityService {
  constructor(
    private readonly store: MemoryStore,
    private readonly clock: Clock,
    private readonly nextId: () => string,
  ) {}

  static create(options?: { clock?: Clock; program?: ProgramConfig; ids?: () => string; buyers?: Buyer[] }) {
    const program = structuredClone(options?.program ?? emptyProgram());
    const store = new MemoryStore(program);
    for (const buyer of options?.buyers ?? []) store.buyers.set(buyer.id, structuredClone(buyer));
    return new AnnuityService(store, options?.clock ?? frozenClock('2026-11-09T21:00:00.000Z'), options?.ids ?? sequentialIds());
  }

  configure(actor: Actor, batch: ConfigureBatch): Promise<Result<ProgramConfig>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      if (batch.sendsEnabled === true) return fail('sends_disabled', 'Outbound sends stay disabled in this build.');
      if (batch.liveDeliveryEnabled === true) return fail('live_delivery_disabled', 'Live buyer delivery stays disabled in this build.');
      if (batch.activateUnresolved) {
        return fail('unresolved_inactive', `${batch.activateUnresolved} stays unresolved and inactive until a separate decision.`);
      }

      const next = structuredClone(this.store.program);
      if (batch.phoneDefaultCountry !== undefined) {
        if (batch.phoneDefaultCountry !== null && batch.phoneDefaultCountry !== 'US') {
          return fail('validation', 'Only an explicit US phone country is implemented. Other countries are not guessed.');
        }
        next.phoneDefaultCountry = batch.phoneDefaultCountry;
      }
      if (batch.cogsPerLeadCents !== undefined) {
        if (!Number.isInteger(batch.cogsPerLeadCents) || batch.cogsPerLeadCents < 0) {
          return fail('validation', 'COGS must be a non-negative integer number of cents.');
        }
        next.cogsPerLeadCents = batch.cogsPerLeadCents;
      }
      if (batch.shareCap !== undefined) {
        if (batch.shareCap !== null && (!Number.isInteger(batch.shareCap) || batch.shareCap < 1)) {
          return fail('validation', 'Shared delivery cap must be an integer of at least 1, or left unset.');
        }
        next.shareCap = batch.shareCap;
      }
      if (batch.quietHours) next.quietHours = structuredClone(batch.quietHours);
      if (batch.qualification) next.qualification = structuredClone(batch.qualification);
      if (batch.sequences) {
        for (const key of ['unbooked', 'booked', 'no_show'] as const) {
          if (batch.sequences[key]) next.sequences[key] = structuredClone(batch.sequences[key]);
        }
      }
      if (batch.bands) {
        if (bandsOverlap(batch.bands)) return fail('band_overlap', 'Capital bands overlap. Set explicit non-overlapping ranges.');
        next.bands = structuredClone(batch.bands);
      }
      if (batch.prices) {
        const mapped: PriceMapping[] = [];
        for (const price of batch.prices) {
          if (!next.bands.some((band) => band.id === price.capitalBandId)) {
            return fail('validation', `Price references unknown capital band ${price.capitalBandId}.`);
          }
          const code = validatePriceAmount(price.product, price.amountCents);
          if (code) {
            return fail(
              code,
              code === 'price_out_of_range'
                ? 'Per-lead price must be configured between $80 and $200. No band-to-price formula is applied.'
                : 'Price amount is invalid.',
            );
          }
          mapped.push({
            id: this.nextId(),
            product: price.product,
            capitalBandId: price.capitalBandId,
            amountCents: price.amountCents,
            active: true,
          });
        }
        const seen = new Set<string>();
        for (const row of mapped) {
          const key = `${row.product}:${row.capitalBandId}`;
          if (seen.has(key)) return fail('price_ambiguous', 'Each product and capital band can have only one explicit price.');
          seen.add(key);
        }
        next.prices = mapped;
      }

      const nextBuyers = new Map(this.store.buyers);
      if (batch.buyers) {
        for (const input of batch.buyers) {
          const buyer: Buyer = {
            ...input,
            licensedStates: input.licensedStates.map((state) => state.toUpperCase()),
            active: input.active ?? false,
            liveDeliveryEnabled: false,
          };
          if (buyer.deliveryEnabled) {
            const routable = buyerRoutable({ ...buyer, active: true, deliveryEnabled: true });
            if (!routable.ok && routable.reason === 'unverified_candidate') {
              return fail('buyer_not_routable', 'Unverified candidates cannot be enabled for delivery.');
            }
            if (buyer.verificationStatus !== 'verified_configuration_only') {
              return fail('buyer_not_routable', 'Delivery requires verified_configuration_only. Candidates stay inactive.');
            }
            if (buyer.licensedStates.length === 0 || buyer.capitalBandIds.length === 0) {
              return fail('buyer_not_routable', 'Licensed states and capital filters must be explicit before delivery can be enabled.');
            }
          }
          nextBuyers.set(buyer.id, buyer);
        }
      }

      this.store.program = next;
      this.store.buyers.clear();
      for (const [id, buyer] of nextBuyers) this.store.buyers.set(id, buyer);
      this.recordAudit(actor, 'program', 'program', 'configured', {});
      return ok(structuredClone(this.store.program));
    });
  }

  submitQuiz(input: IntakeInput): Promise<Result<PublicIntake>> {
    return this.store.transaction(() => {
      const created = this.intakeInside({ kind: 'anonymous' }, input);
      if (!created.ok) return created;
      const lead = created.value;
      return ok({
        reference: lead.id,
        duplicate: created.duplicate,
        fit: lead.fit,
        next: created.duplicate ? 'duplicate' : lead.fit === 'not_fit' ? 'not_a_fit' : 'received',
        stopToken: lead.stopToken,
      });
    });
  }

  intake(actor: Actor, input: IntakeInput): Promise<Result<{ lead: Lead; duplicate: boolean }>> {
    return this.store.transaction(() => {
      if (actor.kind !== 'platform_admin') return fail('denied', 'Platform admin is required for full intake.');
      const created = this.intakeInside(actor, input);
      if (!created.ok) return created;
      return ok({ lead: structuredClone(created.value), duplicate: Boolean(created.duplicate) });
    });
  }

  route(actor: Actor, leadId: string, product: Product): Promise<Result<RouteResult>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      return this.finalizeRoute(this.routeInside(actor, leadId, product));
    });
  }

  decide(
    actor: Actor,
    deliveryId: string,
    decision: 'accept' | 'reject',
    idempotencyKey: string,
  ): Promise<Result<{ delivery: Delivery; replayed: boolean }>> {
    return this.store.transaction(() => this.decideInside(actor, deliveryId, decision, idempotencyKey));
  }

  retry(actor: Actor, leadId: string, product: Product, idempotencyKey: string): Promise<Result<RouteResult>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const commandKey = `retry:${leadId}:${product}:${idempotencyKey}`;
      const prior = this.store.commands.get(commandKey);
      if (prior) return ok(structuredClone(prior) as RouteResult);
      const open = this.openOffers(leadId, product);
      if (open.length > 0) {
        const current = this.routeSnapshot(leadId, product, open, []);
        this.store.commands.set(commandKey, structuredClone(current));
        return ok(current);
      }
      if (!this.store.leads.get(leadId)) return fail('not_found', 'Lead not found.');
      const result = this.finalizeRoute(this.routeInside(actor, leadId, product, { isRetry: true }));
      if (result.ok) this.store.commands.set(commandKey, structuredClone(result.value));
      return result;
    });
  }

  recordBooking(actor: Actor, leadId: string, slotStart: string): Promise<Result<Lead>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const lead = this.store.leads.get(leadId);
      if (!lead) return fail('not_found', 'Lead not found.');
      if (lead.optedOut || lead.disposition === 'opted_out') return fail('opted_out', 'Opted-out contacts cannot be booked.');
      if (lead.fit !== 'in_band' || lead.disposition === 'not_fit') return fail('validation', 'Not-a-fit leads are not booked.');
      if (!slotStart) return fail('validation', 'A slot start is required.');
      const rebook = lead.disposition === 'booked' || lead.disposition === 'confirmed' || lead.disposition === 'no_show' || lead.disposition === 'rebooked';
      lead.disposition = rebook ? 'rebooked' : 'booked';
      lead.bookingGeneration += 1;
      lead.slotStart = slotStart;
      this.cancelStale(lead);
      this.recordAudit(actor, 'lead', lead.id, rebook ? 'rebooked' : 'booked', { slotStart, generation: lead.bookingGeneration });
      return ok(structuredClone(lead));
    });
  }

  markNoShow(actor: Actor, leadId: string): Promise<Result<Lead>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const lead = this.store.leads.get(leadId);
      if (!lead) return fail('not_found', 'Lead not found.');
      if (lead.disposition !== 'booked' && lead.disposition !== 'confirmed' && lead.disposition !== 'rebooked') {
        return fail('illegal_transition', 'No-show only follows a booking.');
      }
      lead.disposition = 'no_show';
      lead.bookingGeneration += 1;
      this.cancelStale(lead);
      this.recordAudit(actor, 'lead', lead.id, 'no_show', { generation: lead.bookingGeneration });
      return ok(structuredClone(lead));
    });
  }

  markQualified(actor: Actor, leadId: string, evidence: QualificationEvidence): Promise<Result<Lead>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const lead = this.store.leads.get(leadId);
      if (!lead) return fail('not_found', 'Lead not found.');
      const rules = this.store.program.qualification;
      if (!rules.configured) {
        return fail('qualification_rules_not_configured', 'Qualified-show rules are not configured. No default from the launch PDF is applied.');
      }
      if (rules.blockAdvisors && lead.isAdvisor) return fail('validation', 'Advisors are excluded by the configured rule.');
      if (rules.blockExistingClients && lead.existingClient) return fail('validation', 'Existing clients are excluded by the configured rule.');
      if (rules.requireCapitalConfirm && !evidence.capitalConfirmed) {
        return fail('validation', 'Capital confirmation was not recorded.');
      }
      if (rules.requireAgeBand && !evidence.ageBand) return fail('validation', 'Age band confirmation was not recorded.');
      const bookedLike = lead.disposition === 'booked' || lead.disposition === 'confirmed' || lead.disposition === 'rebooked' || lead.disposition === 'no_show';
      if (!bookedLike) return fail('booking_required', 'A verified show requires a booking disposition first.');
      lead.disposition = 'completed_qualified';
      this.cancelStale(lead);
      this.recordAudit(actor, 'lead', lead.id, 'completed_qualified', {
        capitalConfirmed: evidence.capitalConfirmed,
        ageBand: evidence.ageBand,
      });
      return ok(structuredClone(lead));
    });
  }

  postRefund(actor: Actor, deliveryId: string, amountCents: number, idempotencyKey: string): Promise<Result<LedgerLine>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      if (!Number.isInteger(amountCents) || amountCents <= 0) return fail('validation', 'Refund amount must be a positive number of cents.');
      const commandKey = `refund:${deliveryId}:${idempotencyKey}`;
      const prior = this.store.commands.get(commandKey);
      if (prior) return ok(structuredClone(prior) as LedgerLine);
      const delivery = this.store.deliveries.get(deliveryId);
      if (!delivery) return fail('not_found', 'Delivery not found.');
      if (delivery.state !== 'accepted') return fail('illegal_transition', 'Refunds apply only to accepted deliveries.');
      const realized = this.store.ledger
        .filter((line) => line.deliveryId === deliveryId && line.kind === 'revenue' && line.recognition === 'realized' && line.status === 'open')
        .reduce((sum, line) => sum + line.amountCents, 0);
      const refunded = this.store.ledger
        .filter((line) => line.deliveryId === deliveryId && line.kind === 'refund' && line.status === 'open')
        .reduce((sum, line) => sum + line.amountCents, 0);
      if (amountCents > realized - refunded) return fail('validation', 'Refund exceeds realized revenue for this delivery.');
      const line = this.addLedger({
        leadId: delivery.leadId,
        buyerId: delivery.buyerId,
        product: delivery.product,
        deliveryId: delivery.id,
        kind: 'refund',
        recognition: 'realized',
        status: 'open',
        amountCents,
        idempotencyKey: `refund:${deliveryId}:${idempotencyKey}`,
      });
      this.store.commands.set(commandKey, structuredClone(line));
      this.recordAudit(actor, 'delivery', delivery.id, 'refunded', { amountCents });
      return ok(structuredClone(line));
    });
  }

  optOutWithStopToken(stopToken: string): Promise<Result<{ leadId: string; cancelled: number }>> {
    return this.store.transaction(() => {
      const leadId = this.store.stopTokens.get(stopToken);
      if (!leadId) return fail('not_found', 'Stop token was not recognized.');
      return ok(this.optOutInside({ kind: 'anonymous' }, this.store.leads.get(leadId)!));
    });
  }

  optOut(actor: Actor, leadId: string): Promise<Result<{ leadId: string; cancelled: number }>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const lead = this.store.leads.get(leadId);
      if (!lead) return fail('not_found', 'Lead not found.');
      return ok(this.optOutInside(actor, lead));
    });
  }

  planFollowUps(actor: Actor, leadId: string, sequence: FollowSequence): Promise<Result<FollowUpMessage[]>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const lead = this.store.leads.get(leadId);
      if (!lead) return fail('not_found', 'Lead not found.');
      if (lead.optedOut) return ok([]);
      const templates = this.store.program.sequences[sequence] ?? [];
      const created: FollowUpMessage[] = [];
      for (const template of templates) {
        const scheduledAt = addMinutes(this.clock.iso(), template.offsetMinutes);
        const message: FollowUpMessage = {
          id: this.nextId(),
          leadId: lead.id,
          sequence,
          templateKey: template.templateKey,
          channel: template.channel,
          validForDisposition: lead.disposition,
          bookingGeneration: lead.bookingGeneration,
          scheduledAt,
          status: messageStatusForSchedule(this.store.program.quietHours, sequence, scheduledAt),
        };
        this.store.messages.push(message);
        created.push(message);
        this.recordAudit(actor, 'message', message.id, 'queued', { status: message.status, templateKey: template.templateKey });
      }
      return ok(structuredClone(created));
    });
  }

  dispatchDue(actor: Actor): Promise<Result<{ attempted: number; blockedReason: 'sends_disabled'; sent: 0 }>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const now = this.clock.iso();
      const due = this.store.messages.filter((message) => message.status === 'queued_suppressed' && message.scheduledAt <= now);
      for (const message of due) {
        this.recordAudit(actor, 'message', message.id, 'send_blocked', { reason: 'sends_disabled' });
      }
      return ok({ attempted: due.length, blockedReason: 'sends_disabled', sent: 0 as const });
    });
  }

  ledger(actor: Actor, buyerId?: string): Promise<Result<LedgerReport>> {
    return this.store.transaction(() => {
      if (actor.kind === 'anonymous') return fail('denied', 'Sign-in is required.');
      let lines = this.store.ledger;
      if (actor.kind === 'buyer') {
        if (buyerId && buyerId !== actor.buyerId) return fail('tenant_isolation', 'Not available in this account.');
        lines = lines.filter((line) => line.buyerId === actor.buyerId);
      } else if (buyerId) {
        lines = lines.filter((line) => line.buyerId === buyerId);
      }
      const cloned = structuredClone(lines);
      return ok({ lines: cloned, ...summarizeLedger(cloned), cogsVisible: actor.kind === 'platform_admin' && !buyerId });
    });
  }

  counts(actor: Actor): Promise<Result<{ leads: number; deliveries: number; ledgerLines: number; messagesSent: number }>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      return ok({
        leads: this.store.leads.size,
        deliveries: this.store.deliveries.size,
        ledgerLines: this.store.ledger.length,
        messagesSent: this.store.messages.filter((message) => (message.status as string) === 'sent').length,
      });
    });
  }

  listDeliveries(actor: Actor, buyerId?: string): Promise<Result<Delivery[]>> {
    return this.store.transaction(() => {
      if (actor.kind === 'anonymous') return fail('denied', 'Sign-in is required.');
      let rows = [...this.store.deliveries.values()];
      if (actor.kind === 'buyer') {
        if (buyerId && buyerId !== actor.buyerId) return fail('tenant_isolation', 'Not available in this account.');
        rows = rows.filter((row) => row.buyerId === actor.buyerId);
      } else if (buyerId) {
        rows = rows.filter((row) => row.buyerId === buyerId);
      }
      return ok(structuredClone(rows));
    });
  }

  listLeads(actor: Actor): Promise<Result<Array<Lead | BuyerLeadView>>> {
    return this.store.transaction(() => {
      if (actor.kind === 'anonymous') return fail('denied', 'Sign-in is required.');
      if (actor.kind === 'platform_admin') return ok([...this.store.leads.values()].map((lead) => structuredClone(lead)));
      const allowed = new Set(
        [...this.store.deliveries.values()].filter((row) => row.buyerId === actor.buyerId).map((row) => row.leadId),
      );
      const views: BuyerLeadView[] = [...this.store.leads.values()]
        .filter((lead) => allowed.has(lead.id))
        .map((lead) => ({
          id: lead.id,
          state: lead.state,
          capitalBandId: lead.capitalBandId,
          disposition: lead.disposition,
          fit: lead.fit,
        }));
      return ok(views);
    });
  }

  getLead(actor: Actor, leadId: string): Promise<Result<Lead | BuyerLeadView>> {
    return this.store.transaction(() => {
      if (actor.kind === 'anonymous') return fail('denied', 'Sign-in is required.');
      const lead = this.store.leads.get(leadId);
      if (!lead) return fail('not_found', 'Lead not found.');
      if (actor.kind === 'platform_admin') return ok(structuredClone(lead));
      const owns = [...this.store.deliveries.values()].some((row) => row.buyerId === actor.buyerId && row.leadId === leadId);
      if (!owns) return fail('tenant_isolation', 'Not available in this account.');
      return ok({
        id: lead.id,
        state: lead.state,
        capitalBandId: lead.capitalBandId,
        disposition: lead.disposition,
        fit: lead.fit,
      });
    });
  }

  listBuyers(actor: Actor): Promise<Result<Buyer[]>> {
    return this.store.transaction(() => {
      if (actor.kind === 'anonymous') return fail('denied', 'Sign-in is required.');
      const buyers = [...this.store.buyers.values()];
      if (actor.kind === 'buyer') return ok(buyers.filter((buyer) => buyer.id === actor.buyerId).map((buyer) => structuredClone(buyer)));
      return ok(buyers.map((buyer) => structuredClone(buyer)));
    });
  }

  getProgram(actor: Actor): Promise<Result<ProgramConfig>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      return ok(structuredClone(this.store.program));
    });
  }

  listMessages(actor: Actor, leadId?: string): Promise<Result<FollowUpMessage[]>> {
    return this.store.transaction(() => {
      const denied = this.requireAdmin(actor);
      if (denied) return denied;
      const rows = this.store.messages.filter((message) => !leadId || message.leadId === leadId);
      return ok(structuredClone(rows));
    });
  }

  private intakeInside(actor: Actor, input: IntakeInput): Result<Lead> & { duplicate?: boolean } {
    if (!consentIsComplete(input.consent)) {
      return fail('consent_missing', 'Consent text version, time, contact permission, and delivery permission are required.');
    }
    const email = normalizeEmail(input.email);
    const state = normalizeState(input.state);
    const phone = normalizePhone(input.phone, this.store.program.phoneDefaultCountry);
    if (!email || !state || !phone.ok || !input.firstName.trim() || !input.lastName.trim()) {
      return fail(phone.ok === false ? phone.code : 'contact_invalid', 'A name, valid email, valid phone, and two-letter state are required.');
    }
    if (!Number.isInteger(input.capitalAmountCents) || input.capitalAmountCents < 0) {
      return fail('validation', 'Capital amount must be a non-negative integer number of cents.');
    }
    const existingId = this.store.emailIndex.get(email) ?? this.store.phoneIndex.get(phone.e164);
    if (existingId) {
      const existing = this.store.leads.get(existingId)!;
      this.recordAudit(actor, 'lead', existing.id, 'duplicate_intake', {});
      return Object.assign(ok(existing), { duplicate: true });
    }
    const classified = classifyBand(this.store.program.bands, input.capitalAmountCents);
    if (classified.overlap) return fail('band_overlap', 'Capital bands overlap, so this lead cannot be classified.');
    const inRoutableBand = Boolean(classified.band && classified.band.routable);
    const lead: Lead = {
      id: this.nextId(),
      createdAt: this.clock.iso(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      emailNormalized: email,
      phoneE164: phone.e164,
      state,
      capitalAmountCents: input.capitalAmountCents,
      capitalBandId: classified.band?.id ?? null,
      fit: inRoutableBand ? 'in_band' : 'not_fit',
      disposition: inRoutableBand ? 'unbooked' : 'not_fit',
      utm: normalizeUtm(input.utm),
      consent: input.consent as ConsentEvidence,
      optedOut: false,
      bookingGeneration: 0,
      existingClient: Boolean(input.existingClient),
      isAdvisor: Boolean(input.isAdvisor),
      stopToken: this.nextId(),
      slotStart: null,
    };
    this.store.leads.set(lead.id, lead);
    this.store.emailIndex.set(email, lead.id);
    this.store.phoneIndex.set(phone.e164, lead.id);
    this.store.stopTokens.set(lead.stopToken, lead.id);
    this.addLedger({
      leadId: lead.id,
      buyerId: null,
      product: null,
      deliveryId: null,
      kind: 'cogs',
      recognition: 'unrecognized',
      status: 'open',
      amountCents: this.store.program.cogsPerLeadCents,
      idempotencyKey: `cogs:${lead.id}`,
    });
    this.recordAudit(actor, 'lead', lead.id, 'intake', {
      fit: lead.fit,
      bandId: lead.capitalBandId,
      utmContent: lead.utm.content,
    });
    return Object.assign(ok(lead), { duplicate: false });
  }

  private routeInside(actor: Actor, leadId: string, product: Product, options?: { isRetry?: boolean }): RouteResult {
    const lead = this.store.leads.get(leadId);
    if (!lead) {
      return { leadId, product, state: 'idle', offers: [], blocked: [{ buyerId: '-', reason: 'not_found' }] };
    }
    if (lead.optedOut) {
      return { leadId, product, state: 'exhausted', offers: [], blocked: [{ buyerId: '-', reason: 'opted_out' }] };
    }
    if (product === 'verified_show' && lead.disposition !== 'completed_qualified') {
      return { leadId, product, state: 'idle', offers: [], blocked: [{ buyerId: '-', reason: 'show_not_verified' }] };
    }
    if (product === 'booked' && !['booked', 'confirmed', 'rebooked', 'completed_qualified'].includes(lead.disposition)) {
      return { leadId, product, state: 'idle', offers: [], blocked: [{ buyerId: '-', reason: 'booking_required' }] };
    }
    if (product === 'per_lead' && lead.fit !== 'in_band') {
      return { leadId, product, state: 'exhausted', offers: [], blocked: [{ buyerId: '-', reason: 'not_fit' }] };
    }
    const open = this.openOffers(leadId, product);
    if (open.length > 0) return this.routeSnapshot(leadId, product, open, []);
    if (this.productDeliveries(leadId, product).some((row) => row.state === 'accepted' && row.distribution === 'exclusive')) {
      return { leadId, product, state: 'accepted', offers: [], blocked: [{ buyerId: '-', reason: 'exclusive_conflict' }] };
    }
    if (!lead.capitalBandId) {
      return { leadId, product, state: 'exhausted', offers: [], blocked: [{ buyerId: '-', reason: 'price_not_configured' }] };
    }
    const priceLookup = resolveExplicitPrice(this.store.program.prices, product, lead.capitalBandId);
    if (!priceLookup.price) {
      return {
        leadId,
        product,
        state: 'idle',
        offers: [],
        blocked: [{ buyerId: '-', reason: priceLookup.code ?? 'price_not_configured' }],
      };
    }
    const price = priceLookup.price.amountCents;
    const day = dayKey(this.clock.iso());
    const rejectedBuyers = new Set(
      this.productDeliveries(leadId, product)
        .filter((row) => row.state === 'rejected')
        .map((row) => row.buyerId),
    );
    const acceptedShared = this.productDeliveries(leadId, product).filter((row) => row.state === 'accepted' && row.distribution === 'shared').length;
    const blocked: RouteResult['blocked'] = [];
    const eligible: Buyer[] = [];
    for (const buyer of [...this.store.buyers.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const reason = this.ineligibleReason(buyer, lead, price, day, rejectedBuyers);
      if (reason) blocked.push({ buyerId: buyer.id, reason });
      else eligible.push(buyer);
    }
    const exclusive = eligible.filter((buyer) => buyer.distribution === 'exclusive');
    const shared = eligible.filter((buyer) => buyer.distribution === 'shared');
    const chosen: Buyer[] = [];
    if (acceptedShared > 0 && exclusive.length > 0) {
      for (const buyer of exclusive) blocked.push({ buyerId: buyer.id, reason: 'exclusive_conflict' });
    }
    if (exclusive.length > 0 && acceptedShared === 0) {
      chosen.push(exclusive[0]);
      for (const buyer of exclusive.slice(1)) blocked.push({ buyerId: buyer.id, reason: 'exclusive_priority' });
      for (const buyer of shared) blocked.push({ buyerId: buyer.id, reason: 'exclusive_priority' });
    } else {
      if (this.store.program.shareCap === null) {
        return {
          leadId,
          product,
          state: 'idle',
          offers: [],
          blocked: [...blocked, { buyerId: '-', reason: 'share_cap_not_configured' }],
        };
      }
      const remaining = this.store.program.shareCap - acceptedShared;
      if (remaining <= 0) {
        return { leadId, product, state: 'accepted', offers: [], blocked: [...blocked, { buyerId: '-', reason: 'share_cap' }] };
      }
      chosen.push(...shared.slice(0, remaining));
      for (const buyer of shared.slice(remaining)) blocked.push({ buyerId: buyer.id, reason: 'share_cap' });
    }
    const offers = chosen.map((buyer) => this.offer(actor, lead, buyer, product, price, day, Boolean(options?.isRetry)));
    const state = offers.length > 0 ? 'offered' : options?.isRetry ? 'exhausted' : 'idle';
    if (offers.length === 0 && options?.isRetry) {
      this.recordAudit(actor, 'lead', lead.id, 'routing_exhausted', { product });
    }
    return { leadId, product, state, offers: structuredClone(offers), blocked };
  }

  private ineligibleReason(buyer: Buyer, lead: Lead, price: number, day: string, rejectedBuyers: Set<string>): string | null {
    const routable = buyerRoutable(buyer);
    if (!routable.ok) return routable.reason;
    if (rejectedBuyers.has(buyer.id)) return 'previously_rejected';
    if (!buyer.licensedStates.includes(lead.state)) return 'state_not_licensed';
    if (!lead.capitalBandId || !buyer.capitalBandIds.includes(lead.capitalBandId)) return 'capital_filter';
    if (buyer.budgetRemainingCents < price) return 'budget';
    if (this.usage(buyer.id, day) >= buyer.dailyCapacity) return 'capacity';
    return null;
  }

  private offer(actor: Actor, lead: Lead, buyer: Buyer, product: Product, price: number, day: string, isRetry: boolean): Delivery {
    const attempt = this.productDeliveries(lead.id, product).filter((row) => row.buyerId === buyer.id).length + 1;
    buyer.budgetRemainingCents -= price;
    const delivery: Delivery = {
      id: this.nextId(),
      leadId: lead.id,
      buyerId: buyer.id,
      product,
      state: 'offered',
      priceCents: price,
      attempt,
      distribution: buyer.distribution,
      channel: 'sandbox_noop',
      reservedDay: day,
      idempotencyOfferKey: `offer:${lead.id}:${product}:${buyer.id}:${attempt}`,
      rejectReason: null,
      audit: [],
      createdAt: this.clock.iso(),
      updatedAt: this.clock.iso(),
    };
    this.store.deliveries.set(delivery.id, delivery);
    this.addLedger({
      leadId: lead.id,
      buyerId: buyer.id,
      product,
      deliveryId: delivery.id,
      kind: 'revenue',
      recognition: 'unrecognized',
      status: 'open',
      amountCents: price,
      idempotencyKey: `revenue-unrecognized:${delivery.id}`,
    });
    const event = this.recordAudit(actor, 'delivery', delivery.id, isRetry ? 'retry_offered' : 'offered', {
      buyerId: buyer.id,
      product,
      priceCents: price,
      channel: 'sandbox_noop',
    });
    delivery.audit.push(event);
    return delivery;
  }

  private decideInside(
    actor: Actor,
    deliveryId: string,
    decision: 'accept' | 'reject',
    idempotencyKey: string,
  ): Result<{ delivery: Delivery; replayed: boolean }> {
    if (actor.kind === 'anonymous') return fail('denied', 'Sign-in is required.');
    if (!idempotencyKey.trim()) return fail('validation', 'An idempotency key is required.');
    const delivery = this.store.deliveries.get(deliveryId);
    if (!delivery) return fail('not_found', 'Delivery not found.');
    if (actor.kind === 'buyer' && actor.buyerId !== delivery.buyerId) {
      return fail('tenant_isolation', 'Not available in this account.');
    }
    const commandKey = `decide:${deliveryId}:${idempotencyKey}`;
    const prior = this.store.commands.get(commandKey) as { decision: 'accept' | 'reject' } | undefined;
    if (prior) {
      if (prior.decision !== decision) return fail('idempotency_conflict', 'This idempotency key was already used for a different decision.');
      return ok({ delivery: structuredClone(delivery), replayed: true });
    }
    if (delivery.state !== 'offered') return fail('illegal_transition', `Delivery is already ${delivery.state}.`);
    const buyer = this.store.buyers.get(delivery.buyerId);
    if (!buyer) return fail('not_found', 'Buyer not found.');
    if (decision === 'reject') {
      delivery.state = 'rejected';
      delivery.rejectReason = 'buyer_rejected';
      delivery.updatedAt = this.clock.iso();
      buyer.budgetRemainingCents += delivery.priceCents;
      this.supersedeOpenRevenue(delivery.id);
      const event = this.recordAudit(actor, 'delivery', delivery.id, 'rejected', { buyerId: buyer.id });
      delivery.audit.push(event);
      this.store.commands.set(commandKey, { decision });
      return ok({ delivery: structuredClone(delivery), replayed: false });
    }
    delivery.state = 'accepted';
    delivery.updatedAt = this.clock.iso();
    this.supersedeOpenRevenue(delivery.id);
    this.addLedger({
      leadId: delivery.leadId,
      buyerId: delivery.buyerId,
      product: delivery.product,
      deliveryId: delivery.id,
      kind: 'revenue',
      recognition: 'realized',
      status: 'open',
      amountCents: delivery.priceCents,
      idempotencyKey: `revenue-realized:${delivery.id}`,
    });
    this.realizeCogs(delivery.leadId);
    if (delivery.distribution === 'exclusive') {
      for (const other of this.openOffers(delivery.leadId, delivery.product)) {
        if (other.id === delivery.id) continue;
        const otherBuyer = this.store.buyers.get(other.buyerId);
        other.state = 'rejected';
        other.rejectReason = 'exclusive_conflict';
        other.updatedAt = this.clock.iso();
        if (otherBuyer) otherBuyer.budgetRemainingCents += other.priceCents;
        this.supersedeOpenRevenue(other.id);
      }
    }
    const event = this.recordAudit(actor, 'delivery', delivery.id, 'accepted', {
      buyerId: buyer.id,
      product: delivery.product,
      priceCents: delivery.priceCents,
    });
    delivery.audit.push(event);
    this.store.commands.set(commandKey, { decision });
    return ok({ delivery: structuredClone(delivery), replayed: false });
  }

  private realizeCogs(leadId: string) {
    const already = this.store.ledger.some((line) => line.leadId === leadId && line.kind === 'cogs' && line.recognition === 'realized' && line.status === 'open');
    if (already) return;
    const unrecognized = this.store.ledger.find(
      (line) => line.leadId === leadId && line.kind === 'cogs' && line.recognition === 'unrecognized' && line.status === 'open',
    );
    const amount = unrecognized?.amountCents ?? this.store.program.cogsPerLeadCents;
    if (unrecognized) unrecognized.status = 'superseded';
    this.addLedger({
      leadId,
      buyerId: null,
      product: null,
      deliveryId: null,
      kind: 'cogs',
      recognition: 'realized',
      status: 'open',
      amountCents: amount,
      idempotencyKey: `cogs-realized:${leadId}`,
    });
  }

  private supersedeOpenRevenue(deliveryId: string) {
    for (const line of this.store.ledger) {
      if (line.deliveryId === deliveryId && line.kind === 'revenue' && line.recognition === 'unrecognized' && line.status === 'open') {
        line.status = 'superseded';
      }
    }
  }

  private optOutInside(actor: Actor, lead: Lead) {
    lead.optedOut = true;
    lead.disposition = 'opted_out';
    let cancelled = 0;
    for (const message of this.store.messages) {
      if (message.leadId !== lead.id || TERMINAL_MESSAGE.has(message.status)) continue;
      message.status = 'cancelled_opt_out';
      cancelled += 1;
    }
    for (const delivery of this.store.deliveries.values()) {
      if (delivery.leadId !== lead.id || delivery.state !== 'offered') continue;
      const buyer = this.store.buyers.get(delivery.buyerId);
      delivery.state = 'rejected';
      delivery.rejectReason = 'opted_out';
      delivery.updatedAt = this.clock.iso();
      if (buyer) buyer.budgetRemainingCents += delivery.priceCents;
      this.supersedeOpenRevenue(delivery.id);
    }
    this.cancelStale(lead);
    this.recordAudit(actor, 'lead', lead.id, 'opted_out', { cancelled });
    return { leadId: lead.id, cancelled };
  }

  private cancelStale(lead: Lead) {
    for (const message of this.store.messages) {
      if (message.leadId !== lead.id || TERMINAL_MESSAGE.has(message.status)) continue;
      if (message.bookingGeneration !== lead.bookingGeneration || message.validForDisposition !== lead.disposition) {
        message.status = 'cancelled_stale';
      }
    }
  }

  private usage(buyerId: string, day: string) {
    return [...this.store.deliveries.values()].filter(
      (row) => row.buyerId === buyerId && row.reservedDay === day && (row.state === 'offered' || row.state === 'accepted'),
    ).length;
  }

  private openOffers(leadId: string, product: Product) {
    return this.productDeliveries(leadId, product).filter((row) => row.state === 'offered');
  }

  private productDeliveries(leadId: string, product: Product) {
    return [...this.store.deliveries.values()].filter((row) => row.leadId === leadId && row.product === product);
  }

  private finalizeRoute(result: RouteResult): Result<RouteResult> {
    if (result.offers.length > 0) return ok(result);
    const reasons = new Set(result.blocked.map((row) => row.reason));
    if (reasons.has('not_found')) return fail('not_found', 'Lead not found.');
    if (reasons.has('show_not_verified')) {
      return fail('show_not_verified', 'Verified-show delivery requires a completed qualified disposition. A booking does not realize show revenue.');
    }
    if (reasons.has('booking_required')) {
      return fail('booking_required', 'The booked product requires a booking disposition and is separate from per-lead.');
    }
    if (reasons.has('price_not_configured')) {
      return fail('price_not_configured', 'No explicit price is configured for this product and capital band. Band width is not a price.');
    }
    if (reasons.has('price_ambiguous')) return fail('price_ambiguous', 'More than one explicit price matches this product and band.');
    if (reasons.has('share_cap_not_configured')) {
      return fail('share_cap_not_configured', 'Shared routing requires an explicit share cap.');
    }
    if (reasons.has('opted_out')) return fail('opted_out', 'Contact is opted out.');
    return ok(result);
  }

  private routeSnapshot(leadId: string, product: Product, offers: Delivery[], blocked: RouteResult['blocked']): RouteResult {
    const accepted = this.productDeliveries(leadId, product).some((row) => row.state === 'accepted');
    return {
      leadId,
      product,
      state: offers.length > 0 ? 'offered' : accepted ? 'accepted' : 'idle',
      offers: structuredClone(offers),
      blocked,
    };
  }

  private addLedger(input: Omit<LedgerLine, 'id' | 'createdAt'>): LedgerLine {
    const existing = this.store.ledger.find((line) => line.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const line: LedgerLine = { ...input, id: this.nextId(), createdAt: this.clock.iso() };
    this.store.ledger.push(line);
    return line;
  }

  private recordAudit(
    actor: Actor,
    entityType: string,
    entityId: string,
    action: string,
    detail: Record<string, string | number | boolean | null>,
  ): AuditEvent {
    const event: AuditEvent = {
      id: this.nextId(),
      at: this.clock.iso(),
      actorKind: actor.kind,
      actorId: actor.kind === 'anonymous' ? 'anonymous' : actor.id,
      entityType,
      entityId,
      action,
      detail,
    };
    this.store.audit.push(event);
    return event;
  }

  private requireAdmin(actor: Actor): Result<never> | null {
    if (actor.kind !== 'platform_admin') return fail('denied', 'Platform admin is required.');
    return null;
  }
}

function normalizeUtm(utm: UtmAttribution): UtmAttribution {
  const clean = (value: string | null) => (value && value.trim() ? value.trim() : null);
  return {
    source: clean(utm.source),
    medium: clean(utm.medium),
    campaign: clean(utm.campaign),
    content: clean(utm.content),
    term: clean(utm.term),
    landingPath: clean(utm.landingPath),
    startFlag: Boolean(utm.startFlag),
  };
}

export type { Disposition };
