import { KPICard, KPIThreshold } from './KPICard';
import { getMetricConfidence } from '@/lib/metricConfidence';

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
  // New KPIs
  leadToBookedPercent?: number;
  reconnectCalls?: number;
  reconnectShowed?: number;
  closeRate?: number;
  pipelineValue?: number;
  // Additional cost metrics
  costPerReconnectCall?: number;
  costPerReconnectShowed?: number;
}

interface PriorMetrics {
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
  reconnectCalls?: number;
  reconnectShowed?: number;
  closeRate?: number;
  pipelineValue?: number;
  costPerReconnectCall?: number;
  costPerReconnectShowed?: number;
  leadToBookedPercent?: number;
}

export interface KPIThresholds {
  costPerLead?: KPIThreshold;
  costPerCall?: KPIThreshold;
  costPerShow?: KPIThreshold;
  costPerInvestor?: KPIThreshold;
  costOfCapital?: KPIThreshold;
}

// Metrics where lower is better (costs)
const COST_METRICS = new Set([
  'costPerLead', 'costPerCall', 'costPerShow', 'costPerInvestor', 
  'costOfCapital', 'costPerReconnectCall', 'costPerReconnectShowed',
  'spamBadLeads', 'spamLeads'
]);

// Metrics where higher is better (performance)
const POSITIVE_METRICS = new Set([
  'totalAdSpend', 'ctr', 'leads', 'totalLeads', 'calls', 'totalCalls',
  'showedCalls', 'showedPercent', 'commitments', 'totalCommitments',
  'commitmentDollars', 'fundedInvestors', 'fundedDollars', 'reconnectCalls',
  'reconnectShowed', 'closeRate', 'pipelineValue', 'leadToBookedPercent'
]);

function calculateChange(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return ((current - prior) / prior) * 100;
}

interface KPIGridProps {
  metrics: KPIMetrics;
  priorMetrics?: PriorMetrics;
  onMetricClick?: (metric: string) => void;
  showFundedMetrics?: boolean;
  thresholds?: KPIThresholds;
  fundedInvestorLabel?: string;
  showConfidence?: boolean;
}

export function KPIGrid({ 
  metrics, 
  priorMetrics,
  onMetricClick, 
  showFundedMetrics = false,
  thresholds,
  fundedInvestorLabel = 'Funded Investors',
  showConfidence = false,
}: KPIGridProps) {
  
  // Calculate change vs prior for a metric, inverting for cost metrics
  const getChangeForMetric = (key: string, currentValue: number): number => {
    if (!priorMetrics) return 0;
    
    const priorValue = (priorMetrics as any)[key] ?? 0;
    const rawChange = calculateChange(currentValue, priorValue);
    
    // For cost metrics, invert the change (lower is better, so negative change is good)
    if (COST_METRICS.has(key)) {
      return -rawChange;
    }
    
    return rawChange;
  };

  const kpis = [
    { key: 'totalAdSpend', label: 'Total Ad Spend', value: metrics.totalAdSpend ?? 0, format: 'currency' as const },
    { key: 'ctr', label: 'CTR', value: metrics.ctr ?? 0, format: 'percent' as const },
    { key: 'leads', label: 'Leads', value: metrics.leads ?? metrics.totalLeads ?? 0, format: 'number' as const, clickable: true },
    { key: 'spamBadLeads', label: 'Spam/Bad Leads', value: metrics.spamBadLeads ?? metrics.spamLeads ?? 0, format: 'number' as const },
    { key: 'costPerLead', label: 'Cost Per Lead', value: metrics.costPerLead ?? 0, format: 'currency' as const, threshold: thresholds?.costPerLead },
    { key: 'pipelineValue', label: 'Pipeline Value', value: metrics.pipelineValue ?? 0, format: 'currency' as const },
    { key: 'leadToBookedPercent', label: 'Lead to Booked %', value: metrics.leadToBookedPercent ?? 0, format: 'percent' as const },
    { key: 'calls', label: 'Booked Calls', value: metrics.calls ?? metrics.totalCalls ?? 0, format: 'number' as const, clickable: true },
    { key: 'costPerCall', label: 'Cost Per Call', value: metrics.costPerCall ?? 0, format: 'currency' as const, threshold: thresholds?.costPerCall },
    { key: 'showedCalls', label: 'Showed Calls', value: metrics.showedCalls ?? 0, format: 'number' as const, clickable: true },
    { key: 'showedPercent', label: 'Show Rate', value: metrics.showedPercent ?? 0, format: 'percent' as const },
    { key: 'costPerShow', label: 'Cost Per Show', value: metrics.costPerShow ?? 0, format: 'currency' as const, threshold: thresholds?.costPerShow },
    { key: 'reconnectCalls', label: 'Reconnect Calls', value: metrics.reconnectCalls ?? 0, format: 'number' as const },
    { key: 'costPerReconnectCall', label: '$/Reconnect', value: metrics.costPerReconnectCall ?? 0, format: 'currency' as const },
    { key: 'reconnectShowed', label: 'Reconnect Showed', value: metrics.reconnectShowed ?? 0, format: 'number' as const },
    { key: 'costPerReconnectShowed', label: '$/Recon Showed', value: metrics.costPerReconnectShowed ?? 0, format: 'currency' as const },
    { key: 'closeRate', label: 'Close Rate', value: metrics.closeRate ?? 0, format: 'percent' as const },
    { key: 'commitments', label: 'Commitments', value: metrics.commitments ?? metrics.totalCommitments ?? 0, format: 'number' as const, clickable: true },
    { key: 'commitmentDollars', label: 'Commitment $', value: metrics.commitmentDollars ?? 0, format: 'currency' as const },
    { key: 'fundedInvestors', label: fundedInvestorLabel, value: metrics.fundedInvestors ?? 0, format: 'number' as const, clickable: true },
    { key: 'fundedDollars', label: 'Funded $', value: metrics.fundedDollars ?? 0, format: 'currency' as const },
    { key: 'costPerInvestor', label: 'Cost / Investor', value: metrics.costPerInvestor ?? 0, format: 'currency' as const, threshold: thresholds?.costPerInvestor },
    { key: 'costOfCapital', label: 'Cost of Capital', value: metrics.costOfCapital ?? 0, format: 'percent' as const, threshold: thresholds?.costOfCapital },
  ];

  // Add funded investor metrics if enabled
  const fundedMetrics = showFundedMetrics ? [
    { key: 'avgTimeToFund', label: 'Avg Time to Fund', value: metrics.avgTimeToFund ?? 0, format: 'days' as const, clickable: false },
    { key: 'avgCallsToFund', label: 'Avg Calls to Fund', value: metrics.avgCallsToFund ?? 0, format: 'number' as const, clickable: false },
  ] : [];

  const allKpis = [...kpis, ...fundedMetrics];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {allKpis.map((kpi) => {
        const change = getChangeForMetric(kpi.key, kpi.value);
        const metricConfidence = showConfidence ? getMetricConfidence(kpi.key) : undefined;
        
        return (
          <KPICard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            change={change}
            changeLabel={priorMetrics ? 'vs prior' : undefined}
            format={kpi.format}
            clickable={kpi.clickable}
            onClick={kpi.clickable ? () => onMetricClick?.(kpi.key) : undefined}
            threshold={'threshold' in kpi ? kpi.threshold : undefined}
            confidence={metricConfidence?.level}
          />
        );
      })}
    </div>
  );
}
