import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useClientByToken } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics } from '@/hooks/useMetrics';
import { useLeads } from '@/hooks/useLeadsAndCalls';
import { useCalls } from '@/hooks/useLeadsAndCalls';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { MetricChartsGrid } from '@/components/dashboard/MetricChartsGrid';
import { PeriodicStatsTable } from '@/components/dashboard/PeriodicStatsTable';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Users, Phone, TrendingUp } from 'lucide-react';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { useQueryClient } from '@tanstack/react-query';

export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const { startDate, endDate } = useDateFilter();
  const queryClient = useQueryClient();
  
  const { data: client, isLoading } = useClientByToken(token);
  const { data: dailyMetrics = [] } = useDailyMetrics(client?.id, startDate, endDate);
  const { data: fundedInvestors = [] } = useFundedInvestors(client?.id, startDate, endDate);
  const { data: leads = [] } = useLeads(client?.id, startDate, endDate);
  const { data: calls = [] } = useCalls(client?.id, false, startDate, endDate);
  
  const [activeSection, setActiveSection] = useState<'overview' | 'adspend' | 'leads' | 'calls' | 'funded'>('overview');

  const metrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors);
  }, [dailyMetrics, fundedInvestors]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['daily-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['funded-investors'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['calls'] });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p>Loading...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center border-2 border-border bg-card p-8">
          <h1 className="text-2xl font-bold mb-2">Report Not Found</h1>
          <p className="text-muted-foreground">This report link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-2 border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold">{client.name} - Performance Report</h1>
        <p className="text-sm text-muted-foreground">Capital Raising Performance Dashboard</p>
      </header>

      <main className="p-6 space-y-6 max-w-7xl mx-auto">
        <DateRangeFilter showAddClient={false} onRefresh={handleRefresh} />

        {/* Section Navigation */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant={activeSection === 'overview' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('overview')}
          >
            Overview
          </Button>
          <Button 
            variant={activeSection === 'adspend' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('adspend')}
          >
            <DollarSign className="h-4 w-4 mr-1" />
            Ad Spend ({dailyMetrics.length})
          </Button>
          <Button 
            variant={activeSection === 'leads' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('leads')}
          >
            <Users className="h-4 w-4 mr-1" />
            Leads ({leads.length})
          </Button>
          <Button 
            variant={activeSection === 'calls' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('calls')}
          >
            <Phone className="h-4 w-4 mr-1" />
            Calls ({calls.length})
          </Button>
          <Button 
            variant={activeSection === 'funded' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setActiveSection('funded')}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            Funded ({fundedInvestors.length})
          </Button>
        </div>

        {activeSection === 'overview' && (
          <>
            <section>
              <h2 className="text-lg font-bold mb-2">Key Performance Indicators</h2>
              <KPIGrid metrics={metrics} showFundedMetrics />
            </section>

            <PeriodicStatsTable dailyMetrics={dailyMetrics} />

            <MetricChartsGrid dailyMetrics={dailyMetrics} />

            <section className="border border-border bg-card p-6 rounded-lg">
              <h3 className="font-semibold text-lg mb-4">Performance Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="border border-border p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                  <p className="text-3xl font-semibold tabular-nums mt-1">{metrics.totalLeads.toLocaleString()}</p>
                </div>
                <div className="border border-border p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Funded Investors</p>
                  <p className="text-3xl font-semibold tabular-nums mt-1">{metrics.fundedInvestors}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">${metrics.fundedDollars.toLocaleString()}</p>
                </div>
                <div className="border border-border p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Avg Time to Fund</p>
                  <p className="text-3xl font-semibold tabular-nums mt-1">{metrics.avgTimeToFund.toFixed(1)} <span className="text-lg font-normal">days</span></p>
                </div>
                <div className="border border-border p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Avg Calls to Fund</p>
                  <p className="text-3xl font-semibold tabular-nums mt-1">{metrics.avgCallsToFund.toFixed(1)}</p>
                </div>
              </div>
            </section>
          </>
        )}

        {activeSection === 'adspend' && (
          <section className="border border-border bg-card p-6 rounded-lg">
            <h3 className="font-semibold text-lg mb-4">Ad Spend Records</h3>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyMetrics.map((metric) => (
                    <TableRow key={metric.id}>
                      <TableCell className="font-mono">{metric.date}</TableCell>
                      <TableCell className="text-right font-mono text-chart-1">
                        ${Number(metric.ad_spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono">{(metric.impressions || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{(metric.clicks || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {activeSection === 'leads' && (
          <section className="border border-border bg-card p-6 rounded-lg">
            <h3 className="font-semibold text-lg mb-4">Leads</h3>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-mono text-sm">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{lead.name || '-'}</TableCell>
                      <TableCell>{lead.email || '-'}</TableCell>
                      <TableCell>{lead.phone || '-'}</TableCell>
                      <TableCell><Badge variant="outline">{lead.source}</Badge></TableCell>
                      <TableCell>
                        {lead.is_spam ? (
                          <Badge variant="destructive">Spam</Badge>
                        ) : (
                          <Badge variant="secondary">{lead.status || 'New'}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {activeSection === 'calls' && (
          <section className="border border-border bg-card p-6 rounded-lg">
            <h3 className="font-semibold text-lg mb-4">Calls</h3>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((call) => (
                    <TableRow key={call.id}>
                      <TableCell className="font-mono text-sm">
                        {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell>
                        {call.showed ? (
                          <Badge className="bg-chart-2 text-chart-2-foreground">Showed</Badge>
                        ) : (
                          <Badge variant="secondary">No Show</Badge>
                        )}
                      </TableCell>
                      <TableCell>{call.outcome || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{new Date(call.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {activeSection === 'funded' && (
          <section className="border border-border bg-card p-6 rounded-lg">
            <h3 className="font-semibold text-lg mb-4">Funded Investors</h3>
            <div className="overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>First Contact</TableHead>
                    <TableHead>Funded Date</TableHead>
                    <TableHead className="text-right">Time to Fund</TableHead>
                    <TableHead className="text-right">Calls to Fund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fundedInvestors.map((investor) => (
                    <TableRow key={investor.id}>
                      <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                      <TableCell className="text-right font-mono text-chart-2">
                        ${Number(investor.funded_amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {investor.first_contact_at ? new Date(investor.first_contact_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{new Date(investor.funded_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right font-mono">
                        {investor.time_to_fund_days !== null ? `${investor.time_to_fund_days} days` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">{investor.calls_to_fund || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>Report generated on {new Date().toLocaleDateString()}</p>
        </footer>
      </main>
    </div>
  );
}
