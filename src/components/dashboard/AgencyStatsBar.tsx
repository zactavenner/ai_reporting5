import { Client } from '@/hooks/useClients';
import { ClientMRRSettings, calculateClientRevenue } from '@/hooks/useClientMRR';
import { ClientSettings, getEffectiveMonthlyTarget } from '@/hooks/useClientSettings';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, Pause, DollarSign, TrendingUp, Target } from 'lucide-react';

interface AgencyStatsBarProps {
  clients: Client[];
  clientMRRSettings: Record<string, ClientMRRSettings>;
  clientAdSpends: Record<string, number>;
  clientFullSettings?: Record<string, ClientSettings>;
}

export function AgencyStatsBar({ 
  clients, 
  clientMRRSettings,
  clientAdSpends,
  clientFullSettings = {},
}: AgencyStatsBarProps) {
  const activeClients = clients.filter(c => c.status === 'active').length;
  const onboardingClients = clients.filter(c => c.status === 'onboarding').length;
  const pausedClients = clients.filter(c => c.status === 'paused' || c.status === 'on_hold').length;
  
  // Calculate total MRR with actual ad spend fees (current performance)
  let totalMRR = 0;
  for (const client of clients) {
    const settings = clientMRRSettings[client.id] || {
      mrr: 0,
      ad_spend_fee_threshold: 30000,
      ad_spend_fee_percent: 10,
    };
    const adSpend = clientAdSpends[client.id] || 0;
    totalMRR += calculateClientRevenue(
      settings.mrr,
      adSpend,
      settings.ad_spend_fee_threshold,
      settings.ad_spend_fee_percent
    );
  }
  
  // Calculate estimated monthly revenue based on targets
  let estimatedMonthlyRevenue = 0;
  for (const client of clients) {
    const fullSettings = clientFullSettings[client.id];
    if (fullSettings) {
      const monthlyTarget = getEffectiveMonthlyTarget(fullSettings);
      estimatedMonthlyRevenue += calculateClientRevenue(
        fullSettings.mrr || 0,
        monthlyTarget,
        fullSettings.ad_spend_fee_threshold || 30000,
        fullSettings.ad_spend_fee_percent || 10
      );
    }
  }
  
  const projectedAnnual = estimatedMonthlyRevenue * 12;

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const stats = [
    {
      label: 'Active Clients',
      value: activeClients,
      icon: UserCheck,
      color: 'text-chart-2',
    },
    {
      label: 'Onboarding',
      value: onboardingClients,
      icon: Users,
      color: 'text-primary',
    },
    {
      label: 'On Hold / Paused',
      value: pausedClients,
      icon: Pause,
      color: 'text-muted-foreground',
    },
    {
      label: 'Current MRR',
      value: formatCurrency(totalMRR),
      icon: DollarSign,
      color: 'text-chart-2',
    },
    {
      label: 'Est. Monthly Rev',
      value: formatCurrency(estimatedMonthlyRevenue),
      icon: Target,
      color: 'text-primary',
    },
    {
      label: 'Projected Annual',
      value: formatCurrency(projectedAnnual),
      icon: TrendingUp,
      color: 'text-chart-2',
    },
  ];

  return (
    <div className="grid grid-cols-6 gap-4 mb-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-2">
          <CardContent className="p-4 flex items-center gap-3">
            <stat.icon className={`h-8 w-8 ${stat.color}`} />
            <div>
              <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
