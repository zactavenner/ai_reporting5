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
    const { client_id, rows, file_type } = await req.json();

    if (!client_id || !rows?.length) {
      return new Response(JSON.stringify({ success: false, error: 'client_id and rows required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[ProcessInvestorText] Processing ${rows.length} rows, file_type=${file_type}`);

    // Deduplicate by email (primary key)
    const seen = new Set<string>();
    const fundedRecords: any[] = [];
    const enrichRecords: any[] = [];

    for (const row of rows) {
      let first_name = '', last_name = '', phone = '', email = '', 
          funded_amount = 0, city = '', state = '', zip = '', address = '';

      if (file_type === 'csv') {
        // CSV format: first_name, last_name, phone, email, funded_amount, city, state, zip
        first_name = (row.first_name || '').trim();
        last_name = (row.last_name || '').trim();
        phone = (row.phone || '').trim();
        email = (row.email || '').trim().toLowerCase();
        funded_amount = parseFloat((row.funded_amount || '0').replace(/[$,]/g, '')) || 0;
        city = (row.city || '').trim();
        state = (row.state || '').trim();
        zip = (row.zip || '').trim();
      } else if (file_type === 'xlsx') {
        // XLSX format: first_name, last_name, street, city, state, zip, email, phone
        first_name = (row.first_name || '').trim();
        last_name = (row.last_name || '').trim();
        address = (row.street || '').trim();
        city = (row.city || '').trim();
        state = (row.state || '').trim();
        zip = (row.zip || '').trim();
        email = (row.email || '').trim().toLowerCase();
        phone = (row.phone || '').trim();
      } else if (file_type === 'xls') {
        // XLS format: address, city, state, zip, phone, email
        address = (row.address || '').trim();
        city = (row.city || '').trim();
        state = (row.state || '').trim();
        zip = (row.zip || '').trim();
        phone = (row.phone || '').trim();
        email = (row.email || '').trim().toLowerCase();
      }

      // Clean email - remove backslash escapes
      email = email.replace(/\\/g, '');
      
      // Skip empty/invalid rows
      if (!email && !phone && !first_name && !address) continue;

      // Dedup key
      const key = email || phone || `${first_name}-${last_name}-${city}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const name = [first_name, last_name].filter(Boolean).join(' ') || null;
      const external_id = `bulk-${(email || phone || `${first_name}${last_name}${city}`).replace(/[^a-zA-Z0-9@._-]/g, '')}`;

      fundedRecords.push({
        client_id,
        external_id,
        name,
        funded_amount,
        source: 'bulk-import',
        funded_at: new Date().toISOString(),
      });

      enrichRecords.push({
        client_id,
        external_id,
        source: 'bulk-import-pending',
        first_name: first_name || null,
        last_name: last_name || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        enriched_phones: phone ? [{ phone }] : [],
        enriched_emails: email ? [{ email }] : [],
        raw_data: { imported: true },
      });
    }

    console.log(`[ProcessInvestorText] ${fundedRecords.length} unique records after dedup`);

    // Batch insert funded_investors
    let importedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < fundedRecords.length; i += 200) {
      const chunk = fundedRecords.slice(i, i + 200);
      const { error } = await supabase
        .from('funded_investors')
        .upsert(chunk, { onConflict: 'external_id,client_id', ignoreDuplicates: true });
      if (error) {
        console.error(`[ProcessInvestorText] Funded chunk ${i} error:`, error);
        failedCount += chunk.length;
      } else {
        importedCount += chunk.length;
      }
    }

    // Batch insert lead_enrichment
    for (let i = 0; i < enrichRecords.length; i += 200) {
      const chunk = enrichRecords.slice(i, i + 200);
      const { error } = await supabase
        .from('lead_enrichment')
        .upsert(chunk, { onConflict: 'external_id,client_id', ignoreDuplicates: true });
      if (error) {
        console.error(`[ProcessInvestorText] Enrichment chunk ${i} error:`, error);
      }
    }

    console.log(`[ProcessInvestorText] Complete: imported=${importedCount}, failed=${failedCount}`);

    return new Response(JSON.stringify({
      success: true,
      imported: importedCount,
      failed: failedCount,
      unique_records: fundedRecords.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Process investor text error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
