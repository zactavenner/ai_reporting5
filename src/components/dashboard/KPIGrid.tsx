import { KPICard, KPIThreshold } from './KPICard';

interface KPIMetrics {
  totalAdSpend?: number;
  ctr?: number;
  leads?: number;
  totalLeads?: number;
  spamBadLeads?: number;
  spamLeads?: number;
  costPerLead?: number;
  calls?: number;
  totalCalls?: number;
  costPerCall?: number;
  showedCalls?: number;
  showedPercent?: number;
  costPerShow?: number;
  commitments?: number;
  totalCommitments?: number;
  commitmentDollars?: number;
  fundedInvestors?: number;
  fundedDollars?: number;
  costPerInvestor?: number;
  costOfCapital?: number;
  avgTimeToFund?: number;
  avgCallsToFund?: number;
}

export interface KPIThresholds {
  costPerLead?: KPIThreshold;
  costPerCall?: KPIThreshold;
  costPerShow?: KPIThreshold;
  costPerInvestor?: KPIThreshold;
  costOfCapital?: KPIThreshold;
}

interface KPIGridProps {
  metrics: KPIMetrics;
  onMetricClick?: (metric: string) => void;
  showFundedMetrics?: boolean;
  thresholds?: KPIThresholds;
  fundedInvestorLabel?: string;
}

export function KPIGrid({ 
  metrics, 
  onMetricClick, 
  showFundedMetrics = false,
  thresholds,
  fundedInvestorLabel = 'Funded Investors',
}: KPIGridProps) {
  const kpis = [
    { key: 'totalAdSpend', label: 'Total Ad Spend', value: metrics.totalAdSpend ?? 0, format: 'currency' as const, change: 0 },
    { key: 'ctr', label: 'CTR', value: metrics.ctr ?? 0, format: 'percent' as const, change: 0 },
    { key: 'leads', label: 'Leads', value: metrics.leads ?? metrics.totalLeads ?? 0, format: 'number' as const, change: 0, clickable: true },
    { key: 'spamBadLeads', label: 'Spam/Bad Leads', value: metrics.spamBadLeads ?? metrics.spamLeads ?? 0, format: 'number' as const, change: 0 },
    { key: 'costPerLead', label: 'Cost Per Lead', value: metrics.costPerLead ?? 0, format: 'currency' as const, change: 0, threshold: thresholds?.costPerLead },
    { key: 'calls', label: 'Calls', value: metrics.calls ?? metrics.totalCalls ?? 0, format: 'number' as const, change: 0, clickable: true },
    { key: 'costPerCall', label: 'Cost Per Call', value: metrics.costPerCall ?? 0, format: 'currency' as const, change: 0, threshold: thresholds?.costPerCall },
    { key: 'showedCalls', label: 'Showed Calls', value: metrics.showedCalls ?? 0, format: 'number' as const, change: 0, clickable: true },
    { key: 'showedPercent', label: 'Showed %', value: metrics.showedPercent ?? 0, format: 'percent' as const, change: 0 },
    { key: 'costPerShow', label: 'Cost Per Show', value: metrics.costPerShow ?? 0, format: 'currency' as const, change: 0, threshold: thresholds?.costPerShow },
    { key: 'commitments', label: 'Commitments', value: metrics.commitments ?? metrics.totalCommitments ?? 0, format: 'number' as const, change: 0, clickable: true },
    { key: 'commitmentDollars', label: 'Commitment $', value: metrics.commitmentDollars ?? 0, format: 'currency' as const, change: 0 },
    { key: 'fundedInvestors', label: fundedInvestorLabel, value: metrics.fundedInvestors ?? 0, format: 'number' as const, change: 0, clickable: true },
    { key: 'fundedDollars', label: 'Funded $', value: metrics.fundedDollars ?? 0, format: 'currency' as const, change: 0 },
    { key: 'costPerInvestor', label: 'Cost / Investor', value: metrics.costPerInvestor ?? 0, format: 'currency' as const, change: 0, threshold: thresholds?.costPerInvestor },
    { key: 'costOfCapital', label: 'Cost of Capital', value: metrics.costOfCapital ?? 0, format: 'percent' as const, change: 0, threshold: thresholds?.costOfCapital },
  ];

  // Add funded investor metrics if enabled
  const fundedMetrics = showFundedMetrics ? [
    { key: 'avgTimeToFund', label: 'Avg Time to Fund', value: metrics.avgTimeToFund ?? 0, format: 'days' as const, change: 0, clickable: false },
    { key: 'avgCallsToFund', label: 'Avg Calls to Fund', value: metrics.avgCallsToFund ?? 0, format: 'number' as const, change: 0, clickable: false },
  ] : [];

  const allKpis = [...kpis, ...fundedMetrics];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {allKpis.map((kpi) => (
        <KPICard
          key={kpi.key}
          label={kpi.label}
          value={kpi.value}
          change={kpi.change}
          format={kpi.format}
          clickable={kpi.clickable}
          onClick={kpi.clickable ? () => onMetricClick?.(kpi.key) : undefined}
          threshold={'threshold' in kpi ? kpi.threshold : undefined}
        />
      ))}
    </div>
  );
}
