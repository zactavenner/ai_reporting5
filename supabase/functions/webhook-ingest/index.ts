import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// WEBHOOK PROCESSING
// ============================================================
// - ad_spend: processed inline for real-time spend tracking
// - contact/opportunity webhooks: trigger automatic full sync
//   for end-to-end attribution tracking
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
      .select('id, name, ghl_api_key, ghl_location_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientId);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // AD SPEND WEBHOOKS - Process inline
    // ============================================================
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

    // ============================================================
    // CONTACT & OPPORTUNITY WEBHOOKS - Auto-sync everything
    // ============================================================
    const contactWebhookTypes = [
      'contact', 'contacts', 'contact_created', 'contact_updated',
      'ContactCreate', 'ContactUpdate', 'ContactDndUpdate',
      'ContactTagUpdate', 'ContactDelete',
      'opportunity', 'opportunities', 'opportunity_created', 'opportunity_updated',
      'OpportunityCreate', 'OpportunityUpdate', 'OpportunityStageUpdate',
      'OpportunityStatusUpdate', 'OpportunityMonetaryValueUpdate',
      'appointment', 'appointments', 'AppointmentCreate', 'AppointmentUpdate',
      'TaskCreate', 'TaskUpdate', 'NoteCreate', 'NoteUpdate',
    ];

    // Extract the GHL contact ID from various webhook payload formats
    const extractContactId = (payload: any): string | null => {
      // Direct contactId field
      if (payload.contactId) return payload.contactId;
      if (payload.contact_id) return payload.contact_id;
      // Contact object with id
      if (payload.contact?.id) return payload.contact.id;
      // For opportunity webhooks
      if (payload.opportunity?.contactId) return payload.opportunity.contactId;
      if (payload.opportunity?.contact_id) return payload.opportunity.contact_id;
      // For appointment webhooks
      if (payload.appointment?.contactId) return payload.appointment.contactId;
      // The payload itself might be the contact
      if (payload.id && (payload.firstName || payload.lastName || payload.email || payload.phone)) {
        return payload.id;
      }
      return null;
    };

    if (contactWebhookTypes.some(t => webhookType.toLowerCase().includes(t.toLowerCase()) || webhookType === t)) {
      const contactId = extractContactId(payload);
      
      console.log(`[AUTO-SYNC] ${webhookType} webhook - Client: ${client.name}, ContactId: ${contactId || 'unknown'}`);
      
      if (contactId && client.ghl_api_key && client.ghl_location_id) {
        // Fire-and-forget: call sync-ghl-contacts with single_contact mode
        // This runs the comprehensive sync (contact info, fields, pipelines, value, timelines)
        const syncUrl = `${supabaseUrl}/functions/v1/sync-ghl-contacts`;
        
        const syncPayload = {
          mode: 'single',
          client_id: clientId,
          contactId: contactId,
        };
        
        // Use EdgeRuntime.waitUntil for background execution so we respond immediately
        const syncPromise = fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify(syncPayload),
        }).then(async (res) => {
          const result = await res.text();
          console.log(`[AUTO-SYNC] Single contact sync completed for ${contactId}: ${res.status} - ${result.substring(0, 200)}`);
          
          // Trigger metric refresh for this client + today so dashboard updates in near real-time
          const today = new Date().toISOString().split('T')[0];
          const recalcUrl = `${supabaseUrl}/functions/v1/recalculate-daily-metrics`;
          try {
            const recalcRes = await fetch(recalcUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({ clientId, startDate: today, endDate: today }),
            });
            console.log(`[AUTO-SYNC] Metric refresh for ${clientId} on ${today}: ${recalcRes.status}`);
          } catch (recalcErr) {
            console.error(`[AUTO-SYNC] Metric refresh failed for ${clientId}:`, recalcErr);
          }
        }).catch((err) => {
          console.error(`[AUTO-SYNC] Single contact sync failed for ${contactId}:`, err);
        });

        // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(syncPromise);
        }
        // If EdgeRuntime not available, the fetch is already fire-and-forget
        
        return new Response(
          JSON.stringify({
            success: true,
            status: 'auto_sync_triggered',
            message: `Webhook received. Full contact sync triggered for ${contactId} (contact info, fields, pipelines, value, timelines).`,
            webhook_type: webhookType,
            client_id: clientId,
            contact_id: contactId,
            received_at: new Date().toISOString(),
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      } else {
        // No contact ID or no GHL credentials - acknowledge but can't sync
        console.log(`[AUTO-SYNC] Cannot sync - contactId: ${contactId}, hasApiKey: ${!!client.ghl_api_key}, hasLocationId: ${!!client.ghl_location_id}`);
        
        return new Response(
          JSON.stringify({
            success: true,
            status: 'acknowledged',
            message: contactId 
              ? 'Webhook received but client has no GHL credentials configured for auto-sync.'
              : 'Webhook received but no contact ID could be extracted from payload.',
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
    }

    // All other webhook types - acknowledge without processing
    console.log(`[ACK] Webhook received - Type: ${webhookType}, Client: ${client.name} (${clientId})`);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'acknowledged',
        message: 'Webhook acknowledged.',
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
