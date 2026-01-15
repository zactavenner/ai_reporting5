import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Helper to extract value from nested object using dot notation
function getValueByPath(obj: any, path: string): any {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    // Handle array notation like items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
    } else {
      current = current[part];
    }
  }
  return current;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Parse URL to get client ID and webhook type
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Expected format: /webhook-ingest/{clientId}/{webhookType}
    // pathParts: ['webhook-ingest', clientId, webhookType]
    const clientId = pathParts[1];
    const webhookType = pathParts[2];

    if (!clientId || !webhookType) {
      return new Response(
        JSON.stringify({ error: 'Missing clientId or webhookType in URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate webhook secret
    const providedSecret = req.headers.get('x-webhook-secret');
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, webhook_secret')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientId);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate secret if provided (optional for flexibility, but recommended)
    if (providedSecret && providedSecret !== client.webhook_secret) {
      await logWebhook(supabase, clientId, webhookType, 'error', null, 'Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      await logWebhook(supabase, clientId, webhookType, 'error', null, 'Invalid JSON payload');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client's webhook mappings
    const { data: settings } = await supabase
      .from('client_settings')
      .select('webhook_mappings')
      .eq('client_id', clientId)
      .single();

    const mappings = settings?.webhook_mappings?.[webhookType] || {};

    // Process based on webhook type
    let result: any;
    switch (webhookType) {
      case 'lead':
        result = await processLead(supabase, clientId, payload, mappings);
        break;
      case 'booked':
        result = await processBookedCall(supabase, clientId, payload, mappings);
        break;
      case 'showed':
        result = await processShowedCall(supabase, clientId, payload, mappings);
        break;
      case 'committed':
        result = await processCommitment(supabase, clientId, payload, mappings);
        break;
      case 'funded':
        result = await processFunded(supabase, clientId, payload, mappings);
        break;
      case 'ad-spend':
        result = await processAdSpend(supabase, clientId, payload, mappings);
        break;
      case 'bad-lead':
        result = await processBadLead(supabase, clientId, payload, mappings);
        break;
      default:
        await logWebhook(supabase, clientId, webhookType, 'error', payload, `Unknown webhook type: ${webhookType}`);
        return new Response(
          JSON.stringify({ error: `Unknown webhook type: ${webhookType}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Log successful webhook
    await logWebhook(supabase, clientId, webhookType, 'success', payload, null);

    // Update daily metrics
    await updateDailyMetrics(supabase, clientId);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function logWebhook(
  supabase: any,
  clientId: string,
  webhookType: string,
  status: string,
  payload: any,
  errorMessage: string | null
) {
  await supabase.from('webhook_logs').insert({
    client_id: clientId,
    webhook_type: webhookType,
    status,
    payload: payload ? JSON.stringify(payload).substring(0, 5000) : null,
    error_message: errorMessage,
  });
}

async function processLead(supabase: any, clientId: string, payload: any, mappings: any) {
  // Extract external ID - try common paths
  const externalId = payload.contact?.id || payload.id || payload.contactId || `wh_${Date.now()}`;
  const name = payload.contact?.name || payload.name || `${payload.contact?.firstName || ''} ${payload.contact?.lastName || ''}`.trim() || 'Unknown';
  const email = payload.contact?.email || payload.email;
  const phone = payload.contact?.phone || payload.phone;
  
  // Get pipeline value if mapped
  const valueField = mappings?.valueField;
  const pipelineValue = valueField ? getValueByPath(payload, valueField) : null;

  const { data, error } = await supabase
    .from('leads')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      source: 'webhook',
      name,
      email,
      phone,
      status: pipelineValue ? `value:${pipelineValue}` : 'new',
      is_spam: false,
    }, {
      onConflict: 'client_id,external_id,source',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return { lead_id: data.id, action: 'upserted' };
}

async function processBookedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = payload.appointment?.id || payload.id || `wh_call_${Date.now()}`;
  const scheduledAt = payload.appointment?.meta?.start_time || payload.scheduled_at || new Date().toISOString();
  const contactId = payload.appointment?.contactId || payload.contact_id;

  // Find matching lead
  let leadId = null;
  if (contactId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', clientId)
      .eq('external_id', String(contactId))
      .single();
    leadId = lead?.id;
  }

  const { data, error } = await supabase
    .from('calls')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      lead_id: leadId,
      scheduled_at: scheduledAt,
      showed: false,
      outcome: 'booked',
    }, {
      onConflict: 'client_id,external_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return { call_id: data.id, action: 'booked' };
}

async function processShowedCall(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = payload.appointment?.id || payload.id || payload.call_id;

  if (!externalId) {
    throw new Error('Missing appointment/call ID');
  }

  const { data, error } = await supabase
    .from('calls')
    .update({ showed: true, outcome: 'showed' })
    .eq('client_id', clientId)
    .eq('external_id', String(externalId))
    .select()
    .single();

  if (error) {
    // If call doesn't exist, create it as showed
    const { data: newCall, error: insertError } = await supabase
      .from('calls')
      .insert({
        client_id: clientId,
        external_id: String(externalId),
        showed: true,
        outcome: 'showed',
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    return { call_id: newCall.id, action: 'created_as_showed' };
  }

  return { call_id: data.id, action: 'marked_showed' };
}

async function processCommitment(supabase: any, clientId: string, payload: any, mappings: any) {
  // Commitments update daily_metrics commitment fields
  const valueField = mappings?.valueField || 'opportunity.details.monetary_value';
  const amount = parseFloat(getValueByPath(payload, valueField)) || 0;

  const today = new Date().toISOString().split('T')[0];
  
  // Get current values
  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('commitments, commitment_dollars')
    .eq('client_id', clientId)
    .eq('date', today)
    .single();

  const currentCommitments = existing?.commitments || 0;
  const currentDollars = existing?.commitment_dollars || 0;

  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date: today,
      commitments: currentCommitments + 1,
      commitment_dollars: currentDollars + amount,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });

  return { commitments: currentCommitments + 1, amount };
}

async function processFunded(supabase: any, clientId: string, payload: any, mappings: any) {
  const externalId = payload.opportunity?.id || payload.id || `wh_funded_${Date.now()}`;
  const valueField = mappings?.valueField || 'opportunity.details.monetary_value';
  const amount = parseFloat(getValueByPath(payload, valueField)) || 0;
  const contactId = payload.opportunity?.contactId || payload.contact_id;

  // Find matching lead
  let leadId = null;
  let firstContactAt = null;
  if (contactId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, created_at')
      .eq('client_id', clientId)
      .eq('external_id', String(contactId))
      .single();
    leadId = lead?.id;
    firstContactAt = lead?.created_at;
  }

  // Calculate time to fund
  let timeToFundDays = null;
  if (firstContactAt) {
    const leadDate = new Date(firstContactAt);
    const fundedDate = new Date();
    timeToFundDays = Math.floor((fundedDate.getTime() - leadDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Count calls for this lead
  let callsToFund = 0;
  if (leadId) {
    const { count } = await supabase
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId);
    callsToFund = count || 0;
  }

  const { data, error } = await supabase
    .from('funded_investors')
    .upsert({
      client_id: clientId,
      external_id: String(externalId),
      lead_id: leadId,
      funded_amount: amount,
      funded_at: new Date().toISOString(),
      first_contact_at: firstContactAt,
      time_to_fund_days: timeToFundDays,
      calls_to_fund: callsToFund,
    }, {
      onConflict: 'client_id,external_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return { funded_investor_id: data.id, amount };
}

async function processAdSpend(supabase: any, clientId: string, payload: any, mappings: any) {
  const valueField = mappings?.valueField || 'report.metrics.spend';
  const dateField = mappings?.dateField || 'report.date';
  
  const spend = parseFloat(getValueByPath(payload, valueField)) || 0;
  const date = getValueByPath(payload, dateField) || new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('ad_spend')
    .eq('client_id', clientId)
    .eq('date', date)
    .single();

  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date,
      ad_spend: spend,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });

  return { date, spend };
}

async function processBadLead(supabase: any, clientId: string, payload: any, mappings: any) {
  const contactId = payload.event?.contact_id || payload.contact_id || payload.id;

  if (!contactId) {
    throw new Error('Missing contact_id');
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ is_spam: true, status: 'bad_lead' })
    .eq('client_id', clientId)
    .eq('external_id', String(contactId))
    .select()
    .single();

  if (error) throw error;
  return { lead_id: data.id, action: 'marked_bad' };
}

async function updateDailyMetrics(supabase: any, clientId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's counts
  const [leadsResult, spamResult, callsResult, showedResult, fundedResult] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', today),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('is_spam', true).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).gte('created_at', today),
    supabase.from('calls').select('*', { count: 'exact', head: true }).eq('client_id', clientId).eq('showed', true).gte('created_at', today),
    supabase.from('funded_investors').select('funded_amount').eq('client_id', clientId).gte('created_at', today),
  ]);

  const fundedCount = fundedResult.data?.length || 0;
  const fundedDollars = fundedResult.data?.reduce((sum: number, f: any) => sum + (f.funded_amount || 0), 0) || 0;

  // Upsert metrics (preserve ad_spend and other fields)
  const { data: existing } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', clientId)
    .eq('date', today)
    .single();

  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date: today,
      leads: leadsResult.count || 0,
      spam_leads: spamResult.count || 0,
      calls: callsResult.count || 0,
      showed_calls: showedResult.count || 0,
      funded_investors: fundedCount,
      funded_dollars: fundedDollars,
      // Preserve existing values
      ad_spend: existing?.ad_spend || 0,
      impressions: existing?.impressions || 0,
      clicks: existing?.clicks || 0,
      ctr: existing?.ctr || 0,
      commitments: existing?.commitments || 0,
      commitment_dollars: existing?.commitment_dollars || 0,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });
}
