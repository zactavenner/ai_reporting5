import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getGeminiApiKey } from '../_shared/get-gemini-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Generate B-roll video from a text prompt using Veo3 (text-to-video).
 * No image input required — purely prompt-driven.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, aspectRatio = '16:9', duration = 8, apiKey: clientApiKey } = await req.json();

    if (!prompt?.trim()) {
      return new Response(
        JSON.stringify({ error: 'prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiKey = await getGeminiApiKey(clientApiKey, 'video');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'No Google AI API key configured. Add GEMINI_API_KEY in settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Generating B-roll video from prompt: ${prompt.substring(0, 100)}...`);

    // Use Veo3 text-to-video (no image input)
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-preview:predictLongRunning?key=${apiKey}`;

    const requestBody = {
      instances: [{ prompt }],
      parameters: {
        aspectRatio,
        sampleCount: 1,
        durationSeconds: duration,
        personGeneration: 'dont_allow', // B-roll = no people
      },
    };

    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Veo3 API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Video generation failed: ${response.status}`, details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await response.json();

    // Check if it's an async operation
    if (data.name) {
      console.log(`B-roll generation started, operation: ${data.name}`);
      return new Response(
        JSON.stringify({
          status: 'processing',
          operationId: data.name,
          message: 'B-roll video generation started. Poll for completion.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check for immediate result
    if (data.predictions?.[0]?.videoUri) {
      const videoUrl = `${data.predictions[0].videoUri}?key=${apiKey}`;
      return new Response(
        JSON.stringify({ status: 'completed', videoUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unexpected response format', details: JSON.stringify(data).substring(0, 500) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Generate B-roll error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
