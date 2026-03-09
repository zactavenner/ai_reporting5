import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichResult {
  identity: any;
  allIdentities: any[];
  companies: any[];
  method: string;
  rawResponse: any;
}

async function lookupByPhone(apiKey: string, slug: string, phone: string): Promise<EnrichResult | null> {
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) return null;
  console.log(`[RetargetIQ] Lookup by phone: ${cleanPhone}`);
  try {
    const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByPhone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, website: slug, phone: cleanPhone }),
    });
    const text = await res.text();
    if (!res.ok) return null;
    const data = JSON.parse(text);
    if (data.success && data.data?.identities?.length > 0) {
      console.log(`[RetargetIQ] ✓ Phone match: ${data.data.identities.length} identities`);
      return {
        identity: data.data.identities[0],
        allIdentities: data.data.identities,
        companies: data.data.identities[0]?.companies || [],
        method: 'phone',
        rawResponse: data.data,
      };
    }
  } catch (e) { console.error('[RetargetIQ] Phone lookup error:', e); }
  return null;
}

async function lookupByEmail(apiKey: string, slug: string, email: string): Promise<EnrichResult | null> {
  console.log(`[RetargetIQ] Lookup by email: ${email}`);
  try {
    const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, website: slug, email: email.trim() }),
    });
    const text = await res.text();
    if (!res.ok) return null;
    const data = JSON.parse(text);
    if (data.success && data.data?.identities?.length > 0) {
      console.log(`[RetargetIQ] ✓ Email match: ${data.data.identities.length} identities`);
      return {
        identity: data.data.identities[0],
        allIdentities: data.data.identities,
        companies: data.data.identities[0]?.companies || [],
        method: 'email',
        rawResponse: data.data,
      };
    }
  } catch (e) { console.error('[RetargetIQ] Email lookup error:', e); }
  return null;
}

async function lookupByAddress(apiKey: string, slug: string, params: any): Promise<EnrichResult | null> {
  const query: any = { api_key: apiKey, website: slug };
  if (params.first_name) query.firstName = params.first_name;
  if (params.last_name) query.lastName = params.last_name;
  if (params.address) query.address = params.address;
  if (params.city) query.city = params.city;
  if (params.state) query.state = params.state;
  if (params.zip) query.zip = params.zip;
  console.log(`[RetargetIQ] Lookup by address`);
  try {
    const res = await fetch('https://app.retargetiq.com/api/v2/GetDataByAddress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    const text = await res.text();
    if (!res.ok) return null;
    const data = JSON.parse(text);
    if (data.success && data.data?.identities?.length > 0) {
      console.log(`[RetargetIQ] ✓ Address match: ${data.data.identities.length} identities`);
      return {
        identity: data.data.identities[0],
        allIdentities: data.data.identities,
        companies: data.data.identities[0]?.companies || [],
        method: 'address',
        rawResponse: data.data,
      };
    }
  } catch (e) { console.error('[RetargetIQ] Address lookup error:', e); }
  return null;
}

function mergeResults(results: EnrichResult[]): { primary: any; allIdentities: any[]; companies: any[]; methods: string[]; rawResponses: any[] } {
  if (results.length === 0) return { primary: null, allIdentities: [], companies: [], methods: [], rawResponses: [] };

  // Collect all unique identities across all results
  const identityMap = new Map<string, any>();
  const allCompanies: any[] = [];
  const methods: string[] = [];
  const rawResponses: any[] = [];

  for (const r of results) {
    methods.push(r.method);
    rawResponses.push(r.rawResponse);
    for (const id of r.allIdentities) {
      const key = `${id.firstName || ''}-${id.lastName || ''}-${id.address || ''}-${id.zip || ''}`;
      if (!identityMap.has(key)) {
        identityMap.set(key, id);
      } else {
        // Merge: pick richer data
        const existing = identityMap.get(key);
        const merged = { ...existing };
        for (const [k, v] of Object.entries(id)) {
          if (v && !merged[k]) merged[k] = v;
          // For arrays, merge
          if (Array.isArray(v) && Array.isArray(merged[k])) {
            const existingSet = new Set(merged[k].map((x: any) => JSON.stringify(x)));
            for (const item of v) {
              if (!existingSet.has(JSON.stringify(item))) merged[k].push(item);
            }
          }
        }
        identityMap.set(key, merged);
      }
    }
    for (const c of r.companies) {
      if (!allCompanies.find(ec => ec.company === c.company && ec.title === c.title)) {
        allCompanies.push(c);
      }
    }
  }

  const allIdentities = Array.from(identityMap.values());
  // Pick the richest identity as primary (most filled fields)
  let primary = allIdentities[0];
  let maxFields = 0;
  for (const id of allIdentities) {
    const fieldCount = Object.values(id).filter(v => v != null && v !== '').length;
    if (fieldCount > maxFields) {
      maxFields = fieldCount;
      primary = id;
    }
  }

  return { primary, allIdentities, companies: allCompanies.length > 0 ? allCompanies : primary?.companies || [], methods, rawResponses };
}

function extractDataFields(identity: any) {
  const d = identity?.data || {};
  const f = identity?.finances || {};
  return {
    // Financial
    household_income: d.incomeLevel || f.householdIncome || null,
    credit_range: f.creditRange || null,
    discretionary_income: f.discretionaryIncome || null,
    financial_power: f.financialPower != null ? Number(f.financialPower) : null,
    net_worth: d.householdNetWorth || null,
    net_worth_midpoint: d.householdNetWorthMidpoint != null ? Number(d.householdNetWorthMidpoint) : null,
    home_ownership: d.homeOwnership || null,
    home_value: d.homeValue != null ? Number(d.homeValue) : null,
    median_home_value: d.medianHomeValue != null ? Number(d.medianHomeValue) : null,
    mortgage_amount: d.mortgageAmount != null ? Number(d.mortgageAmount) : null,
    owns_investments: d.ownsInvestments != null ? Boolean(d.ownsInvestments) : null,
    is_investor: d.investor != null ? Boolean(d.investor) : null,
    owns_stocks_bonds: d.ownsStocksAndBonds != null ? Boolean(d.ownsStocksAndBonds) : null,
    // Demographics
    education: d.education || null,
    occupation: d.occupationDetail || null,
    occupation_type: d.occupationType || null,
    occupation_category: d.occupationCategory || null,
    marital_status: d.maritalStatus || null,
    age: d.age != null ? Number(d.age) : null,
    generation: d.generation || null,
    ethnicity: d.ethnicGroup || null,
    language: d.language || null,
    urbanicity: d.urbanicity || null,
    // Household
    household_adults: d.householdAdults != null ? Number(d.householdAdults) : null,
    household_persons: d.householdPersons != null ? Number(d.householdPersons) : null,
    has_children: d.householdChild != null ? Boolean(d.householdChild) : null,
    dwelling_type: d.dwellingType || null,
    length_of_residence: d.lengthOfResidence != null ? Number(d.lengthOfResidence) : null,
    is_veteran: d.householdVeteran != null ? Boolean(d.householdVeteran) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, lead_id, external_id, phone, email, address, city, state, zip, website_slug, first_name, last_name } = await req.json();

    const apiKey = Deno.env.get('RETARGETIQ_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RetargetIQ API key not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Get website slug
    let slug = website_slug;
    if (!slug && client_id) {
      const { data: settings } = await supabase.from('client_settings').select('retargetiq_website_slug').eq('client_id', client_id).single();
      slug = settings?.retargetiq_website_slug;
    }
    if (!slug) {
      return new Response(JSON.stringify({ success: false, error: 'RetargetIQ website slug not configured.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== WATERFALL ENRICHMENT ==========
    const results: EnrichResult[] = [];

    // Step 1: Phone lookup
    if (phone) {
      const r = await lookupByPhone(apiKey, slug, phone);
      if (r) results.push(r);
    }

    // Step 2: Email lookup
    if (email) {
      const r = await lookupByEmail(apiKey, slug, email);
      if (r) results.push(r);
    }

    // Step 3: Address lookup
    if (address || (city && state)) {
      const r = await lookupByAddress(apiKey, slug, { first_name, last_name, address, city, state, zip });
      if (r) results.push(r);
    }

    // Step 4: Cross-reference — if phone lookup returned emails we didn't have, enrich by those
    if (results.length > 0 && !email) {
      const foundEmails = results.flatMap(r => r.identity?.emails || []);
      if (foundEmails.length > 0) {
        const crossEmail = foundEmails[0]?.email || foundEmails[0];
        if (crossEmail && typeof crossEmail === 'string') {
          const r = await lookupByEmail(apiKey, slug, crossEmail);
          if (r) results.push(r);
        }
      }
    }

    // Step 5: Cross-reference — if email lookup returned phones we didn't have, enrich by those
    if (results.length > 0 && !phone) {
      const foundPhones = results.flatMap(r => r.identity?.phones || []);
      if (foundPhones.length > 0) {
        const crossPhone = foundPhones[0]?.phone || foundPhones[0];
        if (crossPhone && typeof crossPhone === 'string') {
          const r = await lookupByPhone(apiKey, slug, crossPhone);
          if (r) results.push(r);
        }
      }
    }

    // Step 6: Merge all results
    const merged = mergeResults(results);

    if (!merged.primary) {
      return new Response(JSON.stringify({ success: false, error: 'No enrichment data found for this contact' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const identity = merged.primary;
    const dataFields = extractDataFields(identity);

    // Spouse data: all identities beyond the primary
    const spouseIdentities = merged.allIdentities.slice(1).map(s => ({
      firstName: s.firstName, lastName: s.lastName,
      gender: s.gender, age: s.data?.age,
      phones: s.phones || [], emails: s.emails || [],
      companies: s.companies || [],
      address: s.address, city: s.city, state: s.state, zip: s.zip,
      education: s.data?.education, occupation: s.data?.occupationDetail,
      maritalStatus: s.data?.maritalStatus,
    }));

    // Build enrichment record
    const enrichRecord: any = {
      lead_id: lead_id || null,
      client_id,
      external_id: external_id || `manual-${Date.now()}`,
      source: 'retargetiq',
      raw_data: merged.rawResponses.length === 1 ? merged.rawResponses[0] : merged.rawResponses,
      first_name: identity.firstName || null,
      last_name: identity.lastName || null,
      address: [identity.address, identity.city, identity.state, identity.zip].filter(Boolean).join(', ') || null,
      city: identity.city || null,
      state: identity.state || null,
      zip: identity.zip || null,
      gender: identity.gender === 'M' ? 'Male' : identity.gender === 'F' ? 'Female' : identity.gender || null,
      birth_date: identity.birthDate || null,
      company_name: merged.companies[0]?.company || null,
      company_title: merged.companies[0]?.title || null,
      linkedin_url: merged.companies[0]?.linkedin || null,
      enriched_phones: identity.phones || [],
      enriched_emails: identity.emails || [],
      vehicles: identity.vehicles || [],
      enriched_at: new Date().toISOString(),
      // New financial/demographic fields
      ...dataFields,
      // Company array
      companies: merged.companies.length > 0 ? merged.companies : null,
      // Spouse
      spouse_data: spouseIdentities.length > 0 ? spouseIdentities : null,
      is_primary_identity: true,
      retargetiq_id: identity.id || merged.rawResponses[0]?.id || null,
      // Enrichment metadata
      enrichment_methods_used: merged.methods,
      enrichment_match_count: merged.allIdentities.length,
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
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Write enrichment data back to leads table if we have a lead_id or external_id
    if (lead_id || external_id) {
      const leadUpdate: any = {};
      if (identity.phones?.length > 0) {
        const bestPhone = identity.phones[0]?.phone || identity.phones[0];
        if (bestPhone) leadUpdate.phone = bestPhone;
      }
      if (identity.emails?.length > 0) {
        const bestEmail = identity.emails[0]?.email || identity.emails[0];
        if (bestEmail) leadUpdate.email = bestEmail;
      }
      if (identity.firstName || identity.lastName) {
        const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(' ');
        if (fullName) leadUpdate.name = fullName;
      }

      if (Object.keys(leadUpdate).length > 0) {
        if (lead_id) {
          const { data: existingLead } = await supabase.from('leads').select('name, phone, email').eq('id', lead_id).single();
          if (existingLead) {
            if (existingLead.phone) delete leadUpdate.phone;
            if (existingLead.email) delete leadUpdate.email;
            if (existingLead.name) delete leadUpdate.name;
          }
          if (Object.keys(leadUpdate).length > 0) {
            await supabase.from('leads').update(leadUpdate).eq('id', lead_id);
            console.log(`[RetargetIQ] Updated lead ${lead_id} with:`, leadUpdate);
          }
        } else if (external_id && client_id) {
          const { data: existingLead } = await supabase.from('leads').select('id, name, phone, email').eq('external_id', external_id).eq('client_id', client_id).single();
          if (existingLead) {
            if (existingLead.phone) delete leadUpdate.phone;
            if (existingLead.email) delete leadUpdate.email;
            if (existingLead.name) delete leadUpdate.name;
            if (Object.keys(leadUpdate).length > 0) {
              await supabase.from('leads').update(leadUpdate).eq('id', existingLead.id);
              console.log(`[RetargetIQ] Updated lead ${existingLead.id} with:`, leadUpdate);
            }
          }
        }
      }
    }

    console.log(`[RetargetIQ] ✓ Enriched ${external_id} via ${merged.methods.join('+')} — ${merged.allIdentities.length} identities, ${merged.companies.length} companies`);

    return new Response(JSON.stringify({ success: true, enrichment: upserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Enrichment error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
