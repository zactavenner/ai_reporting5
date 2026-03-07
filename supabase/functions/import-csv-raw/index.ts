import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, csv_url, trigger_enrich } = await req.json();

    if (!client_id || !csv_url) {
      return new Response(JSON.stringify({ success: false, error: 'client_id and csv_url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch CSV from URL
    console.log(`[ImportCSV] Fetching CSV from ${csv_url}`);
    const csvResponse = await fetch(csv_url);
    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
    }
    const csv_text = await csvResponse.text();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const lines = csv_text.split('\n').filter((l: string) => l.trim());
    const dataLines = lines.slice(1); // Skip header
    console.log(`[ImportCSV] Processing ${dataLines.length} lines`);

    // Headers: Date, First Name, Last Name, Phone Number, Email, Funded Amount, City, State, Zip Code, Client Name, Industry
    const seen = new Set<string>();
    const fundedRecords: any[] = [];
    const enrichRecords: any[] = [];

    for (const line of dataLines) {
      const cols = parseCSVLine(line);
      const date = (cols[0] || '').trim();
      const first_name = (cols[1] || '').trim();
      const last_name = (cols[2] || '').trim();
      const phone = (cols[3] || '').trim();
      let email = (cols[4] || '').trim().toLowerCase().replace(/\\/g, '').replace(/\s+/g, '');
      const funded_str = (cols[5] || '0').replace(/[$,"""]/g, '');
      const funded_amount = parseFloat(funded_str) || 0;
      const city = (cols[6] || '').trim();
      const state = (cols[7] || '').trim();
      const zip = (cols[8] || '').trim();

      if (!email && !phone && !first_name) continue;

      const key = email || phone || `${first_name}-${last_name}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const external_id = `bulk-${(email || phone || `${first_name}${last_name}`).replace(/[^a-zA-Z0-9@._-]/g, '')}`;
      const name = [first_name, last_name].filter(Boolean).join(' ') || null;

      let funded_at: string;
      if (date) {
        try {
          const d = new Date(date);
          funded_at = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch {
          funded_at = new Date().toISOString();
        }
      } else {
        funded_at = new Date().toISOString();
      }

      fundedRecords.push({
        client_id,
        external_id,
        name,
        funded_amount,
        source: 'bulk-import',
        funded_at,
      });

      enrichRecords.push({
        client_id,
        external_id,
        source: 'bulk-import-pending',
        first_name: first_name || null,
        last_name: last_name || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        enriched_phones: phone ? [{ phone }] : [],
        enriched_emails: email ? [{ email }] : [],
        raw_data: { imported: true },
      });
    }

    console.log(`[ImportCSV] ${fundedRecords.length} unique records after dedup`);

    // Batch insert funded_investors
    let importedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < fundedRecords.length; i += 200) {
      const chunk = fundedRecords.slice(i, i + 200);
      const { error } = await supabase
        .from('funded_investors')
        .upsert(chunk, { onConflict: 'external_id,client_id', ignoreDuplicates: true });
      if (error) {
        console.error(`[ImportCSV] Funded chunk ${i} error:`, error);
        failedCount += chunk.length;
      } else {
        importedCount += chunk.length;
      }
    }

    // Batch insert lead_enrichment
    let enrichInserted = 0;
    for (let i = 0; i < enrichRecords.length; i += 200) {
      const chunk = enrichRecords.slice(i, i + 200);
      const { error } = await supabase
        .from('lead_enrichment')
        .upsert(chunk, { onConflict: 'external_id,client_id', ignoreDuplicates: true });
      if (error) {
        console.error(`[ImportCSV] Enrichment chunk ${i} error:`, error);
      } else {
        enrichInserted += chunk.length;
      }
    }

    console.log(`[ImportCSV] Complete: funded=${importedCount}, enrichment=${enrichInserted}, failed=${failedCount}`);

    // Trigger enrichment in background if requested
    if (trigger_enrich) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      const enrichPromise = (async () => {
        let enrichedCount = 0;
        let enrichFailedCount = 0;
        const batchSize = 3;

        for (let i = 0; i < enrichRecords.length; i += batchSize) {
          const batch = enrichRecords.slice(i, i + batchSize);
          const promises = batch.map(async (r: any) => {
            try {
              const body: any = { client_id, external_id: r.external_id };
              if (r.enriched_phones?.[0]?.phone) body.phone = r.enriched_phones[0].phone;
              if (r.enriched_emails?.[0]?.email) body.email = r.enriched_emails[0].email;
              if (r.first_name) body.first_name = r.first_name;
              if (r.last_name) body.last_name = r.last_name;
              if (r.city) body.city = r.city;
              if (r.state) body.state = r.state;
              if (r.zip) body.zip = r.zip;
              if (!body.phone && !body.email && !body.city) return false;

              const res = await fetch(`${supabaseUrl}/functions/v1/enrich-lead-retargetiq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                body: JSON.stringify(body),
              });
              const data = await res.json();
              if (data.success) { enrichedCount++; return true; }
              else { enrichFailedCount++; return false; }
            } catch (e) {
              console.error(`[ImportEnrich] Error:`, e);
              enrichFailedCount++;
              return false;
            }
          });
          await Promise.all(promises);
          if (i + batchSize < enrichRecords.length) await new Promise(r => setTimeout(r, 500));
          if ((i + batchSize) % 30 === 0) console.log(`[ImportEnrich] Progress: ${Math.min(i + batchSize, enrichRecords.length)}/${enrichRecords.length}`);
        }
        console.log(`[ImportEnrich] Complete: ${enrichedCount} enriched, ${enrichFailedCount} failed`);
      })();

      if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
        (globalThis as any).EdgeRuntime.waitUntil(enrichPromise);
      } else {
        enrichPromise.catch(e => console.error('[ImportEnrich] Background error:', e));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      imported: importedCount,
      failed: failedCount,
      unique_records: fundedRecords.length,
      enrichment_records: enrichInserted,
      enriching: trigger_enrich || false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Import CSV error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
