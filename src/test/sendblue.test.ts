import { describe, it, expect } from 'vitest';
import {
  buildInternalComment,
  channelFromService,
  credentialsFor,
  isOptOutMessage,
  mapProviderStatus,
  maskSecret,
  mirrorMarker,
  normalizeE164,
  normalizeWebhookEvent,
  sendGuard,
  shouldRetryMirror,
  verifyWebhookSignature,
} from '../../supabase/functions/_shared/sendblue.ts';

describe('phone normalization', () => {
  it('accepts US 10 and 11 digit forms', () => {
    expect(normalizeE164('(555) 123-4567')).toBe('+15551234567');
    expect(normalizeE164('15551234567')).toBe('+15551234567');
    expect(normalizeE164('+1 555 123 4567')).toBe('+15551234567');
  });
  it('rejects unusable input', () => {
    expect(normalizeE164('')).toBeNull();
    expect(normalizeE164('12345')).toBeNull();
    expect(normalizeE164(null)).toBeNull();
    expect(normalizeE164('+123')).toBeNull();
  });
});

describe('opt-out detection', () => {
  it('catches keywords and short phrases', () => {
    expect(isOptOutMessage('STOP')).toBe(true);
    expect(isOptOutMessage('stop please')).toBe(true);
    expect(isOptOutMessage('unsubscribe')).toBe(true);
    expect(isOptOutMessage('opt out')).toBe(true);
  });
  it('does not treat prose as an opt-out', () => {
    expect(isOptOutMessage('please stop by the office tomorrow at noon')).toBe(false);
    expect(isOptOutMessage('')).toBe(false);
  });
});

describe('send guard', () => {
  const connected = { plan_type: 'inbound_only', status: 'connected', active: true };
  it('refuses when there is no line', () => {
    expect(sendGuard({ line: null, kind: 'reply', optedOut: false, hasInbound: true }).reason).toBe('line_missing');
  });
  it('refuses opted-out contacts on every kind', () => {
    for (const kind of ['reply', 'new_conversation', 'campaign'] as const) {
      expect(sendGuard({ line: { ...connected, plan_type: 'outbound' }, kind, optedOut: true, hasInbound: true }).reason).toBe('opted_out');
    }
  });
  it('allows replies only after an inbound message', () => {
    expect(sendGuard({ line: connected, kind: 'reply', optedOut: false, hasInbound: true }).allowed).toBe(true);
    expect(sendGuard({ line: connected, kind: 'reply', optedOut: false, hasInbound: false }).reason).toBe('no_inbound_history');
  });
  it('refuses new conversations and campaigns on inbound-only lines', () => {
    expect(sendGuard({ line: connected, kind: 'new_conversation', optedOut: false, hasInbound: false }).reason).toBe('inbound_only_line');
    expect(sendGuard({ line: connected, kind: 'campaign', optedOut: false, hasInbound: false }).reason).toBe('inbound_only_line');
  });
  it('allows outbound kinds on an outbound-capable connected line', () => {
    const line = { plan_type: 'outbound', status: 'connected', active: true };
    expect(sendGuard({ line, kind: 'new_conversation', optedOut: false, hasInbound: false }).allowed).toBe(true);
    expect(sendGuard({ line, kind: 'campaign', optedOut: false, hasInbound: false }).allowed).toBe(true);
  });
  it('refuses inactive or unverified lines', () => {
    expect(sendGuard({ line: { ...connected, active: false }, kind: 'reply', optedOut: false, hasInbound: true }).reason).toBe('line_inactive');
    expect(sendGuard({ line: { ...connected, status: 'unverified' }, kind: 'reply', optedOut: false, hasInbound: true }).reason).toBe('line_not_connected');
  });
});

describe('credentials', () => {
  it('prefers the line credentials and falls back to agency keys', () => {
    expect(credentialsFor({ api_key_id: 'a', api_secret: 'b' }, { keyId: 'x', secret: 'y' })).toEqual({ keyId: 'a', secret: 'b' });
    expect(credentialsFor(null, { keyId: 'x', secret: 'y' })).toEqual({ keyId: 'x', secret: 'y' });
    expect(credentialsFor(null, { keyId: null, secret: null })).toBeNull();
  });
  it('masks secrets', () => {
    expect(maskSecret('abcdef1234')).toBe('••••1234');
    expect(maskSecret(null)).toBeNull();
  });
});

describe('provider status and service mapping', () => {
  it('maps every documented status', () => {
    expect(mapProviderStatus('DELIVERED')).toBe('delivered');
    expect(mapProviderStatus('SENT')).toBe('sent');
    expect(mapProviderStatus('ERROR')).toBe('failed');
    expect(mapProviderStatus('DECLINED')).toBe('failed');
    expect(mapProviderStatus('QUEUED')).toBe('sending');
    expect(mapProviderStatus('ACCEPTED')).toBe('sending');
  });
  it('maps services', () => {
    expect(channelFromService('iMessage')).toBe('imessage');
    expect(channelFromService('RCS')).toBe('rcs');
    expect(channelFromService('SMS')).toBe('sms');
    expect(channelFromService(undefined)).toBe('sms');
  });
});

describe('CRM note body', () => {
  it('carries the marker and never a deliverable type', () => {
    const marker = mirrorMarker('abc');
    const note = buildInternalComment({
      direction: 'inbound',
      channel: 'imessage',
      linePhone: '+15550000000',
      contactPhone: '+15551234567',
      body: 'Hi there',
      mediaCount: 2,
      occurredAt: '2026-09-21T00:00:00.000Z',
      marker,
    });
    expect(note).toContain('Hi there');
    expect(note).toContain(marker);
    expect(note).toContain('Attachments: 2');
    expect(note).not.toContain('SMS:');
  });
});

describe('webhook verification', () => {
  const body = JSON.stringify({ from_number: '+15551234567', content: 'hi' });
  it('fails closed without a secret or header', async () => {
    expect(await verifyWebhookSignature(null, body, new Headers({ 'sb-signature': 'x' }))).toBe(false);
    expect(await verifyWebhookSignature('s3cret', body, new Headers())).toBe(false);
  });
  it('accepts the shared secret verbatim', async () => {
    expect(await verifyWebhookSignature('s3cret', body, new Headers({ 'sb-signing-secret': 's3cret' }))).toBe(true);
  });
  it('accepts a matching HMAC and rejects a wrong one', async () => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('s3cret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
    const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyWebhookSignature('s3cret', body, new Headers({ 'x-sendblue-signature': `sha256=${hex}` }))).toBe(true);
    expect(await verifyWebhookSignature('s3cret', body, new Headers({ 'x-sendblue-signature': 'sha256=deadbeef' }))).toBe(false);
  });
});

describe('webhook payload shaping', () => {
  it('reads an inbound message', () => {
    const e = normalizeWebhookEvent({
      from_number: '+1 555 123 4567',
      number: '+15550000000',
      content: 'hello',
      service: 'iMessage',
      message_handle: 'mh_1',
      is_outbound: false,
    });
    expect(e.kind).toBe('message');
    expect(e.fromNumber).toBe('+15551234567');
    expect(e.toNumber).toBe('+15550000000');
    expect(e.channel).toBe('imessage');
    expect(e.providerMessageId).toBe('mh_1');
  });
  it('reads a delivery status', () => {
    const e = normalizeWebhookEvent({ status: 'DELIVERED', message_handle: 'mh_1', is_outbound: true });
    expect(e.kind).toBe('status');
    expect(mapProviderStatus(e.status)).toBe('delivered');
  });
  it('ignores payloads with nothing usable', () => {
    expect(normalizeWebhookEvent({}).kind).toBe('ignored');
  });
});

describe('mirror retries', () => {
  it('stops after the bounded attempts', () => {
    expect(shouldRetryMirror(0)).toBe(true);
    expect(shouldRetryMirror(3)).toBe(true);
    expect(shouldRetryMirror(4)).toBe(false);
  });
});
