/**
 * Extended type definitions for tables/views added by the Lovable Game Plan phases.
 * These supplement the auto-generated types.ts.
 *
 * Tables: meta_ad_accounts, meta_api_calls, sync_runs, metric_ownership
 * Views: v_client_performance_daily, v_client_performance_weekly,
 *        v_client_performance_monthly, v_agency_performance_monthly
 */

export interface MetaAdAccount {
  id: string;
  ad_account_id: string;
  client_id: string | null;
  timezone_name: string;
  currency: string;
  name: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface MetaApiCall {
  id: string;
  client_id: string | null;
  endpoint: string;
  params: Record<string, any>;
  started_at: string;
  duration_ms: number | null;
  status_code: number | null;
  response_summary: Record<string, any>;
  error: string | null;
  created_at: string;
}

export interface SyncRun {
  id: string;
  client_id: string | null;
  source: 'meta' | 'ghl' | 'hubspot' | 'fathom' | 'manual' | 'reconciliation';
  function_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  rows_written: number;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface MetricOwnership {
  id: string;
  table_name: string;
  column_name: string;
  owner_function: string;
  description: string | null;
  created_at: string;
}

export interface ClientPerformanceDaily {
  id: string;
  client_id: string;
  client_name: string;
  client_status: string;
  report_date: string;
  date_utc: string;
  date_account_tz: string | null;
  ad_spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  frequency: number;
  leads: number;
  spam_leads: number;
  calls: number;
  showed_calls: number;
  reconnect_calls: number;
  reconnect_showed: number;
  commitments: number;
  commitment_dollars: number;
  funded_investors: number;
  funded_dollars: number;
  unattributed_leads: number;
  cpl: number;
  dollar_per_call: number;
  dollar_per_show: number;
  show_pct: number;
  cpa: number;
  cost_of_capital_pct: number;
  created_at: string;
  updated_at: string;
}

export interface ClientPerformanceWeekly {
  client_id: string;
  client_name: string;
  client_status: string;
  week_start: string;
  week_end: string;
  iso_year: number;
  iso_week: number;
  ad_spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  leads: number;
  spam_leads: number;
  calls: number;
  showed_calls: number;
  reconnect_calls: number;
  reconnect_showed: number;
  commitments: number;
  commitment_dollars: number;
  funded_investors: number;
  funded_dollars: number;
  cpl: number;
  dollar_per_call: number;
  dollar_per_show: number;
  show_pct: number;
  cpa: number;
  cost_of_capital_pct: number;
  days_in_period: number;
}

export interface ClientPerformanceMonthly {
  client_id: string;
  client_name: string;
  client_status: string;
  month_start: string;
  year: number;
  month: number;
  ad_spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  reach: number;
  leads: number;
  spam_leads: number;
  calls: number;
  showed_calls: number;
  reconnect_calls: number;
  reconnect_showed: number;
  commitments: number;
  commitment_dollars: number;
  funded_investors: number;
  funded_dollars: number;
  cpl: number;
  dollar_per_call: number;
  dollar_per_show: number;
  show_pct: number;
  cpa: number;
  cost_of_capital_pct: number;
  days_in_period: number;
}

export interface AgencyPerformanceMonthly {
  year: number;
  month: number;
  month_start: string;
  client_count: number;
  total_ad_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  total_calls: number;
  total_showed_calls: number;
  total_commitments: number;
  total_commitment_dollars: number;
  total_funded_investors: number;
  total_funded_dollars: number;
  avg_cpl: number;
  avg_dollar_per_call: number;
  avg_dollar_per_show: number;
  avg_show_pct: number;
  avg_cpa: number;
  cost_of_capital_pct: number;
}
