import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ghlApiKey, ghlLocationId } = await req.json();

    if (!ghlApiKey || !ghlLocationId) {
      return new Response(
        JSON.stringify({ error: 'Missing GHL credentials', calendars: [] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(
      `${GHL_BASE_URL}/calendars/?locationId=${ghlLocationId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${ghlApiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GHL calendars API error: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ 
          error: `GHL API error: ${response.status}`, 
          calendars: [],
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log(`Fetched ${data.calendars?.length || 0} calendars for location ${ghlLocationId}`);

    return new Response(
      JSON.stringify({ 
        calendars: data.calendars || [],
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error fetching GHL calendars:', err);
    return new Response(
      JSON.stringify({ 
        error: err instanceof Error ? err.message : 'Unknown error',
        calendars: [] 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
