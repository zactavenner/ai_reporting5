import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetaInsight {
  date_start: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  dateAdded: string;
  customFields?: Array<{ key: string; value: string }>;
}

interface GHLAppointment {
  id: string;
  contactId: string;
  startTime: string;
  status: string;
  appointmentStatus?: string;
}

interface GHLOpportunity {
  id: string;
  contactId: string;
  status: string;
  monetaryValue?: number;
  pipelineStageId?: string;
  dateAdded: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get optional client_id from request body
    let targetClientId: string | null = null;
    try {
      const body = await req.json();
      targetClientId = body.client_id || null;
    } catch {
      // No body or invalid JSON, sync all clients
    }

    // Get all active clients (or specific client)
    let clientsQuery = supabase
      .from('clients')
      .select('*')
      .eq('status', 'active');
    
    if (targetClientId) {
      clientsQuery = clientsQuery.eq('id', targetClientId);
    }

    const { data: clients, error: clientsError } = await clientsQuery;

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    console.log(`Found ${clients?.length || 0} active clients to sync`);

    const results = [];

    for (const client of clients || []) {
      console.log(`Syncing client: ${client.name} (${client.id})`);
      
      const syncResult = {
        client_id: client.id,
        client_name: client.name,
        meta_synced: false,
        ghl_synced: false,
        leads_added: 0,
        calls_added: 0,
        funded_added: 0,
        errors: [] as string[],
      };

      // Create sync log entry
      const { data: syncLog } = await supabase
        .from('sync_logs')
        .insert({
          client_id: client.id,
          sync_type: 'full',
          status: 'running',
        })
        .select()
        .single();

      try {
        // Sync Meta Ads data
        if (client.meta_ad_account_id && client.meta_access_token) {
          try {
            const metaResult = await syncMetaAds(supabase, client);
            syncResult.meta_synced = true;
            console.log(`Meta sync complete for ${client.name}`);
          } catch (metaError: unknown) {
            console.error(`Meta sync error for ${client.name}:`, metaError);
            syncResult.errors.push(`Meta: ${metaError instanceof Error ? metaError.message : 'Unknown error'}`);
          }
        } else {
          console.log(`Skipping Meta sync for ${client.name} - missing credentials`);
        }

        // Sync GHL data
        if (client.ghl_location_id && client.ghl_api_key) {
          try {
            const ghlResult = await syncGHLData(supabase, client);
            syncResult.ghl_synced = true;
            syncResult.leads_added = ghlResult.leads;
            syncResult.calls_added = ghlResult.calls;
            syncResult.funded_added = ghlResult.funded;
            console.log(`GHL sync complete for ${client.name}: ${ghlResult.leads} leads, ${ghlResult.calls} calls, ${ghlResult.funded} funded`);
          } catch (ghlError: unknown) {
            console.error(`GHL sync error for ${client.name}:`, ghlError);
            syncResult.errors.push(`GHL: ${ghlError instanceof Error ? ghlError.message : 'Unknown error'}`);
          }
        } else {
          console.log(`Skipping GHL sync for ${client.name} - missing credentials`);
        }

        // Check alerts after sync
        await checkAlerts(supabase, client);

        // Update sync log
        await supabase
          .from('sync_logs')
          .update({
            status: syncResult.errors.length > 0 ? 'partial' : 'success',
            records_synced: syncResult.leads_added + syncResult.calls_added + syncResult.funded_added,
            error_message: syncResult.errors.length > 0 ? syncResult.errors.join('; ') : null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog?.id);

      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Sync failed for ${client.name}:`, error);
        syncResult.errors.push(errorMsg);
        
        await supabase
          .from('sync_logs')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog?.id);
      }

      results.push(syncResult);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced_clients: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function syncMetaAds(supabase: any, client: any): Promise<void> {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const dateRange = {
    since: thirtyDaysAgo.toISOString().split('T')[0],
    until: today.toISOString().split('T')[0],
  };

  // Fetch Meta Ads insights
  const insightsUrl = `https://graph.facebook.com/v18.0/act_${client.meta_ad_account_id}/insights?` +
    `fields=spend,impressions,clicks,ctr,actions&` +
    `time_range={"since":"${dateRange.since}","until":"${dateRange.until}"}&` +
    `time_increment=1&` +
    `access_token=${client.meta_access_token}`;

  const response = await fetch(insightsUrl);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Meta API error');
  }

  const data = await response.json();
  const insights: MetaInsight[] = data.data || [];

  for (const day of insights) {
    const leads = day.actions?.find(a => a.action_type === 'lead')?.value || '0';
    
    // Upsert daily metrics (deduplication via UNIQUE constraint)
    await supabase
      .from('daily_metrics')
      .upsert({
        client_id: client.id,
        date: day.date_start,
        ad_spend: parseFloat(day.spend) || 0,
        impressions: parseInt(day.impressions) || 0,
        clicks: parseInt(day.clicks) || 0,
        ctr: parseFloat(day.ctr) || 0,
        leads: parseInt(leads) || 0,
      }, {
        onConflict: 'client_id,date',
        ignoreDuplicates: false,
      });
  }
}

async function syncGHLData(supabase: any, client: any): Promise<{ leads: number; calls: number; funded: number }> {
  const result = { leads: 0, calls: 0, funded: 0 };
  const baseUrl = 'https://rest.gohighlevel.com/v1';
  const headers = {
    'Authorization': `Bearer ${client.ghl_api_key}`,
    'Content-Type': 'application/json',
  };

  // Fetch contacts (leads)
  try {
    const contactsResponse = await fetch(
      `${baseUrl}/contacts/?locationId=${client.ghl_location_id}&limit=100`,
      { headers }
    );

    if (contactsResponse.ok) {
      const contactsData = await contactsResponse.json();
      const contacts: GHLContact[] = contactsData.contacts || [];

      for (const contact of contacts) {
        const isSpam = contact.tags?.some(t => 
          t.toLowerCase().includes('spam') || t.toLowerCase().includes('bad')
        ) || false;

        // Upsert lead (deduplication via UNIQUE constraint on client_id, external_id, source)
        const { data: leadData, error: leadError } = await supabase
          .from('leads')
          .upsert({
            client_id: client.id,
            external_id: contact.id,
            source: 'ghl',
            name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            email: contact.email,
            phone: contact.phone,
            is_spam: isSpam,
          }, {
            onConflict: 'client_id,external_id,source',
            ignoreDuplicates: false,
          })
          .select()
          .single();

        if (!leadError) {
          result.leads++;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching GHL contacts:', error);
  }

  // Fetch appointments (calls)
  try {
    const appointmentsResponse = await fetch(
      `${baseUrl}/appointments/?locationId=${client.ghl_location_id}&limit=100`,
      { headers }
    );

    if (appointmentsResponse.ok) {
      const appointmentsData = await appointmentsResponse.json();
      const appointments: GHLAppointment[] = appointmentsData.appointments || [];

      for (const apt of appointments) {
        // Find matching lead
        const { data: lead } = await supabase
          .from('leads')
          .select('id')
          .eq('client_id', client.id)
          .eq('external_id', apt.contactId)
          .single();

        const showed = apt.status === 'showed' || apt.appointmentStatus === 'showed';

        // Upsert call (deduplication via UNIQUE constraint on client_id, external_id)
        const { error: callError } = await supabase
          .from('calls')
          .upsert({
            client_id: client.id,
            lead_id: lead?.id || null,
            external_id: apt.id,
            scheduled_at: apt.startTime,
            showed: showed,
            outcome: apt.status,
          }, {
            onConflict: 'client_id,external_id',
            ignoreDuplicates: false,
          });

        if (!callError) {
          result.calls++;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching GHL appointments:', error);
  }

  // Fetch opportunities (for funded investors)
  try {
    const oppsResponse = await fetch(
      `${baseUrl}/pipelines/opportunities/?locationId=${client.ghl_location_id}&limit=100`,
      { headers }
    );

    if (oppsResponse.ok) {
      const oppsData = await oppsResponse.json();
      const opportunities: GHLOpportunity[] = oppsData.opportunities || [];

      // Filter for funded opportunities (you may need to adjust based on actual pipeline stage names)
      const fundedOpps = opportunities.filter(opp => 
        opp.status === 'won' || 
        opp.pipelineStageId?.toLowerCase().includes('funded') ||
        opp.pipelineStageId?.toLowerCase().includes('closed')
      );

      for (const opp of fundedOpps) {
        // Find matching lead
        const { data: lead } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('client_id', client.id)
          .eq('external_id', opp.contactId)
          .single();

        // Count calls for this lead
        const { count: callCount } = await supabase
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('lead_id', lead?.id);

        // Calculate time to fund
        let timeToFundDays: number | null = null;
        if (lead?.created_at) {
          const leadDate = new Date(lead.created_at);
          const fundedDate = new Date(opp.dateAdded);
          timeToFundDays = Math.floor((fundedDate.getTime() - leadDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Upsert funded investor (deduplication via UNIQUE constraint)
        const { error: fundedError } = await supabase
          .from('funded_investors')
          .upsert({
            client_id: client.id,
            lead_id: lead?.id || null,
            external_id: opp.id,
            funded_amount: opp.monetaryValue || 0,
            funded_at: opp.dateAdded,
            first_contact_at: lead?.created_at || null,
            time_to_fund_days: timeToFundDays,
            calls_to_fund: callCount || 0,
          }, {
            onConflict: 'client_id,external_id',
            ignoreDuplicates: false,
          });

        if (!fundedError) {
          result.funded++;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching GHL opportunities:', error);
  }

  // Update daily metrics with aggregated GHL data
  await updateDailyMetricsFromGHL(supabase, client.id);

  return result;
}

async function updateDailyMetricsFromGHL(supabase: any, clientId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's counts
  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', today);

  const { count: spamCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_spam', true)
    .gte('created_at', today);

  const { count: callsCount } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', today);

  const { count: showedCount } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('showed', true)
    .gte('created_at', today);

  const { data: fundedData } = await supabase
    .from('funded_investors')
    .select('funded_amount')
    .eq('client_id', clientId)
    .gte('created_at', today);

  const fundedCount = fundedData?.length || 0;
  const fundedDollars = fundedData?.reduce((sum: number, f: any) => sum + (f.funded_amount || 0), 0) || 0;

  // Update today's metrics
  await supabase
    .from('daily_metrics')
    .upsert({
      client_id: clientId,
      date: today,
      leads: leadsCount || 0,
      spam_leads: spamCount || 0,
      calls: callsCount || 0,
      showed_calls: showedCount || 0,
      funded_investors: fundedCount,
      funded_dollars: fundedDollars,
    }, {
      onConflict: 'client_id,date',
      ignoreDuplicates: false,
    });
}

async function checkAlerts(supabase: any, client: any): Promise<void> {
  // Get alert configs for this client
  const { data: alerts } = await supabase
    .from('alert_configs')
    .select('*')
    .eq('client_id', client.id)
    .eq('enabled', true);

  if (!alerts || alerts.length === 0) return;

  // Get latest metrics
  const today = new Date().toISOString().split('T')[0];
  const { data: metrics } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('client_id', client.id)
    .eq('date', today)
    .single();

  if (!metrics) return;

  // Calculate derived metrics
  const costPerLead = metrics.leads > 0 ? metrics.ad_spend / metrics.leads : 0;
  const costPerCall = metrics.calls > 0 ? metrics.ad_spend / metrics.calls : 0;

  for (const alert of alerts) {
    let currentValue = 0;
    
    switch (alert.metric) {
      case 'cost_per_lead':
        currentValue = costPerLead;
        break;
      case 'cost_per_call':
        currentValue = costPerCall;
        break;
      case 'ad_spend':
        currentValue = metrics.ad_spend;
        break;
      case 'leads':
        currentValue = metrics.leads;
        break;
      case 'calls':
        currentValue = metrics.calls;
        break;
      default:
        continue;
    }

    const shouldAlert = 
      (alert.operator === 'above' && currentValue > alert.threshold) ||
      (alert.operator === 'below' && currentValue < alert.threshold);

    if (shouldAlert && alert.slack_webhook_url) {
      await sendSlackAlert(alert.slack_webhook_url, {
        client_name: client.name,
        metric: alert.metric,
        current_value: currentValue,
        threshold: alert.threshold,
        operator: alert.operator,
      });
    }
  }
}

async function sendSlackAlert(webhookUrl: string, data: {
  client_name: string;
  metric: string;
  current_value: number;
  threshold: number;
  operator: string;
}): Promise<void> {
  try {
    const message = {
      text: `🚨 KPI Alert for ${data.client_name}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*KPI Alert for ${data.client_name}*\n\n` +
              `📊 *Metric:* ${data.metric.replace(/_/g, ' ').toUpperCase()}\n` +
              `📈 *Current Value:* $${data.current_value.toFixed(2)}\n` +
              `⚠️ *Threshold:* ${data.operator} $${data.threshold.toFixed(2)}`
          }
        }
      ]
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    console.log(`Slack alert sent for ${data.client_name}: ${data.metric}`);
  } catch (error) {
    console.error('Error sending Slack alert:', error);
  }
}
