export type InboxEvent = {
  id: string; client_id: string; lead_id: string | null; event_type: string; event_subtype: string | null;
  title: string | null; body: string | null; event_at: string; metadata?: any;
};
export type Thread = { leadId: string; clientId: string; last: InboxEvent; events: InboxEvent[]; unread: boolean };

/** Inbound unless explicitly outbound (sms/email subtype or metadata.direction). */
export function isInbound(e: InboxEvent): boolean {
  const dir = (e.event_subtype || e.metadata?.direction || '').toLowerCase();
  return dir === 'inbound';
}

/** Group newest-first events by lead. Unread = newest inbound message is after this member's last read. */
export function buildThreads(events: InboxEvent[], reads: Record<string, string>): Thread[] {
  const map = new Map<string, Thread>();
  for (const e of events) {
    if (!e.lead_id) continue;
    let t = map.get(e.lead_id);
    if (!t) { t = { leadId: e.lead_id, clientId: e.client_id, last: e, events: [], unread: false }; map.set(e.lead_id, t); }
    t.events.push(e);
  }
  const out = [...map.values()];
  for (const t of out) {
    t.events.sort((a, b) => b.event_at.localeCompare(a.event_at));
    t.last = t.events[0];
    const lastIn = t.events.find(isInbound);
    const read = reads[t.leadId];
    t.unread = !!lastIn && (!read || new Date(lastIn.event_at) > new Date(read));
  }
  return out.sort((a, b) => b.last.event_at.localeCompare(a.last.event_at));
}
