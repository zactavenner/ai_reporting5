/**
 * Mirrors Sendblue messages into the matching GoHighLevel contact as an
 * InternalComment note.
 *
 * Guarantees:
 *  - Exactly one note per message (unique ledger row + lease before any POST).
 *  - Exact normalized E.164 match inside that client's own CRM location only.
 *    Ambiguous or missing matches are recorded and skipped — never guessed,
 *    never a contact create.
 *  - Only `type: 'InternalComment'` is ever posted. No SMS, no email.
 *  - Bounded retries; a final failure stays visible with its reason.
 */
import { getMappedGhl } from './ghlMapping.ts';
import {
  MIRROR_MAX_ATTEMPTS,
  buildInternalComment,
  mirrorMarker,
  normalizeE164,
  shouldRetryMirror,
} from './sendblue.ts';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const LEASE_SECONDS = 120;

export interface MirrorOutcome {
  message_id: string;
  status: 'mirrored' | 'skipped' | 'failed' | 'already';
  reason?: string;
}

async function ghlSearchByPhone(apiKey: string, locationId: string, phone: string) {
  const res = await fetch(`${GHL_BASE}/contacts/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      locationId,
      pageLimit: 20,
      filters: [{ field: 'phone', operator: 'contains', value: phone.replace('+', '') }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ghl_search_${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json().catch(() => ({}));
  const contacts: any[] = json?.contacts || [];
  return contacts.filter((c) => c?.locationId === locationId || !c?.locationId);
}

async function ghlPostInternalComment(apiKey: string, contactId: string, message: string) {
  const res = await fetch(`${GHL_BASE}/conversations/messages/inbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
    },
    // InternalComment only — this can never reach the contact.
    body: JSON.stringify({ type: 'InternalComment', conversationProviderId: undefined, contactId, message }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ghl_note_${res.status}: ${text.slice(0, 200)}`);
  let noteId: string | null = null;
  try {
    const json = JSON.parse(text);
    noteId = json?.messageId || json?.id || json?.conversationId || null;
  } catch {
    /* provider returned no JSON body */
  }
  return noteId;
}

/** Ensure a ledger row exists for a message. Safe to call repeatedly. */
export async function queueMirror(admin: any, message: any): Promise<void> {
  await admin.from('sendblue_ghl_mirrors').upsert(
    {
      message_id: message.id,
      client_id: message.client_id,
      marker: mirrorMarker(message.id),
      status: 'pending',
    },
    { onConflict: 'message_id', ignoreDuplicates: true },
  );
}

async function claim(admin: any, row: any, owner: string): Promise<boolean> {
  const now = new Date();
  const { data, error } = await admin
    .from('sendblue_ghl_mirrors')
    .update({
      status: 'processing',
      lease_owner: owner,
      lease_expires_at: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString(),
      attempts: (row.attempts || 0) + 1,
    })
    .eq('id', row.id)
    .in('status', ['pending', 'processing'])
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .select('id')
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

async function finish(admin: any, id: string, patch: Record<string, unknown>) {
  await admin
    .from('sendblue_ghl_mirrors')
    .update({ lease_owner: null, lease_expires_at: null, ...patch })
    .eq('id', id);
}

/** Process pending mirrors. Returns one outcome per ledger row touched. */
export async function runMirrors(admin: any, limit = 25): Promise<MirrorOutcome[]> {
  const owner = crypto.randomUUID();
  const outcomes: MirrorOutcome[] = [];

  const { data: rows } = await admin
    .from('sendblue_ghl_mirrors')
    .select('*')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: true })
    .limit(limit);

  for (const row of rows || []) {
    if (!shouldRetryMirror(row.attempts || 0)) {
      await finish(admin, row.id, { status: 'failed', last_error: row.last_error || 'retries_exhausted' });
      outcomes.push({ message_id: row.message_id, status: 'failed', reason: 'retries_exhausted' });
      continue;
    }
    if (!(await claim(admin, row, owner))) continue;

    try {
      const { data: message } = await admin
        .from('sendblue_messages')
        .select('id, client_id, direction, channel, body, media_urls, created_at, conversation_id, line_id')
        .eq('id', row.message_id)
        .maybeSingle();
      if (!message) {
        await finish(admin, row.id, { status: 'skipped', skipped_reason: 'message_missing' });
        outcomes.push({ message_id: row.message_id, status: 'skipped', reason: 'message_missing' });
        continue;
      }
      if (!message.client_id) {
        await finish(admin, row.id, { status: 'skipped', skipped_reason: 'agency_line_no_client' });
        outcomes.push({ message_id: row.message_id, status: 'skipped', reason: 'agency_line_no_client' });
        continue;
      }

      const [{ data: conversation }, { data: line }] = await Promise.all([
        admin
          .from('sendblue_conversations')
          .select('id, contact_phone, ghl_contact_id, match_state')
          .eq('id', message.conversation_id)
          .maybeSingle(),
        admin.from('sendblue_lines').select('phone_e164').eq('id', message.line_id).maybeSingle(),
      ]);

      const { apiKey, locationId } = await getMappedGhl(admin, message.client_id);
      if (!apiKey || !locationId) {
        await finish(admin, row.id, { status: 'skipped', skipped_reason: 'no_crm_credentials' });
        await admin
          .from('sendblue_conversations')
          .update({ match_state: 'no_crm', match_checked_at: new Date().toISOString() })
          .eq('id', message.conversation_id);
        outcomes.push({ message_id: row.message_id, status: 'skipped', reason: 'no_crm_credentials' });
        continue;
      }

      const phone = normalizeE164(conversation?.contact_phone);
      if (!phone) {
        await finish(admin, row.id, { status: 'skipped', skipped_reason: 'unusable_phone' });
        outcomes.push({ message_id: row.message_id, status: 'skipped', reason: 'unusable_phone' });
        continue;
      }

      let contactId = conversation?.ghl_contact_id || null;
      if (!contactId) {
        const found = await ghlSearchByPhone(apiKey, locationId, phone);
        const exact = found.filter((c) => normalizeE164(c?.phone) === phone);
        if (exact.length === 0) {
          await finish(admin, row.id, { status: 'skipped', skipped_reason: 'no_exact_contact_match' });
          await admin
            .from('sendblue_conversations')
            .update({ match_state: 'unmatched', match_checked_at: new Date().toISOString() })
            .eq('id', message.conversation_id);
          outcomes.push({ message_id: row.message_id, status: 'skipped', reason: 'no_exact_contact_match' });
          continue;
        }
        if (exact.length > 1) {
          await finish(admin, row.id, { status: 'skipped', skipped_reason: 'ambiguous_contact_match' });
          await admin
            .from('sendblue_conversations')
            .update({ match_state: 'ambiguous', match_checked_at: new Date().toISOString() })
            .eq('id', message.conversation_id);
          outcomes.push({ message_id: row.message_id, status: 'skipped', reason: 'ambiguous_contact_match' });
          continue;
        }
        contactId = String(exact[0].id);
        await admin
          .from('sendblue_conversations')
          .update({
            ghl_contact_id: contactId,
            contact_name: conversation?.contact_name || exact[0]?.contactName || null,
            match_state: 'matched',
            match_checked_at: new Date().toISOString(),
          })
          .eq('id', message.conversation_id);
      }

      const marker = row.marker || mirrorMarker(message.id);
      const note = buildInternalComment({
        direction: message.direction,
        channel: message.channel,
        linePhone: line?.phone_e164 || 'unknown',
        contactPhone: phone,
        body: message.body,
        mediaCount: Array.isArray(message.media_urls) ? message.media_urls.length : 0,
        occurredAt: message.created_at,
        marker,
      });

      const noteId = await ghlPostInternalComment(apiKey, contactId, note);
      await finish(admin, row.id, {
        status: 'mirrored',
        ghl_contact_id: contactId,
        ghl_note_id: noteId,
        completed_at: new Date().toISOString(),
        last_error: null,
      });
      outcomes.push({ message_id: row.message_id, status: 'mirrored' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      const attempts = (row.attempts || 0) + 1;
      await finish(admin, row.id, {
        status: attempts >= MIRROR_MAX_ATTEMPTS ? 'failed' : 'pending',
        last_error: reason.slice(0, 300),
      });
      outcomes.push({ message_id: row.message_id, status: 'failed', reason: reason.slice(0, 120) });
    }
  }

  return outcomes;
}
