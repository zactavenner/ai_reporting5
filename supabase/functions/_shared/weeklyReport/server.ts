/**
 * Server adapters for weekly report delivery: ledger store (staged table),
 * private-bucket PDF link + email sender via the existing send-ghl-message
 * function. Only reachable when delivery is armed — which it is not.
 */
import { WEEKLY_REPORT_DISPATCH_ARMED } from './core.ts';
import type { DeliveryStore, LedgerRow, PlannedDelivery, WeeklySender } from './delivery.ts';
import { INTERNAL_PASSWORD } from '../callBridge.ts';

export const LEDGER_TABLE = 'weekly_report_deliveries';
export const PDF_BUCKET = 'weekly-client-reports';

/** Armed only when the code constant AND the server env flag both say so. */
export function isDeliveryArmed() {
  return WEEKLY_REPORT_DISPATCH_ARMED === true && Deno.env.get('WEEKLY_REPORT_DELIVERY_ARMED') === 'true';
}

/** Ledger rows for one client/week, or null when the staged table isn't installed (fail closed). */
export async function loadLedger(sb: any, clientId: string, weekStart: string): Promise<LedgerRow[] | null> {
  const { data, error } = await sb.from(LEDGER_TABLE).select('delivery_key,client_id,week_start,status,attempts')
    .eq('client_id', clientId).eq('week_start', weekStart);
  if (error) return null;
  return data || [];
}

export async function bucketReady(sb: any) {
  const { data, error } = await sb.storage.getBucket(PDF_BUCKET);
  return !error && !!data && data.public === false;
}

export function supabaseStore(sb: any): DeliveryStore {
  return {
    async claimNew(row) {
      const { data, error } = await sb.from(LEDGER_TABLE)
        .upsert({ ...row, status: 'claimed', attempts: 0 }, { onConflict: 'delivery_key', ignoreDuplicates: true })
        .select('delivery_key');
      if (error) throw error;
      return (data || []).length === 1;
    },
    async claimRetry(key, attempts) {
      const { data, error } = await sb.from(LEDGER_TABLE).update({ status: 'claimed', updated_at: new Date().toISOString() })
        .eq('delivery_key', key).eq('status', 'failed_retryable').eq('attempts', attempts).select('delivery_key');
      if (error) throw error;
      return (data || []).length === 1;
    },
    async mark(key, status, patch = {}) {
      const upd: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...patch };
      if (status === 'failed_retryable' || status === 'failed_permanent' || status === 'unknown') {
        const { data } = await sb.from(LEDGER_TABLE).select('attempts').eq('delivery_key', key).maybeSingle();
        upd.attempts = (data?.attempts ?? 0) + 1;
      }
      if (status === 'sent') upd.sent_at = new Date().toISOString();
      const { error } = await sb.from(LEDGER_TABLE).update(upd).eq('delivery_key', key);
      if (error) throw error;
    },
  };
}

/** Uploads the PDF privately, emails a 7-day signed link through send-ghl-message. */
export function ghlEmailSender(sb: any, opts: { pdf: Uint8Array; clientName: string; weekFrom: string; weekTo: string }): WeeklySender {
  return {
    async send(d: PlannedDelivery, clientId: string) {
      const { data: r } = await sb.from('client_report_recipients').select('id,client_id,name,email,active,unsubscribed_at')
        .eq('id', d.recipientId).eq('client_id', clientId).maybeSingle();
      if (!r || r.client_id !== clientId || !r.active || r.unsubscribed_at || !r.email) return { ok: false, ambiguous: false, error: 'Recipient no longer approved' };
      const path = `${clientId}/${opts.weekFrom}/${d.key.replace(/[^a-z0-9-]/gi, '_')}.pdf`;
      const up = await sb.storage.from(PDF_BUCKET).upload(path, opts.pdf, { contentType: 'application/pdf', upsert: true });
      if (up.error) return { ok: false, ambiguous: false, error: 'PDF upload failed' };
      const signed = await sb.storage.from(PDF_BUCKET).createSignedUrl(path, 7 * 86400);
      if (signed.error || !signed.data?.signedUrl) return { ok: false, ambiguous: false, error: 'Signed link failed' };
      const html = `<p>Hi ${escapeHtml(r.name || '')},</p><p>Your weekly performance report for ${escapeHtml(opts.clientName)} (${opts.weekFrom} to ${opts.weekTo}) is ready.</p><p><a href="${signed.data.signedUrl}">Download the PDF report</a> (link valid for 7 days).</p>`;
      let res: Response;
      try {
        res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ghl-message`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: INTERNAL_PASSWORD, channel: 'email', to_email: r.email, name: r.name, subject: `${opts.clientName} · Weekly performance report`, html }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        return { ok: false, ambiguous: true, error: `No response from sender: ${String((e as Error)?.message || e).slice(0, 120)}` };
      }
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) return { ok: true, messageId: j.messageId, pdfPath: path };
      return { ok: false, ambiguous: res.status >= 500, error: `Sender ${res.status}` };
    },
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
