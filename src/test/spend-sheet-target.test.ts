import { describe, it, expect } from 'vitest';
import { pickSpendSheetId } from '../../supabase/functions/_shared/spendSheetTarget';

const kpi = 'https://docs.google.com/spreadsheets/d/KPI_SHEET_123/edit?usp=sharing';

describe('pickSpendSheetId', () => {
  it('writes spend to the scorecard sheet when one is set, even if the KPI link differs', () => {
    expect(pickSpendSheetId('SCORECARD_456', kpi)).toBe('SCORECARD_456');
  });
  it('falls back to the KPI sheet when no scorecard is set', () => {
    expect(pickSpendSheetId(null, kpi)).toBe('KPI_SHEET_123');
    expect(pickSpendSheetId('  ', kpi)).toBe('KPI_SHEET_123');
  });
  it('accepts a full scorecard URL', () => {
    expect(pickSpendSheetId('https://docs.google.com/spreadsheets/d/SCORECARD_456/edit', kpi)).toBe('SCORECARD_456');
  });
  it('returns null when neither is set', () => {
    expect(pickSpendSheetId(null, null)).toBeNull();
  });
});
