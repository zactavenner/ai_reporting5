import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// WEBHOOKS FROZEN - EXCEPT AD SPEND
// ============================================================
// Most webhook processing is frozen pending API-only sync.
// Only ad_spend webhooks are processed for real-time spend tracking.
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const clientId = pathParts[1];
    const webhookType = pathParts[2];

    if (!clientId || !webhookType) {
      return new Response(
        JSON.stringify({ error: 'Missing clientId or webhookType in URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientId);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ONLY process ad_spend webhooks - everything else is frozen
    if (webhookType === 'ad_spend') {
      console.log(`[ACTIVE] Ad spend webhook - Client: ${client.name} (${clientId})`);
      
      const records = Array.isArray(payload) ? payload : [payload];
      let insertedCount = 0;
      
      for (const record of records) {
        const reportedAt = record.reported_at || record.date || new Date().toISOString().split('T')[0];
        
        const adSpendRecord = {
          client_id: clientId,
          reported_at: reportedAt,
          spend: parseFloat(record.spend) || 0,
          impressions: parseInt(record.impressions) || null,
          clicks: parseInt(record.clicks) || null,
          platform: record.platform || 'facebook',
          campaign_name: record.campaign_name || record.campaign || null,
          ad_set_name: record.ad_set_name || record.adset || null,
        };

        const { error: insertError } = await supabase
          .from('ad_spend_reports')
          .upsert(adSpendRecord, { 
            onConflict: 'client_id,reported_at,platform,campaign_name',
            ignoreDuplicates: false 
          });

        if (insertError) {
          console.error('Error inserting ad spend:', insertError);
        } else {
          insertedCount++;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'processed',
          message: `Processed ${insertedCount} ad spend records`,
          webhook_type: webhookType,
          client_id: clientId,
          received_at: new Date().toISOString(),
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // All other webhook types remain frozen
    console.log(`[FROZEN] Webhook received - Type: ${webhookType}, Client: ${client.name} (${clientId})`);
    console.log(`[FROZEN] Payload preview: ${JSON.stringify(payload).substring(0, 500)}`);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'frozen',
        message: 'Webhook acknowledged but processing is frozen. Data sync is handled via hourly API sync.',
        webhook_type: webhookType,
        client_id: clientId,
        received_at: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});