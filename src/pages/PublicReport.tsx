import { useParams } from 'react-router-dom';
import { useClientByToken } from '@/hooks/useClients';
import { useDailyMetrics, useFundedInvestors, aggregateMetrics } from '@/hooks/useMetrics';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { useMemo } from 'react';

export default function PublicReport() {
  const { token } = useParams<{ token: string }>();
  const { data: client, isLoading } = useClientByToken(token);
  const { data: dailyMetrics = [] } = useDailyMetrics(client?.id);
  const { data: fundedInvestors = [] } = useFundedInvestors(client?.id);

  const metrics = useMemo(() => {
    return aggregateMetrics(dailyMetrics, fundedInvestors);
  }, [dailyMetrics, fundedInvestors]);

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
        <DateRangeFilter showAddClient={false} />

        <section>
          <h2 className="text-lg font-bold mb-2">Key Performance Indicators</h2>
          <KPIGrid metrics={metrics} showFundedMetrics />
        </section>

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

        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>Report generated on {new Date().toLocaleDateString()}</p>
        </footer>
      </main>
    </div>
  );
}
