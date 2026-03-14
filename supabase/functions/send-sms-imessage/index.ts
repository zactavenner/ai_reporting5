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
    const SENDBLUE_API_KEY = Deno.env.get('SENDBLUE_API_KEY');
    const SENDBLUE_API_SECRET = Deno.env.get('SENDBLUE_API_SECRET');

    if (!SENDBLUE_API_KEY || !SENDBLUE_API_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Sendblue API credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, message, channel, contact_id, contact_name, campaign_id, client_id } = await req.json();

    if (!phone || !message || !client_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: phone, message, client_id' }),
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
        channel: channel || 'sms',
        direction: 'outbound',
        status: 'sending',
        message_body: message,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Failed to create message record:', insertErr);
      throw new Error(`DB insert failed: ${insertErr.message}`);
    }

    // Call Sendblue API
    const sendblueResponse = await fetch('https://api.sendblue.co/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sb-api-key-id': SENDBLUE_API_KEY,
        'sb-api-secret-key': SENDBLUE_API_SECRET,
      },
      body: JSON.stringify({
        number: phone,
        content: message,
        send_style: 'regular',
      }),
    });

    const sendblueData = await sendblueResponse.json();

    if (!sendblueResponse.ok) {
      console.error('Sendblue API error:', sendblueData);
      await supabase
        .from('outreach_messages')
        .update({
          status: 'failed',
          error_message: sendblueData.message || `Sendblue error: ${sendblueResponse.status}`,
        })
        .eq('id', msgRecord.id);

      // Update integration status
      await supabase
        .from('integration_status')
        .update({
          last_sync_status: 'failed',
          last_error_message: sendblueData.message || 'Send failed',
          error_count: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('integration_name', 'sendblue');

      return new Response(
        JSON.stringify({ error: 'Sendblue send failed', details: sendblueData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update message record with Sendblue ID and delivery status
    await supabase
      .from('outreach_messages')
      .update({
        status: 'delivered',
        sendblue_message_id: sendblueData.message_id || sendblueData.id || null,
        delivered_at: new Date().toISOString(),
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
      .eq('integration_name', 'sendblue');

    return new Response(
      JSON.stringify({ success: true, message_id: msgRecord.id, sendblue_data: sendblueData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error in send-sms-imessage:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
