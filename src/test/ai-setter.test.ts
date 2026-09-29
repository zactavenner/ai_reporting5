import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyPreferences, classifyCreateFailure, dialBlockers, frontendPrompt, isStale, liveSipSessionBody,
  readinessFromEnv, saveBookingBlocker, validSipUrl, withinCallingWindow, zonedToUtc, utcToZoned, nextWeekdays,
  type DialContext,
} from '../../supabase/functions/_shared/aiSetter/core.ts';
import { resetDemo, executeTool } from '../../supabase/functions/_shared/aiSetter/store.ts';
import { computeKpis } from '@/components/ai-caller/aiCallerUtils';

const C = '11111111-1111-1111-1111-111111111111';
// A Tuesday, 15:00 UTC = 11:00 America/New_York.
const WORKDAY = new Date('2026-09-29T15:00:00Z');

function ctx(over: Partial<DialContext> = {}, lead: any = {}, settings: any = {}): DialContext {
  return {
    now: WORKDAY, clientId: C, hasActiveCall: false, hasConfirmedBooking: false,
    readiness: { openai: 'ready', sip: 'ready', outbound_sip_enabled: true },
    campaign: { active: true, client_id: C },
    settings: {
      outbound_enabled: true, caller_number: '+14155550100', caller_number_verified: true, allowed_countries: ['US'],
      call_window_start: 9, call_window_end: 19, max_attempts: 3, timezone: 'America/New_York', ...settings,
    },
    lead: {
      client_id: C, contact_phone: '+12125551234', timezone: 'America/New_York',
      consent_evidence: { source: 'web_form', captured_at: '2026-09-01T00:00:00Z' }, dnc: false, attempts: 0, is_demo: false, ...lead,
    },
    ...over,
  };
}

describe('dial gates', () => {
  it('allows a fully ready lead', () => expect(dialBlockers(ctx())).toEqual([]));
  it('requires consent evidence', () => expect(dialBlockers(ctx({}, { consent_evidence: null }))).toContain('no_consent'));
  it('blocks DNC', () => expect(dialBlockers(ctx({}, { dnc: true }))).toContain('dnc'));
  it('blocks outside calling hours', () => expect(dialBlockers(ctx({ now: new Date('2026-09-29T03:00:00Z') }))).toContain('outside_calling_hours'));
  it('blocks weekends', () => expect(withinCallingWindow('America/New_York', 9, 19, new Date('2026-10-03T15:00:00Z'))).toBe(false));
  it('enforces the attempt limit', () => expect(dialBlockers(ctx({}, { attempts: 3 }))).toContain('attempt_limit'));
  it('blocks inactive campaigns', () => expect(dialBlockers(ctx({ campaign: { active: false, client_id: C } }))).toContain('campaign_inactive'));
  it('blocks missing credentials', () => {
    const b = dialBlockers(ctx({ readiness: { openai: 'missing', sip: 'missing', outbound_sip_enabled: null } }));
    expect(b).toEqual(expect.arrayContaining(['openai_not_ready', 'sip_not_ready', 'outbound_sip_not_enabled']));
  });
  it('surfaces outbound_sip_not_enabled as a blocker', () => {
    expect(dialBlockers(ctx({ readiness: { openai: 'ready', sip: 'ready', outbound_sip_enabled: false } }))).toContain('outbound_sip_not_enabled');
  });
  it('denies cross-client leads', () => expect(dialBlockers(ctx({}, { client_id: '22222222-2222-2222-2222-222222222222' }))).toContain('cross_client'));
  it('never dials demo leads', () => expect(dialBlockers(ctx({}, { is_demo: true }))).toContain('demo_never_dials'));
  it('never dials fictional 555-01xx numbers', () => expect(dialBlockers(ctx({}, { contact_phone: '+12125550101' }))).toContain('demo_never_dials'));
  it('blocks when outbound is globally off', () => expect(dialBlockers(ctx({}, {}, { outbound_enabled: false }))).toContain('outbound_disabled'));
  it('blocks active call and existing booking', () => {
    expect(dialBlockers(ctx({ hasActiveCall: true, hasConfirmedBooking: true }))).toEqual(expect.arrayContaining(['active_call', 'already_booked']));
  });
  it('blocks an unverified caller number', () => expect(dialBlockers(ctx({}, {}, { caller_number_verified: false }))).toContain('caller_number_unverified'));
});

describe('readiness', () => {
  it('reports missing without revealing values', () => {
    const r = readinessFromEnv(() => undefined);
    expect(r.openai).toBe('missing');
    expect(r.sip).toBe('missing');
    expect(JSON.stringify(r)).not.toMatch(/sk-/);
  });
  it('requires sips:// URLs and rejects private hosts', () => {
    expect(validSipUrl('sips:sip.example.com:5061')).toBe(true);
    expect(validSipUrl('sip:sip.example.com')).toBe(false);
    expect(validSipUrl('sips:192.168.1.5')).toBe(false);
    expect(validSipUrl('sips:localhost')).toBe(false);
  });
  it('defaults models', () => {
    const r = readinessFromEnv(() => undefined);
    expect(r.realtime_model).toBe('gpt-realtime-2.1');
    expect(r.live_model).toBe('gpt-live-1');
  });
});

describe('call creation failure handling', () => {
  it('never retries ambiguous timeouts', () => {
    expect(classifyCreateFailure(null)).toMatchObject({ state: 'reconciliation_required', retry: false });
    expect(classifyCreateFailure(504)).toMatchObject({ state: 'reconciliation_required', retry: false });
    expect(classifyCreateFailure(502)).toMatchObject({ state: 'reconciliation_required', retry: false });
  });
  it('treats outbound_sip_not_enabled as a setup block', () => {
    expect(classifyCreateFailure(403, 'outbound_sip_not_enabled')).toMatchObject({ state: 'blocked', retry: false });
  });
  it('builds a Live SIP body with gpt-live-1 and Responses delegation', () => {
    const b = liveSipSessionBody({ model: 'gpt-live-1', responsesModel: 'gpt-6-luna', instructions: 'x', voice: 'marin', destination: '+12125551234', sip: { url: 'sips:a.b:5061', username: 'u', password: 'p', caller: '+14155550100' } });
    expect(b.session.model).toBe('gpt-live-1');
    expect(b.session.delegation.type).toBe('responses');
    expect(b.transport.type).toBe('sip');
    expect((b.session as any).audio.format).toBeUndefined();
  });
});

describe('revisions and confirmation gate', () => {
  const base = () => ({
    session: { id: 's1', client_id: C, status: 'active', task_revision: 2, preferences: { date: '2026-10-01', time: '10:00' },
      confirmation: { revision: 2, details: { contact_name: 'A', service_type: 'investor', date: '2026-10-01', time: '10:00', timezone: 'America/New_York' } } },
    clientId: C, sessionId: 's1', revision: 2, holdId: 'h1',
    hold: { id: 'h1', session_id: 's1', client_id: C, status: 'active', task_revision: 2, expires_at: new Date(Date.now() + 60e3).toISOString() },
    details: { contact_name: 'A', service_type: 'investor', date: '2026-10-01', time: '10:00', timezone: 'America/New_York' },
    confirmed_by_customer: true,
  });
  it('passes when everything matches', () => expect(saveBookingBlocker(base() as any)).toBeNull());
  it('rejects without customer confirmation', () => expect(saveBookingBlocker({ ...base(), confirmed_by_customer: false } as any)).toBe('not_confirmed'));
  it('rejects stale revisions', () => expect(saveBookingBlocker({ ...base(), revision: 1 } as any)).toBe('stale_revision'));
  it('rejects expired holds', () => {
    const b = base(); b.hold.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(saveBookingBlocker(b as any)).toBe('hold_expired');
  });
  it('rejects changed details after readback', () => {
    const b = base(); b.details = { ...b.details, time: '13:00' };
    expect(saveBookingBlocker(b as any)).toBe('details_changed');
  });
  it('rejects cross-client sessions', () => expect(saveBookingBlocker({ ...base(), clientId: 'other' } as any)).toBe('session_mismatch'));
  it('material preference change bumps revision and clears confirmation', () => {
    const r = applyPreferences({ time: '10:00' }, 3, { time: '13:00' });
    expect(r).toMatchObject({ revision: 4, changed: true, clearConfirmation: true });
    expect(applyPreferences({ time: '10:00' }, 3, { time: '10:00' }).revision).toBe(3);
  });
  it('isStale compares revisions', () => expect(isStale(1, 2)).toBe(true));
});

describe('prompt', () => {
  it('has the four required headings and forbids invented investment facts', () => {
    const p = frontendPrompt({ businessName: 'B', serviceType: 'investor', questions: ['Q1'], contactName: 'A', timezone: 'America/New_York' });
    for (const h of ['# Personality', '# Backchannel policy', '# Interruption policy', '# Delegation policy']) expect(p).toContain(h);
    expect(p).toMatch(/Never state investment returns/);
    expect(p).toMatch(/end_call with reason "dnc"/);
  });
});

describe('time helpers', () => {
  it('round-trips zoned times', () => {
    const iso = zonedToUtc('2026-10-01', '10:00', 'America/New_York');
    expect(utcToZoned(iso, 'America/New_York')).toEqual({ date: '2026-10-01', time: '10:00' });
  });
  it('gives seven weekdays', () => {
    const d = nextWeekdays(new Date('2026-10-02T12:00:00Z'), 7);
    expect(d).toHaveLength(7);
    expect(d.every((x) => ![0, 6].includes(new Date(x + 'T12:00:00Z').getUTCDay()))).toBe(true);
  });
});

// Minimal recording fake of the Supabase query builder.
function fakeSb(tables: Record<string, any[]> = {}) {
  const calls: { table: string; op: string; filters: [string, string, any][] }[] = [];
  const from = (table: string) => {
    const rec = { table, op: 'select', filters: [] as [string, string, any][], payload: null as any };
    const rows = () => (tables[table] || []).filter((r) => rec.filters.every(([k, f, v]) => f === 'eq' ? r[k] === v : true));
    const b: any = {
      select: () => b, order: () => b, limit: () => b, in: () => b, gt: () => b, lt: () => b, gte: () => b, lte: () => b, not: () => b,
      like: (k: string, v: any) => { rec.filters.push([k, 'like', v]); return b; },
      eq: (k: string, v: any) => { rec.filters.push([k, 'eq', v]); return b; },
      insert: (p: any) => { rec.op = 'insert'; rec.payload = p; calls.push(rec); return b; },
      update: (p: any) => { rec.op = 'update'; rec.payload = p; calls.push(rec); return b; },
      delete: () => { rec.op = 'delete'; calls.push(rec); return b; },
      maybeSingle: async () => {
        if (rec.op === 'insert') {
          const key = JSON.stringify([rec.payload.session_id, rec.payload.call_ref, rec.payload.tool_call_id]);
          const t = (tables[table] ||= []);
          if (table === 'ai_setter_tool_runs' && t.some((r) => r._k === key)) return { data: null, error: { code: '23505' } };
          const row = { id: `id${t.length}`, _k: key, ...rec.payload };
          t.push(row);
          return { data: row, error: null };
        }
        return { data: rows()[0] || null, error: null };
      },
      single: async () => b.maybeSingle(),
      then: (res: any) => res({ data: rows(), error: null }),
    };
    return b;
  };
  return { from, calls };
}

describe('demo reset isolation', () => {
  it('only deletes is_demo rows scoped to the client', async () => {
    const sb = fakeSb();
    await resetDemo(sb, C);
    const deletes = sb.calls.filter((c) => c.op === 'delete');
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(d.filters).toContainEqual(['client_id', 'eq', C]);
      if (d.table === 'phone_call_records') expect(d.filters.some(([k, f, v]) => k === 'contact_name' && f === 'like' && v === '%(DEMO)')).toBe(true);
      else expect(d.filters).toContainEqual(['is_demo', 'eq', true]);
    }
  });
});

describe('tool idempotency', () => {
  it('a duplicate tool event does not execute twice', async () => {
    const sb = fakeSb({
      ai_setter_sessions: [{ id: 's1', client_id: C, task_revision: 1, preferences: {}, is_demo: true, status: 'active' }],
      ai_setter_tool_runs: [],
    });
    const call = { sessionId: 's1', clientId: C, callRef: 'r', toolCallId: 't1', name: 'end_call', args: { reason: 'completed' } };
    await executeTool(sb, call);
    const second = await executeTool(sb, call);
    expect(second.status === 'duplicate' || second.status === 'ok').toBe(true);
    expect(sb.calls.filter((c) => c.table === 'ai_setter_tool_runs' && c.op === 'insert')).toHaveLength(2);
    expect((sb as any).calls.filter((c: any) => c.table === 'ai_setter_tool_runs' && c.op === 'update')).toHaveLength(1);
  });
  it('rejects cross-client tool calls', async () => {
    const sb = fakeSb({ ai_setter_sessions: [{ id: 's1', client_id: C, task_revision: 1, preferences: {}, is_demo: false }] });
    const r = await executeTool(sb, { sessionId: 's1', clientId: 'other', callRef: 'r', toolCallId: 't', name: 'end_call', args: {} });
    expect(r).toMatchObject({ status: 'error', error: 'session_not_found' });
  });
  it('old-revision booking tools return stale', async () => {
    const sb = fakeSb({ ai_setter_sessions: [{ id: 's1', client_id: C, task_revision: 3, preferences: {}, is_demo: true }], ai_setter_tool_runs: [] });
    const r = await executeTool(sb, { sessionId: 's1', clientId: C, callRef: 'r', toolCallId: 't9', name: 'save_booking', args: {}, revision: 2 });
    expect(r).toMatchObject({ status: 'skipped', reason: 'stale' });
  });
});

describe('browser session', () => {
  beforeEach(() => {
    (globalThis as any).document = { createElement: () => ({}) };
  });
  it('handles mic denied without opening a session', async () => {
    const { BrowserSetterSession } = await import('@/components/ai-caller/setter/browserSession');
    const states: string[] = [];
    const createPeer = vi.fn();
    const s = new BrowserSetterSession(C, { onState: (x) => states.push(x), onTranscript: () => {}, onTool: () => {}, onError: () => {} }, {
      getUserMedia: async () => { const e: any = new Error('no'); e.name = 'NotAllowedError'; throw e; }, createPeer,
    });
    await s.start('q1');
    expect(states).toEqual(['requesting_mic', 'mic_denied']);
    expect(createPeer).not.toHaveBeenCalled();
  });
  it('stops media tracks and closes the peer on end', async () => {
    const { BrowserSetterSession } = await import('@/components/ai-caller/setter/browserSession');
    const stop = vi.fn(); const pcClose = vi.fn(); const dcClose = vi.fn();
    const track = { stop, readyState: 'live' };
    const stream: any = { getTracks: () => [track] };
    const pc: any = {
      addTrack: vi.fn(), createDataChannel: () => ({ close: dcClose, send: vi.fn() }), close: pcClose,
      createOffer: async () => { throw new Error('offer failed'); }, setLocalDescription: vi.fn(),
    };
    const states: string[] = [];
    const s = new BrowserSetterSession(C, { onState: (x) => states.push(x), onTranscript: () => {}, onTool: () => {}, onError: () => {} }, {
      getUserMedia: async () => stream, createPeer: () => pc,
    });
    await s.start('q1');
    expect(stop).toHaveBeenCalled();
    expect(pcClose).toHaveBeenCalled();
    expect(dcClose).toHaveBeenCalled();
    expect(states).toContain('failed');
  });
});

describe('existing AI Caller analytics', () => {
  it('still computes KPIs', () => {
    const k = computeKpis([
      { call_status: 'completed', duration_seconds: 60, appointment_booked: true } as any,
      { call_status: 'no_answer', duration_seconds: 0 } as any,
    ]);
    expect(k.total).toBe(2);
    expect(k.answered).toBe(1);
    expect(k.booked).toBe(1);
  });
});
