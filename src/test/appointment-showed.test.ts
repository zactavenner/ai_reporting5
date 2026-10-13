import { describe, it, expect } from 'vitest';
import { resolveShowed } from '../../supabase/functions/_shared/appointmentShowed';

const now = Date.parse('2026-10-13T12:00:00Z');
const past = '2026-10-12T12:00:00Z';
const future = '2026-10-14T12:00:00Z';

describe('resolveShowed', () => {
  it('showed/completed in the past are showed (any case)', () => {
    expect(resolveShowed('Showed', past, now)).toBe(true);
    expect(resolveShowed('COMPLETED', past, now)).toBe(true);
  });
  it('confirmed/booked/new/pending/other are never showed', () => {
    for (const s of ['confirmed', 'booked', 'new', 'pending', 'noshow', 'cancelled', '', null]) {
      expect(resolveShowed(s as any, past, now)).toBe(false);
    }
  });
  it('future appointments are never showed', () => {
    expect(resolveShowed('showed', future, now)).toBe(false);
  });
});
