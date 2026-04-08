import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PASSWORD = 'HPA1234$';

function getCloudUrl() { return Deno.env.get('SUPABASE_URL')!; }
function getProdDb() {
  const url = Deno.env.get('ORIGINAL_SUPABASE_URL') || getCloudUrl();
  const key = Deno.env.get('ORIGINAL_SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();

    if (!body.company_name) {
      return new Response(JSON.stringify({ error: 'company_name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prodDb = getProdDb();
    const cloudUrl = getCloudUrl();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    console.log(`[onboard-from-form] Received: ${body.company_name}`);

    // 1. Upsert client (match by name)
    const { data: existingClient } = await prodDb
      .from('clients').select('id')
      .ilike('name', body.company_name).limit(1).single();

    let clientId: string;

    if (existingClient) {
      clientId = existingClient.id;
      console.log(`[onboard-from-form] Existing client: ${clientId}`);
    } else {
      const { data: newClient, error: clientError } = await prodDb
        .from('clients').insert({
          name: body.company_name,
          website_url: body.website || null,
          description: body.offer_description || body.fund_name || null,
          industry: body.industry_focus || 'Capital Raising',
          status: 'active',
          brand_colors: body.brand_colors || null,
          brand_fonts: body.brand_fonts || null,
        }).select('id').single();
      if (clientError) throw clientError;
      clientId = newClient.id;
      console.log(`[onboard-from-form] Created client: ${clientId}`);

      await prodDb.from('client_settings').insert({ client_id: clientId });
    }

    // 2. Create rich client_offers record
    const { data: offer, error: offerError } = await prodDb
      .from('client_offers').insert({
        client_id: clientId,
        title: body.fund_name || `${body.company_name} - Primary Offer`,
        description: body.offer_description || null,
        offer_type: 'offer',
        uploaded_by: 'onboard-from-form',
        fund_name: body.fund_name || null,
        fund_type: body.fund_type || null,
        raise_amount: body.raise_amount || null,
        min_investment: body.min_investment || body.minimum_investment || null,
        timeline: body.timeline || null,
        target_investor: body.target_investor || body.target_audience || null,
        targeted_returns: body.targeted_returns || body.target_return || null,
        hold_period: body.hold_period || null,
        distribution_schedule: body.distribution_schedule || null,
        investment_range: body.investment_range || null,
        tax_advantages: body.tax_advantages || null,
        credibility: body.credibility || null,
        fund_history: body.fund_history || null,
        website_url: body.website || body.website_url || null,
        speaker_name: body.speaker_name || body.contact_name || null,
        industry_focus: body.industry_focus || null,
        brand_notes: body.brand_notes || null,
        additional_notes: body.additional_notes || null,
        brand_colors: body.brand_colors || '[]',
        brand_fonts: body.brand_fonts || '[]',
        logo_url: body.logo_url || null,
        pitch_deck_url: body.pitch_deck_link || body.pitch_deck_url || null,
        budget_amount: body.budget_amount ? Number(body.budget_amount) : null,
        budget_mode: body.budget_mode || 'monthly',
        accredited_only: body.accredited_only !== false,
        reg_d_type: body.reg_d_type || null,
        ghl_location_id: body.ghl_location_id || null,
        meta_ad_account_id: body.meta_ad_account_id || null,
        meta_page_id: body.meta_page_id || null,
        meta_pixel_id: body.meta_pixel_id || null,
        status: 'pending_fulfillment',
        raw_form_data: body,
      }).select('id').single();

    if (offerError) throw offerError;
    const offerId = offer.id;
    console.log(`[onboard-from-form] Created offer: ${offerId}`);

    // 3. Attach any files
    if (body.files && Array.isArray(body.files)) {
      for (const file of body.files) {
        await prodDb.from('client_offer_files').insert({
          client_id: clientId, offer_id: offerId,
          file_url: file.url, file_name: file.name,
          file_type: file.type || null, file_size_bytes: file.size || null,
          uploaded_by: 'onboard-from-form',
        });
      }
    }

    // 4. Fire-and-forget fulfill-client
    fetch(`${cloudUrl}/functions/v1/fulfill-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ password: PASSWORD, client_id: clientId, offer_id: offerId }),
    }).catch(err => console.error('[onboard-from-form] Pipeline trigger error:', err));

    console.log(`[onboard-from-form] Pipeline triggered for ${body.company_name}`);

    return new Response(JSON.stringify({
      success: true, client_id: clientId, offer_id: offerId,
      message: 'Onboarding received. Full fulfillment pipeline started.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[onboard-from-form] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
