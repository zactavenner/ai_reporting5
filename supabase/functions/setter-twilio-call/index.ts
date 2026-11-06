// Browser-started Twilio bridge: rings the setter's phone, then dials the lead,
// with Twilio live transcription streaming back to setter-call-events.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { toE164 } from "../_shared/phone.ts";

const INTERNAL_PASSWORD = "HPA1234$";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));

async function twilio(path: string, method: string, params?: Record<string, string>) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) throw new Error("Twilio connection is not configured");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TWILIO_API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Twilio [${res.status}]: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.password !== INTERNAL_PASSWORD) return json({ error: "unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (body.action === "hangup") {
      const { data: call } = await sb.from("setter_calls").select("id, twilio_call_sid").eq("id", String(body.call_id || "")).maybeSingle();
      if (!call?.twilio_call_sid) return json({ error: "call not found" }, 404);
      await twilio(`/Calls/${call.twilio_call_sid}.json`, "POST", { Status: "completed" });
      await sb.from("setter_calls").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", call.id);
      return json({ ok: true });
    }

    // action: start
    const clientId = String(body.client_id || "");
    const leadId = body.lead_id ? String(body.lead_id) : null;
    const to = toE164(body.to_phone);
    const setterPhone = toE164(body.setter_phone);
    if (!clientId) return json({ error: "client_id required" }, 400);
    if (!to) return json({ error: "Lead has no valid phone number" }, 400);
    if (!setterPhone) return json({ error: "Add your callback phone first — we ring you, then the lead" }, 400);

    const { data: settings } = await sb.from("client_settings").select("outbound_caller_number").eq("client_id", clientId).maybeSingle();
    let from = toE164(settings?.outbound_caller_number);
    if (!from) {
      const nums = await twilio("/IncomingPhoneNumbers.json?PageSize=1", "GET");
      from = nums?.incoming_phone_numbers?.[0]?.phone_number || null;
    }
    if (!from) return json({ error: "No Twilio phone number available to call from" }, 400);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { data: row, error } = await sb.from("setter_calls").insert({
      client_id: clientId, lead_id: leadId, setter_name: body.setter_name || null,
      setter_phone: setterPhone, to_phone: to, from_phone: from, webhook_token: token, status: "queued",
    }).select("id").single();
    if (error) throw error;

    const cb = `${Deno.env.get("SUPABASE_URL")}/functions/v1/setter-call-events?call=${row.id}&token=${token}`;
    const twiml =
      `<Response><Start><Transcription statusCallbackUrl="${esc(cb + "&kind=transcript")}" track="both_tracks" partialResults="false"/></Start>` +
      `<Say>Connecting your call.</Say><Dial callerId="${esc(from)}" timeout="30">${esc(to)}</Dial></Response>`;

    try {
      const call = await twilio("/Calls.json", "POST", {
        To: setterPhone, From: from, Twiml: twiml,
        StatusCallback: cb + "&kind=status",
        StatusCallbackEvent: "initiated ringing answered completed",
      });
      await sb.from("setter_calls").update({ twilio_call_sid: call.sid, status: "ringing_setter" }).eq("id", row.id);
    } catch (e) {
      const msg = String((e as Error).message);
      await sb.from("setter_calls").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", row.id);
      return json({ error: msg, call_id: row.id }, 502);
    }

    if (leadId) {
      await sb.from("contact_timeline_events").insert({
        client_id: clientId, lead_id: leadId, event_type: "call", event_subtype: "outbound",
        title: `Browser call${body.setter_name ? ` · ${body.setter_name}` : ""}`,
        event_at: new Date().toISOString(),
        metadata: { via: "setter", mode: "twilio_bridge", to, from, setter_call_id: row.id },
      });
    }
    return json({ ok: true, call_id: row.id });
  } catch (e) {
    console.error("[setter-twilio-call]", (e as Error)?.message || e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
