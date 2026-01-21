import { Client } from '@/hooks/useClients';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, Pause, DollarSign, TrendingUp } from 'lucide-react';

interface AgencyStatsBarProps {
  clients: Client[];
  clientMRR: Record<string, number>;
  adSpendFeeThreshold: number;
  adSpendFeePercent: number;
}

export function AgencyStatsBar({ 
  clients, 
  clientMRR, 
  adSpendFeeThreshold,
  adSpendFeePercent 
}: AgencyStatsBarProps) {
  const activeClients = clients.filter(c => c.status === 'active').length;
  const onboardingClients = clients.filter(c => c.status === 'onboarding').length;
  const pausedClients = clients.filter(c => c.status === 'paused' || c.status === 'on_hold').length;
  
  const totalMRR = Object.values(clientMRR).reduce((sum, mrr) => sum + mrr, 0);
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
      color: 'text-blue-500',
    },
    {
      label: 'On Hold / Paused',
      value: pausedClients,
      icon: Pause,
      color: 'text-yellow-500',
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
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
