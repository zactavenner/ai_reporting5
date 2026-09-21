import { describe, it, expect } from 'vitest';
import {
  isCallMessage,
  callDurationSeconds,
  isCompletedCall,
  recordingUrlFor,
  callRecordKey,
  classifyProbe,
  recordingEligibility,
  isTerminalReason,
  shouldRetry,
  nextMessageCursor,
  nextConversationCursor,
  clampBudget,
  DEFAULT_MIN_DURATION_SECONDS,
} from '../../supabase/functions/_shared/ghlCallRecordings';

describe('call message detection', () => {
  it('recognizes TYPE_CALL and legacy numeric types', () => {
    expect(isCallMessage({ id: '1', messageType: 'TYPE_CALL' })).toBe(true);
    expect(isCallMessage({ id: '1', type: 25 })).toBe(true);
    expect(isCallMessage({ id: '1', type: 26 })).toBe(true);
    expect(isCallMessage({ id: '1', messageType: 'TYPE_SMS' })).toBe(false);
  });

  it('reads duration only when numeric', () => {
    expect(callDurationSeconds({ id: '1', meta: { call: { duration: 95 } } })).toBe(95);
    expect(callDurationSeconds({ id: '1', meta: { call: { duration: null } } })).toBeNull();
    expect(callDurationSeconds({ id: '1' })).toBeNull();
  });

  it('excludes calls still in progress', () => {
    expect(isCompletedCall({ id: '1', meta: { call: { status: 'ringing' } } })).toBe(false);
    expect(isCompletedCall({ id: '1', meta: { call: { status: 'in-progress' } } })).toBe(false);
    expect(isCompletedCall({ id: '1', meta: { call: { status: 'completed' } } })).toBe(true);
    expect(isCompletedCall({ id: '1', meta: { call: { status: 'voicemail' } } })).toBe(true);
    expect(isCompletedCall({ id: '1' })).toBe(true);
  });
});

describe('recording identity', () => {
  it('builds the authenticated CRM recording url', () => {
    expect(recordingUrlFor('loc1', 'msg1')).toBe(
      'https://services.leadconnectorhq.com/conversations/messages/msg1/locations/loc1/recording',
    );
  });

  it('keys records per location and message so reruns dedupe', () => {
    expect(callRecordKey('loc1', 'msg1')).toBe('ghl:loc1:msg1');
    expect(callRecordKey('loc1', 'msg1')).toBe(callRecordKey('loc1', 'msg1'));
    expect(callRecordKey('loc2', 'msg1')).not.toBe(callRecordKey('loc1', 'msg1'));
  });
});

describe('probe classification', () => {
  it('separates missing, expired and unreachable recordings', () => {
    expect(classifyProbe({ status: 200, contentType: 'audio/x-wav', contentLength: 500000 })).toBe('available');
    expect(classifyProbe({ status: 404 })).toBe('no_recording_in_crm');
    expect(classifyProbe({ status: 410 })).toBe('recording_expired');
    expect(classifyProbe({ status: 401 })).toBe('recording_unreachable');
    expect(classifyProbe({ status: 500 })).toBe('recording_unreachable');
  });

  it('treats html/json bodies and tiny payloads as not a recording', () => {
    expect(classifyProbe({ status: 200, contentType: 'application/json' })).toBe('recording_unreachable');
    expect(classifyProbe({ status: 200, contentType: 'text/html' })).toBe('recording_unreachable');
    expect(classifyProbe({ status: 200, contentType: 'audio/mpeg', contentLength: 12 })).toBe('no_recording_in_crm');
  });
});

describe('eligibility gate', () => {
  it('rejects calls under the duration floor', () => {
    expect(recordingEligibility({ availability: 'available', durationSeconds: 5 })).toBe('too_short');
    expect(recordingEligibility({ availability: 'available', durationSeconds: DEFAULT_MIN_DURATION_SECONDS })).toBe('available');
    expect(recordingEligibility({ availability: 'available', durationSeconds: null })).toBe('available');
    expect(recordingEligibility({ availability: 'available', durationSeconds: 10, minDurationSeconds: 5 })).toBe('available');
  });

  it('never upgrades a non-available reason', () => {
    expect(recordingEligibility({ availability: 'no_recording_in_crm', durationSeconds: 600 })).toBe('no_recording_in_crm');
  });
});

describe('retry policy', () => {
  it('stops immediately on terminal reasons', () => {
    expect(isTerminalReason('no_recording_in_crm')).toBe(true);
    expect(isTerminalReason('recording_expired')).toBe(true);
    expect(isTerminalReason('too_short')).toBe(true);
    expect(isTerminalReason('recording_unreachable')).toBe(false);
    expect(shouldRetry('no_recording_in_crm', 0)).toBe(false);
  });

  it('retries transient reasons up to the cap then stops', () => {
    expect(shouldRetry('recording_unreachable', 0)).toBe(true);
    expect(shouldRetry('recording_unreachable', 2)).toBe(true);
    expect(shouldRetry('recording_unreachable', 3)).toBe(false);
  });
});

describe('paging cursors', () => {
  it('advances on a new page and stops on a repeated or empty page', () => {
    expect(nextMessageCursor([{ id: 'a' }, { id: 'b' }])).toBe('b');
    expect(nextMessageCursor([])).toBeNull();
    expect(nextMessageCursor([{ id: 'b' }], 'b')).toBeNull();
  });

  it('advances conversation cursor and stops when it does not move', () => {
    expect(nextConversationCursor([{ id: 'c1', lastMessageDate: '2026-09-01' }])).toEqual({
      id: 'c1',
      date: '2026-09-01',
    });
    expect(nextConversationCursor([{ id: 'c1' }], { id: 'c1' })).toBeNull();
    expect(nextConversationCursor([])).toBeNull();
  });
});

describe('run budget', () => {
  it('clamps to safe bounds and keeps every run finite', () => {
    const b = clampBudget({ maxClients: 9999, maxApiCalls: 1, maxConversationsPerClient: 0, maxCallsPerClient: -5 });
    expect(b.maxClients).toBe(25);
    expect(b.maxApiCalls).toBe(10);
    expect(b.maxConversationsPerClient).toBe(1);
    expect(b.maxCallsPerClient).toBe(1);
  });
});
