import { useMemo } from 'react';
import { FundedInvestor, DailyMetric } from './useMetrics';

// Minimal interface for leads - compatible with both full Lead and filtered Lead types
interface LeadLike {
  id: string;
  is_spam?: boolean | null;
  pipeline_value?: number | null;
  [key: string]: any;
}

// Minimal interface for calls - compatible with both full Call and filtered Call types
interface CallLike {
  id: string;
  showed?: boolean | null;
  is_reconnect?: boolean | null;
  [key: string]: any;
}

// Minimal interface for funded investors
interface FundedInvestorLike {
  id: string;
  funded_amount: number;
  time_to_fund_days?: number | null;
  calls_to_fund?: number | null;
  [key: string]: any;
}

export interface SourceAggregatedMetrics {
  totalAdSpend: number;
  totalLeads: number;
  spamLeads: number;
  totalCalls: number;
  showedCalls: number;
  reconnectCalls: number;
  reconnectShowed: number;
  totalCommitments: number;
  commitmentDollars: number;
  fundedInvestors: number;
  fundedDollars: number;
  ctr: number;
  costPerLead: number;
  costPerCall: number;
  showedPercent: number;
  costPerShow: number;
  costPerInvestor: number;
  costOfCapital: number;
  avgTimeToFund: number;
  avgCallsToFund: number;
  leadToBookedPercent: number;
  closeRate: number;
  pipelineValue: number;
  costPerReconnectCall: number;
  costPerReconnectShowed: number;
}

/**
 * Aggregates metrics directly from source tables (leads, calls, funded_investors)
 * Ad spend, impressions, clicks, commitments still come from daily_metrics as they're not in source tables
 */
export function aggregateFromSourceData(
  leads: LeadLike[],
  calls: CallLike[],
  fundedInvestors: FundedInvestorLike[],
  dailyMetrics: DailyMetric[] = []
): SourceAggregatedMetrics {
  // Ad spend and click metrics come from daily_metrics (no other source)
  const dailyTotals = dailyMetrics.reduce(
    (acc, day) => ({
      totalAdSpend: acc.totalAdSpend + Number(day.ad_spend || 0),
      totalClicks: acc.totalClicks + (day.clicks || 0),
      totalImpressions: acc.totalImpressions + (day.impressions || 0),
      totalCommitments: acc.totalCommitments + (day.commitments || 0),
      commitmentDollars: acc.commitmentDollars + Number(day.commitment_dollars || 0),
    }),
    {
      totalAdSpend: 0,
      totalClicks: 0,
      totalImpressions: 0,
      totalCommitments: 0,
      commitmentDollars: 0,
    }
  );

  // Calculate leads from source
  const validLeads = leads.filter(l => !l.is_spam);
  const spamLeads = leads.filter(l => l.is_spam);

  // Calculate calls from source
  const nonReconnectCalls = calls.filter(c => !c.is_reconnect);
  const showedCalls = calls.filter(c => c.showed && !c.is_reconnect);
  const reconnectCalls = calls.filter(c => c.is_reconnect);
  const reconnectShowed = reconnectCalls.filter(c => c.showed);

  // Calculate funded from source
  const fundedCount = fundedInvestors.length;
  const fundedDollars = fundedInvestors.reduce((sum, f) => sum + (f.funded_amount || 0), 0);

  // Calculate funded investor averages from source
  const fundedWithTimeData = fundedInvestors.filter(f => f.time_to_fund_days !== null);
  const avgTimeToFund = fundedWithTimeData.length > 0
    ? fundedWithTimeData.reduce((sum, f) => sum + (f.time_to_fund_days || 0), 0) / fundedWithTimeData.length
    : 0;

  const avgCallsToFund = fundedCount > 0
    ? fundedInvestors.reduce((sum, f) => sum + (f.calls_to_fund || 0), 0) / fundedCount
    : 0;

  // Derived metrics
  const totalAdSpend = dailyTotals.totalAdSpend;
  const totalLeads = validLeads.length;
  const totalCalls = nonReconnectCalls.length;
  const showedCount = showedCalls.length;

  const leadToBookedPercent = totalLeads > 0 ? (totalCalls / totalLeads) * 100 : 0;
  const closeRate = showedCount > 0 ? (fundedCount / showedCount) * 100 : 0;

  // Calculate pipeline value (min value from leads with pipeline_value > 0)
  const leadsWithPipeline = leads.filter(l => l.pipeline_value && l.pipeline_value > 0);
  const pipelineValue = leadsWithPipeline.length > 0
    ? Math.min(...leadsWithPipeline.map(l => l.pipeline_value || 0))
    : 0;

  return {
    totalAdSpend,
    totalLeads,
    spamLeads: spamLeads.length,
    totalCalls,
    showedCalls: showedCount,
    reconnectCalls: reconnectCalls.length,
    reconnectShowed: reconnectShowed.length,
    totalCommitments: dailyTotals.totalCommitments,
    commitmentDollars: dailyTotals.commitmentDollars,
    fundedInvestors: fundedCount,
    fundedDollars,
    ctr: dailyTotals.totalImpressions > 0 ? (dailyTotals.totalClicks / dailyTotals.totalImpressions) * 100 : 0,
    costPerLead: totalLeads > 0 ? totalAdSpend / totalLeads : 0,
    costPerCall: totalCalls > 0 ? totalAdSpend / totalCalls : 0,
    showedPercent: totalCalls > 0 ? (showedCount / totalCalls) * 100 : 0,
    costPerShow: showedCount > 0 ? totalAdSpend / showedCount : 0,
    costPerInvestor: fundedCount > 0 ? totalAdSpend / fundedCount : 0,
    costOfCapital: fundedDollars > 0 ? (totalAdSpend / fundedDollars) * 100 : 0,
    avgTimeToFund,
    avgCallsToFund,
    leadToBookedPercent,
    closeRate,
    pipelineValue,
    costPerReconnectCall: reconnectCalls.length > 0 ? totalAdSpend / reconnectCalls.length : 0,
    costPerReconnectShowed: reconnectShowed.length > 0 ? totalAdSpend / reconnectShowed.length : 0,
  };
}

/**
 * Hook to get aggregated metrics from source data
 */
export function useSourceAggregatedMetrics(
  leads: LeadLike[],
  calls: CallLike[],
  fundedInvestors: FundedInvestorLike[],
  dailyMetrics: DailyMetric[] = []
): SourceAggregatedMetrics {
  return useMemo(() => {
    return aggregateFromSourceData(leads, calls, fundedInvestors, dailyMetrics);
  }, [leads, calls, fundedInvestors, dailyMetrics]);
}
