import { describe, it, expect } from 'vitest';
import {
  canEnable, connectionState, decide, isPushTransport, sessionScope, hmacHex, mentionKey, parseMentions, routeMentions, signingString, verifyCallback, MAX_HOP,
} from '../../supabase/functions/_shared/externalAgents/core';

const agent = (o: Partial<any> = {}) => ({ id: 'a1', slug: 'claude', enabled: true, member_id: 'm1', transport: 'push_webhook' as const, mention_hourly_limit: 20, ...o });

describe('connection status', () => {
  it('pull access alone is "pull only", never ready', () => {
    const s = connectionState({ member_id: 'm', transport: 'pull_mcp', endpoint_url: null, oauth_user_id: 'u', last_test_ok: true }, false);
    expect(s).toBe('pull_only');
  });
  it('push without a successful test cannot be enabled', () => {
    const s = connectionState({ member_id: 'm', transport: 'push_webhook', endpoint_url: 'https://x.io', oauth_user_id: null, last_test_ok: null }, true);
    expect(s).toBe('not_tested');
    expect(canEnable(s)).toBe(false);
  });
  it('unlinked member is missing connection even with an endpoint', () => {
    expect(connectionState({ member_id: null, transport: 'push_webhook', endpoint_url: 'https://x.io', oauth_user_id: null, last_test_ok: true }, true)).toBe('missing_connection');
  });
});

describe('push delivery decisions', () => {
  it('requires accepted + run id', () => {
    expect(decide({ kind: 'response', status: 200, body: { accepted: true, run_id: 'r1' } }, 1, false)).toEqual({ status: 'accepted', runId: 'r1' });
    expect(decide({ kind: 'response', status: 200, body: { ok: true } }, 1, false).status).toBe('needs_review');
  });
  it('timeout without idempotency support is never blindly resent', () => {
    expect(decide({ kind: 'timeout' }, 1, false).status).toBe('needs_review');
    expect(decide({ kind: 'network', message: 'reset' }, 1, false).status).toBe('needs_review');
  });
  it('timeout with idempotency support retries with backoff, bounded', () => {
    const d = decide({ kind: 'timeout' }, 2, true, 5);
    expect(d).toMatchObject({ status: 'failed_retryable', nextInSeconds: 60 });
    expect(decide({ kind: 'timeout' }, 5, true, 5).status).toBe('failed');
  });
  it('4xx is permanent, 429/5xx retry', () => {
    expect(decide({ kind: 'response', status: 401, body: null }, 1, false).status).toBe('failed');
    expect(decide({ kind: 'response', status: 503, body: null }, 1, false).status).toBe('failed_retryable');
    expect(decide({ kind: 'response', status: 429, body: null }, 1, false).status).toBe('failed_retryable');
  });
});

describe('callback authentication', () => {
  const secret = 'x'.repeat(40);
  const now = 1_790_000_000;
  const nonce = 'abcdefghijklmnop1234';
  it('accepts a fresh correct signature', async () => {
    const body = '{"event":"accepted"}';
    const sig = await hmacHex(secret, signingString(String(now), nonce, body));
    expect((await verifyCallback(secret, { ts: String(now), nonce, sig }, body, now + 10)).ok).toBe(true);
  });
  it('rejects tampered body, wrong secret and stale replay', async () => {
    const body = '{"event":"accepted"}';
    const sig = await hmacHex(secret, signingString(String(now), nonce, body));
    expect(await verifyCallback(secret, { ts: String(now), nonce, sig }, '{"event":"completed"}', now)).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(await verifyCallback('y'.repeat(40), { ts: String(now), nonce, sig }, body, now)).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(await verifyCallback(secret, { ts: String(now), nonce, sig }, body, now + 301)).toMatchObject({ ok: false, reason: 'stale_timestamp' });
    expect(await verifyCallback(secret, { ts: null, nonce, sig }, body, now)).toMatchObject({ ok: false });
  });
});

describe('mention routing', () => {
  const agents = [agent(), agent({ id: 'a2', slug: 'muse' }), agent({ id: 'a3', slug: 'alfred', enabled: false })];
  it('parses mentions, ignoring emails', () => {
    expect(parseMentions('hey @Claude and @muse, mail zac@claude.com')).toEqual(['claude', 'muse']);
  });
  it('never wakes the sender', () => {
    const r = routeMentions({ body: '@claude @muse', senderAgentId: 'a1', hop: 1, agents, recentWakes: {} });
    expect(r.wake).toEqual(['a2']);
    expect(r.skipped).toContainEqual({ slug: 'claude', reason: 'self_mention' });
  });
  it('stops ping-pong at the hop limit', () => {
    const r = routeMentions({ body: '@muse', senderAgentId: 'a1', hop: MAX_HOP + 1, agents, recentWakes: {} });
    expect(r.wake).toEqual([]);
    expect(r.skipped[0].reason).toBe('hop_limit');
  });
  it('enforces the hourly cap and skips disabled agents', () => {
    const r = routeMentions({ body: '@muse @alfred', senderAgentId: null, hop: 0, agents, recentWakes: { a2: 20 } });
    expect(r.wake).toEqual([]);
    expect(r.skipped.map((s) => s.reason).sort()).toEqual(['not_connected', 'rate_limited']);
  });
  it('mention keys are stable per message and agent (duplicate routing collapses)', () => {
    expect(mentionKey('m1', 'a2')).toBe(mentionKey('m1', 'a2'));
  });
});

describe('local Mac worker and remote MCP', () => {
  const base = { member_id: 'm', endpoint_url: null, oauth_user_id: null };
  it('Mac worker stays disconnected until the end-to-end test passes', () => {
    expect(connectionState({ ...base, transport: 'local_worker', last_test_ok: null }, false)).toBe('missing_connection');
    expect(connectionState({ ...base, transport: 'local_worker', last_test_ok: null }, true)).toBe('not_tested');
    expect(connectionState({ ...base, transport: 'local_worker', last_test_ok: false }, true)).toBe('test_failed');
    expect(connectionState({ ...base, transport: 'local_worker', last_test_ok: true }, true)).toBe('ready');
  });
  it('remote MCP needs endpoint and tool name', () => {
    expect(connectionState({ ...base, transport: 'remote_mcp', endpoint_url: 'https://x.io', last_test_ok: true }, false)).toBe('missing_connection');
    expect(connectionState({ ...base, transport: 'remote_mcp', endpoint_url: 'https://x.io', mcp_tool_name: 'start_task', last_test_ok: true }, false)).toBe('ready');
  });
  it('only webhook/MCP are pushed; Mac worker waits for its own poll', () => {
    expect(isPushTransport('remote_mcp')).toBe(true);
    expect(isPushTransport('local_worker')).toBe(false);
  });
  it('one continuity session per task, one for team chat', () => {
    expect(sessionScope({ kind: 'assignment', task_id: 't1' })).toBe('task:t1');
    expect(sessionScope({ kind: 'mention', task_id: null })).toBe('team');
  });
});
