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
    const { client_id, lead_id, external_id, phone, email, website_slug, mode } = await req.json();

    const apiKey = Deno.env.get('RETARGETIQ_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RetargetIQ API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get website slug from client settings if not provided
    let slug = website_slug;
    if (!slug && client_id) {
      const { data: settings } = await supabase
        .from('client_settings')
        .select('retargetiq_website_slug')
        .eq('client_id', client_id)
        .single();
      slug = settings?.retargetiq_website_slug;
    }

    if (!slug) {
      return new Response(JSON.stringify({ success: false, error: 'RetargetIQ website slug not configured. Set it in client settings.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine which endpoint to use
    let enrichData: any = null;

    if (phone) {
      // Clean phone number - digits only
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        console.log(`[RetargetIQ] Enriching by phone: ${cleanPhone}, website: ${slug}`);
        const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByPhone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            website: slug,
            phone: cleanPhone,
          }),
        });

        const responseText = await res.text();
        console.log(`[RetargetIQ] Phone response (${res.status}): ${responseText.substring(0, 500)}`);
        
        if (res.ok) {
          try {
            const data = JSON.parse(responseText);
            if (data.success && data.data?.identities?.length > 0) {
              enrichData = data.data.identities[0];
            }
          } catch (e) {
            console.error('[RetargetIQ] Failed to parse phone response:', e);
          }
        }
      }
    }

    // Fallback to email if phone didn't work
    if (!enrichData && email) {
      const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          website: slug,
          email: email,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data?.identities?.length > 0) {
          enrichData = data.data.identities[0];
        }
      }
    }

    if (!enrichData) {
      return new Response(JSON.stringify({ success: false, error: 'No enrichment data found for this contact' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse enrichment data
    const enrichRecord = {
      lead_id: lead_id || null,
      client_id,
      external_id: external_id || `manual-${Date.now()}`,
      source: 'retargetiq',
      raw_data: enrichData,
      first_name: enrichData.firstName || null,
      last_name: enrichData.lastName || null,
      address: [enrichData.address, enrichData.city, enrichData.state, enrichData.zip].filter(Boolean).join(', ') || null,
      city: enrichData.city || null,
      state: enrichData.state || null,
      zip: enrichData.zip || null,
      gender: enrichData.gender === 'M' ? 'Male' : enrichData.gender === 'F' ? 'Female' : enrichData.gender || null,
      birth_date: enrichData.birthDate || null,
      household_income: enrichData.finances?.householdIncome || enrichData.data?.incomeLevel || null,
      credit_range: enrichData.finances?.creditRange || null,
      company_name: enrichData.companies?.[0]?.company || null,
      company_title: enrichData.companies?.[0]?.title || null,
      linkedin_url: enrichData.companies?.[0]?.linkedin || null,
      enriched_phones: enrichData.phones || [],
      enriched_emails: enrichData.emails || [],
      vehicles: enrichData.vehicles || [],
      enriched_at: new Date().toISOString(),
    };

    // Upsert enrichment record
    const { data: upserted, error: upsertError } = await supabase
      .from('lead_enrichment')
      .upsert(enrichRecord, { onConflict: 'external_id,client_id' })
      .select()
      .single();

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      return new Response(JSON.stringify({ success: false, error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, enrichment: upserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Enrichment error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
