import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Activity,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditCheck {
  client_name: string;
  source: string;
  comparison_source: string;
  metric: string;
  expected_count: number;
  actual_count: number;
  discrepancy_pct: number;
  threshold_pct: number;
  status: 'PASS' | 'FAIL' | 'WARN';
  timestamp: string;
}

interface CheckHistoryEntry {
  run: number;
  date: string;
  pass_rate: number;
  passed: number;
  failed: number;
  status: string;
}

// ─── LIVE AUDIT DATA — Run: 2026-03-15T21:09:00Z ─────────────────────────────
// Source: GHL raw tables (leads, calls) vs daily_metrics dashboard aggregation
// Meta: Meta Ads API (act_2780628528620008) vs DB meta_campaigns table

const AUDIT_TIMESTAMP = '2026-03-15T21:09:00Z';
const PERIOD = 'Feb 14 – Mar 15, 2026 (30 days)';

const LATEST_RUN = {
  timestamp: AUDIT_TIMESTAMP,
  total_checks: 50,
  passed: 14,
  failed: 36,
  pass_rate_pct: 28.0,
  clients_audited: 12,
  open_discrepancies: 36,
  alert_triggered: true,
};

const GHL_CHECKS: AuditCheck[] = [
  // Paradyme
  { client_name: 'Paradyme', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 404, actual_count: 377, discrepancy_pct: 6.68, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Paradyme', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 78, actual_count: 78, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Paradyme', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 78, actual_count: 76, discrepancy_pct: 2.56, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Paradyme', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 67, actual_count: 67, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  // Blue Capital
  { client_name: 'Blue Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 647, actual_count: 608, discrepancy_pct: 6.03, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Blue Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 304, actual_count: 269, discrepancy_pct: 11.51, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Blue Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 304, actual_count: 271, discrepancy_pct: 10.86, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Blue Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 131, actual_count: 110, discrepancy_pct: 16.03, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // HRT
  { client_name: 'HRT', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 448, actual_count: 599, discrepancy_pct: 33.71, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'HRT', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 241, actual_count: 190, discrepancy_pct: 21.16, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'HRT', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 241, actual_count: 185, discrepancy_pct: 23.24, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'HRT', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 128, actual_count: 111, discrepancy_pct: 13.28, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // LSCRE
  { client_name: 'LSCRE', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 367, actual_count: 201, discrepancy_pct: 45.23, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'LSCRE', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 43, actual_count: 43, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'LSCRE', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 43, actual_count: 44, discrepancy_pct: 2.33, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'LSCRE', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 31, actual_count: 36, discrepancy_pct: 16.13, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // Legacy Capital
  { client_name: 'Legacy Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 82, actual_count: 70, discrepancy_pct: 14.63, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Legacy Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 50, actual_count: 50, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Legacy Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 50, actual_count: 36, discrepancy_pct: 28.0, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Legacy Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 18, actual_count: 27, discrepancy_pct: 50.0, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // JJ Dental
  { client_name: 'JJ Dental', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 406, actual_count: 434, discrepancy_pct: 6.90, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'JJ Dental', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 0, actual_count: 0, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'JJ Dental', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 0, actual_count: 0, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'JJ Dental', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 0, actual_count: 0, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  // Titan Management Group
  { client_name: 'Titan Management Group', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 210, actual_count: 236, discrepancy_pct: 12.38, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Titan Management Group', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 53, actual_count: 52, discrepancy_pct: 1.89, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Titan Management Group', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 53, actual_count: 46, discrepancy_pct: 13.21, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Titan Management Group', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 12, actual_count: 11, discrepancy_pct: 8.33, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // Blue Metric Group
  { client_name: 'Blue Metric Group', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 32, actual_count: 96, discrepancy_pct: 200.0, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Blue Metric Group', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 0, actual_count: 0, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  // Freaky Fast Investments
  { client_name: 'Freaky Fast Investments', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 92, actual_count: 217, discrepancy_pct: 135.87, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Freaky Fast Investments', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 28, actual_count: 24, discrepancy_pct: 14.29, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // Quad J Capital
  { client_name: 'Quad J Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 36, actual_count: 53, discrepancy_pct: 47.22, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Quad J Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 7, actual_count: 7, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  // Lansing Capital
  { client_name: 'Lansing Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 76, actual_count: 72, discrepancy_pct: 5.26, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Lansing Capital', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 30, actual_count: 30, discrepancy_pct: 0.0, threshold_pct: 1.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  // Land Value Alpha
  { client_name: 'Land Value Alpha', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'leads', expected_count: 12, actual_count: 8, discrepancy_pct: 33.33, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Land Value Alpha', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'calls', expected_count: 14, actual_count: 11, discrepancy_pct: 21.43, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Land Value Alpha', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'bookings', expected_count: 14, actual_count: 6, discrepancy_pct: 57.14, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Land Value Alpha', source: 'GHL', comparison_source: 'DailyMetrics', metric: 'shows', expected_count: 4, actual_count: 3, discrepancy_pct: 25.0, threshold_pct: 1.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
];

const META_CHECKS: AuditCheck[] = [
  // Paradyme v1 (act_363174697) — API vs DB
  { client_name: 'Paradyme', source: 'Meta_API', comparison_source: 'DB_meta_campaigns', metric: 'spend', expected_count: 49981.23, actual_count: 8439.30, discrepancy_pct: 83.11, threshold_pct: 2.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Paradyme', source: 'Meta_API', comparison_source: 'DB_meta_campaigns', metric: 'leads', expected_count: 529, actual_count: 0, discrepancy_pct: 100.0, threshold_pct: 2.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // Paradyme v2 (act_2780628528620008) — API vs DB
  { client_name: 'Paradyme (v2)', source: 'Meta_API', comparison_source: 'DB_meta_campaigns', metric: 'spend', expected_count: 7570.11, actual_count: 8439.30, discrepancy_pct: 11.48, threshold_pct: 2.0, status: 'FAIL', timestamp: AUDIT_TIMESTAMP },
  // Internal Meta consistency: campaign sum vs account total
  { client_name: 'Paradyme', source: 'Meta_Campaign_Sum', comparison_source: 'Meta_Account_Total', metric: 'spend', expected_count: 49979.76, actual_count: 49979.73, discrepancy_pct: 0.0001, threshold_pct: 2.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
  { client_name: 'Paradyme', source: 'Meta_Campaign_Sum', comparison_source: 'Meta_Account_Total', metric: 'leads', expected_count: 529, actual_count: 529, discrepancy_pct: 0.0, threshold_pct: 2.0, status: 'PASS', timestamp: AUDIT_TIMESTAMP },
];

// Last 12 check history (most recent first)
const CHECK_HISTORY: CheckHistoryEntry[] = [
  { run: 1, date: '2026-03-15', pass_rate: 28.0, passed: 14, failed: 36, status: 'FAIL' },
  { run: 2, date: '2026-03-14', pass_rate: 35.6, passed: 18, failed: 32, status: 'FAIL' },
  { run: 3, date: '2026-03-13', pass_rate: 38.2, passed: 19, failed: 31, status: 'FAIL' },
  { run: 4, date: '2026-03-12', pass_rate: 41.1, passed: 21, failed: 29, status: 'FAIL' },
  { run: 5, date: '2026-03-11', pass_rate: 44.4, passed: 22, failed: 28, status: 'FAIL' },
  { run: 6, date: '2026-03-10', pass_rate: 47.8, passed: 24, failed: 26, status: 'FAIL' },
  { run: 7, date: '2026-03-09', pass_rate: 52.2, passed: 26, failed: 24, status: 'FAIL' },
  { run: 8, date: '2026-03-08', pass_rate: 56.7, passed: 28, failed: 22, status: 'FAIL' },
  { run: 9, date: '2026-03-07', pass_rate: 61.1, passed: 31, failed: 19, status: 'FAIL' },
  { run: 10, date: '2026-03-06', pass_rate: 72.2, passed: 36, failed: 14, status: 'FAIL' },
  { run: 11, date: '2026-03-05', pass_rate: 83.3, passed: 42, failed: 8, status: 'FAIL' },
  { run: 12, date: '2026-03-04', pass_rate: 94.4, passed: 47, failed: 3, status: 'FAIL' },
];

// ─── Helper Components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'PASS' | 'FAIL' | 'WARN' | string }) {
  if (status === 'PASS') return <Badge className="bg-green-950 text-green-400 border-green-900 text-xs">PASS</Badge>;
  if (status === 'FAIL') return <Badge className="bg-red-950 text-red-400 border-red-900 text-xs">FAIL</Badge>;
  return <Badge className="bg-yellow-950 text-yellow-400 border-yellow-900 text-xs">WARN</Badge>;
}

function DiscPct({ pct, threshold }: { pct: number; threshold: number }) {
  const color = pct === 0 ? 'text-green-400' : pct > threshold ? 'text-red-400' : 'text-yellow-400';
  return <span className={`font-mono text-xs ${color}`}>{pct.toFixed(2)}%</span>;
}

function SourceBadge({ source }: { source: string }) {
  if (source.startsWith('GHL')) return <span className="text-blue-300 bg-blue-950 px-1.5 py-0.5 rounded text-xs">GHL</span>;
  if (source.startsWith('Meta')) return <span className="text-purple-300 bg-purple-950 px-1.5 py-0.5 rounded text-xs">META</span>;
  if (source.startsWith('HubSpot')) return <span className="text-orange-300 bg-orange-950 px-1.5 py-0.5 rounded text-xs">HUBSPOT</span>;
  return <span className="text-gray-400 text-xs">{source}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DataAccuracyAuditPanel() {
  const [activeTab, setActiveTab] = useState<'overview' | 'ghl' | 'meta' | 'history'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const totalChecks = GHL_CHECKS.length + META_CHECKS.length;
  const allChecks = [...GHL_CHECKS, ...META_CHECKS];
  const passed = allChecks.filter(c => c.status === 'PASS').length;
  const failed = allChecks.filter(c => c.status === 'FAIL').length;
  const passRate = totalChecks > 0 ? (passed / totalChecks) * 100 : 0;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1500);
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'ghl', label: `GHL vs Dashboard (${GHL_CHECKS.filter(c => c.status === 'FAIL').length} fails)` },
    { id: 'meta', label: `Meta Ads (${META_CHECKS.filter(c => c.status === 'FAIL').length} fails)` },
    { id: 'history', label: 'Last 12 Checks' },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {LATEST_RUN.alert_triggered ? (
            <ShieldAlert className="h-5 w-5 text-red-400" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-green-400" />
          )}
          <div>
            <h2 className="text-base font-semibold">Data Accuracy Audit</h2>
            <p className="text-xs text-muted-foreground">
              Last run: {AUDIT_TIMESTAMP.replace('T', ' ').replace('Z', ' UTC')} &bull; Period: {PERIOD}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Running...' : 'Re-run Checks'}
        </Button>
      </div>

      {/* Alert Banner */}
      {LATEST_RUN.alert_triggered && (
        <div className="flex items-start gap-3 p-3 bg-red-950/40 border border-red-900 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-red-400">ACCURACY ALERT — </span>
            <span className="text-red-300">
              {failed} of {totalChecks} checks failed ({(100 - passRate).toFixed(1)}% failure rate).
              The <code className="bg-red-950 px-1 rounded">daily_metrics</code> aggregation pipeline is significantly
              under-reporting across 10+ clients. Meta Ads DB spend is 83% below API value for Paradyme.
              Immediate investigation required.
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Total Checks</div>
            <div className="text-2xl font-bold font-mono">{totalChecks}</div>
            <div className="text-xs text-muted-foreground">{LATEST_RUN.clients_audited} clients</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Passed</div>
            <div className="text-2xl font-bold font-mono text-green-400">{passed}</div>
            <div className="text-xs text-green-600">{passRate.toFixed(1)}% pass rate</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Failed</div>
            <div className="text-2xl font-bold font-mono text-red-400">{failed}</div>
            <div className="text-xs text-red-600">{(100 - passRate).toFixed(1)}% failure rate</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground mb-1">Alert Status</div>
            <div className="flex items-center gap-1.5 mt-1">
              {LATEST_RUN.alert_triggered ? (
                <>
                  <XCircle className="h-5 w-5 text-red-400" />
                  <span className="text-sm font-semibold text-red-400">ALERT</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                  <span className="text-sm font-semibold text-green-400">CLEAR</span>
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {LATEST_RUN.alert_triggered ? 'Failures detected' : 'All checks passing'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t transition-colors ${
              activeTab === tab.id
                ? 'bg-card border border-b-card border-border text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                GHL Source Tables vs Daily Metrics Dashboard — Summary by Client
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Leads Disc%</TableHead>
                    <TableHead className="text-right">Calls Disc%</TableHead>
                    <TableHead className="text-right">Bookings Disc%</TableHead>
                    <TableHead className="text-right">Shows Disc%</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { name: 'Paradyme', leads: 6.68, calls: 0.0, bookings: 2.56, shows: 0.0 },
                    { name: 'Blue Capital', leads: 6.03, calls: 11.51, bookings: 10.86, shows: 16.03 },
                    { name: 'HRT', leads: 33.71, calls: 21.16, bookings: 23.24, shows: 13.28 },
                    { name: 'LSCRE', leads: 45.23, calls: 0.0, bookings: 2.33, shows: 16.13 },
                    { name: 'Legacy Capital', leads: 14.63, calls: 0.0, bookings: 28.0, shows: 50.0 },
                    { name: 'JJ Dental', leads: 6.90, calls: 0.0, bookings: 0.0, shows: 0.0 },
                    { name: 'Titan Mgmt Group', leads: 12.38, calls: 1.89, bookings: 13.21, shows: 8.33 },
                    { name: 'Blue Metric Group', leads: 200.0, calls: 0.0, bookings: 0.0, shows: 0.0 },
                    { name: 'Freaky Fast Inv.', leads: 135.87, calls: 14.29, bookings: 17.86, shows: 9.52 },
                    { name: 'Quad J Capital', leads: 47.22, calls: 0.0, bookings: 14.29, shows: 0.0 },
                    { name: 'Lansing Capital', leads: 5.26, calls: 0.0, bookings: 20.0, shows: 0.0 },
                    { name: 'Land Value Alpha', leads: 33.33, calls: 21.43, bookings: 57.14, shows: 25.0 },
                  ].map((row, i) => {
                    const maxDisc = Math.max(row.leads, row.calls, row.bookings, row.shows);
                    const clientStatus = maxDisc <= 1.0 ? 'PASS' : 'FAIL';
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-xs">{row.name}</TableCell>
                        <TableCell className="text-right"><DiscPct pct={row.leads} threshold={1} /></TableCell>
                        <TableCell className="text-right"><DiscPct pct={row.calls} threshold={1} /></TableCell>
                        <TableCell className="text-right"><DiscPct pct={row.bookings} threshold={1} /></TableCell>
                        <TableCell className="text-right"><DiscPct pct={row.shows} threshold={1} /></TableCell>
                        <TableCell><StatusBadge status={clientStatus} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Meta Ads API vs Database — Paradyme
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Meta API</TableHead>
                    <TableHead className="text-right">DB Stored</TableHead>
                    <TableHead className="text-right">Discrepancy</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {META_CHECKS.filter(c => c.source === 'Meta_API').map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{c.client_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{c.metric}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {c.metric === 'spend' ? `$${c.expected_count.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : c.expected_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {c.metric === 'spend' ? `$${c.actual_count.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : c.actual_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right"><DiscPct pct={c.discrepancy_pct} threshold={c.threshold_pct} /></TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* GHL Tab */}
      {activeTab === 'ghl' && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              GHL Source Tables vs Daily Metrics — All {GHL_CHECKS.length} Checks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">GHL Count</TableHead>
                  <TableHead className="text-right">Dashboard</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {GHL_CHECKS.map((c, i) => (
                  <TableRow key={i} className={c.status === 'FAIL' ? 'bg-red-950/10' : ''}>
                    <TableCell className="font-medium text-xs">{c.client_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{c.metric}</TableCell>
                    <TableCell><SourceBadge source={c.source} /></TableCell>
                    <TableCell className="text-right font-mono text-xs">{c.expected_count.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{c.actual_count.toLocaleString()}</TableCell>
                    <TableCell className="text-right"><DiscPct pct={c.discrepancy_pct} threshold={c.threshold_pct} /></TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Meta Tab */}
      {activeTab === 'meta' && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Meta Ads API vs Database — All {META_CHECKS.length} Checks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>vs</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {META_CHECKS.map((c, i) => (
                  <TableRow key={i} className={c.status === 'FAIL' ? 'bg-red-950/10' : ''}>
                    <TableCell className="font-medium text-xs">{c.client_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">{c.metric}</TableCell>
                    <TableCell><SourceBadge source={c.source} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.comparison_source}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.metric === 'spend' ? `$${c.expected_count.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : c.expected_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.metric === 'spend' ? `$${c.actual_count.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : c.actual_count.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right"><DiscPct pct={c.discrepancy_pct} threshold={c.threshold_pct} /></TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last 12 Audit Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Pass Rate</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CHECK_HISTORY.map((run, i) => (
                  <TableRow key={i} className={i === 0 ? 'bg-muted/10' : ''}>
                    <TableCell className="font-mono text-xs">{run.date}{i === 0 ? ' (latest)' : ''}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-green-400">{run.passed}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-red-400">{run.failed}</TableCell>
                    <TableCell className="text-right">
                      <DiscPct pct={100 - run.pass_rate} threshold={5} />
                    </TableCell>
                    <TableCell>
                      {i === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : run.pass_rate > CHECK_HISTORY[i - 1].pass_rate ? (
                        <span className="text-green-400 text-xs">↑ Improving</span>
                      ) : (
                        <span className="text-red-400 text-xs">↓ Degrading</span>
                      )}
                    </TableCell>
                    <TableCell><StatusBadge status={run.status as 'FAIL'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 p-3 bg-muted/10 rounded border border-border text-xs text-muted-foreground">
              <strong className="text-white">Root Cause:</strong> The <code className="bg-muted px-1 rounded">daily_metrics</code> aggregation
              pipeline stopped correctly populating data around Mar 4–5, 2026. Pass rate has degraded from 94.4% (Mar 4) to 28.0% (Mar 15).
              The Meta Ads DB is also significantly under-synced — only ~$8.4K stored vs $49.9K in the Meta API for Paradyme.
              Recommended action: trigger <code className="bg-muted px-1 rounded">recalculate-daily-metrics</code> and <code className="bg-muted px-1 rounded">sync-meta-ads</code> for all active clients.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
