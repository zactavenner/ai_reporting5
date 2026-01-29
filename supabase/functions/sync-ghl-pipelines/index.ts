import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
  }>;
}

interface GHLOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  monetaryValue?: number;
  contact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  source?: string;
  lastStageChangeAt?: string;
  createdAt?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { client_id, mode = 'list', pipeline_id } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client's GHL credentials
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('ghl_location_id, ghl_api_key')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientError);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.ghl_location_id || !client.ghl_api_key) {
      return new Response(
        JSON.stringify({ error: 'GHL credentials not configured for this client' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ghlHeaders = {
      'Authorization': `Bearer ${client.ghl_api_key}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    };

    // Mode: list - Return available pipelines from GHL
    if (mode === 'list') {
      console.log('Fetching pipelines from GHL for location:', client.ghl_location_id);
      
      const pipelinesResponse = await fetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${client.ghl_location_id}`,
        { headers: ghlHeaders }
      );

      if (!pipelinesResponse.ok) {
        const errorText = await pipelinesResponse.text();
        console.error('GHL API error:', pipelinesResponse.status, errorText);
        
        // Provide user-friendly error messages
        let errorMessage = `GHL API error: ${pipelinesResponse.status}`;
        if (pipelinesResponse.status === 401) {
          errorMessage = 'GHL credentials are invalid or expired. Please update your Private Integration Key in Client Settings → Integrations.';
        } else if (pipelinesResponse.status === 403) {
          errorMessage = 'GHL API access denied. Please ensure your Private Integration has the "Opportunities" scope enabled.';
        }
        
        return new Response(
          JSON.stringify({ error: errorMessage, code: pipelinesResponse.status }),
          { status: pipelinesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pipelinesData = await pipelinesResponse.json();
      console.log('Found pipelines:', pipelinesData.pipelines?.length || 0);

      return new Response(
        JSON.stringify({ pipelines: pipelinesData.pipelines || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: sync - Sync a specific pipeline
    if (mode === 'sync' && pipeline_id) {
      console.log('Syncing pipeline:', pipeline_id);

      // First, fetch pipeline details
      const pipelinesResponse = await fetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${client.ghl_location_id}`,
        { headers: ghlHeaders }
      );

      if (!pipelinesResponse.ok) {
        const errorText = await pipelinesResponse.text();
        console.error('GHL API error fetching pipelines:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch pipeline details' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pipelinesData = await pipelinesResponse.json();
      const targetPipeline = pipelinesData.pipelines?.find((p: GHLPipeline) => p.id === pipeline_id);

      if (!targetPipeline) {
        return new Response(
          JSON.stringify({ error: 'Pipeline not found in GHL' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Upsert the pipeline
      const { data: dbPipeline, error: pipelineError } = await supabase
        .from('client_pipelines')
        .upsert({
          client_id,
          ghl_pipeline_id: pipeline_id,
          name: targetPipeline.name,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'client_id,ghl_pipeline_id' })
        .select()
        .single();

      if (pipelineError) {
        console.error('Error upserting pipeline:', pipelineError);
        return new Response(
          JSON.stringify({ error: 'Failed to save pipeline' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Pipeline saved:', dbPipeline.id);

      // Sync stages
      const stages = targetPipeline.stages || [];
      for (const stage of stages) {
        await supabase
          .from('pipeline_stages')
          .upsert({
            pipeline_id: dbPipeline.id,
            ghl_stage_id: stage.id,
            name: stage.name,
            sort_order: stage.position || 0,
          }, { onConflict: 'pipeline_id,ghl_stage_id' });
      }

      console.log('Stages synced:', stages.length);

      // Fetch stages from DB to get their IDs
      const { data: dbStages } = await supabase
        .from('pipeline_stages')
        .select('id, ghl_stage_id')
        .eq('pipeline_id', dbPipeline.id);

      const stageIdMap = new Map(dbStages?.map(s => [s.ghl_stage_id, s.id]) || []);

      // Fetch opportunities with pagination
      let allOpportunities: GHLOpportunity[] = [];
      let hasMore = true;
      let startAfterId: string | null = null;

      while (hasMore) {
        let url = `https://services.leadconnectorhq.com/opportunities/search?locationId=${client.ghl_location_id}&pipelineId=${pipeline_id}&limit=100`;
        if (startAfterId) {
          url += `&startAfterId=${startAfterId}`;
        }

        console.log('Fetching opportunities:', url);
        const oppsResponse = await fetch(url, { headers: ghlHeaders });

        if (!oppsResponse.ok) {
          console.error('Failed to fetch opportunities:', await oppsResponse.text());
          break;
        }

        const oppsData = await oppsResponse.json();
        const opportunities = oppsData.opportunities || [];
        allOpportunities = allOpportunities.concat(opportunities);

        if (opportunities.length < 100) {
          hasMore = false;
        } else {
          startAfterId = opportunities[opportunities.length - 1]?.id;
        }
      }

      console.log('Total opportunities fetched:', allOpportunities.length);

      // Clear existing opportunities for this pipeline before inserting new ones
      await supabase
        .from('pipeline_opportunities')
        .delete()
        .eq('pipeline_id', dbPipeline.id);

      // Insert opportunities
      let syncedCount = 0;
      for (const opp of allOpportunities) {
        const stageId = stageIdMap.get(opp.pipelineStageId);
        if (!stageId) {
          console.warn('Stage not found for opportunity:', opp.id, opp.pipelineStageId);
          continue;
        }

        const { error: oppError } = await supabase
          .from('pipeline_opportunities')
          .insert({
            pipeline_id: dbPipeline.id,
            stage_id: stageId,
            ghl_opportunity_id: opp.id,
            ghl_contact_id: opp.contact?.id,
            contact_name: opp.contact?.name || opp.name,
            contact_email: opp.contact?.email,
            contact_phone: opp.contact?.phone,
            monetary_value: opp.monetaryValue || 0,
            source: opp.source,
            status: opp.status || 'open',
            last_stage_change_at: opp.lastStageChangeAt,
          });

        if (!oppError) {
          syncedCount++;
        } else {
          console.error('Error inserting opportunity:', oppError);
        }
      }

      console.log('Opportunities synced:', syncedCount);

      return new Response(
        JSON.stringify({
          success: true,
          pipeline: dbPipeline,
          stages_count: stages.length,
          opportunities_count: syncedCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode: remove - Remove a pipeline from tracking
    if (mode === 'remove' && pipeline_id) {
      const { error: deleteError } = await supabase
        .from('client_pipelines')
        .delete()
        .eq('client_id', client_id)
        .eq('ghl_pipeline_id', pipeline_id);

      if (deleteError) {
        console.error('Error removing pipeline:', deleteError);
        return new Response(
          JSON.stringify({ error: 'Failed to remove pipeline' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid mode' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-ghl-pipelines:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
