import { describe, expect, it } from 'vitest';
import { docProblems, docState } from '@/lib/huddle/clientDocs';

const SHEET = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMd/edit#gid=0';
const DOC = 'https://docs.google.com/document/d/1a2b3c4d5e6f/edit';

describe('Huddle client docs', () => {
  it('flags a missing document', () => {
    expect(docState('sheet', '')).toBe('missing');
    expect(docProblems({ kpi_google_sheet_url: SHEET, kpi_google_doc_url: null })).toBe(1);
  });

  it('flags a link that is the wrong kind of Google file', () => {
    expect(docState('sheet', DOC)).toBe('wrong_type');
    expect(docState('doc', 'https://example.com/doc')).toBe('wrong_type');
  });

  it('is clear only when both the sheet and the doc are linked', () => {
    expect(docProblems({ kpi_google_sheet_url: SHEET, kpi_google_doc_url: DOC })).toBe(0);
  });
});
