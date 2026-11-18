// Which spreadsheet the daily Meta spend report writes its "FB Spend" tab to.
// The scorecard sheet (client_settings.metrics_sheet_id) wins; the KPI sheet
// link is only used when no scorecard is set.
export function extractSpreadsheetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

export function pickSpendSheetId(
  metricsSheetId: string | null | undefined,
  kpiSheetUrl: string | null | undefined,
): string | null {
  const scorecard = String(metricsSheetId ?? '').trim();
  if (scorecard) return extractSpreadsheetId(scorecard) ?? scorecard;
  return extractSpreadsheetId(kpiSheetUrl);
}
