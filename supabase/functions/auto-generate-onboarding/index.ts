import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PASSWORD = 'HPA1234$';

// 10 ads: distribute across aspect ratios for the Capital Raising style
const AD_PLAN = [
  { ratio: '1:1', count: 4 },
  { ratio: '4:5', count: 3 },
  { ratio: '9:16', count: 3 },
];

function getCloudUrl() {
  return Deno.env.get('SUPABASE_URL')!;
}

function getCloudKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

function getProdDb() {
  const url = Deno.env.get('ORIGINAL_SUPABASE_URL') || getCloudUrl();
  const key = Deno.env.get('ORIGINAL_SUPABASE_SERVICE_ROLE_KEY') || getCloudKey();
  return createClient(url, key);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    if (body.password !== PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      client_id,
      offer_id,
      offer_description,
      company_name,
      brand_colors,
      brand_fonts,
      website_url,
      intake_data,
    } = body;

    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[auto-generate] Starting for client ${client_id} (${company_name})`);

    const prodDb = getProdDb();
    const cloudUrl = getCloudUrl();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    // 1. Fetch the Capital Raising ad style
    const { data: styleData } = await prodDb
      .from('ad_styles')
      .select('*')
      .ilike('name', '%capital%raising%')
      .limit(1);

    const style = styleData?.[0];
    if (!style) {
      console.error('[auto-generate] Capital Raising style not found');
      return new Response(
        JSON.stringify({ error: 'Capital Raising ad style not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[auto-generate] Using style: ${style.name} with ${(style.reference_images || []).length} reference images`);

    // 2. Generate 10 static ads across ratios
    const projectId = `onboarding-${client_id}`;
    const adResults: any[] = [];
    const adErrors: any[] = [];

    for (const plan of AD_PLAN) {
      for (let i = 0; i < plan.count; i++) {
        try {
          console.log(`[auto-generate] Generating ad ${adResults.length + 1}/10: ${style.name} @ ${plan.ratio}`);

          const adPayload = {
            prompt: '',
            stylePrompt: style.prompt_template,
            styleName: style.name,
            aspectRatio: plan.ratio,
            productDescription: offer_description || '',
            offerDescription: offer_description || '',
            brandColors: brand_colors || [],
            brandFonts: brand_fonts || [],
            projectId,
            clientId: client_id,
            referenceImages: style.reference_images || [],
            primaryReferenceImage: style.reference_images?.[0] || null,
            strictBrandAdherence: !!(brand_colors && brand_colors.length > 0),
          };

          const adResponse = await fetch(`${cloudUrl}/functions/v1/generate-static-ad`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${anonKey}`,
            },
            body: JSON.stringify(adPayload),
          });

          const adData = await adResponse.json();

          if (adResponse.ok && adData.success) {
            adResults.push({
              ratio: plan.ratio,
              imageUrl: adData.imageUrl,
              assetId: adData.assetId,
            });

            // Save as creative with draft status
            await prodDb.from('creatives').insert({
              client_id,
              title: `${company_name || 'Onboarding'} - ${style.name} ${plan.ratio} #${i + 1}`,
              type: 'image',
              file_url: adData.imageUrl,
              status: 'draft',
              source: 'auto-onboarding',
              aspect_ratio: plan.ratio,
              trigger_campaign_id: offer_id || null,
            });

            console.log(`[auto-generate] Ad ${adResults.length}/10 generated successfully`);
          } else {
            const errMsg = adData.error || `HTTP ${adResponse.status}`;
            adErrors.push({ ratio: plan.ratio, error: errMsg });
            console.error(`[auto-generate] Ad generation failed: ${errMsg}`);
          }

          // Small delay to avoid rate limits
          if (adResults.length + adErrors.length < 10) {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (err) {
          adErrors.push({ ratio: plan.ratio, error: String(err) });
          console.error(`[auto-generate] Ad error:`, err);
        }
      }
    }

    console.log(`[auto-generate] Static ads complete: ${adResults.length} success, ${adErrors.length} errors`);

    // 3. Trigger copy generation via generate-asset edge function
    // Generate Research, Ad Copy, Emails, SMS, Scripts
    const copyTypes = ['research', 'angles', 'ad_copy', 'emails', 'sms', 'scripts'];
    const copyResults: any[] = [];

    for (const assetType of copyTypes) {
      try {
        console.log(`[auto-generate] Generating copy: ${assetType}`);
        const assetResponse = await fetch(`${cloudUrl}/functions/v1/generate-asset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            password: PASSWORD,
            client_id,
            offer_id: offer_id || null,
            asset_type: assetType,
            intake_data: intake_data || {},
          }),
        });

        const assetData = await assetResponse.json();
        if (assetResponse.ok) {
          copyResults.push({ type: assetType, success: true });
          console.log(`[auto-generate] Copy ${assetType} generated`);
        } else {
          copyResults.push({ type: assetType, success: false, error: assetData.error });
          console.error(`[auto-generate] Copy ${assetType} failed:`, assetData.error);
        }

        // Delay between copy generations
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        copyResults.push({ type: assetType, success: false, error: String(err) });
        console.error(`[auto-generate] Copy error for ${assetType}:`, err);
      }
    }

    // 4. Send context to MCP agent server for Claude Code processing
    try {
      console.log(`[auto-generate] Sending to MCP agent server for copy refinement`);
      
      // Create an onboarding copy agent if one doesn't exist
      const cloudDb = createClient(getCloudUrl(), getCloudKey());
      const { data: existingAgents } = await cloudDb
        .from('agents')
        .select('id')
        .eq('template_key', 'onboarding_copy')
        .limit(1);

      let agentId: string;

      if (existingAgents && existingAgents.length > 0) {
        agentId = existingAgents[0].id;
      } else {
        const { data: newAgent } = await cloudDb.from('agents').insert({
          name: 'Onboarding Copy Generator',
          description: 'Auto-generates marketing copy for new client onboarding',
          icon: '✍️',
          template_key: 'onboarding_copy',
          prompt_template: `You are an expert marketing copywriter for capital raising campaigns. 
A new client "{{client_name}}" has just onboarded. Use the provided intake data to generate:
1. Refined ad copy variations (3 headlines, 3 body copies)
2. Email drip sequence (3 emails)
3. SMS follow-up sequence (3 messages)
4. Video script hooks (3 variations)

Focus on: {{data}}

Make all copy institutional, trust-building, and compliant. Use specific numbers from their fund details.`,
          model: 'google/gemini-2.5-pro',
          connectors: ['database'],
          enabled: true,
        }).select('id').single();

        agentId = newAgent?.id || '';
      }

      if (agentId) {
        // Trigger the agent run
        await fetch(`${cloudUrl}/functions/v1/run-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            agent_id: agentId,
            client_id,
            password: PASSWORD,
          }),
        });
        console.log(`[auto-generate] MCP agent triggered: ${agentId}`);
      }
    } catch (err) {
      console.error(`[auto-generate] MCP agent trigger error:`, err);
    }

    // 5. Return the public link info
    const { data: clientData } = await prodDb
      .from('clients')
      .select('public_token, slug')
      .eq('id', client_id)
      .single();

    const publicToken = clientData?.public_token;
    const publicLink = publicToken
      ? `${req.headers.get('origin') || 'https://report-bloom-magic.lovable.app'}/public/${publicToken}`
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        client_id,
        offer_id,
        ads_generated: adResults.length,
        ads_errors: adErrors.length,
        copy_results: copyResults,
        public_link: publicLink,
        ad_results: adResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[auto-generate] Fatal error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
