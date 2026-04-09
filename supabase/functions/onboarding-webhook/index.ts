import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PASSWORD = 'HPA1234$';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (!body.company_name) {
      return new Response(JSON.stringify({ error: 'company_name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log(`[onboarding-webhook] Received onboarding for: ${body.company_name}`);

    // 1. Check if client already exists by name
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .ilike('name', body.company_name)
      .limit(1)
      .single();

    let clientId: string;
    let isNew = false;

    if (existingClient) {
      clientId = existingClient.id;
      console.log(`[onboarding-webhook] Existing client found: ${clientId}`);
      // Update status to onboarding so it appears in the Onboarding tab
      await supabase.from('clients').update({ status: 'onboarding' }).eq('id', clientId);
    } else {
      // 2. Create new client with status 'onboarding'
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: body.company_name,
          website_url: body.website_url || null,
          description: body.offer_description || null,
          industry: body.industry || body.fund_type || 'Capital Raising',
          status: 'onboarding',
          brand_colors: body.brand_colors || null,
          brand_fonts: body.brand_fonts || null,
        })
        .select('id')
        .single();

      if (clientError) throw clientError;
      clientId = newClient.id;
      isNew = true;
      console.log(`[onboarding-webhook] Created client: ${clientId}`);

      // Create client_settings
      await supabase.from('client_settings').insert({ client_id: clientId });
    }

    // 3. Create offer with ALL intake fields populated
    const { data: offer, error: offerError } = await supabase
      .from('client_offers')
      .insert({
        client_id: clientId,
        title: body.offer_title || `${body.company_name} - Primary Offer`,
        description: body.offer_description || null,
        offer_type: 'campaign',
        uploaded_by: 'onboarding-webhook',
        fund_name: body.fund_name || body.company_name,
        fund_type: body.fund_type || null,
        raise_amount: body.raise_amount || null,
        min_investment: body.min_investment || body.minimum_investment || null,
        timeline: body.timeline || null,
        target_investor: body.target_investor || body.target_audience || 'Accredited Investors',
        targeted_returns: body.targeted_returns || body.target_return || null,
        hold_period: body.hold_period || null,
        distribution_schedule: body.distribution_schedule || null,
        investment_range: body.investment_range || null,
        tax_advantages: body.tax_advantages || null,
        credibility: body.credibility || null,
        fund_history: body.fund_history || null,
        website_url: body.website_url || null,
        speaker_name: body.speaker_name || null,
        industry_focus: body.industry_focus || body.industry || null,
        brand_notes: body.brand_notes || null,
        additional_notes: body.additional_notes || null,
        brand_colors: body.brand_colors || null,
        brand_fonts: body.brand_fonts || null,
        budget_amount: body.budget_amount ? Number(body.budget_amount) : null,
        budget_mode: body.budget_mode || null,
        accredited_only: body.accredited_only ?? null,
        reg_d_type: body.reg_d_type || null,
        logo_url: body.logo_url || null,
        pitch_deck_url: body.pitch_deck_url || body.pitch_deck_link || null,
        ghl_location_id: body.ghl_location_id || null,
        meta_ad_account_id: body.meta_ad_account_id || null,
        meta_page_id: body.meta_page_id || null,
        meta_pixel_id: body.meta_pixel_id || null,
        raw_form_data: body.extra_data || body.raw_form_data || null,
        status: 'active',
      })
      .select('id')
      .single();

    if (offerError) throw offerError;
    const offerId = offer.id;
    console.log(`[onboarding-webhook] Created offer: ${offerId}`);

    // 4. Attach any files sent with the intake
    if (body.files && Array.isArray(body.files)) {
      for (const file of body.files) {
        await supabase.from('client_offer_files').insert({
          client_id: clientId,
          offer_id: offerId,
          file_url: file.url,
          file_name: file.name,
          file_type: file.type || null,
          file_size_bytes: file.size || null,
          uploaded_by: 'onboarding-webhook',
        });
      }
      console.log(`[onboarding-webhook] Attached ${body.files.length} files`);
    }

    // 5. Trigger the fulfill-client pipeline (the single source of truth for onboarding)
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    fetch(`${supabaseUrl}/functions/v1/fulfill-client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        password: PASSWORD,
        client_id: clientId,
        offer_id: offerId,
      }),
    }).catch(err => console.error('[onboarding-webhook] Pipeline trigger error:', err));

    console.log(`[onboarding-webhook] Pipeline triggered for client ${clientId}`);

    return new Response(
      JSON.stringify({
        success: true,
        client_id: clientId,
        offer_id: offerId,
        is_new_client: isNew,
        message: 'Onboarding received. Fulfillment pipeline started.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[onboarding-webhook] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
