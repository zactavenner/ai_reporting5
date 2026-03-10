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

    // Get all funded investors for this client
    const allFunded: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from('funded_investors')
        .select('id, external_id, name, lead_id, client_id')
        .eq('client_id', client_id)
        .range(offset, offset + pageSize - 1);
      if (pageErr) throw pageErr;
      if (!page || page.length === 0) break;
      allFunded.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    // Get already-enriched external_ids so we skip them
    const enrichedSet = new Set<string>();
    let eOffset = 0;
    while (true) {
      const { data: ePage, error: eErr } = await supabase
        .from('lead_enrichment')
        .select('external_id')
        .eq('client_id', client_id)
        .eq('source', 'retargetiq')
        .range(eOffset, eOffset + pageSize - 1);
      if (eErr) throw eErr;
      if (!ePage || ePage.length === 0) break;
      ePage.forEach((r: any) => enrichedSet.add(r.external_id));
      if (ePage.length < pageSize) break;
      eOffset += pageSize;
    }

    // Filter to unenriched funded investors
    const pending = allFunded.filter(f => !enrichedSet.has(f.external_id));
    const total = pending.length;

    console.log(`[EnrichFunded] Found ${allFunded.length} funded investors, ${total} unenriched for client ${client_id}`);

    if (total === 0) {
      return new Response(JSON.stringify({ success: true, total: 0, message: 'All funded investors already enriched' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // For each funded investor, look up their lead data and enrich
    const enrichPromise = (async () => {
      let enrichedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const batchSize = 3;

      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);

        const promises = batch.map(async (funded: any) => {
          try {
            const body: any = { client_id, external_id: funded.external_id };

            // Parse name into first/last
            if (funded.name) {
              const parts = funded.name.trim().split(/\s+/);
              body.first_name = parts[0];
              if (parts.length > 1) body.last_name = parts.slice(1).join(' ');
            }

            // Get lead details if available
            if (funded.lead_id) {
              const { data: lead } = await supabase
                .from('leads')
                .select('phone, email, name, external_id')
                .eq('id', funded.lead_id)
                .single();

              if (lead) {
                if (lead.phone) body.phone = lead.phone;
                if (lead.email) body.email = lead.email;
                body.lead_id = funded.lead_id;
                // Use lead's external_id for GHL linking
                if (lead.external_id) body.external_id = lead.external_id;
                // Use lead name if funded name is missing
                if (!funded.name && lead.name) {
                  const parts = lead.name.trim().split(/\s+/);
                  body.first_name = parts[0];
                  if (parts.length > 1) body.last_name = parts.slice(1).join(' ');
                }
              }
            }

            // Need at least one identifier
            if (!body.phone && !body.email && !body.first_name) {
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
            console.error(`[EnrichFunded] Error enriching ${funded.external_id}:`, e);
            failedCount++;
          }
        });

        await Promise.all(promises);

        // Rate limit
        if (i + batchSize < pending.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if ((i + batchSize) % 30 === 0 || i + batchSize >= pending.length) {
          console.log(`[EnrichFunded] Progress: ${Math.min(i + batchSize, pending.length)}/${total} (${enrichedCount} enriched, ${failedCount} failed, ${skippedCount} skipped)`);
        }
      }

      console.log(`[EnrichFunded] COMPLETE: ${enrichedCount} enriched, ${failedCount} failed, ${skippedCount} skipped out of ${total}`);
    })();

    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      (globalThis as any).EdgeRuntime.waitUntil(enrichPromise);
    } else {
      enrichPromise.catch(e => console.error('[EnrichFunded] Background error:', e));
    }

    return new Response(JSON.stringify({
      success: true,
      total,
      already_enriched: allFunded.length - total,
      message: `Enrichment started for ${total} funded investors in background`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('EnrichFunded error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
