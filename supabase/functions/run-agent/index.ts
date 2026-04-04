import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { agent_id, client_id: overrideClientId, password } = await req.json();
    if (password !== 'HPA1234$') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!agent_id) {
      return new Response(JSON.stringify({ error: 'agent_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cloud DB for agents/agent_runs tables
    const cloudUrl = Deno.env.get('SUPABASE_URL')!;
    const cloudKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cloudDb = createClient(cloudUrl, cloudKey);

    // Production DB for client data
    const prodUrl = Deno.env.get('ORIGINAL_SUPABASE_URL') || cloudUrl;
    const prodKey = Deno.env.get('ORIGINAL_SUPABASE_SERVICE_ROLE_KEY') || cloudKey;
    const prodDb = createClient(prodUrl, prodKey);

    // Load agent config from Cloud DB
    const { data: agent, error: agentErr } = await cloudDb
      .from('agents')
      .select('*')
      .eq('id', agent_id)
      .single();

    if (agentErr || !agent) {
      console.error('Agent not found:', agentErr);
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine which clients to run for (from production DB)
    const targetClientId = overrideClientId || agent.client_id;
    let clientsToProcess: any[] = [];

    if (targetClientId) {
      const { data: c } = await prodDb.from('clients').select('id, name, ghl_api_key, ghl_location_id, meta_ad_account_id, meta_access_token').eq('id', targetClientId).single();
      if (c) clientsToProcess = [c];
    } else {
      const { data: cs } = await prodDb.from('clients').select('id, name, ghl_api_key, ghl_location_id, meta_ad_account_id, meta_access_token').in('status', ['active', 'onboarding']);
      clientsToProcess = cs || [];
    }

    const results: any[] = [];

    for (const client of clientsToProcess) {
      // Create run record in Cloud DB
      const { data: run } = await cloudDb.from('agent_runs').insert({
        agent_id,
        client_id: client.id,
        status: 'running',
        started_at: new Date().toISOString(),
      }).select().single();

      const runId = run?.id;

      try {
        const connectors = agent.connectors || ['database'];
        const dataContext: Record<string, any> = {};
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const todayStr = today.toISOString().split('T')[0];

        if (connectors.includes('database')) {
          const { count: leadsCount } = await prodDb
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id)
            .gte('created_at', yesterdayStr)
            .lt('created_at', todayStr);

          const { data: calls } = await prodDb
            .from('calls')
            .select('id, showed, is_reconnect, booked_at, scheduled_at')
            .eq('client_id', client.id)
            .gte('booked_at', yesterdayStr)
            .lt('booked_at', todayStr);

          const { data: metrics } = await prodDb
            .from('daily_metrics')
            .select('*')
            .eq('client_id', client.id)
            .eq('date', yesterdayStr)
            .maybeSingle();

          const { data: funded } = await prodDb
            .from('funded_investors')
            .select('id, funded_amount, commitment_amount')
            .eq('client_id', client.id)
            .gte('funded_at', yesterdayStr)
            .lt('funded_at', todayStr);

          const { data: settings } = await prodDb
            .from('client_settings')
            .select('*')
            .eq('client_id', client.id)
            .maybeSingle();

          const { data: offers } = await prodDb
            .from('client_offers')
            .select('id, title, offer_type')
            .eq('client_id', client.id);

          dataContext.database = {
            leads_count: leadsCount || 0,
            calls: calls || [],
            calls_count: calls?.length || 0,
            showed_count: calls?.filter((c: any) => c.showed)?.length || 0,
            daily_metrics: metrics,
            funded_investors: funded || [],
            funded_count: funded?.length || 0,
            settings,
            offers: offers || [],
          };
        }

        if (connectors.includes('meta_ads') && client.meta_access_token && client.meta_ad_account_id) {
          try {
            const metaUrl = `https://graph.facebook.com/v19.0/act_${client.meta_ad_account_id}/insights?fields=spend,impressions,clicks,ctr&time_range={"since":"${yesterdayStr}","until":"${yesterdayStr}"}&access_token=${client.meta_access_token}`;
            const metaRes = await fetch(metaUrl);
            const metaData = await metaRes.json();
            dataContext.meta_ads = metaData.data?.[0] || { note: 'No Meta data for this date' };
          } catch (e) {
            dataContext.meta_ads = { error: 'Failed to fetch Meta data' };
          }
        }

        if (connectors.includes('ghl_crm') && client.ghl_api_key && client.ghl_location_id) {
          try {
            const ghlHeaders = {
              'Authorization': `Bearer ${client.ghl_api_key}`,
              'Version': '2021-07-28',
            };
            const contactsRes = await fetch(
              `https://services.leadconnectorhq.com/contacts/?locationId=${client.ghl_location_id}&startAfter=${yesterdayStr}&limit=100`,
              { headers: ghlHeaders }
            );
            const contactsData = await contactsRes.json();
            dataContext.ghl_crm = {
              contacts_count: contactsData.contacts?.length || 0,
              contacts_sample: (contactsData.contacts || []).slice(0, 5),
            };
          } catch (e) {
            dataContext.ghl_crm = { error: 'Failed to fetch GHL data' };
          }
        }

        // Build prompt with variable interpolation
        let prompt = agent.prompt_template;
        prompt = prompt.replace(/\{\{client_name\}\}/g, client.name);
        prompt = prompt.replace(/\{\{date\}\}/g, todayStr);
        prompt = prompt.replace(/\{\{yesterday\}\}/g, yesterdayStr);
        prompt = prompt.replace(/\{\{data\}\}/g, JSON.stringify(dataContext, null, 2));

        const inputSummary = `Connectors: ${connectors.join(', ')}. Data keys: ${Object.keys(dataContext).join(', ')}`;

        // Call OpenRouter AI
        const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
        if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

        const aiRes = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': prodUrl,
          },
          body: JSON.stringify({
            model: agent.model || 'google/gemini-2.5-pro',
            messages: [
              { role: 'system', content: 'You are an AI agent executing a scheduled task. Respond with actionable JSON when possible.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        const aiData = await aiRes.json();
        const aiOutput = aiData.choices?.[0]?.message?.content || 'No response from AI';
        const tokensUsed = aiData.usage?.total_tokens || 0;

        // Try to parse AI output for actions
        let actionsTaken: any[] = [];
        try {
          const parsed = JSON.parse(aiOutput.replace(/```json\n?/g, '').replace(/```\n?/g, ''));

          // Apply corrections to daily_metrics on production DB
          if (parsed.corrections && Object.keys(parsed.corrections).length > 0 && connectors.includes('database')) {
            await prodDb
              .from('daily_metrics')
              .upsert({
                client_id: client.id,
                date: yesterdayStr,
                ...parsed.corrections,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'client_id,date' });
            actionsTaken.push({ type: 'daily_metrics_update', corrections: parsed.corrections });
          }

          // Post Slack message to client channel if configured
          if (parsed.slack_message && connectors.includes('slack')) {
            const slackApiKey = Deno.env.get('SLACK_API_KEY');
            const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
            if (slackApiKey && lovableApiKey) {
              const { data: cs } = await prodDb.from('client_settings').select('slack_channel_id').eq('client_id', client.id).maybeSingle();
              const channelId = cs?.slack_channel_id;
              if (channelId) {
                await fetch('https://connector-gateway.lovable.dev/slack/api/chat.postMessage', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${lovableApiKey}`,
                    'X-Connection-Api-Key': slackApiKey,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ channel: channelId, text: parsed.slack_message }),
                });
                actionsTaken.push({ type: 'slack_channel_message', channel: channelId });
              }
            }
          }

          // Always DM Zac after agent completion
          const slackApiKey = Deno.env.get('SLACK_API_KEY');
          const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
          if (slackApiKey && lovableApiKey) {
            // Check agency_settings for DM user ID (on Cloud DB where settings live)
            const { data: agencySettings } = await cloudDb
              .from('agency_settings')
              .select('slack_dm_user_id, agent_notification_slack_dm')
              .limit(1)
              .maybeSingle();

            const dmUserId = agencySettings?.slack_dm_user_id;
            const dmEnabled = agencySettings?.agent_notification_slack_dm !== false;

            if (dmUserId && dmEnabled) {
              // Open DM channel
              const dmOpenRes = await fetch('https://connector-gateway.lovable.dev/slack/api/conversations.open', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${lovableApiKey}`,
                  'X-Connection-Api-Key': slackApiKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ users: dmUserId }),
              });
              const dmOpenData = await dmOpenRes.json();
              const dmChannelId = dmOpenData?.channel?.id;

              if (dmChannelId) {
                const statusEmoji = '✅';
                const dmMessage = `${statusEmoji} *Agent Run Complete: ${agent.name}*\n*Client:* ${client.name}\n*Tokens Used:* ${tokensUsed}\n*Actions Taken:* ${actionsTaken.length}\n\n${parsed?.slack_message || parsed?.findings || aiOutput.slice(0, 500)}`;

                await fetch('https://connector-gateway.lovable.dev/slack/api/chat.postMessage', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${lovableApiKey}`,
                    'X-Connection-Api-Key': slackApiKey,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ channel: dmChannelId, text: dmMessage }),
                });
                actionsTaken.push({ type: 'slack_dm', user: dmUserId });
              }
            }
          }
        } catch {
          // AI didn't return valid JSON, that's ok
        }

        // Update run as completed in Cloud DB
        await cloudDb.from('agent_runs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          input_summary: inputSummary,
          output_summary: aiOutput.slice(0, 2000),
          actions_taken: actionsTaken,
          tokens_used: tokensUsed,
        }).eq('id', runId);

        results.push({ client: client.name, status: 'completed', actions: actionsTaken.length });

      } catch (runError: any) {
        await cloudDb.from('agent_runs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: runError.message,
        }).eq('id', runId);
        results.push({ client: client.name, status: 'failed', error: runError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('run-agent error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
