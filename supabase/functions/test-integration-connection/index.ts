import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { integration, client_id } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let success = false;
    let message = '';
    let tokenExpiresAt: string | null = null;

    if (integration === 'meta_ads') {
      const token = Deno.env.get('META_SHARED_ACCESS_TOKEN');
      if (!token) {
        message = 'No Meta access token configured';
      } else {
        try {
          const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
          if (res.ok) {
            success = true;
            message = 'Meta Ads connected successfully';
            // Check token expiry
            const debugRes = await fetch(
              `https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${token}`
            );
            if (debugRes.ok) {
              const debugData = await debugRes.json();
              if (debugData.data?.expires_at) {
                tokenExpiresAt = new Date(debugData.data.expires_at * 1000).toISOString();
              }
            }
          } else {
            message = `Meta API returned ${res.status}`;
          }
        } catch (e) {
          message = `Meta connection failed: ${e.message}`;
        }
      }
    } else if (integration === 'ghl') {
      if (client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('ghl_api_key, ghl_location_id')
          .eq('id', client_id)
          .single();
        if (client?.ghl_api_key && client?.ghl_location_id) {
          try {
            const res = await fetch(
              `https://services.leadconnectorhq.com/locations/${client.ghl_location_id}`,
              { headers: { Authorization: `Bearer ${client.ghl_api_key}`, Version: '2021-07-28' } }
            );
            success = res.ok;
            message = res.ok ? 'GHL connected' : `GHL returned ${res.status}`;
          } catch (e) {
            message = `GHL connection failed: ${e.message}`;
          }
        } else {
          message = 'No GHL credentials configured for this client';
        }
      } else {
        message = 'Client ID required for GHL test';
      }
    } else if (integration === 'stripe') {
      const key = Deno.env.get('STRIPE_SECRET_KEY');
      if (!key) {
        message = 'No Stripe key configured';
      } else {
        try {
          const res = await fetch('https://api.stripe.com/v1/balance', {
            headers: { Authorization: `Bearer ${key}` },
          });
          success = res.ok;
          message = res.ok ? 'Stripe connected' : `Stripe returned ${res.status}`;
        } catch (e) {
          message = `Stripe connection failed: ${e.message}`;
        }
      }
    } else if (integration === 'meetgeek') {
      const key = Deno.env.get('MEETGEEK_API_KEY');
      success = !!key;
      message = key ? 'MeetGeek API key configured' : 'No MeetGeek API key';
    } else if (integration === 'hubspot') {
      if (client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('hubspot_access_token')
          .eq('id', client_id)
          .single();
        if (client?.hubspot_access_token) {
          try {
            const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
              headers: { Authorization: `Bearer ${client.hubspot_access_token}` },
            });
            success = res.ok;
            message = res.ok ? 'HubSpot connected' : `HubSpot returned ${res.status}`;
          } catch (e) {
            message = `HubSpot connection failed: ${e.message}`;
          }
        } else {
          message = 'No HubSpot token for this client';
        }
      } else {
        message = 'Client ID required for HubSpot test';
      }
    }

    // Upsert integration status
    const upsertData: Record<string, unknown> = {
      integration_name: integration,
      is_connected: success,
      last_sync_status: success ? 'success' : 'failed',
      last_error_message: success ? null : message,
      updated_at: new Date().toISOString(),
    };
    if (client_id) upsertData.client_id = client_id;
    if (tokenExpiresAt) upsertData.token_expires_at = tokenExpiresAt;

    if (client_id) {
      await supabase
        .from('integration_status')
        .upsert(
          { ...upsertData, client_id },
          { onConflict: 'client_id,integration_name' }
        );
    }

    return new Response(JSON.stringify({ success, message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
