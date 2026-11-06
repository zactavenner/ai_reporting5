/**
 * Weekly Client Report — delivery planning + execution (pure, store/sender injected).
 *
 * Fail-closed: a client's batch sends only when EVERY check passes —
 * operator auth, armed flag, ledger installed, readiness gate, rendered PDF,
 * same-client approved recipients, and no unresolved send for that client/week.
 * One durable key per (client, week, recipient, channel); the claim is an
 * insert-if-absent against a unique index, so retries and concurrent workers
 * can't double-send. An ambiguous provider result is parked as `unknown` and
 * never auto-resent.
 */
import { liveDeliveryGate, sendKey, type ReadinessCheck } from './core.ts';
import { isApprovedWeeklyRecipient } from './model.ts';

export type LedgerStatus = 'claimed' | 'sending' | 'sent' | 'failed_retryable' | 'failed_permanent' | 'unknown';
export interface LedgerRow { delivery_key: string; client_id: string; week_start: string; status: LedgerStatus; attempts: number }
export interface RecipientFlags { id: string; client_id: string; active: boolean; unsubscribed_at: string | null; cadences: string[] | null; channels: string[] | null }

export const MAX_ATTEMPTS = 3;
const UNRESOLVED: LedgerStatus[] = ['claimed', 'sending', 'unknown'];

export interface PlanInput {
  clientId: string; weekStart: string; weekEnd: string;
  checks: ReadinessCheck[];
  recipients: RecipientFlags[];
  ledger: LedgerRow[] | null; // null = ledger table not installed
  authOk: boolean; armed: boolean; pdfOk: boolean;
}
export type DeliveryAction = 'send' | 'retry' | 'skip_already_sent' | 'blocked';
export interface PlannedDelivery { key: string; recipientId: string; channel: 'email'; action: DeliveryAction; attempts: number; reason?: string }
export interface DeliveryPlan { clientId: string; weekStart: string; weekEnd: string; blockers: string[]; deliveries: PlannedDelivery[] }

export function planClientDeliveries(i: PlanInput): DeliveryPlan {
  const blockers: string[] = [];
  if (!i.authOk) blockers.push('Operator authorization missing');
  for (const r of liveDeliveryGate(i.checks, i.armed).reasons) blockers.push(r);
  if (i.ledger === null) blockers.push('Delivery ledger not installed (staged migration not applied)');
  if (!i.pdfOk) blockers.push('PDF did not render');
  if (i.recipients.some((r) => r.client_id !== i.clientId)) blockers.push('Recipient from another client rejected');
  const approved = i.recipients.filter((r) => isApprovedWeeklyRecipient(r, i.clientId));
  if (!approved.length) blockers.push('No approved weekly email recipients');
  const ledger = (i.ledger || []).filter((l) => l.client_id === i.clientId && l.week_start === i.weekStart);
  if ((i.ledger || []).some((l) => l.client_id !== i.clientId)) blockers.push('Ledger rows from another client rejected');
  const unresolved = ledger.filter((l) => UNRESOLVED.includes(l.status));
  if (unresolved.length) blockers.push(`${unresolved.length} unresolved send(s) for this week need review`);

  const byKey = new Map(ledger.map((l) => [l.delivery_key, l]));
  const deliveries = approved.map<PlannedDelivery>((r) => {
    const key = sendKey(i.clientId, i.weekStart, r.id, 'email');
    const prior = byKey.get(key);
    const base = { key, recipientId: r.id, channel: 'email' as const, attempts: prior?.attempts ?? 0 };
    if (prior?.status === 'sent') return { ...base, action: 'skip_already_sent' };
    if (prior?.status === 'failed_permanent') return { ...base, action: 'blocked', reason: 'Permanently failed — needs review' };
    if (prior && prior.status === 'failed_retryable' && prior.attempts >= MAX_ATTEMPTS) return { ...base, action: 'blocked', reason: 'Retry limit reached' };
    if (prior && UNRESOLVED.includes(prior.status)) return { ...base, action: 'blocked', reason: `Unresolved (${prior.status})` };
    if (blockers.length) return { ...base, action: 'blocked', reason: 'Client batch blocked' };
    return { ...base, action: prior?.status === 'failed_retryable' ? 'retry' : 'send' };
  });
  return { clientId: i.clientId, weekStart: i.weekStart, weekEnd: i.weekEnd, blockers, deliveries };
}

export interface DeliveryStore {
  /** Atomic insert-if-absent (unique delivery_key). True only for the caller that created the row. */
  claimNew(row: { delivery_key: string; client_id: string; week_start: string; week_end: string; recipient_id: string; channel: 'email' }): Promise<boolean>;
  /** Compare-and-set: failed_retryable@attempts → claimed. */
  claimRetry(key: string, attempts: number): Promise<boolean>;
  mark(key: string, status: LedgerStatus, patch?: { provider_message_id?: string; last_error?: string; pdf_path?: string }): Promise<void>;
}
export type SendOutcome = { ok: true; messageId?: string; pdfPath?: string } | { ok: false; ambiguous: boolean; error: string };
export interface WeeklySender { send(d: PlannedDelivery, clientId: string): Promise<SendOutcome> }

export const disabledSender: WeeklySender = {
  send: async () => { throw new Error('Weekly report sender is disabled'); },
};

export async function executePlan(plan: DeliveryPlan, store: DeliveryStore, sender: WeeklySender) {
  const results: { key: string; result: string }[] = [];
  if (plan.blockers.length) return plan.deliveries.map((d) => ({ key: d.key, result: 'blocked' }));
  for (const d of plan.deliveries) {
    if (d.action !== 'send' && d.action !== 'retry') { results.push({ key: d.key, result: d.action }); continue; }
    const claimed = d.action === 'send'
      ? await store.claimNew({ delivery_key: d.key, client_id: plan.clientId, week_start: plan.weekStart, week_end: plan.weekEnd, recipient_id: d.recipientId, channel: 'email' })
      : await store.claimRetry(d.key, d.attempts);
    if (!claimed) { results.push({ key: d.key, result: 'skipped_concurrent' }); continue; }
    await store.mark(d.key, 'sending');
    let out: SendOutcome;
    try { out = await sender.send(d, plan.clientId); }
    catch (e) { out = { ok: false, ambiguous: false, error: String((e as Error)?.message || e) }; }
    if (out.ok) { await store.mark(d.key, 'sent', { provider_message_id: out.messageId, pdf_path: out.pdfPath }); results.push({ key: d.key, result: 'sent' }); }
    else if (out.ambiguous) { await store.mark(d.key, 'unknown', { last_error: out.error }); results.push({ key: d.key, result: 'unknown' }); }
    else {
      const final = d.attempts + 1 >= MAX_ATTEMPTS;
      await store.mark(d.key, final ? 'failed_permanent' : 'failed_retryable', { last_error: out.error });
      results.push({ key: d.key, result: final ? 'failed_permanent' : 'failed_retryable' });
    }
  }
  return results;
}
