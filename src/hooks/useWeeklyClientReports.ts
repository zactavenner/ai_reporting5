import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildReportModel, loadReportRows, loadRoster, type RosterEntry, type WeeklyClientReport,
} from '../../supabase/functions/_shared/weeklyReport/model.ts';
import { dashboardAuthHeaders, normalizeDashboardError } from '@/lib/dashboardAuthHeaders';

export type { RosterEntry, WeeklyClientReport };
const sb = supabase as any;

/** Every active client from the authoritative `clients` roster — no hardcoded list. */
export function useWeeklyReportRoster() {
  return useQuery<RosterEntry[]>({ queryKey: ['weekly-report-roster'], queryFn: () => loadRoster(sb) });
}

export function useWeeklyClientReport(entry: RosterEntry | null) {
  return useQuery<WeeklyClientReport>({
    queryKey: ['weekly-client-report', entry?.id],
    enabled: !!entry,
    queryFn: async () => buildReportModel(entry!, await loadReportRows(sb, entry!)),
  });
}

async function invokeWeekly<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('weekly-client-report', { body, headers: dashboardAuthHeaders() });
  if (error) throw await normalizeDashboardError(error);
  return data as T;
}

export interface DryRunClient {
  clientId: string; clientName: string; week: { from: string; to: string }; timezone: string;
  pdf: { ok: boolean; pages?: number; bytes?: number; error?: string };
  approvedRecipients: number;
  deliveries: { key: string; recipientRef: string; channel: string; action: string; reason?: string }[];
  blockers: string[];
}
export interface DryRunResult { mode: 'dry_run'; armed: false; generatedAt: string; clients: DryRunClient[]; batchBlockers: string[] }

/** Server dry run of the Monday batch — renders PDFs and plans deliveries, writes and sends nothing. */
export function useWeeklyDryRun() {
  return useMutation({ mutationFn: (clientId?: string) => invokeWeekly<DryRunResult>({ action: 'dry_run', client_id: clientId }) });
}

/** Server-rendered PDF for one client (returned inline; nothing stored). */
export async function fetchServerPdf(clientId: string): Promise<Blob> {
  const r = await invokeWeekly<{ pdf_base64: string }>({ action: 'render_pdf', client_id: clientId });
  const bin = atob(r.pdf_base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
