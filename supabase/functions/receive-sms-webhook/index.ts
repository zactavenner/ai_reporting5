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
    const body = await req.json();
    console.log('Sendblue webhook received:', JSON.stringify(body));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Handle delivery status update
    if (body.status && body.message_id) {
      const statusMap: Record<string, string> = {
        'DELIVERED': 'delivered',
        'SENT': 'delivered',
        'FAILED': 'failed',
        'ERROR': 'failed',
      };

      const newStatus = statusMap[body.status?.toUpperCase()] || body.status?.toLowerCase();

      await supabase
        .from('outreach_messages')
        .update({
          status: newStatus,
          delivered_at: newStatus === 'delivered' ? new Date().toISOString() : undefined,
          error_message: newStatus === 'failed' ? (body.error_message || 'Delivery failed') : undefined,
        })
        .eq('sendblue_message_id', body.message_id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle incoming message
    if (body.number && body.content) {
      const phone = body.number;

      // Try to find a matching outbound message to get the client_id
      const { data: existingMsg } = await supabase
        .from('outreach_messages')
        .select('client_id, campaign_id, contact_id, contact_name')
        .eq('contact_phone', phone)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingMsg) {
        await supabase.from('outreach_messages').insert({
          client_id: existingMsg.client_id,
          campaign_id: existingMsg.campaign_id,
          contact_id: existingMsg.contact_id,
          contact_name: existingMsg.contact_name,
          contact_phone: phone,
          channel: body.media_url ? 'imessage' : 'sms',
          direction: 'inbound',
          status: 'replied',
          message_body: body.content,
          replied_at: new Date().toISOString(),
        });

        // Mark the last outbound message as replied
        await supabase
          .from('outreach_messages')
          .update({ status: 'replied', replied_at: new Date().toISOString() })
          .eq('contact_phone', phone)
          .eq('direction', 'outbound')
          .eq('client_id', existingMsg.client_id)
          .order('created_at', { ascending: false })
          .limit(1);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error in receive-sms-webhook:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
