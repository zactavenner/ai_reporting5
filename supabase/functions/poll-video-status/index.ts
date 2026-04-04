import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getGeminiApiKey } from '../_shared/get-gemini-key.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Poll for video generation status.
 * Currently generate-video-from-image returns synchronously,
 * but this endpoint exists for future async generation support
 * and for polling Veo3 operations.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { operationId, apiKey } = await req.json();

    if (!operationId) {
      return new Response(
        JSON.stringify({ error: 'operationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If operationId is a Google Generative AI operation, poll it
    if (operationId.startsWith('operations/')) {
      const resolvedKey = await getGeminiApiKey(apiKey, 'video');
      if (!resolvedKey) {
        return new Response(
          JSON.stringify({ status: 'failed', error: 'No API key available for polling' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationId}?key=${resolvedKey}`;
      const pollResponse = await fetch(pollUrl);

      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        console.error('Poll error:', pollResponse.status, errorText);
        return new Response(
          JSON.stringify({ status: 'processing', progress: 0.5 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pollData = await pollResponse.json();

      if (pollData.done) {
        // Check for video result
        const result = pollData.response;
        if (result?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri) {
          const videoUri = result.generateVideoResponse.generatedSamples[0].video.uri;
          const videoUrl = `${videoUri}?key=${resolvedKey}`;
          return new Response(
            JSON.stringify({ status: 'completed', videoUrl }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for error
        if (pollData.error) {
          return new Response(
            JSON.stringify({ status: 'failed', error: pollData.error.message || 'Generation failed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ status: 'failed', error: 'No video in completed response' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Still processing
      const progress = pollData.metadata?.progress || 0.5;
      return new Response(
        JSON.stringify({ status: 'processing', progress }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For non-Google operations, return completed (synchronous generation)
    return new Response(
      JSON.stringify({ status: 'completed', videoUrl: operationId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Poll video status error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
