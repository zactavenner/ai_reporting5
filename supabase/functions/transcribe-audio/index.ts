import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio } = await req.json() as { audio: string };

    if (!audio) {
      return new Response(
        JSON.stringify({ error: "No audio provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch API key from agency_settings first, fallback to env var
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settings } = await supabase
      .from('agency_settings')
      .select('gemini_api_key')
      .limit(1)
      .maybeSingle();

    const GEMINI_API_KEY = settings?.gemini_api_key || Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it in Agency Settings.");
    }

    // Extract base64 data and mime type from data URL
    const matches = audio.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return new Response(
        JSON.stringify({ error: "Invalid audio format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "You are a transcription assistant. Your only job is to accurately transcribe the audio content provided. Return ONLY the transcribed text, nothing else. No explanations, no formatting, just the exact words spoken."
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Transcription error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Transcription failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const transcription = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(
      JSON.stringify({ text: transcription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
