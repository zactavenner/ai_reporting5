export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low' | 'not_reported';

export interface MetricConfidence {
  metric: string;
  level: ConfidenceLevel;
  description: string;
}

export const METRIC_CONFIDENCE: MetricConfidence[] = [
  { metric: 'leads', level: 'high', description: 'Webhook-driven, deduplicated' },
  { metric: 'booked', level: 'high', description: 'Appointment webhook' },
  { metric: 'showed', level: 'medium', description: 'Auto-mark + manual override' },
  { metric: 'connected_show', level: 'high', description: 'API-validated' },
  { metric: 'committed', level: 'high', description: 'Webhook-driven' },
  { metric: 'funded', level: 'very_high', description: 'Multiple validation layers' },
  { metric: 'campaign_cpl', level: 'not_reported', description: 'Intentionally excluded' },
  { metric: 'client_cpl', level: 'high', description: 'Total spend / Total leads' },
  { metric: 'cost_per_call', level: 'high', description: 'Total spend / Total calls' },
  { metric: 'cost_per_show', level: 'medium', description: 'Based on showed calls' },
  { metric: 'cost_per_investor', level: 'very_high', description: 'Based on funded count' },
  { metric: 'cost_of_capital', level: 'very_high', description: 'Based on funded dollars' },
  { metric: 'reconnect_calls', level: 'high', description: 'Webhook-driven' },
  { metric: 'reconnect_showed', level: 'medium', description: 'Auto-mark + manual' },
];

export function getMetricConfidence(metricKey: string): MetricConfidence | undefined {
  return METRIC_CONFIDENCE.find(m => m.metric === metricKey);
}

export const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { icon: string; color: string; label: string }> = {
  very_high: { icon: '●', color: 'text-chart-4', label: 'Very High' },
  high: { icon: '●', color: 'text-chart-2', label: 'High' },
  medium: { icon: '◐', color: 'text-chart-3', label: 'Medium' },
  low: { icon: '○', color: 'text-muted-foreground', label: 'Low' },
  not_reported: { icon: '—', color: 'text-muted-foreground', label: 'Not Reported' },
};
