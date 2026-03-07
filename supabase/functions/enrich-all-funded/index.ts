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
    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ success: false, error: 'client_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get all lead_enrichment records that haven't been enriched yet
    const { data: pendingRecords, error } = await supabase
      .from('lead_enrichment')
      .select('external_id, first_name, last_name, enriched_phones, enriched_emails, city, state, zip, address, source')
      .eq('client_id', client_id)
      .in('source', ['bulk-import-pending', 'bulk-import'])
      .limit(10000);

    if (error) throw error;

    const total = pendingRecords?.length || 0;
    console.log(`[EnrichAll] Found ${total} records to enrich for client ${client_id}`);

    if (total === 0) {
      return new Response(JSON.stringify({ success: true, total: 0, message: 'No records to enrich' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Run enrichment in background
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const enrichPromise = (async () => {
      let enrichedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const batchSize = 3;

      for (let i = 0; i < pendingRecords.length; i += batchSize) {
        const batch = pendingRecords.slice(i, i + batchSize);

        const promises = batch.map(async (r: any) => {
          try {
            const body: any = { client_id, external_id: r.external_id };

            // Extract phone
            const phoneObj = r.enriched_phones?.[0];
            const phone = phoneObj?.phone || phoneObj;
            if (phone && typeof phone === 'string') body.phone = phone.trim();

            // Extract email
            const emailObj = r.enriched_emails?.[0];
            const email = emailObj?.email || emailObj;
            if (email && typeof email === 'string') body.email = email.trim();

            if (r.first_name) body.first_name = r.first_name;
            if (r.last_name) body.last_name = r.last_name;
            if (r.city) body.city = r.city;
            if (r.state) body.state = r.state;
            if (r.zip) body.zip = r.zip;
            if (r.address) body.address = r.address;

            // Need at least one identifier
            if (!body.phone && !body.email && !body.city) {
              skippedCount++;
              return;
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
            } else {
              failedCount++;
            }
          } catch (e) {
            console.error(`[EnrichAll] Error enriching ${r.external_id}:`, e);
            failedCount++;
          }
        });

        await Promise.all(promises);

        // Rate limit
        if (i + batchSize < pendingRecords.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if ((i + batchSize) % 30 === 0 || i + batchSize >= pendingRecords.length) {
          console.log(`[EnrichAll] Progress: ${Math.min(i + batchSize, pendingRecords.length)}/${total} (${enrichedCount} enriched, ${failedCount} failed, ${skippedCount} skipped)`);
        }
      }

      console.log(`[EnrichAll] COMPLETE: ${enrichedCount} enriched, ${failedCount} failed, ${skippedCount} skipped out of ${total}`);
    })();

    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      (globalThis as any).EdgeRuntime.waitUntil(enrichPromise);
    } else {
      enrichPromise.catch(e => console.error('[EnrichAll] Background error:', e));
    }

    return new Response(JSON.stringify({
      success: true,
      total,
      message: `Enrichment started for ${total} records in background`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('EnrichAll error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
