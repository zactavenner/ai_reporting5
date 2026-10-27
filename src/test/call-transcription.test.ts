import { describe, expect, it } from 'vitest';
import {
  callSummaryTimestamp,
  ghlFullName,
  isBlankSummary,
  lookupCallPartyNames,
  summaryUserPreamble,
  transcriptionNamePrompt,
} from '../../supabase/functions/_shared/callSummary';

const API_KEY = 'ghl-test-key';
const LOCATION_ID = 'loc-ipc';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GHL party name lookup', () => {
  it('uses the contact and user full names from GHL', async () => {
    const calls: { url: string; authorization: string; version: string }[] = [];
    const names = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: LOCATION_ID,
      contactId: 'contact-1',
      userId: 'user-1',
      fallbackContactName: 'Bradley',
      fallbackUserName: 'Gary',
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string>;
        calls.push({
          url: String(input),
          authorization: headers.Authorization,
          version: headers.Version,
        });
        if (String(input).endsWith('/contacts/contact-1')) {
          return jsonResponse({
            contact: {
              firstName: 'Bradley',
              lastName: 'Kaahanui',
              locationId: LOCATION_ID,
              assignedTo: 'someone-else',
            },
          });
        }
        return jsonResponse({ user: { firstName: 'Gary', lastName: 'Kummer' } });
      }) as typeof fetch,
    });

    expect(names).toEqual({ contactName: 'Bradley Kaahanui', userName: 'Gary Kummer' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://services.leadconnectorhq.com/contacts/contact-1',
      'https://services.leadconnectorhq.com/users/user-1',
    ]);
    expect(calls[0]).toMatchObject({ authorization: `Bearer ${API_KEY}`, version: '2021-07-28' });
  });

  it('uses the contact assigned user when the call has no user id', async () => {
    const names = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: LOCATION_ID,
      contactId: 'contact-1',
      userId: null,
      fetchImpl: (async (input) => {
        if (String(input).includes('/contacts/')) {
          return jsonResponse({
            contact: { first_name: 'Steven', last_name: 'Bass', assignedTo: 'user-john' },
          });
        }
        return jsonResponse({ firstName: 'John', lastName: 'Quiñones' });
      }) as typeof fetch,
    });

    expect(names).toEqual({ contactName: 'Steven Bass', userName: 'John Quiñones' });
  });

  it('keeps payload names when the contact lookup fails and still resolves the user', async () => {
    const names = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: LOCATION_ID,
      contactId: 'contact-1',
      userId: 'user-1',
      fallbackContactName: 'Daniel Schaffer',
      fallbackUserName: 'Gary',
      fetchImpl: (async (input) => {
        if (String(input).includes('/contacts/')) return jsonResponse({ message: 'nope' }, 404);
        return jsonResponse({ name: 'Daniel Gaulin' });
      }) as typeof fetch,
    });

    expect(names).toEqual({ contactName: 'Daniel Schaffer', userName: 'Daniel Gaulin' });
  });

  it('keeps the payload rep name when the user lookup throws', async () => {
    const names = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: LOCATION_ID,
      contactId: 'contact-1',
      userId: 'user-1',
      fallbackUserName: 'Gary Kummer',
      fetchImpl: (async (input) => {
        if (String(input).includes('/users/')) throw new Error('network');
        return jsonResponse({ contact: { firstName: 'Richard', lastName: 'Gibson' } });
      }) as typeof fetch,
    });

    expect(names).toEqual({ contactName: 'Richard Gibson', userName: 'Gary Kummer' });
  });

  it('does not call GHL without a location id or when both ids are missing', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return jsonResponse({});
    }) as typeof fetch;

    const missingLocation = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: '  ',
      contactId: 'contact-1',
      userId: 'user-1',
      fallbackContactName: 'Steven Bass',
      fallbackUserName: 'John',
      fetchImpl,
    });
    const missingIds = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: LOCATION_ID,
      contactId: null,
      userId: null,
      fallbackContactName: '  ',
      fallbackUserName: null,
      fetchImpl,
    });

    expect(missingLocation).toEqual({ contactName: 'Steven Bass', userName: 'John' });
    expect(missingIds).toEqual({ contactName: null, userName: null });
    expect(calls).toBe(0);
  });

  it('ignores a contact from a different location', async () => {
    const names = await lookupCallPartyNames({
      apiKey: API_KEY,
      locationId: LOCATION_ID,
      contactId: 'contact-1',
      userId: null,
      fallbackContactName: 'Payload Name',
      fetchImpl: (async () => jsonResponse({
        contact: { firstName: 'Other', lastName: 'Person', locationId: 'somewhere-else', assignedTo: 'user-9' },
      })) as typeof fetch,
    });

    expect(names).toEqual({ contactName: 'Payload Name', userName: null });
  });
});

describe('summary and transcription name hints', () => {
  it('tells the model to keep the CRM spellings and treat a single speaker as the rep', () => {
    const preamble = summaryUserPreamble('Gary Kummer', 'Bradley Kaahanui');
    expect(preamble).toContain('Salesperson = Gary Kummer');
    expect(preamble).toContain('Prospect = Bradley Kaahanui');
    expect(preamble).toContain('Use these exact spellings for the rep and the prospect.');
    expect(preamble).toContain('On a voicemail, or when only one person speaks, the speaker is the rep.');
  });

  it('passes both names to the transcription prompt', () => {
    expect(transcriptionNamePrompt('Gary Kummer', 'Bradley Kaahanui')).toBe(
      'The rep is Gary Kummer and the prospect is Bradley Kaahanui.',
    );
    expect(transcriptionNamePrompt('Gary Kummer', '  ')).toBe('The rep is Gary Kummer.');
    expect(transcriptionNamePrompt(null, null)).toBeUndefined();
  });

  it('joins GHL first and last names', () => {
    expect(ghlFullName({ firstName: 'John', lastName: 'Quiñones' })).toBe('John Quiñones');
    expect(ghlFullName({ name: 'Only Full' })).toBe('Only Full');
    expect(ghlFullName(null)).toBeNull();
  });
});

describe('AI Call Summary note', () => {
  it('prints the header time in Pacific time with a PT label', () => {
    expect(callSummaryTimestamp('2026-10-26T23:02:55.000Z')).toBe('10/26/2026, 4:02:55 PM PT');
    expect(callSummaryTimestamp('2026-11-05T16:02:55.000Z')).toBe('11/5/2026, 8:02:55 AM PT');
  });

  it('treats an empty or whitespace summary as not postable', () => {
    expect(isBlankSummary('')).toBe(true);
    expect(isBlankSummary(' \n\t ')).toBe(true);
    expect(isBlankSummary(null)).toBe(true);
    expect(isBlankSummary('Left a voicemail about the deck.')).toBe(false);
  });
});
