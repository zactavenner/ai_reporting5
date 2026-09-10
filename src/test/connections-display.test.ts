import { describe, expect, it, vi } from 'vitest';
import {
  archivedOffers,
  countVisibleOffers,
  resolveConnectionStatusView,
  sanitizeConnectionError,
  visibleOffers,
  withTimeout,
} from '@/lib/connectionsDisplay';

describe('offer counting (chip must match the panel)', () => {
  const offers = [
    { id: '1', status: 'active' },
    { id: '2', status: 'paused' },
    { id: '3', status: null },
    { id: '4', status: undefined },
    { id: '5', status: 'archived' },
  ];

  it('counts the same records the panel renders, including legacy rows', () => {
    expect(countVisibleOffers(offers)).toBe(4);
    expect(visibleOffers(offers).map((o) => o.id)).toEqual(['1', '2', '3', '4']);
    expect(archivedOffers(offers).map((o) => o.id)).toEqual(['5']);
  });

  it('regression: a single legacy offer with no status is never counted as zero', () => {
    expect(countVisibleOffers([{ status: null }])).toBe(1);
    expect(countVisibleOffers([{}])).toBe(1);
    expect(countVisibleOffers([{ status: 'paused' }])).toBe(1);
  });

  it('handles empty and missing input', () => {
    expect(countVisibleOffers([])).toBe(0);
    expect(countVisibleOffers(undefined as any)).toBe(0);
  });
});

describe('connection status always terminates', () => {
  const base = { canEdit: true, hasData: false, isPending: false, isError: false };

  it('shows the unauthorized state when no operator session exists', () => {
    expect(resolveConnectionStatusView({ ...base, canEdit: false }).kind).toBe('unauthorized');
  });

  it('shows loaded as soon as data arrives', () => {
    expect(resolveConnectionStatusView({ ...base, hasData: true, isPending: true }).kind).toBe('loaded');
  });

  it('spins only while genuinely pending', () => {
    expect(resolveConnectionStatusView({ ...base, isPending: true }).kind).toBe('loading');
  });

  it('turns a timeout into unavailable, not an endless spinner', () => {
    expect(resolveConnectionStatusView({ ...base, isPending: true, timedOut: true }).kind).toBe('unavailable');
    expect(
      resolveConnectionStatusView({ ...base, isError: true, error: new Error('Connection status request timed out') }).kind,
    ).toBe('unavailable');
  });

  it('maps auth failures to unauthorized', () => {
    expect(resolveConnectionStatusView({ ...base, isError: true, error: new Error('401 unauthorized') }).kind).toBe(
      'unauthorized',
    );
  });

  it('never leaves a settled query without a terminal state', () => {
    expect(resolveConnectionStatusView({ ...base }).kind).toBe('unavailable');
    expect(resolveConnectionStatusView({ ...base, isError: true, error: new Error('edge function boom') })).toEqual({
      kind: 'error',
      message: 'edge function boom',
    });
  });
});

describe('error sanitizing', () => {
  it('redacts credential-shaped values and caps length', () => {
    const msg = sanitizeConnectionError(new Error('failed with token EAAB1234567890abcdefghijklmnop'));
    expect(msg).not.toContain('EAAB1234567890abcdefghijklmnop');
    expect(msg).toContain('[redacted]');
    expect(sanitizeConnectionError(new Error('x'.repeat(400))).length).toBeLessThanOrEqual(200);
  });

  it('falls back to a safe message', () => {
    expect(sanitizeConnectionError(undefined)).toBe('Connection status could not be loaded.');
  });
});

describe('withTimeout', () => {
  it('rejects a hung request', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 100);
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    vi.useRealTimers();
  });

  it('passes a resolved value through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
});
