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
    const { client_id, records, enrich } = await req.json();

    if (!client_id || !records?.length) {
      return new Response(JSON.stringify({ success: false, error: 'client_id and records required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[BatchImport] Starting import of ${records.length} records for client ${client_id}`);

    // 1) Insert funded investors
    const fundedRecords = records.map((r: any, i: number) => ({
      client_id,
      external_id: r.external_id || `csv-import-${Date.now()}-${i}`,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
      funded_amount: parseFloat(r.funded_amount) || 0,
      source: 'csv-import',
      funded_at: r.date || new Date().toISOString(),
    }));

    // Batch insert in chunks of 100
    let importedCount = 0;
    let failedCount = 0;
    for (let i = 0; i < fundedRecords.length; i += 100) {
      const chunk = fundedRecords.slice(i, i + 100);
      const { error } = await supabase
        .from('funded_investors')
        .upsert(chunk, { onConflict: 'external_id,client_id', ignoreDuplicates: true });
      if (error) {
        console.error(`[BatchImport] Chunk ${i} error:`, error);
        failedCount += chunk.length;
      } else {
        importedCount += chunk.length;
      }
    }

    console.log(`[BatchImport] Imported ${importedCount} funded investors, ${failedCount} failed`);

    // 2) If enrich is requested, process enrichment in background
    if (enrich) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      // Process enrichment in background to avoid timeout
      const enrichPromise = (async () => {
        let enrichedCount = 0;
        let enrichFailedCount = 0;
        const batchSize = 5; // Process 5 at a time to avoid rate limits

        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          
          const promises = batch.map(async (r: any) => {
            try {
              const body = {
                client_id,
                external_id: r.external_id || `csv-import-${Date.now()}-${records.indexOf(r)}`,
                phone: r.phone?.trim() || undefined,
                email: r.email?.trim() || undefined,
                first_name: r.first_name?.trim() || undefined,
                last_name: r.last_name?.trim() || undefined,
                city: r.city?.trim() || undefined,
                state: r.state?.trim() || undefined,
                zip: r.zip?.trim() || undefined,
                address: r.address?.trim() || undefined,
              };

              // Skip records with no identifiable info
              if (!body.phone && !body.email && !body.city) {
                console.log(`[BatchEnrich] Skipping record with no contact info: ${body.external_id}`);
                return false;
              }

              const res = await fetch(`${supabaseUrl}/functions/v1/enrich-lead-retargetiq`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceKey}`,
                },
                body: JSON.stringify(body),
              });

              const data = await res.json();
              if (data.success) {
                enrichedCount++;
                return true;
              } else {
                enrichFailedCount++;
                return false;
              }
            } catch (e) {
              console.error(`[BatchEnrich] Error:`, e);
              enrichFailedCount++;
              return false;
            }
          });

          await Promise.all(promises);
          
          // Small delay between batches to avoid rate limiting
          if (i + batchSize < records.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          if ((i + batchSize) % 50 === 0) {
            console.log(`[BatchEnrich] Progress: ${Math.min(i + batchSize, records.length)}/${records.length} (${enrichedCount} enriched, ${enrichFailedCount} failed)`);
          }
        }

        console.log(`[BatchEnrich] Complete: ${enrichedCount} enriched, ${enrichFailedCount} failed out of ${records.length}`);
      })();

      // Use EdgeRuntime.waitUntil if available for background processing
      if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
        (globalThis as any).EdgeRuntime.waitUntil(enrichPromise);
      } else {
        // Fallback: just let it run
        enrichPromise.catch(e => console.error('[BatchEnrich] Background error:', e));
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      imported: importedCount, 
      failed: failedCount,
      enriching: enrich ? true : false,
      message: enrich 
        ? `Imported ${importedCount} records. Enrichment running in background.`
        : `Imported ${importedCount} records.`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Batch import error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
