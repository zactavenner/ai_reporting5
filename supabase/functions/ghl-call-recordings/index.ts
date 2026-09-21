// CRM call-recording capture.
//
// Actions (POST, internal password):
//  - { action: "audit" }            READ-ONLY. Per client: calls found, recordings
//                                   available, and the exact reason for each gap.
//                                   Writes nothing, transcribes nothing.
//  - { action: "capture" }          Walks each client's call messages (every call in a
//                                   conversation, not just the last one), upserts one
//                                   phone_call_records row per CRM call with the
//                                   authenticated recording URL, and marks eligibility.
//  - { action: "webhook" }          Single-call recording notification from the CRM.
//  - { action: "state", ... }       Turn capture on/off per client, record consent.
//
// Capture never sends a message to any lead or contact, never changes a CRM stage, and
// never transcribes a call whose client has capture disabled or consent unconfirmed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getMappedGhl } from "../_shared/ghlMapping.ts";
import {
  GHL_BASE,
  GHL_VERSION,
  DEFAULT_MIN_DURATION_SECONDS,
  clampBudget,
  callDurationSeconds,
  callRecordKey,
  callStatus,
  classifyProbe,
  isCallMessage,
  isCompletedCall,
  nextConversationCursor,
  nextMessageCursor,
  recordingEligibility,
  recordingUrlFor,
  shouldRetry,
  type CallMessage,
  type RecordingAvailability,
} from "../_shared/ghlCallRecordings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hpa-webhook-token",
};

const INTERNAL_PASSWORD = "HPA1234$";
const LEASE_SECONDS = 600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") return json({ ok: true, service: "ghl-call-recordings" });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const url = new URL(req.url);
  for (const [k, v] of url.searchParams.entries()) if (body[k] === undefined) body[k] = v;

  if ((body.password || req.headers.get("x-hpa-webhook-token")) !== INTERNAL_PASSWORD) {
    return json({ error: "unauthorized" }, 401);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const runner = new Runner(sb, body);

  try {
    switch (body.action || "audit") {
      case "audit":
        return json(await runner.audit());
      case "capture":
        return json(await runner.capture());
      case "webhook":
        return json(await runner.webhook());
      case "state":
        return json(await runner.setState());
      default:
        return json({ error: `unknown action: ${body.action}` }, 400);
    }
  } catch (e) {
    console.error("[ghl-call-recordings]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

interface ClientRow {
  id: string;
  name: string;
}

class Runner {
  private apiCalls = 0;
  private budget = clampBudget(this.body.budget);
  private daysBack = Math.max(1, Math.min(Number(this.body.days_back ?? 30), 180));
  private minDuration = Math.max(0, Number(this.body.min_duration_seconds ?? DEFAULT_MIN_DURATION_SECONDS));
  private owner = `run-${crypto.randomUUID()}`;

  constructor(private sb: any, private body: any) {}

  private since(): Date {
    return new Date(Date.now() - this.daysBack * 86400_000);
  }

  private async ghl(path: string, apiKey: string, label: string): Promise<Response | null> {
    if (this.apiCalls >= this.budget.maxApiCalls) return null;
    this.apiCalls++;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`${GHL_BASE}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Accept: "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 3) return res;
        await res.body?.cancel().catch(() => {});
        const wait = Number(res.headers.get("Retry-After")) * 1000 || 2000 * attempt;
        console.warn(`[ghl-call-recordings] ${label} ${res.status}, retry ${attempt}/3`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return res;
    }
    return null;
  }

  /** Probe the recording endpoint without downloading the whole file. */
  private async probeRecording(locationId: string, messageId: string, apiKey: string) {
    if (this.apiCalls >= this.budget.maxApiCalls) return null;
    this.apiCalls++;
    const res = await fetch(recordingUrlFor(locationId, messageId), {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Range: "bytes=0-4095" },
    });
    const contentType = res.headers.get("content-type");
    const lenHeader = res.headers.get("content-range")?.split("/")?.[1] || res.headers.get("content-length");
    const contentLength = lenHeader && /^\d+$/.test(lenHeader) ? Number(lenHeader) : null;
    await res.body?.cancel().catch(() => {});
    return { status: res.status === 206 ? 200 : res.status, contentType, contentLength };
  }

  private async clients(): Promise<ClientRow[]> {
    let q = this.sb.from("clients").select("id, name").not("ghl_api_key", "is", null).not("ghl_location_id", "is", null);
    if (this.body.client_id) q = q.eq("id", this.body.client_id);
    else q = q.eq("status", "active");
    const { data, error } = await q.order("name").limit(this.budget.maxClients);
    if (error) throw error;
    return (data || []) as ClientRow[];
  }

  /** Walk conversations → call messages for one client, bounded by the run budget. */
  private async *callMessages(client: ClientRow, apiKey: string, locationId: string) {
    const since = this.since();
    let convCursor: { id: string; date: string | null } | null = null;
    let conversations = 0;
    let calls = 0;

    while (conversations < this.budget.maxConversationsPerClient && calls < this.budget.maxCallsPerClient) {
      let path = `/conversations/search?locationId=${encodeURIComponent(locationId)}&limit=100&sortBy=last_message_date&sort=desc`;
      if (convCursor?.id) {
        path += `&startAfterId=${encodeURIComponent(convCursor.id)}`;
        if (convCursor.date) path += `&startAfterDate=${encodeURIComponent(String(new Date(convCursor.date).getTime()))}`;
      }
      const res = await this.ghl(path, apiKey, `conversations ${client.name}`);
      if (!res) return;
      if (!res.ok) {
        console.warn(`[ghl-call-recordings] conversations ${res.status} for ${client.name}`);
        return;
      }
      const page = await res.json();
      const list: { id?: string; contactId?: string; lastMessageDate?: string }[] = page?.conversations || [];
      if (!list.length) return;

      for (const conv of list) {
        if (!conv.id) continue;
        if (conv.lastMessageDate && new Date(conv.lastMessageDate) < since) return;
        conversations++;

        let msgCursor: string | null = null;
        let pages = 0;
        while (pages < 10 && calls < this.budget.maxCallsPerClient) {
          let mp = `/conversations/${encodeURIComponent(conv.id)}/messages?limit=100`;
          if (msgCursor) mp += `&lastMessageId=${encodeURIComponent(msgCursor)}`;
          const mres = await this.ghl(mp, apiKey, `messages ${conv.id}`);
          if (!mres || !mres.ok) break;
          const mbody = await mres.json();
          const messages: CallMessage[] = mbody?.messages?.messages || mbody?.messages || [];
          if (!messages.length) break;

          let olderThanWindow = false;
          for (const msg of messages) {
            if (msg.dateAdded && new Date(msg.dateAdded) < since) {
              olderThanWindow = true;
              continue;
            }
            if (!isCallMessage(msg) || !isCompletedCall(msg)) continue;
            calls++;
            yield { msg, conversationId: conv.id, contactId: msg.contactId || conv.contactId || null };
            if (calls >= this.budget.maxCallsPerClient) break;
          }

          const next = nextMessageCursor(messages, msgCursor);
          if (!next || olderThanWindow) break;
          msgCursor = next;
          pages++;
        }
        if (conversations >= this.budget.maxConversationsPerClient) break;
      }

      const nextConv = nextConversationCursor(list, convCursor);
      if (!nextConv) return;
      convCursor = nextConv;
    }
  }

  // ---------------------------------------------------------------- audit (read-only)
  async audit() {
    const out: any[] = [];
    for (const client of await this.clients()) {
      const { apiKey, locationId } = await getMappedGhl(this.sb, client.id);
      if (!apiKey || !locationId) {
        out.push({ client: client.name, client_id: client.id, blocked: "no_crm_credentials" });
        continue;
      }
      const reasons: Record<string, number> = {};
      let calls = 0;
      let probes = 0;
      const maxProbes = Math.max(1, Math.min(Number(this.body.probe_limit ?? 15), 50));

      for await (const { msg } of this.callMessages(client, apiKey, locationId)) {
        calls++;
        if (probes >= maxProbes) continue;
        probes++;
        const probe = await this.probeRecording(locationId, msg.id, apiKey);
        if (!probe) break;
        const reason = recordingEligibility({
          availability: classifyProbe(probe),
          durationSeconds: callDurationSeconds(msg),
          minDurationSeconds: this.minDuration,
        });
        reasons[reason] = (reasons[reason] || 0) + 1;
      }

      out.push({
        client: client.name,
        client_id: client.id,
        window_days: this.daysBack,
        calls_found: calls,
        recordings_probed: probes,
        reasons,
        recommend_capture: (reasons.available || 0) > 0,
      });
    }
    return { ok: true, action: "audit", read_only: true, api_calls: this.apiCalls, clients: out };
  }

  // ---------------------------------------------------------------- capture
  async capture() {
    const results: any[] = [];
    for (const client of await this.clients()) {
      const state = await this.leaseClient(client.id);
      if (!state.acquired) {
        results.push({ client: client.name, skipped: state.reason });
        continue;
      }
      try {
        results.push(await this.captureClient(client));
      } catch (e) {
        await this.sb
          .from("call_recording_capture_state")
          .update({ last_error: (e as Error).message.slice(0, 500), lease_owner: null, lease_expires_at: null })
          .eq("client_id", client.id);
        results.push({ client: client.name, error: (e as Error).message });
      }
    }
    return { ok: true, action: "capture", api_calls: this.apiCalls, results };
  }

  /** Single-flight lease per client; a concurrent run skips instead of doubling up. */
  private async leaseClient(clientId: string): Promise<{ acquired: boolean; reason?: string }> {
    const { data: existing } = await this.sb
      .from("call_recording_capture_state")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (!existing) {
      await this.sb.from("call_recording_capture_state").insert({ client_id: clientId, enabled: false });
      return { acquired: false, reason: "capture_disabled" };
    }
    if (!existing.enabled && this.body.force !== true) return { acquired: false, reason: "capture_disabled" };
    if (!existing.consent_confirmed_at && this.body.force !== true) {
      return { acquired: false, reason: "recording_consent_unconfirmed" };
    }
    if (existing.lease_expires_at && new Date(existing.lease_expires_at) > new Date()) {
      return { acquired: false, reason: "already_running" };
    }

    const { data: leased } = await this.sb
      .from("call_recording_capture_state")
      .update({
        lease_owner: this.owner,
        lease_expires_at: new Date(Date.now() + LEASE_SECONDS * 1000).toISOString(),
      })
      .eq("client_id", clientId)
      .is("lease_owner", existing.lease_owner)
      .select("lease_owner")
      .maybeSingle();

    return leased?.lease_owner === this.owner ? { acquired: true } : { acquired: false, reason: "already_running" };
  }

  private async captureClient(client: ClientRow) {
    const { apiKey, locationId } = await getMappedGhl(this.sb, client.id);
    if (!apiKey || !locationId) throw new Error("no CRM credentials");

    const stats: Record<string, number> = { calls: 0, new: 0, updated: 0, eligible: 0 };
    const reasons: Record<string, number> = {};

    for await (const { msg, conversationId, contactId } of this.callMessages(client, apiKey, locationId)) {
      stats.calls++;
      const callId = callRecordKey(locationId, msg.id);

      const { data: existing } = await this.sb
        .from("phone_call_records")
        .select("id, recording_status, recording_attempts, transcription_status")
        .eq("call_id", callId)
        .maybeSingle();

      // Already resolved: never re-probe, never re-transcribe, never re-bill.
      if (existing?.transcription_status === "completed") {
        stats.updated++;
        reasons.already_transcribed = (reasons.already_transcribed || 0) + 1;
        continue;
      }
      const attempts = Number(existing?.recording_attempts || 0);
      if (existing && !shouldRetry((existing.recording_status || "recording_unreachable") as RecordingAvailability, attempts)) {
        reasons[existing.recording_status || "retries_exhausted"] =
          (reasons[existing.recording_status || "retries_exhausted"] || 0) + 1;
        continue;
      }

      const probe = await this.probeRecording(locationId, msg.id, apiKey);
      if (!probe) break; // budget spent — next run resumes here
      const duration = callDurationSeconds(msg);
      const reason = recordingEligibility({
        availability: classifyProbe(probe),
        durationSeconds: duration,
        minDurationSeconds: this.minDuration,
      });
      reasons[reason] = (reasons[reason] || 0) + 1;

      const row: Record<string, unknown> = {
        call_id: callId,
        client_id: client.id,
        provider: "ghl_recording_capture",
        contact_id: contactId,
        direction: msg.direction || null,
        call_status: callStatus(msg),
        started_at: msg.dateAdded || null,
        duration_seconds: duration,
        connected: reason === "available" || (duration ?? 0) > 0,
        recording_url: reason === "available" ? recordingUrlFor(locationId, msg.id) : null,
        recording_status: reason,
        recording_checked_at: new Date().toISOString(),
        recording_attempts: attempts + 1,
        transcription_status: reason === "available" ? "pending" : "awaiting_recording",
        raw_payload: { source: "ghl-call-recordings", conversation_id: conversationId, message_id: msg.id, meta: msg.meta ?? null },
      };

      const { error } = await this.sb.from("phone_call_records").upsert(row, { onConflict: "call_id" });
      if (error) throw error;
      if (existing) stats.updated++;
      else stats.new++;
      if (reason === "available") stats.eligible++;
    }

    await this.sb
      .from("call_recording_capture_state")
      .update({
        lease_owner: null,
        lease_expires_at: null,
        last_run_at: new Date().toISOString(),
        last_run_stats: { ...stats, reasons, window_days: this.daysBack },
        last_error: null,
      })
      .eq("client_id", client.id);

    return { client: client.name, client_id: client.id, ...stats, reasons };
  }

  // ---------------------------------------------------------------- webhook (one call)
  async webhook() {
    const messageId = String(this.body.message_id || this.body.messageId || "").trim();
    const clientId = String(this.body.client_id || "").trim();
    if (!messageId || !clientId) return { ok: false, error: "message_id and client_id are required" };

    const { apiKey, locationId } = await getMappedGhl(this.sb, clientId);
    if (!apiKey || !locationId) return { ok: false, error: "no CRM credentials" };

    const { data: state } = await this.sb
      .from("call_recording_capture_state")
      .select("enabled, consent_confirmed_at")
      .eq("client_id", clientId)
      .maybeSingle();
    if (!state?.enabled || !state?.consent_confirmed_at) {
      return { ok: false, skipped: "capture_disabled_or_consent_unconfirmed" };
    }

    const probe = await this.probeRecording(locationId, messageId, apiKey);
    const duration = Number(this.body.duration_seconds ?? this.body.duration ?? NaN);
    const reason = probe
      ? recordingEligibility({
          availability: classifyProbe(probe),
          durationSeconds: Number.isFinite(duration) ? duration : null,
          minDurationSeconds: this.minDuration,
        })
      : "recording_unreachable";

    const callId = callRecordKey(locationId, messageId);
    const { error } = await this.sb.from("phone_call_records").upsert(
      {
        call_id: callId,
        client_id: clientId,
        provider: "ghl_recording_webhook",
        contact_id: this.body.contact_id || null,
        direction: this.body.direction || null,
        call_status: this.body.call_status || null,
        started_at: this.body.started_at || new Date().toISOString(),
        duration_seconds: Number.isFinite(duration) ? duration : null,
        recording_url: reason === "available" ? recordingUrlFor(locationId, messageId) : null,
        recording_status: reason,
        recording_checked_at: new Date().toISOString(),
        transcription_status: reason === "available" ? "pending" : "awaiting_recording",
        raw_payload: { source: "ghl-call-recordings:webhook", message_id: messageId },
      },
      { onConflict: "call_id" },
    );
    if (error) throw error;
    return { ok: true, call_id: callId, recording_status: reason };
  }

  // ---------------------------------------------------------------- per-client state
  async setState() {
    const clientId = String(this.body.client_id || "").trim();
    if (!clientId) return { ok: false, error: "client_id required" };
    const patch: Record<string, unknown> = { client_id: clientId };
    if (this.body.enabled !== undefined) patch.enabled = this.body.enabled === true;
    if (this.body.consent_confirmed === true) {
      patch.consent_confirmed_at = new Date().toISOString();
      patch.consent_confirmed_by = String(this.body.confirmed_by || "operator").slice(0, 200);
    }
    if (this.body.consent_confirmed === false) {
      patch.consent_confirmed_at = null;
      patch.consent_confirmed_by = null;
    }
    const { data, error } = await this.sb
      .from("call_recording_capture_state")
      .upsert(patch, { onConflict: "client_id" })
      .select("client_id, enabled, consent_confirmed_at, consent_confirmed_by, last_run_at, last_run_stats")
      .maybeSingle();
    if (error) throw error;
    return { ok: true, state: data };
  }
}
