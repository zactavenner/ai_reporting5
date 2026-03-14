import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SENDBLUE_API_BASE = 'https://api.sendblue.co/api';

interface SendBlueMessage {
  number: string;
  content: string;
  send_style?: string;
  media_url?: string;
  status_callback?: string;
}

// Send a message via SendBlue API
async function sendMessage(
  apiKey: string,
  apiSecret: string,
  message: SendBlueMessage
): Promise<{ success: boolean; messageId?: string; error?: string; status?: string }> {
  try {
    const response = await fetch(`${SENDBLUE_API_BASE}/send-message`, {
      method: 'POST',
      headers: {
        'sb-api-key-id': apiKey,
        'sb-api-secret-key': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error_message || data.message || `HTTP ${response.status}` };
    }

    return {
      success: true,
      messageId: data.message_id || data.id,
      status: data.status,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Evaluate typing (send iMessage typing indicator)
async function sendTypingIndicator(
  apiKey: string,
  apiSecret: string,
  number: string
): Promise<void> {
  try {
    await fetch(`${SENDBLUE_API_BASE}/send-typing-indicator`, {
      method: 'POST',
      headers: {
        'sb-api-key-id': apiKey,
        'sb-api-secret-key': apiSecret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number }),
    });
  } catch {
    // Non-blocking
  }
}

// Get message status from SendBlue
async function getMessageStatus(
  apiKey: string,
  apiSecret: string,
  messageId: string
): Promise<{ status: string; error?: string }> {
  try {
    const response = await fetch(`${SENDBLUE_API_BASE}/get-message?message_id=${messageId}`, {
      method: 'GET',
      headers: {
        'sb-api-key-id': apiKey,
        'sb-api-secret-key': apiSecret,
      },
    });

    const data = await response.json();
    return { status: data.status || 'unknown' };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' };
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
    const { action, client_id, campaign_id, lead_id, message_body, to_phone, media_url } = body;

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client SendBlue credentials
    const { data: settings } = await supabase
      .from('client_settings')
      .select('sendblue_api_key, sendblue_api_secret, sendblue_phone_number, ai_outreach_enabled')
      .eq('client_id', client_id)
      .single();

    if (!settings?.sendblue_api_key || !settings?.sendblue_api_secret) {
      return new Response(
        JSON.stringify({
          error: 'SendBlue API credentials not configured',
          setup_required: true,
          instructions: 'Add your SendBlue API Key and Secret in Client Settings → AI Outreach tab'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: send_message ----
    if (action === 'send_message') {
      if (!to_phone || !message_body) {
        return new Response(
          JSON.stringify({ error: 'to_phone and message_body are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send typing indicator first for a natural feel
      await sendTypingIndicator(settings.sendblue_api_key, settings.sendblue_api_secret, to_phone);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const result = await sendMessage(settings.sendblue_api_key, settings.sendblue_api_secret, {
        number: to_phone,
        content: message_body,
        media_url: media_url || undefined,
      });

      // Record the message in the database
      const { data: messageRecord } = await supabase
        .from('ai_outreach_messages')
        .insert({
          campaign_id: campaign_id || null,
          client_id,
          lead_id: lead_id || null,
          channel: 'sms',
          direction: 'outbound',
          status: result.success ? 'sent' : 'failed',
          message_body,
          media_url: media_url || null,
          to_phone,
          from_phone: settings.sendblue_phone_number || null,
          sendblue_message_id: result.messageId || null,
          sendblue_status: result.status || null,
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
        })
        .select('id')
        .single();

      // Update campaign metrics if applicable
      if (campaign_id && result.success) {
        await supabase.rpc('increment_counter', {
          table_name: 'ai_outreach_campaigns',
          column_name: 'total_sent',
          row_id: campaign_id
        }).catch(() => {
          // Fallback: manual increment
          supabase
            .from('ai_outreach_campaigns')
            .select('total_sent')
            .eq('id', campaign_id)
            .single()
            .then(({ data }) => {
              if (data) {
                supabase
                  .from('ai_outreach_campaigns')
                  .update({ total_sent: (data.total_sent || 0) + 1 })
                  .eq('id', campaign_id);
              }
            });
        });
      }

      return new Response(
        JSON.stringify({
          success: result.success,
          message_id: messageRecord?.id,
          sendblue_message_id: result.messageId,
          status: result.status,
          error: result.error,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: send_campaign_batch ----
    if (action === 'send_campaign_batch') {
      if (!campaign_id) {
        return new Response(
          JSON.stringify({ error: 'campaign_id is required for batch send' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get campaign
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

      // Get eligible leads that haven't been messaged yet (or need follow-up)
      const { data: eligibleLeads } = await supabase
        .from('leads')
        .select('id, name, phone, email, status')
        .eq('client_id', client_id)
        .not('phone', 'is', null)
        .in('status', campaign.target_lead_statuses || ['new'])
        .limit(50); // Process in batches of 50

      if (!eligibleLeads || eligibleLeads.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No eligible leads to message', sent: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Filter out leads that already have max attempts
      const leadIds = eligibleLeads.map(l => l.id);
      const { data: existingMessages } = await supabase
        .from('ai_outreach_messages')
        .select('lead_id, attempt_number')
        .eq('campaign_id', campaign_id)
        .in('lead_id', leadIds)
        .order('attempt_number', { ascending: false });

      const attemptsByLead = new Map<string, number>();
      for (const msg of existingMessages || []) {
        if (msg.lead_id && !attemptsByLead.has(msg.lead_id)) {
          attemptsByLead.set(msg.lead_id, msg.attempt_number);
        }
      }

      let sent = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const lead of eligibleLeads) {
        const currentAttempts = attemptsByLead.get(lead.id) || 0;
        if (currentAttempts >= (campaign.max_attempts_per_lead || 3)) {
          skipped++;
          continue;
        }

        // Personalize the message template
        const personalizedMessage = (campaign.sms_template || '')
          .replace(/\{name\}/gi, lead.name || 'there')
          .replace(/\{first_name\}/gi, (lead.name || 'there').split(' ')[0]);

        if (!personalizedMessage) {
          skipped++;
          continue;
        }

        // Send with delay between messages
        const result = await sendMessage(settings.sendblue_api_key, settings.sendblue_api_secret, {
          number: lead.phone!,
          content: personalizedMessage,
        });

        await supabase.from('ai_outreach_messages').insert({
          campaign_id,
          client_id,
          lead_id: lead.id,
          channel: 'sms',
          direction: 'outbound',
          status: result.success ? 'sent' : 'failed',
          message_body: personalizedMessage,
          to_phone: lead.phone!,
          from_phone: settings.sendblue_phone_number || null,
          contact_name: lead.name,
          sendblue_message_id: result.messageId || null,
          sendblue_status: result.status || null,
          attempt_number: currentAttempts + 1,
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
        });

        if (result.success) {
          sent++;
        } else {
          errors.push(`${lead.name || lead.phone}: ${result.error}`);
        }

        // Rate limit: 1 message per 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Update campaign totals
      await supabase
        .from('ai_outreach_campaigns')
        .update({
          total_sent: (campaign.total_sent || 0) + sent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id);

      return new Response(
        JSON.stringify({ success: true, sent, skipped, errors: errors.slice(0, 5) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: check_status ----
    if (action === 'check_status') {
      const { sendblue_message_id } = body;
      if (!sendblue_message_id) {
        return new Response(
          JSON.stringify({ error: 'sendblue_message_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await getMessageStatus(
        settings.sendblue_api_key,
        settings.sendblue_api_secret,
        sendblue_message_id
      );

      // Update our record
      if (result.status === 'DELIVERED') {
        await supabase
          .from('ai_outreach_messages')
          .update({
            status: 'delivered',
            sendblue_status: result.status,
            delivered_at: new Date().toISOString(),
          })
          .eq('sendblue_message_id', sendblue_message_id);
      }

      return new Response(
        JSON.stringify({ success: true, status: result.status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- ACTION: test_connection ----
    if (action === 'test_connection') {
      // Test SendBlue API connectivity
      try {
        const response = await fetch(`${SENDBLUE_API_BASE}/accounts`, {
          method: 'GET',
          headers: {
            'sb-api-key-id': settings.sendblue_api_key,
            'sb-api-secret-key': settings.sendblue_api_secret,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return new Response(
            JSON.stringify({
              success: true,
              connected: true,
              account: data,
              phone_number: settings.sendblue_phone_number,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({
              success: false,
              connected: false,
              error: `SendBlue API returned ${response.status}: ${errorText}`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (err) {
        return new Response(
          JSON.stringify({
            success: false,
            connected: false,
            error: err instanceof Error ? err.message : 'Connection failed'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Valid actions: send_message, send_campaign_batch, check_status, test_connection` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('SendBlue outreach error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
