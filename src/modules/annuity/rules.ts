import {
  DEFAULT_COGS_CENTS,
  PER_LEAD_MAX_CENTS,
  PER_LEAD_MIN_CENTS,
  type Buyer,
  type CapitalBand,
  type FollowSequence,
  type LedgerLine,
  type LedgerReport,
  type PriceMapping,
  type Product,
  type ProgramConfig,
  type QuietHours,
  type ServiceErrorCode,
  type UnresolvedCommercial,
  type UtmAttribution,
} from './types';

export function fail(code: ServiceErrorCode, message: string) {
  return { ok: false as const, code, message };
}

export function ok<T>(value: T) {
  return { ok: true as const, value };
}

export function emptyUnresolved(): UnresolvedCommercial {
  return {
    brand: { status: 'unresolved', selected: null, options: ['limitless', 'atlas'] },
    callFormat: { status: 'unresolved', selected: null, options: ['phone', 'zoom'] },
    specialistRoster: { status: 'unconfigured', licensedStates: [] },
    katieIdentity: { status: 'unresolved', disclosure: null },
    blueprintDelivery: { status: 'inactive' },
    payoutIllustrations: {
      status: 'inactive',
      reason: 'Dated carrier illustrations and compliance sign-off are not on file. Do not display payout rates.',
    },
  };
}

export function emptyProgram(): ProgramConfig {
  return {
    phoneDefaultCountry: null,
    cogsPerLeadCents: DEFAULT_COGS_CENTS,
    shareCap: null,
    sendsEnabled: false,
    liveDeliveryEnabled: false,
    quietHours: {
      configured: false,
      timeZone: null,
      days: [],
      startMinute: null,
      endMinute: null,
      appliesTo: [],
    },
    qualification: {
      configured: false,
      requireCapitalConfirm: true,
      requireAgeBand: true,
      blockAdvisors: true,
      blockExistingClients: true,
    },
    sequences: { unbooked: [], booked: [], no_show: [] },
    unresolved: emptyUnresolved(),
    bands: [],
    prices: [],
  };
}

export function emptyUtm(partial?: Partial<UtmAttribution>): UtmAttribution {
  return {
    source: partial?.source ?? null,
    medium: partial?.medium ?? null,
    campaign: partial?.campaign ?? null,
    content: partial?.content ?? null,
    term: partial?.term ?? null,
    landingPath: partial?.landingPath ?? null,
    startFlag: partial?.startFlag ?? false,
  };
}

export function parseUtmSearch(search: string, landingPath: string | null = null): UtmAttribution {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const text = (key: string) => {
    const value = params.get(key);
    return value && value.trim() ? value.trim() : null;
  };
  return {
    source: text('utm_source'),
    medium: text('utm_medium'),
    campaign: text('utm_campaign'),
    content: text('utm_content'),
    term: text('utm_term'),
    landingPath,
    startFlag: params.get('start') === '1',
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value)) return null;
  return value;
}

export function normalizeState(state: string): string | null {
  const value = state.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return null;
  return value;
}

/** US normalization runs only when the program explicitly selects US. No other country is guessed. */
export function normalizePhone(phone: string, country: ProgramConfig['phoneDefaultCountry']): { ok: true; e164: string } | { ok: false; code: ServiceErrorCode } {
  if (!country) return { ok: false, code: 'phone_country_not_configured' };
  const digits = phone.replace(/\D/g, '');
  let national = digits;
  if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
  if (national.length !== 10) return { ok: false, code: 'contact_invalid' };
  return { ok: true, e164: `+1${national}` };
}

export function consentIsComplete(consent: { textVersion?: string; capturedAt?: string; purposes?: string[] } | null): boolean {
  if (!consent) return false;
  if (!consent.textVersion || !consent.textVersion.trim()) return false;
  if (!consent.capturedAt) return false;
  const purposes = new Set(consent.purposes ?? []);
  return purposes.has('contact') && purposes.has('delivery_to_buyer');
}

export function classifyBand(bands: CapitalBand[], amountCents: number): { band: CapitalBand | null; overlap: boolean } {
  const hits = bands.filter(
    (band) => band.active && amountCents >= band.minCents && (band.maxCents === null || amountCents < band.maxCents),
  );
  if (hits.length > 1) return { band: null, overlap: true };
  return { band: hits[0] ?? null, overlap: false };
}

export function bandsOverlap(bands: CapitalBand[]): boolean {
  const active = bands.filter((band) => band.active);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      const aMax = a.maxCents ?? Number.POSITIVE_INFINITY;
      const bMax = b.maxCents ?? Number.POSITIVE_INFINITY;
      if (a.minCents < bMax && b.minCents < aMax) return true;
    }
  }
  return false;
}

export function validatePriceAmount(product: Product, amountCents: number): ServiceErrorCode | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'validation';
  if (product === 'per_lead' && (amountCents < PER_LEAD_MIN_CENTS || amountCents > PER_LEAD_MAX_CENTS)) {
    return 'price_out_of_range';
  }
  return null;
}

/** Price exists only when an admin saved an explicit product+band row. Bands do not imply a price. */
export function resolveExplicitPrice(prices: PriceMapping[], product: Product, bandId: string): { price: PriceMapping | null; code?: ServiceErrorCode } {
  const matches = prices.filter((row) => row.active && row.product === product && row.capitalBandId === bandId);
  if (matches.length > 1) return { price: null, code: 'price_ambiguous' };
  if (matches.length === 0) return { price: null, code: 'price_not_configured' };
  return { price: matches[0] };
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(iso: string, timeZone: string): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  let hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
  if (hour === 24) hour = 0;
  return { day: WEEKDAY[weekday.slice(0, 3)] ?? 0, minutes: hour * 60 + minute };
}

export function withinQuietHours(iso: string, quiet: QuietHours): boolean | null {
  if (!quiet.configured || !quiet.timeZone || quiet.startMinute === null || quiet.endMinute === null) return null;
  const parts = zonedParts(iso, quiet.timeZone);
  if (!quiet.days.includes(parts.day)) return false;
  return parts.minutes >= quiet.startMinute && parts.minutes < quiet.endMinute;
}

export function messageStatusForSchedule(quiet: QuietHours, sequence: FollowSequence, scheduledAt: string): 'queued_suppressed' | 'held_quiet_hours' | 'held_configuration_incomplete' {
  if (!quiet.configured) return 'held_configuration_incomplete';
  if (!quiet.appliesTo.includes(sequence)) return 'queued_suppressed';
  const inside = withinQuietHours(scheduledAt, quiet);
  if (inside === null) return 'held_configuration_incomplete';
  if (!inside) return 'held_quiet_hours';
  return 'queued_suppressed';
}

export function buyerRoutable(buyer: Buyer): { ok: true } | { ok: false; reason: string } {
  if (buyer.verificationStatus !== 'verified_configuration_only') return { ok: false, reason: 'unverified_candidate' };
  if (!buyer.active || !buyer.deliveryEnabled) return { ok: false, reason: 'delivery_disabled' };
  if (buyer.liveDeliveryEnabled !== false) return { ok: false, reason: 'live_delivery_disabled' };
  if (buyer.licensedStates.length === 0) return { ok: false, reason: 'licensed_states_not_configured' };
  if (buyer.capitalBandIds.length === 0) return { ok: false, reason: 'capital_filter_not_configured' };
  if (!Number.isInteger(buyer.dailyCapacity) || buyer.dailyCapacity < 0) return { ok: false, reason: 'capacity_not_configured' };
  if (!Number.isInteger(buyer.budgetRemainingCents) || buyer.budgetRemainingCents < 0) return { ok: false, reason: 'budget_not_configured' };
  return { ok: true };
}

export function summarizeLedger(lines: LedgerLine[]): Pick<LedgerReport, 'realized' | 'unrecognized'> {
  const realized = { revenueCents: 0, cogsCents: 0, refundCents: 0, contributionCents: 0 };
  const unrecognized = { revenueCents: 0, cogsCents: 0, refundCents: 0 };
  for (const line of lines) {
    if (line.status !== 'open') continue;
    if (line.recognition === 'realized') {
      if (line.kind === 'revenue') realized.revenueCents += line.amountCents;
      if (line.kind === 'cogs') realized.cogsCents += line.amountCents;
      if (line.kind === 'refund') realized.refundCents += line.amountCents;
    } else {
      if (line.kind === 'revenue') unrecognized.revenueCents += line.amountCents;
      if (line.kind === 'cogs') unrecognized.cogsCents += line.amountCents;
      if (line.kind === 'refund') unrecognized.refundCents += line.amountCents;
    }
  }
  realized.contributionCents = realized.revenueCents - realized.cogsCents - realized.refundCents;
  return { realized, unrecognized };
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}
