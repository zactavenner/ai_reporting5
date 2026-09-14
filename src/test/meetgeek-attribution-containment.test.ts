/**
 * Regression tests for the 2026-09-14 cross-client exposure incident.
 *
 * An internal HPA executive meeting (staff-only attendees) was attributed to a
 * client and written as a note onto that client's contact, because the pipeline
 * accepted time proximity and a shared attendee address as authority.
 *
 * These tests lock the corrected rules:
 *  - identity must be proven (invite UID or identical join URL),
 *  - an external counterparty must exist,
 *  - a usable transcript must exist,
 *  - nothing is written to a CRM contact before all of that passes.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalJoinUrl,
  processCalendarMeeting,
  verifyMeetingIdentity,
  type CalendarAppointment,
  type LifecycleDeps,
  type MeetgeekClientConfig,
} from '../../supabase/functions/_shared/meetgeekCalendarGate';
import type { NormalizedMeeting } from '../../supabase/functions/_shared/meetgeekIngest';

const STAFF = new Set(['zac@zactavenner.com', 'ops@highperformanceads.com', 'bot@meetgeek.ai']);

const legacy: MeetgeekClientConfig = {
  clientId: 'legacy-capital',
  enabled: true,
  ghlLocationId: 'wzuq-loc',
  ghlCalendarId: 'cal-discovery',
  botJoinPolicy: 'selected_calendar_video_only',
  mappingValid: true,
};

function appointment(over: Partial<CalendarAppointment> = {}): CalendarAppointment {
  return {
    eventId: 'appt-legacy-1',
    calendarId: 'cal-discovery',
    locationId: 'wzuq-loc',
    contactId: 'contact-legacy-1',
    attendeeEmail: 'investor@example.com',
    title: '30-min Discovery Call',
    startTime: '2026-08-10T15:00:00Z',
    endTime: '2026-08-10T15:30:00Z',
    isVideo: true,
    joinUrl: 'https://meet.google.com/hrt-pilot-001',
    inviteUid: 'uid-hrt-pilot-001',
    ...over,
  };
}

function meeting(over: Partial<NormalizedMeeting> = {}): NormalizedMeeting {
  return {
    eventId: 'ev-1',
    meetingExternalId: 'mtg-1',
    title: '30-min Discovery Call',
    startedAt: '2026-08-10T15:04:37Z',
    endedAt: '2026-08-10T15:35:00Z',
    durationMinutes: 30,
    recordingUrl: null,
    transcriptUrl: null,
    sourceUrl: 'https://meet.google.com/hrt-pilot-001',
    summary: 'Discovery call with the investor.',
    actionItems: ['Send deck'],
    participants: [{ name: 'Investor', email: 'investor@example.com' }, { name: 'Zac', email: 'zac@zactavenner.com' }],
    transcriptText: 'Investor: tell me about the fund terms and the target returns. '.repeat(8),
    insights: null,
    ...(over as any),
  } as NormalizedMeeting;
}

/** The exact internal meeting that caused the incident. */
const internalExecMeeting = meeting({
  meetingExternalId: 'fae18b69-086f-4942-bbb4-1a763ee6e819',
  title: '[Important] Executive Meeting',
  startedAt: '2026-08-10T15:04:37Z',
  sourceUrl: 'https://meet.google.com/cgz-samp-pxe',
  participants: [
    { name: 'Zac', email: 'zac@zactavenner.com' },
    { name: 'Ops', email: 'ops@highperformanceads.com' },
    { name: 'Notetaker', email: 'bot@meetgeek.ai' },
  ],
});

function makeDeps(over: Partial<LifecycleDeps> = {}) {
  const calls = { notes: [] as any[], activities: [] as any[], patches: [] as any[] };
  const deps: LifecycleDeps = {
    getConfigForMeeting: async () => legacy,
    findAppointments: async () => [appointment()],
    findActivity: async () => null,
    upsertActivity: async (row) => { calls.activities.push(row); return { id: 'act-1' }; },
    patchActivity: async (id, patch) => { calls.patches.push({ id, ...patch }); },
    matchLead: async (_c, emails) => (emails.includes('investor@example.com')
      ? { id: 'lead-1', external_id: 'contact-legacy-1', email: 'investor@example.com' }
      : { id: 'lead-staff', external_id: 'contact-legacy-1', email: emails[0] ?? null }),
    listInternalEmails: async () => STAFF,
    writeGhlNote: async (i) => { calls.notes.push(i); return { status: 'written' as const }; },
    touchHealth: async () => {},
    ...over,
  };
  return { deps, calls };
}

describe('canonicalJoinUrl', () => {
  it('treats scheme, host case and trailing slash as the same meeting', () => {
    expect(canonicalJoinUrl('HTTPS://Meet.Google.com/cgz-samp-pxe/'))
      .toBe(canonicalJoinUrl('https://meet.google.com/cgz-samp-pxe'));
  });
  it('extracts a link from surrounding booking text and rejects empty input', () => {
    expect(canonicalJoinUrl('Join here: https://zoom.us/j/123 (dial in)')).toBe('zoom.us/j/123');
    expect(canonicalJoinUrl(null)).toBeNull();
    expect(canonicalJoinUrl('no link at all')).toBeNull();
  });
});

describe('verifyMeetingIdentity', () => {
  it('classifies the exact incident meeting as internal and never client-attributable', () => {
    const v = verifyMeetingIdentity({ meeting: internalExecMeeting, appointment: appointment(), internalEmails: STAFF });
    expect(v).toMatchObject({ ok: false, reason: 'internal_meeting' });
  });

  it('refuses a client meeting whose join URL differs from the booking', () => {
    const v = verifyMeetingIdentity({
      meeting: meeting({ sourceUrl: 'https://meet.google.com/some-other-room' }),
      appointment: appointment({ inviteUid: null }),
      internalEmails: STAFF,
    });
    expect(v).toMatchObject({ ok: false, reason: 'identity_unverified' });
  });

  it('refuses when only the time matches and there is no link or invite id', () => {
    const v = verifyMeetingIdentity({
      meeting: meeting({ sourceUrl: null }),
      appointment: appointment({ joinUrl: null, inviteUid: null }),
      internalEmails: STAFF,
    });
    expect(v).toMatchObject({ ok: false, reason: 'identity_unverified' });
  });

  it('accepts an identical join URL with an external attendee', () => {
    const v = verifyMeetingIdentity({ meeting: meeting(), appointment: appointment(), internalEmails: STAFF });
    expect(v).toMatchObject({ ok: true, method: 'join_url', externalEmail: 'investor@example.com' });
  });

  it('accepts the invite UID when the recording carries no link', () => {
    const v = verifyMeetingIdentity({
      meeting: meeting({ sourceUrl: null, title: 'Discovery Call uid-hrt-pilot-001' }),
      appointment: appointment(),
      internalEmails: STAFF,
    });
    expect(v.ok).toBe(true);
    expect(v.method).toBe('invite_uid');
  });

  it('refuses when the booking attendee is not on the call', () => {
    const v = verifyMeetingIdentity({
      meeting: meeting({ participants: [{ name: 'Someone else', email: 'stranger@example.com' }] }),
      appointment: appointment(),
      internalEmails: STAFF,
    });
    expect(v).toMatchObject({ ok: false, reason: 'identity_unverified' });
  });

  it('is unaffected by a staff host that exists under many clients', () => {
    // Two clients both have zac@ as a "lead"; only the external investor decides.
    const v = verifyMeetingIdentity({ meeting: meeting(), appointment: appointment(), internalEmails: STAFF });
    expect(v.externalEmail).toBe('investor@example.com');
  });
});

describe('processCalendarMeeting containment', () => {
  it('writes NO CRM note for the internal executive meeting', async () => {
    const { deps, calls } = makeDeps();
    const res = await processCalendarMeeting({ meeting: internalExecMeeting, noteBuilder: () => 'note', deps });
    expect(res).toMatchObject({ ok: false, rejected: 'internal_meeting' });
    expect(calls.notes).toHaveLength(0);
    // The rejected row must not carry the client contact it was never proven to be.
    expect(calls.activities[0].ghl_contact_id).toBeNull();
  });

  it('writes NO CRM note when join URLs mismatch', async () => {
    const { deps, calls } = makeDeps({ findAppointments: async () => [appointment({ inviteUid: null })] });
    const res = await processCalendarMeeting({
      meeting: meeting({ sourceUrl: 'https://meet.google.com/different-room' }),
      noteBuilder: () => 'note',
      deps,
    });
    expect(res).toMatchObject({ ok: false, rejected: 'identity_unverified' });
    expect(calls.notes).toHaveLength(0);
  });

  it('writes NO CRM note when the transcript is missing or partial', async () => {
    const { deps, calls } = makeDeps();
    const res = await processCalendarMeeting({
      meeting: meeting({ transcriptText: 'hi' }),
      noteBuilder: () => 'note',
      deps,
    });
    expect(res).toMatchObject({ ok: false, rejected: 'transcript_incomplete' });
    expect(calls.notes).toHaveLength(0);
  });

  it('never selects a contact from a staff attendee that exists as a lead', async () => {
    const { deps, calls } = makeDeps({
      // Staff address resolves to a lead, the external investor does not.
      matchLead: async (_c, emails) => (emails.includes('zac@zactavenner.com')
        ? { id: 'lead-staff', external_id: 'contact-legacy-1', email: 'zac@zactavenner.com' }
        : null),
    });
    const res = await processCalendarMeeting({ meeting: meeting(), noteBuilder: () => 'note', deps });
    expect(res).toMatchObject({ ok: true, matched: false, crmSyncStatus: 'skipped' });
    expect(calls.notes).toHaveLength(0);
  });

  it('keeps two simultaneous client meetings on their own bookings', async () => {
    const other: MeetgeekClientConfig = { ...legacy, clientId: 'other-client', ghlLocationId: 'other-loc' };
    const otherAppt = appointment({
      eventId: 'appt-other-1',
      locationId: 'other-loc',
      contactId: 'contact-other-1',
      attendeeEmail: 'someone@other.com',
      joinUrl: 'https://meet.google.com/other-room',
      inviteUid: 'uid-other',
    });
    // Same start time, different rooms: each client's gate sees only its own booking.
    const { deps: d1, calls: c1 } = makeDeps();
    const r1 = await processCalendarMeeting({ meeting: meeting(), noteBuilder: () => 'note', deps: d1 });
    expect(r1).toMatchObject({ ok: true, clientId: 'legacy-capital', crmSyncStatus: 'written' });
    expect(c1.notes[0].contactId).toBe('contact-legacy-1');

    const { deps: d2, calls: c2 } = makeDeps({
      getConfigForMeeting: async () => other,
      findAppointments: async () => [otherAppt],
      matchLead: async () => ({ id: 'lead-other', external_id: 'contact-other-1', email: 'someone@other.com' }),
    });
    const r2 = await processCalendarMeeting({
      meeting: meeting({
        meetingExternalId: 'mtg-2',
        sourceUrl: 'https://meet.google.com/other-room',
        participants: [{ name: 'Other', email: 'someone@other.com' }],
      }),
      noteBuilder: () => 'note',
      deps: d2,
    });
    expect(r2).toMatchObject({ ok: true, clientId: 'other-client', crmSyncStatus: 'written' });
    expect(c2.notes[0].contactId).toBe('contact-other-1');
  });

  it('writes exactly one note for the verified HRT-style pilot appointment', async () => {
    const { deps, calls } = makeDeps();
    const res = await processCalendarMeeting({ meeting: meeting(), noteBuilder: () => 'note', deps });
    expect(res).toMatchObject({ ok: true, matched: true, crmSyncStatus: 'written', clientId: 'legacy-capital' });
    expect(calls.notes).toHaveLength(1);
    expect(calls.notes[0].contactId).toBe('contact-legacy-1');
  });
});
