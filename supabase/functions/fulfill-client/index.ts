import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PASSWORD = 'HPA1234$';

function getCloudUrl() { return Deno.env.get('SUPABASE_URL')!; }
function getCloudKey() { return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; }
function getProdDb() {
  const url = Deno.env.get('ORIGINAL_SUPABASE_URL') || getCloudUrl();
  const key = Deno.env.get('ORIGINAL_SUPABASE_SERVICE_ROLE_KEY') || getCloudKey();
  return createClient(url, key);
}

async function callFunction(name: string, payload: any, cloudUrl: string, anonKey: string) {
  const resp = await fetch(`${cloudUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify(payload),
  });
  return { ok: resp.ok, status: resp.status, data: await resp.json().catch(() => ({})) };
}

async function createStep(db: any, runId: string, phase: string, stepName: string, sortOrder: number, stepType = 'edge_function', functionName?: string, functionParams?: any) {
  const { data } = await db.from('fulfillment_steps').insert({
    run_id: runId, phase, step_name: stepName, step_type: stepType,
    sort_order: sortOrder, function_name: functionName || null,
    function_params: functionParams || null, status: 'pending',
  }).select('id').single();
  return data?.id;
}

async function updateStep(db: any, stepId: string, status: string, outputData?: any, errorMessage?: string) {
  const update: any = { status };
  if (status === 'running') update.started_at = new Date().toISOString();
  if (status === 'completed' || status === 'failed') {
    update.completed_at = new Date().toISOString();
    if (update.started_at) {
      // duration calculated from DB
    }
  }
  if (outputData) update.output_data = outputData;
  if (errorMessage) update.error_message = errorMessage;
  await db.from('fulfillment_steps').update(update).eq('id', stepId);
}

async function updateRunPhase(db: any, runId: string, phase: string) {
  await db.from('fulfillment_runs').update({ current_phase: phase }).eq('id', runId);
}

async function notifySlack(cloudUrl: string, anonKey: string, message: string) {
  try {
    await callFunction('slack-notify', { message }, cloudUrl, anonKey);
  } catch (e) {
    console.error('[fulfill-client] Slack notify error:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    if (body.password !== PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { client_id, offer_id, run_id: existingRunId } = body;
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prodDb = getProdDb();
    const cloudUrl = getCloudUrl();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    // Fetch client + offer
    const { data: client } = await prodDb.from('clients').select('*').eq('id', client_id).single();
    if (!client) throw new Error('Client not found');

    let offer: any = null;
    if (offer_id) {
      const { data: o } = await prodDb.from('client_offers').select('*').eq('id', offer_id).single();
      offer = o;
    }

    const companyName = client.name || offer?.fund_name || 'Unknown';
    console.log(`[fulfill-client] Starting pipeline for ${companyName} (${client_id})`);

    // Create or resume fulfillment run
    let runId = existingRunId;
    if (!runId) {
      const { data: run } = await prodDb.from('fulfillment_runs').insert({
        client_id, offer_id: offer_id || null,
        status: 'running', run_mode: 'full',
        current_phase: 'intake', started_at: new Date().toISOString(),
        config: { company_name: companyName },
      }).select('id').single();
      runId = run?.id;
    } else {
      await prodDb.from('fulfillment_runs').update({ status: 'running' }).eq('id', runId);
    }

    if (!runId) throw new Error('Failed to create fulfillment run');

    // Build client_data from offer fields
    const clientData: any = {
      company_name: companyName,
      name: companyName,
      fund_type: offer?.fund_type || client.industry || '',
      raise_amount: offer?.raise_amount || '',
      min_investment: offer?.min_investment || '',
      timeline: offer?.timeline || '',
      target_investor: offer?.target_investor || 'Accredited Investors',
      website: offer?.website_url || client.website_url || '',
      industry: offer?.industry_focus || client.industry || '',
      offer_description: offer?.description || client.description || '',
      brand_notes: offer?.brand_notes || '',
      additional_notes: offer?.additional_notes || '',
      speaker_name: offer?.speaker_name || '',
      targeted_returns: offer?.targeted_returns || '',
      hold_period: offer?.hold_period || '',
      distribution_schedule: offer?.distribution_schedule || '',
      investment_range: offer?.investment_range || '',
      tax_advantages: offer?.tax_advantages || '',
      credibility: offer?.credibility || '',
      fund_history: offer?.fund_history || '',
    };

    // ─── PHASE 1: Brand Scraping ───
    await updateRunPhase(prodDb, runId, 'intake');
    await notifySlack(cloudUrl, anonKey, `🚀 Starting fulfillment for *${companyName}*`);

    if (clientData.website) {
      const scrapeStepId = await createStep(prodDb, runId, 'intake', 'Brand Scraping', 1, 'edge_function', 'scrape-brand-info');
      try {
        await updateStep(prodDb, scrapeStepId, 'running');
        const r = await callFunction('scrape-brand-info', { url: clientData.website, clientId: client_id }, cloudUrl, anonKey);
        if (r.ok) {
          await updateStep(prodDb, scrapeStepId, 'completed', r.data);
          // Merge scraped brand data if available
          if (r.data?.brand_colors) clientData.brand_colors = r.data.brand_colors;
        } else {
          await updateStep(prodDb, scrapeStepId, 'failed', null, r.data?.error || 'Scrape failed');
        }
      } catch (e) {
        await updateStep(prodDb, scrapeStepId, 'failed', null, String(e));
      }
    }

    // ─── PHASE 2: Research & Angles ───
    await updateRunPhase(prodDb, runId, 'research');
    await notifySlack(cloudUrl, anonKey, `📊 Phase 2: Research & Angles for *${companyName}*`);

    let existingResearch: any = null;
    let existingAngles: any = null;

    for (const assetType of ['research', 'angles']) {
      const stepId = await createStep(prodDb, runId, 'research', `Generate ${assetType}`, assetType === 'research' ? 10 : 11, 'edge_function', 'generate-asset');
      try {
        await updateStep(prodDb, stepId, 'running');
        const r = await callFunction('generate-asset', {
          client_id, offer_id: offer_id || null,
          asset_type: assetType, client_data: clientData,
          existing_research: existingResearch, existing_angles: existingAngles,
        }, cloudUrl, anonKey);

        if (r.ok) {
          await updateStep(prodDb, stepId, 'completed', { asset_id: r.data?.asset?.id });
          if (assetType === 'research') existingResearch = r.data?.content;
          if (assetType === 'angles') existingAngles = r.data?.content;
        } else {
          await updateStep(prodDb, stepId, 'failed', null, r.data?.error || `${assetType} generation failed`);
        }
      } catch (e) {
        await updateStep(prodDb, stepId, 'failed', null, String(e));
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    // ─── PHASE 3: Content Generation ───
    await updateRunPhase(prodDb, runId, 'content');
    await notifySlack(cloudUrl, anonKey, `✍️ Phase 3: Content generation for *${companyName}*`);

    const copyTypes = ['emails', 'sms', 'adcopy', 'scripts', 'creatives', 'report', 'funnel', 'setter', 'vsl', 'caller'];
    let sortOrder = 20;
    for (const assetType of copyTypes) {
      const stepId = await createStep(prodDb, runId, 'content', `Generate ${assetType}`, sortOrder++, 'edge_function', 'generate-asset');
      try {
        await updateStep(prodDb, stepId, 'running');
        const r = await callFunction('generate-asset', {
          client_id, offer_id: offer_id || null,
          asset_type: assetType, client_data: clientData,
          existing_research: existingResearch, existing_angles: existingAngles,
        }, cloudUrl, anonKey);

        if (r.ok) {
          await updateStep(prodDb, stepId, 'completed', { asset_id: r.data?.asset?.id });
        } else {
          await updateStep(prodDb, stepId, 'failed', null, r.data?.error || `${assetType} failed`);
        }
      } catch (e) {
        await updateStep(prodDb, stepId, 'failed', null, String(e));
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    // ─── Trigger Phase 4-6 (visuals) as separate function to avoid timeout ───
    await updateRunPhase(prodDb, runId, 'visuals_queued');
    console.log(`[fulfill-client] Triggering visuals phase for run ${runId}`);

    fetch(`${cloudUrl}/functions/v1/fulfill-client-visuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({
        password: PASSWORD, client_id, offer_id, run_id: runId,
        client_data: clientData,
        brand_colors: offer?.brand_colors || client.brand_colors || [],
        brand_fonts: offer?.brand_fonts || client.brand_fonts || [],
        company_name: companyName,
        offer_description: offer?.description || client.description || '',
      }),
    }).catch(err => console.error('[fulfill-client] Visuals trigger error:', err));

    return new Response(JSON.stringify({
      success: true, run_id: runId, client_id, offer_id,
      message: 'Phases 1-3 complete. Phases 4-6 triggered.',
      research_generated: !!existingResearch,
      angles_generated: !!existingAngles,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[fulfill-client] Fatal error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
