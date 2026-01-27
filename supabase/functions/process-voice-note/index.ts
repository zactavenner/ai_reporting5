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
    const { audioBase64, clientId, clientName, isPublicRecording, durationSeconds } = await req.json();

    if (!audioBase64 || !clientId) {
      return new Response(
        JSON.stringify({ error: "Missing audioBase64 or clientId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Gemini API key from agency settings
    const { data: settings } = await supabase
      .from("agency_settings")
      .select("gemini_api_key")
      .limit(1)
      .single();

    const geminiApiKey = settings?.gemini_api_key;
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured in agency settings" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing voice note for client:", clientId);

    // Step 1: Transcribe audio using Gemini
    const transcriptResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: audioBase64,
                  },
                },
                {
                  text: "Transcribe this audio recording accurately. Only output the transcription, nothing else.",
                },
              ],
            },
          ],
        }),
      }
    );

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error("Transcription error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to transcribe audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transcriptData = await transcriptResponse.json();
    const transcript = transcriptData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!transcript.trim()) {
      return new Response(
        JSON.stringify({ error: "No speech detected in audio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Transcript:", transcript.substring(0, 100) + "...");

    // Step 2: Generate summary and extract action items using tool calling
    const analysisResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are analyzing a voice note recording from an agency meeting or call with a client${clientName ? ` named "${clientName}"` : ""}.

Transcript:
${transcript}

Based on this transcript, extract:
1. A short descriptive title (max 60 characters)
2. A concise 2-3 sentence summary of the key points discussed
3. Any action items or tasks mentioned that need to be done

Use the extract_voice_note_data function to return your analysis.`,
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: "extract_voice_note_data",
                  description: "Extract structured data from a voice note transcript",
                  parameters: {
                    type: "object",
                    properties: {
                      title: {
                        type: "string",
                        description: "Short descriptive title for the voice note (max 60 chars)",
                      },
                      summary: {
                        type: "string",
                        description: "2-3 sentence summary of the key points discussed",
                      },
                      action_items: {
                        type: "array",
                        description: "List of action items or tasks extracted from the transcript",
                        items: {
                          type: "object",
                          properties: {
                            title: {
                              type: "string",
                              description: "Task title",
                            },
                            description: {
                              type: "string",
                              description: "Optional task description",
                            },
                            priority: {
                              type: "string",
                              enum: ["low", "medium", "high"],
                              description: "Task priority",
                            },
                          },
                          required: ["title", "priority"],
                        },
                      },
                    },
                    required: ["title", "summary", "action_items"],
                  },
                },
              ],
            },
          ],
          tool_config: {
            function_calling_config: {
              mode: "ANY",
              allowed_function_names: ["extract_voice_note_data"],
            },
          },
        }),
      }
    );

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error("Analysis error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze transcript" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysisData = await analysisResponse.json();
    console.log("Analysis response:", JSON.stringify(analysisData, null, 2));

    // Extract function call result
    let title = "Voice Note";
    let summary = "";
    let actionItems: Array<{ title: string; description?: string; priority: string }> = [];

    const functionCall = analysisData.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.functionCall
    )?.functionCall;

    if (functionCall?.args) {
      title = functionCall.args.title || title;
      summary = functionCall.args.summary || "";
      actionItems = functionCall.args.action_items || [];
    }

    console.log("Extracted:", { title, summary, actionItemsCount: actionItems.length });

    // Step 3: Save voice note to database
    const { data: voiceNote, error: insertError } = await supabase
      .from("client_voice_notes")
      .insert({
        client_id: clientId,
        title,
        duration_seconds: durationSeconds || 0,
        transcript,
        summary,
        action_items: actionItems,
        recorded_by: isPublicRecording ? "Client" : "Agency",
        is_public_recording: isPublicRecording || false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save voice note" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Voice note saved:", voiceNote.id);

    // Step 4: Create pending tasks for approval
    if (actionItems.length > 0) {
      const pendingTasks = actionItems.map((item) => ({
        voice_note_id: voiceNote.id,
        client_id: clientId,
        title: item.title,
        description: item.description || null,
        priority: item.priority || "medium",
        status: "pending",
      }));

      const { error: tasksError } = await supabase
        .from("pending_meeting_tasks")
        .insert(pendingTasks);

      if (tasksError) {
        console.error("Error creating pending tasks:", tasksError);
        // Don't fail the whole request, just log the error
      } else {
        console.log("Created", pendingTasks.length, "pending tasks");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        voiceNote: {
          id: voiceNote.id,
          title,
          summary,
          transcript,
          action_items: actionItems,
          duration_seconds: durationSeconds,
        },
        tasksCreated: actionItems.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing voice note:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
