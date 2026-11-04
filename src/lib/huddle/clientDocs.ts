/** Required Google documents for every client on the Huddle card. */
export type ClientDocKey = 'kpi_google_sheet_url' | 'kpi_google_doc_url';

export interface ClientDocDef {
  key: ClientDocKey;
  label: string;
  kind: 'sheet' | 'doc';
  hint: string;
}

export const CLIENT_DOCS: ClientDocDef[] = [
  { key: 'kpi_google_sheet_url', label: 'Reporting Google Sheet', kind: 'sheet', hint: 'Scorecard, ad spend and leads tabs' },
  { key: 'kpi_google_doc_url', label: 'Master Google Doc', kind: 'doc', hint: 'Client brief, offer and notes' },
];

export type ClientDocState = 'linked' | 'missing' | 'wrong_type';

export function docState(kind: 'sheet' | 'doc', url: string | null | undefined): ClientDocState {
  const v = (url || '').trim();
  if (!v) return 'missing';
  const path = kind === 'sheet' ? '/spreadsheets/d/' : '/document/d/';
  return /^https?:\/\/docs\.google\.com\//i.test(v) && v.includes(path) ? 'linked' : 'wrong_type';
}

/** Number of required documents that are missing or not the right Google file. */
export function docProblems(values: Partial<Record<ClientDocKey, string | null>>): number {
  return CLIENT_DOCS.filter((d) => docState(d.kind, values[d.key]) !== 'linked').length;
}
