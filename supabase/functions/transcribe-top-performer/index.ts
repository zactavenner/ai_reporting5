import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { uploadId, fileUrl, mimeType } = await req.json();
    if (!uploadId || !fileUrl) {
      return new Response(JSON.stringify({ error: "uploadId and fileUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("top_performer_uploads")
      .update({ transcription_status: "processing" }).eq("id", uploadId);

    const { data: settings } = await supabase
      .from("agency_settings").select("gemini_api_key").limit(1).maybeSingle();
    const GEMINI_API_KEY = settings?.gemini_api_key || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    // Download the file and base64-encode
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`);
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk) as any);
    }
    const base64 = btoa(binary);
    const mt = mimeType || fileRes.headers.get("content-type") || "video/mp4";

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Transcribe the spoken audio in this ad. Return ONLY the verbatim script — no labels, timestamps, or commentary. If there is no spoken audio, return 'No spoken audio.'" },
              { inline_data: { mime_type: mt, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const txt = await geminiRes.text();
      await supabase.from("top_performer_uploads")
        .update({ transcription_status: "failed", transcript: `Error: ${txt.slice(0, 300)}` })
        .eq("id", uploadId);
      throw new Error(`Gemini error: ${txt}`);
    }

    const result = await geminiRes.json();
    const transcript = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    await supabase.from("top_performer_uploads")
      .update({ transcript, transcription_status: "completed" }).eq("id", uploadId);

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-top-performer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
