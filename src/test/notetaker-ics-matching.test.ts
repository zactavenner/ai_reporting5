import { describe, it, expect } from 'vitest';
import { buildShadowInviteIcs, CALENDAR_PRESENTATION_VERSION, scheduleSignature } from '../../supabase/functions/_shared/icsInvite';

const base = {
  uid: 'hpa-mg-client-appt@reporting.highperformanceads.com',
  method: 'REQUEST' as const,
  sequence: 0,
  start: '2026-09-22T15:00:00.000Z',
  end: '2026-09-22T15:30:00.000Z',
  summary: 'Discovery Call with Jane Doe',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  organizerEmail: 'zac@zactavenner.com',
  organizerName: 'High Performance Ads',
  attendeeEmail: 'theainotetaker@gmail.com',
};

describe('shadow invite matching keys', () => {
  it('carries client, location, calendar, appointment and contact keys', () => {
    const ics = buildShadowInviteIcs({
      ...base,
      xProps: {
        'X-HPA-CLIENT-ID': 'c-1',
        'X-HPA-LOCATION-ID': 'loc-1',
        'X-HPA-CALENDAR-ID': 'cal-1',
        'X-HPA-APPOINTMENT-ID': 'appt-1',
        'X-HPA-CONTACT-ID': 'contact-1',
        'X-HPA-CONTACT-EMAIL': 'jane@example.com',
      },
    });
    expect(ics).toContain('X-HPA-CLIENT-ID:c-1');
    expect(ics).toContain('X-HPA-LOCATION-ID:loc-1');
    expect(ics).toContain('X-HPA-CALENDAR-ID:cal-1');
    expect(ics).toContain('X-HPA-APPOINTMENT-ID:appt-1');
    expect(ics).toContain('X-HPA-CONTACT-ID:contact-1');
    expect(ics).toContain('X-HPA-CONTACT-EMAIL:jane@example.com');
  });

  it('keeps the original title and organizer identity, and invites only the notetaker', () => {
    const ics = buildShadowInviteIcs({ ...base, xProps: { 'X-HPA-CONTACT-EMAIL': 'jane@example.com' } });
    expect(ics).toContain('SUMMARY:Discovery Call with Jane Doe');
    expect(ics).toContain('mailto:zac@zactavenner.com');
    const unfolded = ics.replace(/\r\n /g, '');
    const attendees = unfolded.split('\r\n').filter((l) => l.startsWith('ATTENDEE'));
    expect(attendees).toHaveLength(1);
    expect(attendees[0]).toContain('theainotetaker@gmail.com');
  });

  it('drops empty matching keys and normalizes the prefix', () => {
    const ics = buildShadowInviteIcs({
      ...base,
      xProps: { 'X-HPA-CONTACT-ID': null, 'X-HPA-CONTACT-NAME': '  ', 'hpa-client-name': 'Acme' },
    });
    expect(ics).not.toContain('X-HPA-CONTACT-ID');
    expect(ics).not.toContain('X-HPA-CONTACT-NAME');
    expect(ics).toContain('X-HPA-CLIENT-NAME:Acme');
  });

  it('bumps the presentation version so existing invites get exactly one update', () => {
    expect(CALENDAR_PRESENTATION_VERSION).toBe('v4-organizer-mailbox');
    expect(scheduleSignature(base.start, base.end, base.meetingUrl)).toContain('v4-organizer-mailbox');
  });
});
