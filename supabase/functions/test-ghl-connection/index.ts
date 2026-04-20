import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { api_key, location_id } = await req.json();
    if (!api_key || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing api_key or location_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`https://services.leadconnectorhq.com/locations/${location_id}`, {
      headers: {
        Authorization: `Bearer ${api_key}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({ ok: false, status: res.status, error: body.slice(0, 300) }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const location = data?.location || data;
    return new Response(JSON.stringify({
      ok: true,
      location_name: location?.name || null,
      location_id: location?.id || location_id,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});