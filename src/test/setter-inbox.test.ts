import { describe, it, expect } from 'vitest';
import { buildThreads, type InboxEvent } from '@/lib/inbox';

const ev = (id: string, lead: string, at: string, dir: 'inbound' | 'outbound'): InboxEvent => ({
  id, client_id: 'c', lead_id: lead, event_type: 'sms', event_subtype: dir, title: null, body: id, event_at: at,
});

describe('unified inbox', () => {
  it('marks a thread unread when the lead replied after my last read', () => {
    const t = buildThreads([ev('a', 'L1', '2026-11-06T10:00:00Z', 'inbound')], { L1: '2026-11-06T09:00:00Z' });
    expect(t[0].unread).toBe(true);
  });
  it('is read once I opened it after their last message', () => {
    const t = buildThreads([ev('a', 'L1', '2026-11-06T10:00:00Z', 'inbound')], { L1: '2026-11-06T11:00:00Z' });
    expect(t[0].unread).toBe(false);
  });
  it('our own outbound texts never make a thread unread', () => {
    const t = buildThreads([ev('a', 'L1', '2026-11-06T10:00:00Z', 'outbound')], {});
    expect(t[0].unread).toBe(false);
  });
  it('sorts threads newest first and groups by lead', () => {
    const t = buildThreads([
      ev('a', 'L1', '2026-11-06T08:00:00Z', 'inbound'),
      ev('b', 'L2', '2026-11-06T09:00:00Z', 'inbound'),
      ev('c', 'L1', '2026-11-06T07:00:00Z', 'outbound'),
    ], {});
    expect(t.map((x) => x.leadId)).toEqual(['L2', 'L1']);
    expect(t[1].events).toHaveLength(2);
  });
});
