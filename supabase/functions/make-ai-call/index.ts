import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs API key not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, agent_prompt, voice_id, contact_id, contact_name, campaign_id, client_id, client_context } = await req.json();

    if (!phone || !client_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: phone, client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Create outreach message record
    const { data: msgRecord, error: insertErr } = await supabase
      .from('outreach_messages')
      .insert({
        campaign_id: campaign_id || null,
        client_id,
        contact_id: contact_id || null,
        contact_name: contact_name || null,
        contact_phone: phone,
        channel: 'voice_call',
        direction: 'outbound',
        status: 'sending',
        message_body: agent_prompt || 'AI voice call',
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Failed to create call record:', insertErr);
      throw new Error(`DB insert failed: ${insertErr.message}`);
    }

    // Build the agent prompt with context
    const fullPrompt = [
      agent_prompt || 'You are a professional follow-up agent.',
      client_context ? `Context: ${client_context}` : '',
      contact_name ? `You are speaking with ${contact_name}.` : '',
    ].filter(Boolean).join('\n');

    // Call ElevenLabs Conversational AI API
    const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/convai/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        agent: {
          prompt: { prompt: fullPrompt },
          first_message: `Hi${contact_name ? ` ${contact_name}` : ''}, how are you doing today?`,
          language: 'en',
        },
        tts: voice_id ? { voiceId: voice_id } : undefined,
        phone_number: phone,
      }),
    });

    const elevenLabsData = await elevenLabsResponse.json();

    if (!elevenLabsResponse.ok) {
      console.error('ElevenLabs API error:', elevenLabsData);
      await supabase
        .from('outreach_messages')
        .update({
          status: 'failed',
          error_message: elevenLabsData.detail || `ElevenLabs error: ${elevenLabsResponse.status}`,
        })
        .eq('id', msgRecord.id);

      await supabase
        .from('integration_status')
        .update({
          last_sync_status: 'failed',
          last_error_message: elevenLabsData.detail || 'Call failed',
          error_count: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('integration_name', 'elevenlabs');

      return new Response(
        JSON.stringify({ error: 'ElevenLabs call failed', details: elevenLabsData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update message record
    await supabase
      .from('outreach_messages')
      .update({
        status: 'completed',
        elevenlabs_call_id: elevenLabsData.conversation_id || null,
        call_duration_seconds: elevenLabsData.duration || null,
        call_transcript: elevenLabsData.transcript || null,
        call_summary: elevenLabsData.summary || null,
        call_sentiment: elevenLabsData.sentiment || null,
      })
      .eq('id', msgRecord.id);

    // Update integration status
    await supabase
      .from('integration_status')
      .update({
        is_connected: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        records_synced: 1,
        error_count: 0,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('integration_name', 'elevenlabs');

    return new Response(
      JSON.stringify({ success: true, message_id: msgRecord.id, conversation_id: elevenLabsData.conversation_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error in make-ai-call:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
