import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, creative, videoUrl, transcript } = await req.json();

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

    // New action: Spelling and grammar check for ad copy (text, images, and videos)
    if (action === "spelling_check") {
      // Build text content from all available sources
      let textContent = `
Headline: ${creative?.headline || '(none)'}
Body Copy: ${creative?.body_copy || '(none)'}
CTA: ${creative?.cta_text || '(none)'}
      `.trim();

      // Add transcript for video content if provided
      if (transcript) {
        textContent += `\n\nVideo Transcript/Spoken Content:\n${transcript}`;
      }

      // Skip if no text content at all
      const hasTextFields = creative?.headline || creative?.body_copy || creative?.cta_text;
      const hasTranscript = !!transcript;
      
      if (!hasTextFields && !hasTranscript) {
        return new Response(
          JSON.stringify({ 
            hasErrors: false, 
            severity: "none", 
            errors: [], 
            summary: "No text content to review" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
                    text: `You are a professional proofreader for advertising copy. Analyze this ad copy for spelling, grammar, and number formatting errors.

${textContent}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "hasErrors": true or false,
  "severity": "none" or "minor" or "critical",
  "errors": [{"text": "the incorrect word/phrase", "issue": "description of error", "suggestion": "corrected version"}],
  "summary": "Brief 1-2 sentence summary of issues found, or 'No issues found' if clean"
}

IMPORTANT RULES:
1. **Number Formatting (CRITICAL)**: Numbers should use "#" symbol, not written out. 
   - WRONG: "number one market", "number 1 market"
   - CORRECT: "#1 market"
   - This applies to rankings, positions, and similar numeric references in marketing

2. **Spelling & Grammar**: Check for typos, misspellings, subject-verb agreement, etc.

3. **Video/Audio Transcripts**: If transcript is provided, check spoken content for the same issues.

Severity guide:
- "critical" = Spelling mistakes, major grammar errors, or numbers written out instead of using # symbol
- "minor" = Minor punctuation issues, spacing problems, capitalization inconsistencies
- "none" = Clean copy with no errors

Focus ONLY on objective errors, not style preferences. Marketing abbreviations and intentional stylization are acceptable.`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Spelling check error:", response.status, errorText);
        throw new Error("Spelling check failed");
      }

      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      // Parse the JSON response
      try {
        // Clean up the response - remove markdown code blocks if present
        let cleanedText = rawText.trim();
        if (cleanedText.startsWith("```json")) {
          cleanedText = cleanedText.slice(7);
        } else if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.slice(3);
        }
        if (cleanedText.endsWith("```")) {
          cleanedText = cleanedText.slice(0, -3);
        }
        cleanedText = cleanedText.trim();
        
        const parsed = JSON.parse(cleanedText);
        return new Response(
          JSON.stringify(parsed),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (parseError) {
        console.error("Failed to parse AI response:", rawText);
        // Return a safe default if parsing fails
        return new Response(
          JSON.stringify({ 
            hasErrors: false, 
            severity: "none", 
            errors: [], 
            summary: "Unable to analyze copy" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "transcribe") {
      if (!videoUrl) {
        return new Response(
          JSON.stringify({ error: "No video URL provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
                    text: `You are a video transcription and analysis expert. Analyze this video URL and provide:
1. Describe what's happening in the video in detail
2. Transcribe any spoken words, text overlays, or captions
3. Note any background music or sound effects
4. Identify key messaging and calls to action

Format your response as:
**Visual Description:**
[Description of visuals]

**Spoken/Text Content:**
[Transcription of any speech or text]

**Audio Elements:**
[Description of music/sounds]

**Key Messaging:**
[Main marketing message and CTAs]

Video URL: ${videoUrl}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Transcription error:", response.status, errorText);
        throw new Error("Transcription failed");
      }

      const result = await response.json();
      const transcription = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(
        JSON.stringify({ transcript: transcription }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "audit") {
      const creativeDetails = `
Title: ${creative.title || 'N/A'}
Type: ${creative.type || 'N/A'}
Platform: ${creative.platform || 'N/A'}
Headline: ${creative.headline || 'N/A'}
Body Copy: ${creative.body_copy || 'N/A'}
CTA: ${creative.cta_text || 'N/A'}
${transcript ? `Video Transcript: ${transcript}` : ''}
${creative.file_url ? `File URL: ${creative.file_url}` : ''}
      `.trim();

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
                    text: `You are an expert digital advertising strategist and creative director with 15+ years of experience in paid social advertising. Analyze this ad creative and provide actionable feedback.

Your audit should cover:
1. **Overall Score (1-10)**: Rate the creative's effectiveness
2. **Headline Analysis**: Is it compelling? Clear value prop?
3. **Visual/Video Quality**: Professional? Attention-grabbing?
4. **Messaging Clarity**: Is the offer clear?
5. **CTA Effectiveness**: Strong action driver?
6. **Platform Optimization**: Suited for the target platform?
7. **Emotional Appeal**: Does it connect with the audience?
8. **Compliance Check**: Any potential ad policy issues?

Format with clear sections and be specific with recommendations.

Ad Creative Details:
${creativeDetails}`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Audit error:", response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limited, please try again later" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        throw new Error("Audit failed");
      }

      const result = await response.json();
      const audit = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(
        JSON.stringify({ audit }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Creative AI error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
