// Shared validation only. Authorization and source reads always run on the server.
export type Scope = 'agency_acquisition' | 'capital_raising';
export type Member = { id: string; name: string; role: string };
export type ClientSource = { id: string; name: string; status: string; meta_ad_account_id: string | null; meta_ad_account_ids: string[] | null; ghl_location_id: string | null };
export type OfferSource = { id: string; client_id: string; title: string; offer_type: string | null; status: string; meta_ad_account_id: string | null; ghl_location_id: string | null };
export type Sources = { client: ClientSource | null; offer: OfferSource | null; members: Member[] };

export const textFields = [
  'offer_id', 'primary_owner_id', 'backup_owner_id', 'deliverables', 'exclusions',
  'coverage_hours', 'timezone', 'qualification_definition', 'meta_ad_account_id',
  'ghl_location_id', 'currency', 'scope_evidence', 'claims_evidence', 'authority_evidence',
  'budget_evidence', 'account_evidence', 'account_verified_by', 'account_verified_at',
] as const;
export const numericFields = [
  'sales_capacity_weekly', 'qualification_lag_days', 'funding_lag_days',
  'target_cpql', 'daily_limit', 'monthly_limit', 'pilot_limit',
] as const;
export type TextField = typeof textFields[number];
export type NumericField = typeof numericFields[number];
export type PacketInput = Record<TextField, string> & Record<NumericField, number | null> & { issue_owners: Record<string, string> };
export type Blocker = { field: string; message: string; owner_id: string | null };
export class PilotError extends Error {
  constructor(message: string, public status = 400, public code = 'invalid_input') { super(message); }
}
export function emptyPacket(): PacketInput {
  return Object.fromEntries([...textFields.map(k => [k, '']), ...numericFields.map(k => [k, null]), ['issue_owners', {}]]) as PacketInput;
}
export function sanitizePacket(raw: unknown): PacketInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PilotError('Packet must be an object');
  const value = raw as Record<string, unknown>;
  const allowed = new Set<string>([...textFields, ...numericFields, 'issue_owners']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new PilotError(`Unknown packet field: ${key}`);
  const result = emptyPacket();
  for (const key of textFields) {
    const v = value[key] ?? '';
    if (typeof v !== 'string' || v.length > 10000) throw new PilotError(`Invalid ${key}`);
    result[key] = v.trim();
  }
  for (const key of numericFields) {
    const v = value[key];
    if (v === '' || v === undefined || v === null) { result[key] = null; continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1e9) throw new PilotError(`${key} must be a finite, non-negative number`);
    result[key] = v;
  }
  const owners = value.issue_owners ?? {};
  if (typeof owners !== 'object' || Array.isArray(owners) || owners === null) throw new PilotError('Invalid issue owners');
  for (const [field, id] of Object.entries(owners)) {
    if (!allowed.has(field) || typeof id !== 'string' || id.length > 100) throw new PilotError('Invalid issue owner');
    if (id) result.issue_owners[field] = id;
  }
  return result;
}
export function validateScope(scope: unknown): Scope {
  if (scope !== 'agency_acquisition' && scope !== 'capital_raising') throw new PilotError('Choose agency acquisition or capital raising');
  return scope;
}
const account = (s: string | null | undefined) => (s || '').trim().replace(/^act_/, '');
const evidence = (s: string) => { try { const url = new URL(s); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
export function readiness(scope: Scope, p: PacketInput, sources: Sources, now = Date.now()): Blocker[] {
  const blockers: Blocker[] = [];
  const memberIds = new Set(sources.members.map(m => m.id));
  const add = (field: string, message: string) => {
    const owner = p.issue_owners[field] || p.primary_owner_id;
    blockers.push({ field, message, owner_id: memberIds.has(owner) ? owner : null });
  };
  const { client, offer } = sources;
  if (!client || !['active', 'onboarding'].includes(client.status)) add('offer_id', 'Choose an active or onboarding client.');
  if (!offer || offer.id !== p.offer_id || offer.client_id !== client?.id) add('offer_id', 'Choose an offer belonging to this client.');
  if (offer && ['archived', 'cancelled', 'inactive'].includes(offer.status)) add('offer_id', 'The selected offer is inactive.');
  // The signed scope reference is required: names and industry labels do not authorize a workflow.
  for (const field of ['deliverables', 'exclusions', 'coverage_hours', 'qualification_definition'] as const)
    if (!p[field]) add(field, `Provide ${field.replaceAll('_', ' ')}.`);
  for (const field of ['primary_owner_id', 'backup_owner_id', 'account_verified_by'] as const)
    if (!memberIds.has(p[field])) add(field, `Select a current team member for ${field.replaceAll('_', ' ')}.`);
  if (p.primary_owner_id && p.primary_owner_id === p.backup_owner_id) add('backup_owner_id', 'Primary and backup must be different people.');
  for (const [field, id] of Object.entries(p.issue_owners)) if (!memberIds.has(id)) add(field, 'The assigned input owner is no longer on the team.');
  try { if (!p.timezone) throw new Error(); new Intl.DateTimeFormat('en-US', { timeZone: p.timezone }); }
  catch { add('timezone', 'Provide a valid IANA timezone, for example America/Los_Angeles.'); }
  if (!/^[A-Z]{3}$/.test(p.currency)) add('currency', 'Provide the approved three-letter budget currency.');
  for (const field of ['sales_capacity_weekly', 'target_cpql', 'daily_limit', 'monthly_limit', 'pilot_limit'] as const)
    if (p[field] === null || p[field]! <= 0) add(field, `Provide an approved positive ${field.replaceAll('_', ' ')}.`);
  for (const field of (scope === 'capital_raising' ? ['qualification_lag_days', 'funding_lag_days'] : ['qualification_lag_days']) as NumericField[])
    if (p[field] === null) add(field, `Provide ${field.replaceAll('_', ' ')}; enter 0 only if same-day is confirmed.`);
  if (scope === 'agency_acquisition' && p.funding_lag_days !== null) add('funding_lag_days', 'Funding lag belongs to the capital-raising scope. Clear it for agency acquisition.');
  if (p.daily_limit !== null && p.monthly_limit !== null && p.monthly_limit < p.daily_limit) add('monthly_limit', 'Monthly limit cannot be lower than one daily limit.');
  if (p.daily_limit !== null && p.pilot_limit !== null && p.pilot_limit < p.daily_limit) add('pilot_limit', 'Pilot limit cannot be lower than one daily limit.');
  for (const field of ['scope_evidence', 'claims_evidence', 'authority_evidence', 'budget_evidence', 'account_evidence'] as const)
    if (!evidence(p[field])) add(field, `Link the approved ${field.replace('_evidence', '')} evidence (HTTPS).`);
  const verifiedAt = Date.parse(p.account_verified_at);
  if (!Number.isFinite(verifiedAt) || verifiedAt > now) add('account_verified_at', 'Record when the account identity was checked; future dates are invalid.');
  const mappedAccounts = [client?.meta_ad_account_id, ...(client?.meta_ad_account_ids || [])].map(account).filter(Boolean);
  if (!account(p.meta_ad_account_id) || !mappedAccounts.includes(account(p.meta_ad_account_id))) add('meta_ad_account_id', 'Meta account must match this client’s saved account mapping.');
  if (offer?.meta_ad_account_id && account(offer.meta_ad_account_id) !== account(p.meta_ad_account_id)) add('meta_ad_account_id', 'Meta account conflicts with the selected offer.');
  if (!p.ghl_location_id || !client?.ghl_location_id || p.ghl_location_id !== client.ghl_location_id) add('ghl_location_id', 'GHL location must match this client’s saved location.');
  if (offer?.ghl_location_id && offer.ghl_location_id !== p.ghl_location_id) add('ghl_location_id', 'GHL location conflicts with the selected offer.');
  return blockers;
}
export function sourceSnapshot(sources: Sources, p: PacketInput) {
  const ids = new Set([p.primary_owner_id, p.backup_owner_id, p.account_verified_by, ...Object.values(p.issue_owners)]);
  return { client: sources.client, offer: sources.offer, members: sources.members.filter(m => ids.has(m.id)).sort((a, b) => a.id.localeCompare(b.id)) };
}
export function sameSnapshot(a: unknown, b: unknown): boolean {
  const stable = (v: unknown): string => v !== null && typeof v === 'object'
    ? Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
    : JSON.stringify(v);
  return stable(a) === stable(b);
}
