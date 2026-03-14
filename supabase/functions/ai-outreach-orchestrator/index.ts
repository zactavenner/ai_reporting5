import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * AI Outreach Orchestrator
 *
 * Manages multi-channel outreach sequences:
 * 1. SMS/iMessage via SendBlue → warm the lead
 * 2. Voice call via ElevenLabs → convert to appointment
 * 3. Follow-up SMS → confirm appointment
 *
 * Flow: Lead comes in → SMS intro → Wait for response →
 *       If responded, schedule voice call → AI agent books appointment →
 *       Confirmation SMS sent → Appointment synced to GHL calendar
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action, client_id, campaign_id } = body;

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: run_sequence ----
    // Main orchestrator: processes active campaigns and advances leads through the sequence
    if (action === 'run_sequence') {
      // Get all active campaigns for this client
      const campaignFilter: any = { client_id, status: 'active' };
      let campaignsQuery = supabase
        .from('ai_outreach_campaigns')
        .select('*')
        .eq('client_id', client_id)
        .eq('status', 'active');

      if (campaign_id) {
        campaignsQuery = campaignsQuery.eq('id', campaign_id);
      }

      const { data: campaigns } = await campaignsQuery;

      if (!campaigns || campaigns.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No active campaigns', processed: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if we're in the send window
      const settings_q = await supabase
        .from('client_settings')
        .select('sendblue_api_key, elevenlabs_api_key, ai_outreach_enabled')
        .eq('client_id', client_id)
        .single();

      if (!settings_q.data?.ai_outreach_enabled) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI outreach is not enabled for this client' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results: any[] = [];

      for (const campaign of campaigns) {
        const campaignResult = {
          campaign_id: campaign.id,
          name: campaign.name,
          type: campaign.campaign_type,
          sms_sent: 0,
          calls_made: 0,
          appointments_booked: 0,
          errors: [] as string[],
        };

        try {
          // Check time window
          const now = new Date();
          const currentHour = now.getHours();
          const startHour = parseInt((campaign.send_window_start || '09:00').split(':')[0]);
          const endHour = parseInt((campaign.send_window_end || '18:00').split(':')[0]);

          if (currentHour < startHour || currentHour >= endHour) {
            campaignResult.errors.push(`Outside send window (${campaign.send_window_start}-${campaign.send_window_end})`);
            results.push(campaignResult);
            continue;
          }

          // Check day of week
          const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const currentDay = dayMap[now.getDay()];
          if (!(campaign.send_days || []).includes(currentDay)) {
            campaignResult.errors.push(`Not a send day (${currentDay})`);
            results.push(campaignResult);
            continue;
          }

          // --- STEP 1: Find leads that need initial SMS outreach ---
          if (campaign.campaign_type === 'sms' || campaign.campaign_type === 'multi_channel') {
            if (settings_q.data?.sendblue_api_key) {
              const sendResult = await fetch(`${supabaseUrl}/functions/v1/sendblue-outreach`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  action: 'send_campaign_batch',
                  client_id,
                  campaign_id: campaign.id,
                }),
              });

              const sendData = await sendResult.json();
              campaignResult.sms_sent = sendData.sent || 0;
              if (sendData.errors?.length > 0) {
                campaignResult.errors.push(...sendData.errors);
              }
            }
          }

          // --- STEP 2: Find leads that responded to SMS → schedule voice calls ---
          if (campaign.campaign_type === 'voice' || campaign.campaign_type === 'multi_channel') {
            if (settings_q.data?.elevenlabs_api_key) {
              const callResult = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-outreach`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                  action: 'run_campaign_calls',
                  client_id,
                  campaign_id: campaign.id,
                }),
              });

              const callData = await callResult.json();
              campaignResult.calls_made = callData.called || 0;
              if (callData.errors?.length > 0) {
                campaignResult.errors.push(...callData.errors);
              }
            }
          }

          // --- STEP 3: Check completed calls for appointment bookings ---
          const { data: pendingCalls } = await supabase
            .from('ai_outreach_messages')
            .select('id, elevenlabs_conversation_id, status')
            .eq('campaign_id', campaign.id)
            .eq('channel', 'voice')
            .eq('status', 'calling')
            .not('elevenlabs_conversation_id', 'is', null);

          if (pendingCalls && pendingCalls.length > 0 && settings_q.data?.elevenlabs_api_key) {
            for (const call of pendingCalls) {
              try {
                const resultResp = await fetch(`${supabaseUrl}/functions/v1/elevenlabs-outreach`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    action: 'get_call_result',
                    client_id,
                    conversation_id: call.elevenlabs_conversation_id,
                    message_id: call.id,
                  }),
                });

                const resultData = await resultResp.json();
                if (resultData.appointment_detected) {
                  campaignResult.appointments_booked++;
                }
              } catch (err) {
                console.error(`Failed to check call result for ${call.id}:`, err);
              }
            }
          }

          // Update campaign metrics
          await supabase
            .from('ai_outreach_campaigns')
            .update({
              total_appointments: (campaign.total_appointments || 0) + campaignResult.appointments_booked,
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaign.id);

        } catch (err) {
          campaignResult.errors.push(err instanceof Error ? err.message : 'Unknown error');
        }

        results.push(campaignResult);
      }

      const totalSms = results.reduce((s, r) => s + r.sms_sent, 0);
      const totalCalls = results.reduce((s, r) => s + r.calls_made, 0);
      const totalAppointments = results.reduce((s, r) => s + r.appointments_booked, 0);

      return new Response(
        JSON.stringify({
          success: true,
          campaigns_processed: results.length,
          total_sms_sent: totalSms,
          total_calls_made: totalCalls,
          total_appointments_booked: totalAppointments,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: get_stats ----
    if (action === 'get_stats') {
      // Get overall outreach stats for this client
      const { data: campaigns } = await supabase
        .from('ai_outreach_campaigns')
        .select('id, name, campaign_type, status, total_sent, total_delivered, total_responded, total_appointments, created_at')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });

      const { data: recentMessages } = await supabase
        .from('ai_outreach_messages')
        .select('id, channel, status, appointment_booked, sent_at, contact_name, to_phone')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .limit(50);

      // Aggregate stats
      const totalSent = (campaigns || []).reduce((s, c) => s + (c.total_sent || 0), 0);
      const totalAppointments = (campaigns || []).reduce((s, c) => s + (c.total_appointments || 0), 0);

      const smsSent = (recentMessages || []).filter(m => m.channel === 'sms').length;
      const voiceCalls = (recentMessages || []).filter(m => m.channel === 'voice').length;
      const appointmentsFromMessages = (recentMessages || []).filter(m => m.appointment_booked).length;

      return new Response(
        JSON.stringify({
          success: true,
          stats: {
            total_campaigns: (campaigns || []).length,
            active_campaigns: (campaigns || []).filter(c => c.status === 'active').length,
            total_messages_sent: totalSent,
            total_appointments_booked: totalAppointments,
            recent_sms_count: smsSent,
            recent_voice_count: voiceCalls,
            recent_appointments: appointmentsFromMessages,
            conversion_rate: totalSent > 0 ? ((totalAppointments / totalSent) * 100).toFixed(1) + '%' : '0%',
          },
          campaigns: campaigns || [],
          recent_activity: recentMessages || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Valid: run_sequence, get_stats` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('AI Outreach Orchestrator error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
