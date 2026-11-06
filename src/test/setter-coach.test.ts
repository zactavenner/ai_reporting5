import { describe, it, expect } from 'vitest';
import { fillScript, matchObjection, pickScript, DISPOSITION_HOTKEYS } from '@/lib/setterCoach';

const base = { opening: '', questions: [], booking: '', objections: [] };

describe('setter coach', () => {
  it('fills known vars and keeps unknown ones visible', () => {
    expect(fillScript('Hi {{first_name}}, {{slot_1}}', { first_name: 'Ann' })).toBe('Hi Ann, {{slot_1}}');
  });
  it('prefers the client default script over the agency default', () => {
    const s = [
      { ...base, id: 'a', client_id: null, name: 'A', is_default: true },
      { ...base, id: 'c', client_id: 'x', name: 'C', is_default: true },
    ];
    expect(pickScript(s, 'x')?.id).toBe('c');
    expect(pickScript(s, 'y')?.id).toBe('a');
  });
  it('matches the objection with the most keyword hits', () => {
    const o = [
      { label: 'Info', keywords: ['send'], reply: '' },
      { label: 'Busy', keywords: ['busy', 'driving'], reply: '' },
    ];
    expect(matchObjection("I'm busy driving, send it", o)?.label).toBe('Busy');
    expect(matchObjection('', o)).toBeNull();
  });
  it('maps hotkey 1 to booked and 6 to not interested', () => {
    expect(DISPOSITION_HOTKEYS['1']).toBe('booked');
    expect(DISPOSITION_HOTKEYS['6']).toBe('not_interested');
  });
});
