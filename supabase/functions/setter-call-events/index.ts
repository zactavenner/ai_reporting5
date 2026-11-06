// Twilio callbacks for setter browser calls: call status + live transcription lines.
// Authenticated by a per-call random token that is never readable by the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const ok = () => new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });

function timingSafeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const callId = url.searchParams.get("call") || "";
  const token = url.searchParams.get("token") || "";
  const kind = url.searchParams.get("kind") || "";
  if (!callId || !token) return new Response("bad request", { status: 400 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: call } = await sb.from("setter_calls").select("id, webhook_token, status").eq("id", callId).maybeSingle();
  if (!call || !timingSafeEq(call.webhook_token, token)) return new Response("forbidden", { status: 403 });

  const form = new URLSearchParams(await req.text());

  if (kind === "status") {
    const s = (form.get("CallStatus") || "").toLowerCase();
    const map: Record<string, string> = { ringing: "ringing_setter", "in-progress": "in_progress", completed: "completed", busy: "failed", "no-answer": "no_answer", failed: "failed", canceled: "completed" };
    const status = map[s];
    if (status) {
      const end = ["completed", "failed", "no_answer"].includes(status);
      await sb.from("setter_calls").update({ status, ...(end ? { ended_at: new Date().toISOString() } : {}) }).eq("id", callId);
    }
    return ok();
  }

  if (kind === "transcript" && form.get("TranscriptionEvent") === "transcription-content") {
    if (String(form.get("Final")).toLowerCase() !== "true") return ok();
    let text = "";
    try { text = JSON.parse(form.get("TranscriptionData") || "{}").transcript || ""; } catch { /* ignore */ }
    text = text.trim().slice(0, 2000);
    if (text) {
      // Parent leg rings the setter: inbound = setter's voice, outbound = what the setter hears (the lead).
      const speaker = form.get("Track") === "inbound_track" ? "setter" : "lead";
      await sb.from("setter_call_lines").insert({ call_id: callId, speaker, body: text });
    }
  }
  return ok();
});
