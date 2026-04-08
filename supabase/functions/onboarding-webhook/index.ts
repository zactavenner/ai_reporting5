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

    // Validate required fields
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

    if (existingClient) {
      clientId = existingClient.id;
      console.log(`[onboarding-webhook] Existing client found: ${clientId}`);
    } else {
      // 2. Create new client
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert({
          name: body.company_name,
          website_url: body.website_url || null,
          description: body.offer_description || null,
          industry: body.industry || 'Capital Raising',
          status: 'active',
          brand_colors: body.brand_colors || null,
          brand_fonts: body.brand_fonts || null,
        })
        .select('id')
        .single();

      if (clientError) throw clientError;
      clientId = newClient.id;
      console.log(`[onboarding-webhook] Created client: ${clientId}`);

      // Create client_settings
      await supabase.from('client_settings').insert({ client_id: clientId });
    }

    // 3. Create offer from intake data
    const { data: offer, error: offerError } = await supabase
      .from('client_offers')
      .insert({
        client_id: clientId,
        title: body.offer_title || `${body.company_name} - Primary Offer`,
        description: body.offer_description || null,
        offer_type: 'offer',
        uploaded_by: 'onboarding-webhook',
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

    // 5. Trigger the full auto-generate pipeline in the background
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const pipelinePayload = {
      password: PASSWORD,
      client_id: clientId,
      offer_id: offerId,
      offer_description: body.offer_description || '',
      company_name: body.company_name,
      brand_colors: body.brand_colors || [],
      brand_fonts: body.brand_fonts || [],
      website_url: body.website_url || '',
      intake_data: {
        fund_name: body.fund_name || body.company_name,
        fund_type: body.fund_type || '',
        target_return: body.target_return || '',
        minimum_investment: body.minimum_investment || '',
        fund_size: body.fund_size || '',
        asset_class: body.asset_class || '',
        investment_thesis: body.investment_thesis || '',
        key_differentiators: body.key_differentiators || '',
        target_audience: body.target_audience || 'Accredited Investors',
        compliance_notes: body.compliance_notes || '',
        ...body.extra_data,
      },
    };

    // Fire and forget - don't await, let it run in background
    fetch(`${supabaseUrl}/functions/v1/auto-generate-onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(pipelinePayload),
    }).catch(err => console.error('[onboarding-webhook] Pipeline trigger error:', err));

    console.log(`[onboarding-webhook] Pipeline triggered for client ${clientId}`);

    return new Response(
      JSON.stringify({
        success: true,
        client_id: clientId,
        offer_id: offerId,
        message: 'Onboarding received. Full generation pipeline started.',
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
