/** Annuity module types. Amounts are integer cents. Nothing here is a live integration. */

export const PRODUCTION_SUPABASE_PROJECT_ID = 'jgwwmtuvjlmzapwqiabu';
export const DEFAULT_COGS_CENTS = 3700;
export const PER_LEAD_MIN_CENTS = 8000;
export const PER_LEAD_MAX_CENTS = 20000;

export type Product = 'per_lead' | 'booked' | 'verified_show';

export type Disposition =
  | 'not_fit'
  | 'unbooked'
  | 'booked'
  | 'confirmed'
  | 'completed_qualified'
  | 'completed_unqualified'
  | 'no_show'
  | 'rebooked'
  | 'canceled'
  | 'opted_out'
  | 'lost';

export type DeliveryState = 'offered' | 'accepted' | 'rejected';
export type RouteState = 'offered' | 'accepted' | 'retry_pending' | 'exhausted' | 'idle';
export type Distribution = 'exclusive' | 'shared';
export type VerificationStatus = 'unverified_candidate' | 'verified_configuration_only';

export type MessageStatus =
  | 'queued_suppressed'
  | 'held_quiet_hours'
  | 'held_configuration_incomplete'
  | 'cancelled_stale'
  | 'cancelled_opt_out';

export type FollowSequence = 'unbooked' | 'booked' | 'no_show';

export type ServiceErrorCode =
  | 'denied'
  | 'tenant_isolation'
  | 'not_found'
  | 'validation'
  | 'price_not_configured'
  | 'price_out_of_range'
  | 'price_ambiguous'
  | 'band_overlap'
  | 'consent_missing'
  | 'contact_invalid'
  | 'phone_country_not_configured'
  | 'share_cap_not_configured'
  | 'sends_disabled'
  | 'live_delivery_disabled'
  | 'show_not_verified'
  | 'booking_required'
  | 'exclusive_conflict'
  | 'illegal_transition'
  | 'idempotency_conflict'
  | 'qualification_rules_not_configured'
  | 'unresolved_inactive'
  | 'buyer_not_routable'
  | 'opted_out';

export interface ActorAdmin {
  kind: 'platform_admin';
  id: string;
}
export interface ActorBuyer {
  kind: 'buyer';
  id: string;
  buyerId: string;
}
export interface ActorAnonymous {
  kind: 'anonymous';
}
export type Actor = ActorAdmin | ActorBuyer | ActorAnonymous;

export interface UtmAttribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  landingPath: string | null;
  startFlag: boolean;
}

export interface ConsentEvidence {
  textVersion: string;
  capturedAt: string;
  purposes: Array<'contact' | 'automated_messages' | 'delivery_to_buyer'>;
  /** Optional client-supplied evidence handle. Not verified against a live vendor. */
  evidenceRef: string | null;
}

export interface CapitalBand {
  id: string;
  label: string;
  minCents: number;
  /** Exclusive upper bound. Null means no upper bound. */
  maxCents: number | null;
  routable: boolean;
  active: boolean;
}

export interface PriceMapping {
  id: string;
  product: Product;
  capitalBandId: string;
  amountCents: number;
  active: boolean;
}

export interface QuietHours {
  configured: boolean;
  timeZone: string | null;
  /** JavaScript weekday: 0 Sunday … 6 Saturday. */
  days: number[];
  startMinute: number | null;
  endMinute: number | null;
  appliesTo: FollowSequence[];
}

export interface QualificationRules {
  configured: boolean;
  requireCapitalConfirm: boolean;
  requireAgeBand: boolean;
  blockAdvisors: boolean;
  blockExistingClients: boolean;
}

export interface SequenceTemplate {
  templateKey: string;
  channel: 'sms' | 'email';
  offsetMinutes: number;
  sequence: FollowSequence;
}

export interface UnresolvedCommercial {
  brand: { status: 'unresolved'; selected: null; options: ['limitless', 'atlas'] };
  callFormat: { status: 'unresolved'; selected: null; options: ['phone', 'zoom'] };
  specialistRoster: { status: 'unconfigured'; licensedStates: [] };
  katieIdentity: { status: 'unresolved'; disclosure: null };
  blueprintDelivery: { status: 'inactive' };
  payoutIllustrations: { status: 'inactive'; reason: string };
}

export interface ProgramConfig {
  phoneDefaultCountry: 'US' | null;
  cogsPerLeadCents: number;
  shareCap: number | null;
  sendsEnabled: false;
  liveDeliveryEnabled: false;
  quietHours: QuietHours;
  qualification: QualificationRules;
  sequences: Record<FollowSequence, SequenceTemplate[]>;
  unresolved: UnresolvedCommercial;
  bands: CapitalBand[];
  prices: PriceMapping[];
}

export interface Buyer {
  id: string;
  name: string;
  verificationStatus: VerificationStatus;
  licensedStates: string[];
  capitalBandIds: string[];
  dailyCapacity: number;
  budgetRemainingCents: number;
  distribution: Distribution;
  deliveryEnabled: boolean;
  liveDeliveryEnabled: false;
  active: boolean;
}

export interface Lead {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  emailNormalized: string;
  phoneE164: string;
  state: string;
  capitalAmountCents: number;
  capitalBandId: string | null;
  fit: 'in_band' | 'not_fit';
  disposition: Disposition;
  utm: UtmAttribution;
  consent: ConsentEvidence;
  optedOut: boolean;
  bookingGeneration: number;
  existingClient: boolean;
  isAdvisor: boolean;
  stopToken: string;
  slotStart: string | null;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorKind: Actor['kind'];
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  detail: Record<string, string | number | boolean | null>;
}

export interface Delivery {
  id: string;
  leadId: string;
  buyerId: string;
  product: Product;
  state: DeliveryState;
  priceCents: number;
  attempt: number;
  distribution: Distribution;
  channel: 'sandbox_noop';
  reservedDay: string;
  idempotencyOfferKey: string;
  rejectReason: string | null;
  audit: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface LedgerLine {
  id: string;
  leadId: string;
  buyerId: string | null;
  product: Product | null;
  deliveryId: string | null;
  kind: 'revenue' | 'cogs' | 'refund';
  recognition: 'unrecognized' | 'realized';
  status: 'open' | 'superseded';
  amountCents: number;
  idempotencyKey: string;
  createdAt: string;
}

export interface FollowUpMessage {
  id: string;
  leadId: string;
  sequence: FollowSequence;
  templateKey: string;
  channel: 'sms' | 'email';
  validForDisposition: Disposition;
  bookingGeneration: number;
  scheduledAt: string;
  status: MessageStatus;
}

export interface RouteBlocked {
  buyerId: string;
  reason: string;
}

export interface RouteResult {
  leadId: string;
  product: Product;
  state: RouteState;
  offers: Delivery[];
  blocked: RouteBlocked[];
}

export interface PublicIntake {
  reference: string;
  duplicate: boolean;
  fit: 'in_band' | 'not_fit';
  next: 'received' | 'not_a_fit' | 'duplicate';
  stopToken: string;
}

export interface LedgerTotals {
  revenueCents: number;
  cogsCents: number;
  refundCents: number;
  contributionCents: number;
}

export interface LedgerReport {
  lines: LedgerLine[];
  /** Realized contribution is revenue − COGS − refunds. Unrecognized amounts are excluded. */
  realized: LedgerTotals;
  unrecognized: { revenueCents: number; cogsCents: number; refundCents: number };
  /** False for buyer-scoped reports, which do not include platform COGS. */
  cogsVisible: boolean;
}

export interface BuyerLeadView {
  id: string;
  state: string;
  capitalBandId: string | null;
  disposition: Disposition;
  fit: 'in_band' | 'not_fit';
}

export type Result<T> = { ok: true; value: T } | { ok: false; code: ServiceErrorCode; message: string };

export interface IntakeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  capitalAmountCents: number;
  utm: UtmAttribution;
  consent: ConsentEvidence | null;
  existingClient?: boolean;
  isAdvisor?: boolean;
}

export interface QualificationEvidence {
  capitalConfirmed: boolean;
  ageBand: string | null;
}

export interface ConfigureBatch {
  phoneDefaultCountry?: 'US' | null;
  cogsPerLeadCents?: number;
  shareCap?: number | null;
  quietHours?: QuietHours;
  qualification?: QualificationRules;
  sequences?: Partial<Record<FollowSequence, SequenceTemplate[]>>;
  bands?: CapitalBand[];
  prices?: Array<{ product: Product; capitalBandId: string; amountCents: number }>;
  buyers?: Array<Omit<Buyer, 'liveDeliveryEnabled' | 'active'> & { active?: boolean }>;
  sendsEnabled?: boolean;
  liveDeliveryEnabled?: boolean;
  activateUnresolved?: keyof UnresolvedCommercial;
}
