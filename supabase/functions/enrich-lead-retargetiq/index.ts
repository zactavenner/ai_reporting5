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
    const { client_id, lead_id, external_id, phone, email, address, city, state, zip, website_slug, mode, first_name, last_name } = await req.json();

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
      return new Response(JSON.stringify({ success: false, error: 'RetargetIQ website slug not configured.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let enrichData: any = null;

    // 1) Try phone first
    if (!enrichData && phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        console.log(`[RetargetIQ] Enriching by phone: ${cleanPhone}, website: ${slug}`);
        const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByPhone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, website: slug, phone: cleanPhone }),
        });
        const responseText = await res.text();
        console.log(`[RetargetIQ] Phone response (${res.status}): ${responseText.substring(0, 500)}`);
        if (res.ok) {
          try {
            const data = JSON.parse(responseText);
            if (data.success && data.data?.identities?.length > 0) {
              enrichData = data.data.identities[0];
              console.log(`[RetargetIQ] ✓ Phone match found`);
            }
          } catch (e) {
            console.error('[RetargetIQ] Failed to parse phone response:', e);
          }
        }
      }
    }

    // 2) Fallback to email
    if (!enrichData && email) {
      console.log(`[RetargetIQ] Enriching by email: ${email}`);
      const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, website: slug, email: email.trim() }),
      });
      const responseText = await res.text();
      console.log(`[RetargetIQ] Email response (${res.status}): ${responseText.substring(0, 500)}`);
      if (res.ok) {
        try {
          const data = JSON.parse(responseText);
          if (data.success && data.data?.identities?.length > 0) {
            enrichData = data.data.identities[0];
            console.log(`[RetargetIQ] ✓ Email match found`);
          }
        } catch (e) {
          console.error('[RetargetIQ] Failed to parse email response:', e);
        }
      }
    }

    // 3) Fallback to address (name + address)
    if (!enrichData && (address || (city && state))) {
      const addressQuery: any = { api_key: apiKey, website: slug };
      if (first_name) addressQuery.firstName = first_name;
      if (last_name) addressQuery.lastName = last_name;
      if (address) addressQuery.address = address;
      if (city) addressQuery.city = city;
      if (state) addressQuery.state = state;
      if (zip) addressQuery.zip = zip;

      console.log(`[RetargetIQ] Enriching by address: ${JSON.stringify(addressQuery)}`);
      const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByAddress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressQuery),
      });
      const responseText = await res.text();
      console.log(`[RetargetIQ] Address response (${res.status}): ${responseText.substring(0, 500)}`);
      if (res.ok) {
        try {
          const data = JSON.parse(responseText);
          if (data.success && data.data?.identities?.length > 0) {
            enrichData = data.data.identities[0];
            console.log(`[RetargetIQ] ✓ Address match found`);
          }
        } catch (e) {
          console.error('[RetargetIQ] Failed to parse address response:', e);
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

    // Write enrichment data back to leads table if we have a lead_id or external_id
    if (lead_id || external_id) {
      const leadUpdate: any = {};
      
      // Add enriched phone if lead doesn't have one
      if (enrichData.phones?.length > 0) {
        const bestPhone = enrichData.phones[0]?.phone || enrichData.phones[0];
        if (bestPhone) leadUpdate.phone = bestPhone;
      }
      
      // Add enriched email if lead doesn't have one
      if (enrichData.emails?.length > 0) {
        const bestEmail = enrichData.emails[0]?.email || enrichData.emails[0];
        if (bestEmail) leadUpdate.email = bestEmail;
      }
      
      // Add name if available
      if (enrichData.firstName || enrichData.lastName) {
        const fullName = [enrichData.firstName, enrichData.lastName].filter(Boolean).join(' ');
        if (fullName) leadUpdate.name = fullName;
      }

      if (Object.keys(leadUpdate).length > 0) {
        // Only update fields that are currently null/empty
        if (lead_id) {
          const { data: existingLead } = await supabase
            .from('leads')
            .select('name, phone, email')
            .eq('id', lead_id)
            .single();
          
          if (existingLead) {
            if (existingLead.phone) delete leadUpdate.phone;
            if (existingLead.email) delete leadUpdate.email;
            if (existingLead.name) delete leadUpdate.name;
          }
          
          if (Object.keys(leadUpdate).length > 0) {
            await supabase.from('leads').update(leadUpdate).eq('id', lead_id);
            console.log(`[RetargetIQ] Updated lead ${lead_id} with enriched data:`, leadUpdate);
          }
        } else if (external_id && client_id) {
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id, name, phone, email')
            .eq('external_id', external_id)
            .eq('client_id', client_id)
            .single();
          
          if (existingLead) {
            if (existingLead.phone) delete leadUpdate.phone;
            if (existingLead.email) delete leadUpdate.email;
            if (existingLead.name) delete leadUpdate.name;
            
            if (Object.keys(leadUpdate).length > 0) {
              await supabase.from('leads').update(leadUpdate).eq('id', existingLead.id);
              console.log(`[RetargetIQ] Updated lead ${existingLead.id} with enriched data:`, leadUpdate);
            }
          }
        }
      }
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
