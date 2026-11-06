import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  completedWeeks, computeWeek, readiness, topCreatives, liveDeliveryGate, WEEKLY_REPORT_DISPATCH_ARMED,
  type ClientReportConfig, type ReadinessCheck, type WeekMetrics,
} from '@/lib/weeklyReport/core';

const DEFAULT_TZ = 'America/Los_Angeles';
const sb = supabase as any;

export interface RosterEntry {
  id: string; name: string; status: string; industry: string | null;
  config: ClientReportConfig; checks: ReadinessCheck[]; gate: { allowed: boolean; reasons: string[] };
}

function isValidTz(tz?: string | null) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

function buildConfig(c: any, s: any): ClientReportConfig {
  const tz = s?.stats_report_timezone || s?.weekly_sync_timezone;
  const isCapital = /capital/i.test(c.industry || '') || !!s?.total_raise_amount || !!(s?.funded_stage_ids?.length || s?.hubspot_funded_stage_ids?.length);
  return {
    clientId: c.id,
    timezone: isValidTz(tz) ? tz : DEFAULT_TZ,
    timezoneConfigured: isValidTz(tz),
    isCapital,
    trackedCalendarIds: s?.tracked_calendar_ids || [],
    raiseGoal: s?.total_raise_amount ? Number(s.total_raise_amount) : null,
    raiseDeadline: s?.raise_deadline || null,
  };
}

/** Every active client from the authoritative `clients` roster — no hardcoded list. */
export function useWeeklyReportRoster() {
  return useQuery<RosterEntry[]>({
    queryKey: ['weekly-report-roster'],
    queryFn: async () => {
      // Presence-only columns: no credential values are read into the browser.
      const { data: clients, error } = await sb.from('clients')
        .select('id,name,status,industry,meta_ad_account_id,meta_ad_account_ids,meta_token_type,ghl_location_id,ghl_sync_status,last_ghl_sync_at,hubspot_portal_id,last_hubspot_sync_at')
        .eq('status', 'active').order('name');
      if (error) throw error;
      const ids = (clients || []).map((c: any) => c.id);
      if (!ids.length) return [];
      const [{ data: settings }, { data: recips }, { data: spend }] = await Promise.all([
        sb.from('client_settings').select('client_id,stats_report_timezone,weekly_sync_timezone,tracked_calendar_ids,total_raise_amount,raise_deadline,funded_stage_ids,committed_stage_ids,hubspot_funded_stage_ids').in('client_id', ids),
        sb.from('client_report_recipients').select('id,client_id,channels,cadences,active,unsubscribed_at').in('client_id', ids).eq('active', true).is('unsubscribed_at', null),
        sb.from('daily_metrics').select('client_id,date').in('client_id', ids).not('ad_spend', 'is', null).gte('date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)).order('date', { ascending: false }).limit(5000),
      ]);
      const sBy = new Map((settings || []).map((s: any) => [s.client_id, s]));
      const lastSpend = new Map<string, string>();
      for (const r of spend || []) if (!lastSpend.has(r.client_id)) lastSpend.set(r.client_id, r.date);
      return (clients || []).map((c: any) => {
        const s = sBy.get(c.id);
        const config = buildConfig(c, s);
        const week = completedWeeks(new Date(), config.timezone, 1)[0];
        const approved = (recips || []).filter((r: any) => r.client_id === c.id && (r.cadences || []).includes('weekly') && (r.channels || []).includes('email')).length;
        const checks = readiness({
          hasMetaAccount: !!(c.meta_ad_account_id || c.meta_ad_account_ids?.length),
          hasMetaToken: !!c.meta_token_type,
          hasGhlLocation: !!c.ghl_location_id || !!c.hubspot_portal_id,
          hasCrmCredential: !!c.ghl_sync_status || !!c.hubspot_portal_id,
          timezoneConfigured: config.timezoneConfigured,
          trackedCalendars: config.trackedCalendarIds.length,
          isCapital: config.isCapital,
          hasFundedMapping: !!(s?.funded_stage_ids?.length || s?.committed_stage_ids?.length || s?.hubspot_funded_stage_ids?.length),
          raiseGoal: config.raiseGoal,
          lastSpendDate: lastSpend.get(c.id) || null,
          lastCrmSync: c.last_ghl_sync_at || c.last_hubspot_sync_at || null,
          weekEnd: week.to,
          approvedRecipients: approved,
        });
        return { id: c.id, name: c.name, status: c.status, industry: c.industry, config, checks, gate: liveDeliveryGate(checks, WEEKLY_REPORT_DISPATCH_ARMED) };
      });
    },
  });
}

export interface WeeklyClientReport {
  clientName: string; config: ClientReportConfig;
  weeks: WeekMetrics[]; // newest first: [current, prior, ...]
  creatives: ReturnType<typeof topCreatives>; creativesSyncedAt: string | null;
  raise: { goal: number | null; fundedToDate: number | null; committedToDate: number | null; deadline: string | null };
  quality: { total: number; spam: number; missingContact: number; duplicates: number; verified: number };
  exceptions: string[]; // internal only — never printed in client copy
}

export function useWeeklyClientReport(entry: RosterEntry | null) {
  return useQuery<WeeklyClientReport>({
    queryKey: ['weekly-client-report', entry?.id],
    enabled: !!entry,
    queryFn: async () => {
      const cfg = entry!.config; const id = entry!.id;
      const weeks = completedWeeks(new Date(), cfg.timezone, 4);
      const from = weeks[3].from, to = weeks[0].to;
      const fromTs = new Date(Date.parse(from) - 2 * 86400000).toISOString();
      const toTs = new Date(Date.parse(to) + 2 * 86400000).toISOString();
      const [leads, calls, spend, form, funded, ads] = await Promise.all([
        sb.from('leads').select('id,client_id,created_at,email,phone,is_spam,status,current_disposition,opportunity_value,pipeline_value').eq('client_id', id).gte('created_at', fromTs).lte('created_at', toTs).limit(5000),
        sb.from('calls').select('id,client_id,lead_id,scheduled_at,booked_at,showed,appointment_status,ghl_appointment_id,ghl_calendar_id,is_reconnect').eq('client_id', id).or(`booked_at.gte.${fromTs},scheduled_at.gte.${fromTs}`).limit(5000),
        sb.from('daily_metrics').select('client_id,date,ad_spend').eq('client_id', id).gte('date', from).lte('date', to),
        sb.from('ad_spend_daily').select('client_id,date,leads').eq('client_id', id).gte('date', from).lte('date', to),
        sb.from('funded_investors').select('client_id,commitment_amount,funded_amount,funded_at,is_verified_funded').eq('client_id', id).limit(5000),
        sb.from('meta_ads').select('client_id,meta_ad_id,name,thumbnail_url,image_url,spend,attributed_leads,attributed_calls,attributed_funded,synced_at').eq('client_id', id).gt('spend', 0).order('spend', { ascending: false }).limit(20),
      ]);
      for (const r of [leads, calls, spend, form, funded, ads]) if (r.error) throw r.error;
      const data = { leads: leads.data || [], calls: calls.data || [], spend: spend.data || [], formLeads: form.data || [], funded: funded.data || [] };
      const metrics = weeks.map((w) => computeWeek(cfg, w, data));
      const exceptions: string[] = [];
      const cur = metrics[0];
      if (cur.spendDaysCovered < 7) exceptions.push(`Spend covers ${cur.spendDaysCovered}/7 days`);
      if (cur.metaFormLeads.value != null && cur.verifiedLeads.value != null && Math.abs(cur.metaFormLeads.value - cur.verifiedLeads.value) > Math.max(3, cur.metaFormLeads.value * 0.2))
        exceptions.push(`Meta form leads (${cur.metaFormLeads.value}) differ from verified CRM leads (${cur.verifiedLeads.value})`);
      if (cur.shows.value == null) exceptions.push('Shows unavailable — configure tracked calendars');
      for (const c of entry!.checks) if (c.level !== 'ok') exceptions.push(`${c.label}: ${c.detail}`);

      const curLeads = data.leads.filter((l: any) => l.created_at >= fromTs);
      const fundedAll = data.funded as any[];
      const fundedToDate = cfg.isCapital ? fundedAll.filter((f) => f.is_verified_funded).reduce((a, f) => a + Number(f.funded_amount || 0), 0) : null;
      const committedToDate = cfg.isCapital ? fundedAll.reduce((a, f) => a + Number(f.commitment_amount || 0), 0) : null;
      const inWeek = (l: any) => { const d = new Date(l.created_at).toISOString().slice(0, 10); return d >= weeks[0].from && d <= weeks[0].to; };
      const wk = curLeads.filter(inWeek);
      return {
        clientName: entry!.name, config: cfg, weeks: metrics,
        creatives: topCreatives(ads.data || [], id, 6),
        creativesSyncedAt: ads.data?.[0]?.synced_at || null,
        raise: { goal: cfg.raiseGoal, fundedToDate, committedToDate, deadline: cfg.raiseDeadline },
        quality: {
          total: wk.length,
          spam: wk.filter((l: any) => l.is_spam).length,
          missingContact: wk.filter((l: any) => !l.is_spam && (!l.email || !l.phone)).length,
          verified: cur.verifiedLeads.value ?? 0,
          duplicates: Math.max(0, wk.length - wk.filter((l: any) => l.is_spam).length - wk.filter((l: any) => !l.is_spam && (!l.email || !l.phone)).length - (cur.verifiedLeads.value ?? 0)),
        },
        exceptions,
      };
    },
  });
}
