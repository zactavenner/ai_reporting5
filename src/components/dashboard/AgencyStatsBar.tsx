import { Client } from '@/hooks/useClients';
import { ClientMRRSettings, calculateClientRevenue } from '@/hooks/useClientMRR';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, Pause, DollarSign, TrendingUp } from 'lucide-react';

interface AgencyStatsBarProps {
  clients: Client[];
  clientMRRSettings: Record<string, ClientMRRSettings>;
  clientAdSpends: Record<string, number>;
}

export function AgencyStatsBar({ 
  clients, 
  clientMRRSettings,
  clientAdSpends,
}: AgencyStatsBarProps) {
  const activeClients = clients.filter(c => c.status === 'active').length;
  const onboardingClients = clients.filter(c => c.status === 'onboarding').length;
  const pausedClients = clients.filter(c => c.status === 'paused' || c.status === 'on_hold').length;
  
  // Calculate total MRR with ad spend fees
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
  
  const projectedAnnual = totalMRR * 12;

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
      label: 'Monthly MRR',
      value: formatCurrency(totalMRR),
      icon: DollarSign,
      color: 'text-chart-2',
    },
    {
      label: 'Projected Annual',
      value: formatCurrency(projectedAnnual),
      icon: TrendingUp,
      color: 'text-primary',
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-4 mb-4">
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
