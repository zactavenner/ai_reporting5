import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const apiKey = req.headers.get('x-api-key') || url.searchParams.get('api_key');
    const expectedKey = Deno.env.get('CLIENTS_EXPORT_API_KEY');

    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabase
      .from('clients')
      .select('id, name, status, meta_ad_account_id, meta_ad_account_ids, ghl_location_id, ghl_api_key, ghl_account_url')
      .order('name', { ascending: true });

    if (error) throw error;

    const clients = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      meta_ad_account_ids: [c.meta_ad_account_id, ...(c.meta_ad_account_ids || [])].filter(Boolean),
      ghl_location_id: c.ghl_location_id,
      ghl_api_key: c.ghl_api_key,
      ghl_account_url: c.ghl_account_url,
    }));

    return new Response(JSON.stringify({ count: clients.length, clients }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});