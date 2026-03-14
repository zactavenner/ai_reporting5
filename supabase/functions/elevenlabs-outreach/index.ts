import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Initiate an outbound call via ElevenLabs Conversational AI
async function initiateCall(
  apiKey: string,
  agentId: string,
  toPhone: string,
  fromPhone: string,
  customContext?: Record<string, string>
): Promise<{ success: boolean; callId?: string; conversationId?: string; error?: string }> {
  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversation/create-call`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: fromPhone,
        customer_phone_number: toPhone,
        ...(customContext ? { conversation_initiation_client_data: { dynamic_variables: customContext } } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.detail?.message || data.message || data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      callId: data.call_id || data.id,
      conversationId: data.conversation_id,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Get call/conversation details from ElevenLabs
async function getConversationDetails(
  apiKey: string,
  conversationId: string
): Promise<{
  status: string;
  duration?: number;
  transcript?: string;
  summary?: string;
  recordingUrl?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      return { status: 'error', error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    // Extract transcript from messages
    const transcript = data.transcript
      ?.map((t: any) => `${t.role}: ${t.message}`)
      .join('\n') || '';

    return {
      status: data.status || 'unknown',
      duration: data.metadata?.call_duration_secs || data.call_duration_secs,
      transcript,
      summary: data.analysis?.summary || data.summary,
      recordingUrl: data.metadata?.recording_url || data.recording_url,
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// List available voices from ElevenLabs
async function listVoices(apiKey: string): Promise<any[]> {
  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description,
      preview_url: v.preview_url,
      labels: v.labels,
    }));
  } catch {
    return [];
  }
}

// List agents from ElevenLabs
async function listAgents(apiKey: string): Promise<any[]> {
  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.agents || []).map((a: any) => ({
      agent_id: a.agent_id,
      name: a.name,
      phone_numbers: a.phone_numbers,
    }));
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();
    const { action, client_id, campaign_id, lead_id, to_phone, contact_name } = body;

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client ElevenLabs credentials
    const { data: settings } = await supabase
      .from('client_settings')
      .select('elevenlabs_api_key, elevenlabs_agent_id, elevenlabs_phone_number, ai_outreach_enabled')
      .eq('client_id', client_id)
      .single();

    if (!settings?.elevenlabs_api_key) {
      return new Response(
        JSON.stringify({
          error: 'ElevenLabs API key not configured',
          setup_required: true,
          instructions: 'Add your ElevenLabs API Key in Client Settings → AI Outreach tab'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: initiate_call ----
    if (action === 'initiate_call') {
      if (!to_phone) {
        return new Response(
          JSON.stringify({ error: 'to_phone is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!settings.elevenlabs_agent_id) {
        return new Response(
          JSON.stringify({ error: 'ElevenLabs Agent ID not configured. Create an agent in the ElevenLabs dashboard first.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get lead details for conversation context
      let leadContext: Record<string, string> = {};
      if (lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('name, email, phone, source, utm_source, pipeline_value')
          .eq('id', lead_id)
          .single();

        if (lead) {
          leadContext = {
            lead_name: lead.name || 'Unknown',
            lead_email: lead.email || '',
            lead_source: lead.source || lead.utm_source || 'Unknown',
            pipeline_value: String(lead.pipeline_value || 0),
          };
        }
      }

      if (contact_name) {
        leadContext.lead_name = contact_name;
      }

      // Get campaign voice script if applicable
      let voiceScript = '';
      if (campaign_id) {
        const { data: campaign } = await supabase
          .from('ai_outreach_campaigns')
          .select('voice_script, voice_greeting')
          .eq('id', campaign_id)
          .single();

        if (campaign) {
          voiceScript = campaign.voice_script || '';
          if (campaign.voice_greeting) {
            leadContext.greeting = campaign.voice_greeting;
          }
        }
      }

      const result = await initiateCall(
        settings.elevenlabs_api_key,
        settings.elevenlabs_agent_id,
        to_phone,
        settings.elevenlabs_phone_number || '',
        leadContext
      );

      // Record the call in the database
      const { data: messageRecord } = await supabase
        .from('ai_outreach_messages')
        .insert({
          campaign_id: campaign_id || null,
          client_id,
          lead_id: lead_id || null,
          channel: 'voice',
          direction: 'outbound',
          status: result.success ? 'calling' : 'failed',
          to_phone,
          contact_name: contact_name || leadContext.lead_name || null,
          elevenlabs_call_id: result.callId || null,
          elevenlabs_conversation_id: result.conversationId || null,
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
          metadata: { voice_script: voiceScript, lead_context: leadContext },
        })
        .select('id')
        .single();

      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: messageRecord?.id,
          call_id: result.callId,
          conversation_id: result.conversationId,
          error: result.error,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: get_call_result ----
    if (action === 'get_call_result') {
      const { conversation_id, message_id } = body;
      if (!conversation_id) {
        return new Response(
          JSON.stringify({ error: 'conversation_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const details = await getConversationDetails(settings.elevenlabs_api_key, conversation_id);

      // Update our record
      const updateData: Record<string, any> = {
        call_duration_seconds: details.duration || null,
        call_transcript: details.transcript || null,
        call_summary: details.summary || null,
        call_recording_url: details.recordingUrl || null,
        updated_at: new Date().toISOString(),
      };

      // Map ElevenLabs status to our status
      if (details.status === 'done' || details.status === 'completed') {
        updateData.status = details.duration && details.duration > 10 ? 'answered' : 'no_answer';
      } else if (details.status === 'failed') {
        updateData.status = 'failed';
      }

      // Check transcript for appointment booking signals
      if (details.transcript) {
        const appointmentSignals = [
          'book an appointment', 'schedule a call', 'set up a meeting',
          'sounds good', 'I\'m interested', 'let\'s do it', 'sign me up',
          'what time works', 'I can do', 'available on',
        ];
        const lowerTranscript = details.transcript.toLowerCase();
        const hasAppointmentSignal = appointmentSignals.some(s => lowerTranscript.includes(s));

        if (hasAppointmentSignal) {
          updateData.appointment_booked = true;
          updateData.status = 'appointment_booked';
          updateData.appointment_notes = 'Auto-detected appointment intent from call transcript';
        }
      }

      if (message_id) {
        await supabase
          .from('ai_outreach_messages')
          .update(updateData)
          .eq('id', message_id);
      } else {
        await supabase
          .from('ai_outreach_messages')
          .update(updateData)
          .eq('elevenlabs_conversation_id', conversation_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: details.status,
          duration: details.duration,
          transcript: details.transcript,
          summary: details.summary,
          recording_url: details.recordingUrl,
          appointment_detected: updateData.appointment_booked || false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: list_voices ----
    if (action === 'list_voices') {
      const voices = await listVoices(settings.elevenlabs_api_key);
      return new Response(
        JSON.stringify({ success: true, voices }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: list_agents ----
    if (action === 'list_agents') {
      const agents = await listAgents(settings.elevenlabs_api_key);
      return new Response(
        JSON.stringify({ success: true, agents }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: test_connection ----
    if (action === 'test_connection') {
      try {
        const response = await fetch(`${ELEVENLABS_API_BASE}/user`, {
          method: 'GET',
          headers: { 'xi-api-key': settings.elevenlabs_api_key },
        });

        if (response.ok) {
          const data = await response.json();
          const voices = await listVoices(settings.elevenlabs_api_key);
          const agents = await listAgents(settings.elevenlabs_api_key);

          return new Response(
            JSON.stringify({
              success: true,
              connected: true,
              subscription: data.subscription?.tier || 'unknown',
              character_count: data.subscription?.character_count,
              character_limit: data.subscription?.character_limit,
              available_voices: voices.length,
              available_agents: agents.length,
              agent_configured: !!settings.elevenlabs_agent_id,
              phone_configured: !!settings.elevenlabs_phone_number,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              connected: false,
              error: `ElevenLabs API returned ${response.status}`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            connected: false,
            error: err instanceof Error ? err.message : 'Connection failed',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ---- ACTION: run_campaign_calls ----
    if (action === 'run_campaign_calls') {
      if (!campaign_id) {
        return new Response(
          JSON.stringify({ error: 'campaign_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!settings.elevenlabs_agent_id) {
        return new Response(
          JSON.stringify({ error: 'ElevenLabs Agent ID must be configured first' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: campaign } = await supabase
        .from('ai_outreach_campaigns')
        .select('*')
        .eq('id', campaign_id)
        .single();

      if (!campaign || campaign.status !== 'active') {
        return new Response(
          JSON.stringify({ error: 'Campaign not found or not active' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get eligible leads
      const { data: eligibleLeads } = await supabase
        .from('leads')
        .select('id, name, phone, email, source, utm_source, pipeline_value, status')
        .eq('client_id', client_id)
        .not('phone', 'is', null)
        .in('status', campaign.target_lead_statuses || ['new'])
        .limit(20); // Small batches for voice calls

      if (!eligibleLeads || eligibleLeads.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No eligible leads to call', called: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Filter out leads that already have max attempts
      const leadIds = eligibleLeads.map(l => l.id);
      const { data: existingCalls } = await supabase
        .from('ai_outreach_messages')
        .select('lead_id, attempt_number')
        .eq('campaign_id', campaign_id)
        .eq('channel', 'voice')
        .in('lead_id', leadIds)
        .order('attempt_number', { ascending: false });

      const attemptsByLead = new Map<string, number>();
      for (const call of existingCalls || []) {
        if (call.lead_id && !attemptsByLead.has(call.lead_id)) {
          attemptsByLead.set(call.lead_id, call.attempt_number);
        }
      }

      let called = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const lead of eligibleLeads) {
        const currentAttempts = attemptsByLead.get(lead.id) || 0;
        if (currentAttempts >= (campaign.max_attempts_per_lead || 3)) {
          skipped++;
          continue;
        }

        const leadContext: Record<string, string> = {
          lead_name: lead.name || 'Unknown',
          lead_email: lead.email || '',
          lead_source: lead.source || lead.utm_source || 'Unknown',
        };
        if (campaign.voice_greeting) {
          leadContext.greeting = campaign.voice_greeting
            .replace(/\{name\}/gi, lead.name || 'there')
            .replace(/\{first_name\}/gi, (lead.name || 'there').split(' ')[0]);
        }

        const result = await initiateCall(
          settings.elevenlabs_api_key,
          settings.elevenlabs_agent_id,
          lead.phone!,
          settings.elevenlabs_phone_number || '',
          leadContext
        );

        await supabase.from('ai_outreach_messages').insert({
          campaign_id,
          client_id,
          lead_id: lead.id,
          channel: 'voice',
          direction: 'outbound',
          status: result.success ? 'calling' : 'failed',
          to_phone: lead.phone!,
          contact_name: lead.name,
          elevenlabs_call_id: result.callId || null,
          elevenlabs_conversation_id: result.conversationId || null,
          attempt_number: currentAttempts + 1,
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
          metadata: { voice_script: campaign.voice_script, lead_context: leadContext },
        });

        if (result.success) {
          called++;
        } else {
          errors.push(`${lead.name || lead.phone}: ${result.error}`);
        }

        // Space calls 30 seconds apart
        await new Promise(resolve => setTimeout(resolve, 30000));
      }

      await supabase
        .from('ai_outreach_campaigns')
        .update({
          total_sent: (campaign.total_sent || 0) + called,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id);

      return new Response(
        JSON.stringify({ success: true, called, skipped, errors: errors.slice(0, 5) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: `Unknown action: ${action}. Valid: initiate_call, get_call_result, list_voices, list_agents, test_connection, run_campaign_calls`
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('ElevenLabs outreach error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
