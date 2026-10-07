import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RULES, buildMetaPayload, dispatchGate, evaluateLead, idempotencyKey, outboxEligibility, runDispatch,
  validatePayload, validateRules, normPhone, sha256Hex, matchInputFromLead, disabledSender,
  type ClientCfg, type DispatchStore, type OutboxJob, type Sender, type QualityRules, type GlobalGate, type MilestoneResult,
} from '../../supabase/functions/_shared/qualityFeedback/core.ts';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-10-07T12:00:00Z');
const rules: QualityRules = { ...DEFAULT_RULES, qualified_dispositions: ['verified_qualified'] };
const lead = (o: any = {}) => ({ id: 'L1', client_id: A, name: 'Jane Doe', email: 'Jane@Acme.io', phone: '(415) 555-2671', created_at: '2026-10-01T10:00:00Z', ...o });
const qDisp = { id: 'D1', disposition: 'verified_qualified', disposed_at: '2026-10-03T10:00:00Z', source: 'ghl' };
const attended = { id: 'C1', booked_at: '2026-10-02T10:00:00Z', appointment_status: 'showed', showed: true, showed_at: '2026-10-05T15:00:00Z', attendance_source: 'meetgeek' };
const m = (rs: MilestoneResult[], k: string) => rs.find((r) => r.milestone === k)!;

const cfg = (o: Partial<ClientCfg> = {}): ClientCfg => ({
  client_id: A, mode: 'live', milestone: 'attended_qualified_call', meta_event_name: 'QualifiedCall', event_source: 'crm',
  destination_dataset_id: '123456', destination_verified: true, sharing_consent_status: 'documented', live_activated_at: '2026-10-04T00:00:00Z', ...o,
});

function memStore(jobs: OutboxJob[], g: GlobalGate, cfgs: Record<string, ClientCfg>, leadsByClient: Record<string, Record<string, any>>, evalHash = 'h') {
  const calls = { claims: 0 };
  const attempts: any[] = [];
  const store: DispatchStore = {
    async claim(limit) {
      calls.claims++;
      const due = jobs.filter((j) => ['pending', 'failed_retryable'].includes(j.status)).slice(0, limit);
      due.forEach((j) => (j.status = 'claimed')); // atomic in a single-threaded JS loop
      return due.map((j) => ({ ...j }));
    },
    async global() { return g; },
    async clientCfg(id) { return cfgs[id] ?? null; },
    async currentEval() { return { status: 'eligible', evidence_hash: evalHash }; },
    async match(leadId, clientId) { const l = leadsByClient[clientId]?.[leadId]; return l ? matchInputFromLead(l) : null; },
    async update(id, patch) { Object.assign(jobs.find((j) => j.id === id)!, patch); },
    async attempt(r) { attempts.push(r); },
  };
  return { store, calls, attempts };
}

function fakeSender(status = 200, body: any = { events_received: 1, fbtrace_id: 'x' }) {
  const sent: any[] = [];
  const s: Sender = { installed: true, async send(ds, clientId, events) { sent.push({ ds, clientId, events }); return { httpStatus: status, body }; } };
  return { s, sent };
}

const job = (o: Partial<OutboxJob> = {}): OutboxJob => ({
  id: 'J1', client_id: A, lead_id: 'L1', milestone: 'attended_qualified_call', occurrence_ref: 'a:C1', idempotency_key: 'qf_x',
  meta_event_name: 'QualifiedCall', event_time: '2026-10-05T15:00:00Z', destination_dataset_id: '123456', evidence_hash: 'h', status: 'pending', attempts: 0, is_test: false, ...o,
});

describe('verified qualification evaluator', () => {
  it('booking, no-show, AI score and missing evidence never imply qualification', () => {
    const rs = evaluateLead(rules, lead({ quality_score: 10 }), [], [{ id: 'C1', booked_at: '2026-10-02T00:00:00Z', appointment_status: 'no_show', showed: false }], []);
    for (const k of ['verified_qualified_lead', 'verified_qualified_booking', 'attended_qualified_call']) expect(m(rs, k).status).not.toBe('eligible');
    expect(m(rs, 'verified_qualified_lead').reasons.join(' ')).toMatch(/score is not qualification evidence/);
  });
  it('no rules configured => needs review, not qualified', () => {
    const rs = evaluateLead(null, lead(), [qDisp], [attended], []);
    expect(m(rs, 'verified_qualified_lead').status).toBe('needs_review');
  });
  it('current disposition without a source record => needs review', () => {
    const rs = evaluateLead(rules, lead({ current_disposition: 'verified_qualified' }), [], [], []);
    expect(m(rs, 'verified_qualified_lead').status).toBe('withheld');
    expect(m(rs, 'verified_qualified_lead').reasons.join(' ')).toMatch(/no disposition history/);
  });
  it('qualified + attended => eligible at the actual milestone time', () => {
    const rs = evaluateLead(rules, lead(), [qDisp], [attended], []);
    expect(m(rs, 'verified_qualified_lead').occurred_at).toBe('2026-10-03T10:00:00.000Z');
    expect(m(rs, 'attended_qualified_call').status).toBe('eligible');
    expect(m(rs, 'attended_qualified_call').occurred_at).toBe('2026-10-05T15:00:00.000Z');
  });
  it('attendance without source, spam, test, invalid contact, disqualified are excluded/held', () => {
    expect(m(evaluateLead(rules, lead(), [qDisp], [{ ...attended, attendance_source: null }], []), 'attended_qualified_call').status).toBe('needs_review');
    expect(m(evaluateLead(rules, lead({ is_spam: true }), [qDisp], [attended], []), 'attended_qualified_call').status).toBe('excluded');
    expect(m(evaluateLead(rules, lead({ email: 'test@x.io' }), [qDisp], [attended], []), 'verified_qualified_lead').status).toBe('excluded');
    expect(m(evaluateLead(rules, lead({ email: '', phone: '12' }), [qDisp], [attended], []), 'verified_qualified_lead').status).toBe('excluded');
    expect(m(evaluateLead(rules, lead({ current_disposition: 'not_accredited' }), [qDisp], [attended], []), 'verified_qualified_lead').status).toBe('excluded');
    expect(m(evaluateLead(rules, lead({ custom_fields: { duplicate_of: 'L0' } }), [qDisp], [attended], []), 'verified_qualified_lead').status).toBe('excluded');
  });
  it('rejects rules that both qualify and disqualify a disposition', () => {
    expect(validateRules({ qualified_dispositions: ['spam'] }).ok).toBe(false);
  });
});

describe('payload allowlist + matching', () => {
  it('hashes normalized email/phone, keeps original time, excludes sensitive fields', async () => {
    const l = lead({ custom_fields: { net_worth: '5M', accredited: 'yes', fbclid: 'abc', investment_amount: 100000 } });
    const { event } = await buildMetaPayload({ eventName: 'QualifiedCall', eventTime: '2026-10-05T15:00:00Z', eventId: 'qf_1', source: 'crm', match: matchInputFromLead(l) });
    expect(event.user_data.em[0]).toBe(await sha256Hex('jane@acme.io'));
    expect(event.user_data.ph[0]).toBe(await sha256Hex('14155552671'));
    expect(event.event_time).toBe(Math.floor(Date.parse('2026-10-05T15:00:00Z') / 1000));
    expect(event.user_data.fbc).toBeUndefined(); // never synthesized from fbclid
    const s = JSON.stringify(event);
    for (const bad of ['5M', 'accredited', 'net_worth', '100000', 'investment']) expect(s).not.toContain(bad);
    expect(validatePayload(event, NOW)).toEqual([]);
    expect(validatePayload({ ...event, custom_data: { value: 100000 } }, NOW).join()).toMatch(/not allowed/);
  });
  it('old milestones are refused, not re-timed', async () => {
    const { event } = await buildMetaPayload({ eventName: 'QualifiedCall', eventTime: '2026-09-01T00:00:00Z', eventId: 'x', source: 'crm', match: { email: 'a@b.co' } });
    expect(validatePayload(event, NOW).join()).toMatch(/too old/);
  });
  it('phone normalization', () => { expect(normPhone('415-555-2671')).toBe('14155552671'); expect(normPhone('123')).toBeNull(); });
});

describe('idempotency + replay safety', () => {
  it('same occurrence => same key regardless of rule version; different milestone => different key', async () => {
    const base = { clientId: A, leadId: 'L1', milestone: 'attended_qualified_call' as const, occurrenceRef: 'a:C1', datasetId: '1', eventName: 'E' };
    expect(await idempotencyKey(base)).toBe(await idempotencyKey({ ...base }));
    expect(await idempotencyKey(base)).not.toBe(await idempotencyKey({ ...base, milestone: 'verified_qualified_lead', occurrenceRef: 'q:x' }));
  });
  it('preview, simulation, and pre-activation occurrences never enter the outbox', () => {
    const r = m(evaluateLead(rules, lead(), [qDisp], [attended], []), 'attended_qualified_call');
    expect(outboxEligibility(cfg(), r, 'preview')).toBeTruthy();
    expect(outboxEligibility(cfg(), r, 'simulation')).toBeTruthy();
    expect(outboxEligibility(cfg({ live_activated_at: '2026-10-06T00:00:00Z' }), r, 'live')).toMatch(/before activation/);
    expect(outboxEligibility(cfg({ mode: 'preview' }), r, 'live')).toBeTruthy();
    expect(outboxEligibility(cfg(), r, 'live')).toBeNull();
    const f = m(evaluateLead(rules, lead(), [qDisp], [attended], [{ id: 'F', funded_at: '2026-10-06T00:00:00Z', is_verified_funded: true }]), 'verified_funded');
    expect(outboxEligibility(cfg({ milestone: 'verified_funded' as any }), f, 'live')).toBeTruthy();
  });
  it('concurrent workers claim each job once', async () => {
    const jobs = [job()];
    const { store } = memStore(jobs, { live_enabled: true, emergency_stop: false }, { [A]: cfg() }, { [A]: { L1: lead() } });
    const { s, sent } = fakeSender();
    await Promise.all([runDispatch(store, s, NOW), runDispatch(store, s, NOW), runDispatch(store, s, NOW)]);
    expect(sent.length).toBe(1);
    expect(jobs[0].status).toBe('accepted');
  });
});

describe('gates', () => {
  const leads = { [A]: { L1: lead() } };
  it('global disabled / emergency stop => zero sender calls and no claims', async () => {
    for (const g of [{ live_enabled: false, emergency_stop: false }, { live_enabled: true, emergency_stop: true }]) {
      const jobs = [job(), job({ id: 'J2', status: 'failed_retryable', attempts: 2 })];
      const { store, calls } = memStore(jobs, g, { [A]: cfg() }, leads);
      const { s, sent } = fakeSender();
      await runDispatch(store, s, NOW);
      expect(sent.length).toBe(0); expect(calls.claims).toBe(0);
    }
  });
  it('Off/Preview/paused client => held, zero sends (including retries)', async () => {
    for (const mode of ['off', 'preview'] as const) {
      const jobs = [job(), job({ id: 'J2', status: 'failed_retryable', attempts: 3 })];
      const { store } = memStore(jobs, { live_enabled: true, emergency_stop: false }, { [A]: cfg({ mode }) }, leads);
      const { s, sent } = fakeSender();
      await runDispatch(store, s, NOW);
      expect(sent.length).toBe(0);
      expect(jobs.every((j) => j.status === 'held')).toBe(true);
    }
  });
  it('disabled sender (this build) never performs I/O', async () => {
    const jobs = [job()];
    const { store } = memStore(jobs, { live_enabled: true, emergency_stop: false }, { [A]: cfg() }, leads);
    await runDispatch(store, disabledSender, NOW);
    expect(jobs[0].status).toBe('held'); expect(jobs[0]).toMatchObject({ hold_reason: 'Live sender not installed' });
  });
  it('dispatches only the correctly scoped client', async () => {
    const jobs = [job(), job({ id: 'J2', client_id: B, lead_id: 'L9' })];
    const { store } = memStore(jobs, { live_enabled: true, emergency_stop: false }, { [A]: cfg(), [B]: cfg({ client_id: B, mode: 'off' }) }, leads);
    const { s, sent } = fakeSender();
    await runDispatch(store, s, NOW);
    expect(sent.map((x) => x.clientId)).toEqual([A]);
    expect(jobs[1].status).toBe('held');
  });
  it('cross-client config/lead lookups fail closed', () => {
    expect(dispatchGate({ live_enabled: true, emergency_stop: false }, cfg({ client_id: B }), job(), { status: 'eligible', evidence_hash: 'h' }, true).action).toBe('hold');
  });
  it('mapping, destination, consent and evidence changes hold jobs', () => {
    const g = { live_enabled: true, emergency_stop: false }, cur = { status: 'eligible' as const, evidence_hash: 'h' };
    expect(dispatchGate(g, cfg({ destination_dataset_id: '999' }), job(), cur, true).action).toBe('hold');
    expect(dispatchGate(g, cfg({ meta_event_name: 'Other' }), job(), cur, true).action).toBe('hold');
    expect(dispatchGate(g, cfg({ sharing_consent_status: 'unknown' }), job(), cur, true).action).toBe('hold');
    expect(dispatchGate(g, cfg(), job(), { status: 'eligible', evidence_hash: 'changed' }, true).action).toBe('hold');
    expect(dispatchGate(g, cfg(), job(), { status: 'withheld', evidence_hash: 'h' }, true).action).toBe('hold');
    expect(dispatchGate(g, cfg(), job(), cur, true).action).toBe('send');
  });
  it('transient failures retry with backoff; permanent failures are retained', async () => {
    const jobs = [job()];
    const { store, attempts } = memStore(jobs, { live_enabled: true, emergency_stop: false }, { [A]: cfg() }, leads);
    await runDispatch(store, fakeSender(503, { error: { message: 'busy access_token=SECRET' } }).s, NOW);
    expect(jobs[0].status).toBe('failed_retryable');
    expect(JSON.stringify(attempts)).not.toContain('SECRET');
    jobs[0].status = 'pending';
    await runDispatch(store, fakeSender(400, { error: { message: 'bad' } }).s, NOW);
    expect(jobs[0].status).toBe('failed_permanent');
  });
});
