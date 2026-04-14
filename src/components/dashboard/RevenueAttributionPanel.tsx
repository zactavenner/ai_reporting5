import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  DollarSign,
  Layers,
  Target,
  MousePointerClick,
  ChevronRight,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttributionModel =
  | 'first_touch'
  | 'last_touch'
  | 'linear'
  | 'time_decay'
  | 'position_based';

interface Touchpoint {
  campaign_id: string;
  campaign_name: string;
  ad_set_name?: string | null;
  ad_name?: string | null;
  channel: string;
  touched_at: string;
  spend: number;
}

interface Deal {
  id: string;
  revenue: number;
  closed_at: string;
  touchpoints: Touchpoint[];
}

export interface RevenueAttributionPanelProps {
  deals: Deal[];
}

interface CampaignRow {
  campaign_id: string;
  campaign_name: string;
  channel: string;
  attributed_revenue: number;
  attributed_spend: number;
  roas: number;
  deal_count: number;
  touchpoint_count: number;
  ad_sets: AdSetRow[];
}

interface AdSetRow {
  ad_set_name: string;
  attributed_revenue: number;
  attributed_spend: number;
  roas: number;
  deal_count: number;
  ads: AdRow[];
}

interface AdRow {
  ad_name: string;
  attributed_revenue: number;
  attributed_spend: number;
  roas: number;
  deal_count: number;
}

// ---------------------------------------------------------------------------
// Attribution helpers
// ---------------------------------------------------------------------------

const MODEL_LABELS: Record<AttributionModel, string> = {
  first_touch: 'First Touch',
  last_touch: 'Last Touch',
  linear: 'Linear',
  time_decay: 'Time Decay',
  position_based: 'Position-Based',
};

const MODEL_DESCRIPTIONS: Record<AttributionModel, string> = {
  first_touch: '100% credit to the first campaign interaction.',
  last_touch: '100% credit to the last campaign interaction before close.',
  linear: 'Equal credit split across every touchpoint.',
  time_decay:
    'Exponentially more credit to touchpoints closer to the close date.',
  position_based:
    '40% first touch, 40% last touch, 20% split among middle touchpoints.',
};

function computeWeights(
  touchpoints: Touchpoint[],
  model: AttributionModel,
  closedAt: string,
): number[] {
  const n = touchpoints.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  switch (model) {
    case 'first_touch': {
      const w = new Array(n).fill(0);
      w[0] = 1;
      return w;
    }
    case 'last_touch': {
      const w = new Array(n).fill(0);
      w[n - 1] = 1;
      return w;
    }
    case 'linear': {
      return new Array(n).fill(1 / n);
    }
    case 'time_decay': {
      const closeTime = new Date(closedAt).getTime();
      const halfLife = 7 * 24 * 60 * 60 * 1000; // 7-day half-life
      const raw = touchpoints.map((tp) => {
        const diff = closeTime - new Date(tp.touched_at).getTime();
        return Math.pow(2, -diff / halfLife);
      });
      const total = raw.reduce((a, b) => a + b, 0);
      return raw.map((r) => r / total);
    }
    case 'position_based': {
      const w = new Array(n).fill(0);
      w[0] = 0.4;
      w[n - 1] = 0.4;
      const middleCount = n - 2;
      if (middleCount > 0) {
        const middleShare = 0.2 / middleCount;
        for (let i = 1; i < n - 1; i++) {
          w[i] = middleShare;
        }
      } else {
        // Only 2 touchpoints -- split the remaining 20%
        w[0] += 0.1;
        w[n - 1] += 0.1;
      }
      return w;
    }
    default:
      return new Array(n).fill(1 / n);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RevenueAttributionPanel({ deals }: RevenueAttributionPanelProps) {
  const [model, setModel] = useState<AttributionModel>('position_based');
  const [drillCampaign, setDrillCampaign] = useState<string | null>(null);
  const [drillAdSet, setDrillAdSet] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'attributed_revenue' | 'roas' | 'deal_count'>(
    'attributed_revenue',
  );

  // ---- Attribution computation ----
  const campaignRows = useMemo(() => {
    const map: Record<
      string,
      {
        campaign_id: string;
        campaign_name: string;
        channel: string;
        revenue: number;
        spend: number;
        deals: Set<string>;
        touchpoints: number;
        adSets: Record<
          string,
          {
            revenue: number;
            spend: number;
            deals: Set<string>;
            ads: Record<
              string,
              { revenue: number; spend: number; deals: Set<string> }
            >;
          }
        >;
      }
    > = {};

    for (const deal of deals) {
      const sorted = [...deal.touchpoints].sort(
        (a, b) =>
          new Date(a.touched_at).getTime() - new Date(b.touched_at).getTime(),
      );
      const weights = computeWeights(sorted, model, deal.closed_at);

      sorted.forEach((tp, idx) => {
        const w = weights[idx];
        const rev = deal.revenue * w;
        const sp = tp.spend * w;

        if (!map[tp.campaign_id]) {
          map[tp.campaign_id] = {
            campaign_id: tp.campaign_id,
            campaign_name: tp.campaign_name,
            channel: tp.channel,
            revenue: 0,
            spend: 0,
            deals: new Set(),
            touchpoints: 0,
            adSets: {},
          };
        }
        const c = map[tp.campaign_id];
        c.revenue += rev;
        c.spend += sp;
        c.deals.add(deal.id);
        c.touchpoints += 1;

        const adSetKey = tp.ad_set_name ?? 'Unknown Ad Set';
        if (!c.adSets[adSetKey]) {
          c.adSets[adSetKey] = { revenue: 0, spend: 0, deals: new Set(), ads: {} };
        }
        const as = c.adSets[adSetKey];
        as.revenue += rev;
        as.spend += sp;
        as.deals.add(deal.id);

        const adKey = tp.ad_name ?? 'Unknown Ad';
        if (!as.ads[adKey]) {
          as.ads[adKey] = { revenue: 0, spend: 0, deals: new Set() };
        }
        const ad = as.ads[adKey];
        ad.revenue += rev;
        ad.spend += sp;
        ad.deals.add(deal.id);
      });
    }

    const rows: CampaignRow[] = Object.values(map).map((c) => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      channel: c.channel,
      attributed_revenue: c.revenue,
      attributed_spend: c.spend,
      roas: c.spend > 0 ? c.revenue / c.spend : 0,
      deal_count: c.deals.size,
      touchpoint_count: c.touchpoints,
      ad_sets: Object.entries(c.adSets)
        .map(([name, as]) => ({
          ad_set_name: name,
          attributed_revenue: as.revenue,
          attributed_spend: as.spend,
          roas: as.spend > 0 ? as.revenue / as.spend : 0,
          deal_count: as.deals.size,
          ads: Object.entries(as.ads)
            .map(([adName, ad]) => ({
              ad_name: adName,
              attributed_revenue: ad.revenue,
              attributed_spend: ad.spend,
              roas: ad.spend > 0 ? ad.revenue / ad.spend : 0,
              deal_count: ad.deals.size,
            }))
            .sort((a, b) => b.attributed_revenue - a.attributed_revenue),
        }))
        .sort((a, b) => b.attributed_revenue - a.attributed_revenue),
    }));

    rows.sort((a, b) => b[sortField] - a[sortField]);
    return rows;
  }, [deals, model, sortField]);

  // Totals
  const totals = useMemo(() => {
    let revenue = 0;
    let spend = 0;
    let dealIds = new Set<string>();
    for (const r of campaignRows) {
      revenue += r.attributed_revenue;
      spend += r.attributed_spend;
      dealIds = new Set([...dealIds, ...deals.filter(() => true).map((d) => d.id)]);
    }
    return {
      revenue,
      spend,
      roas: spend > 0 ? revenue / spend : 0,
      deals: deals.length,
    };
  }, [campaignRows, deals]);

  // Chart data (top 8)
  const chartData = useMemo(() => {
    return campaignRows.slice(0, 8).map((r) => ({
      name:
        r.campaign_name.length > 22
          ? r.campaign_name.slice(0, 22) + '...'
          : r.campaign_name,
      Revenue: Math.round(r.attributed_revenue),
      Spend: Math.round(r.attributed_spend),
    }));
  }, [campaignRows]);

  // Drill-down state
  const activeCampaign = campaignRows.find((r) => r.campaign_id === drillCampaign) ?? null;
  const activeAdSets = activeCampaign?.ad_sets ?? [];
  const activeAdSet = activeAdSets.find((as) => as.ad_set_name === drillAdSet) ?? null;

  const hasData = campaignRows.length > 0;

  // Format helpers
  const fmtCurrency = (v: number) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `$${(v / 1_000).toFixed(1)}K`
        : `$${v.toFixed(0)}`;

  const fmtRoas = (v: number) => `${v.toFixed(2)}x`;

  const roasColor = (v: number) => {
    if (v >= 5) return 'text-chart-4 font-semibold';
    if (v >= 2) return 'text-chart-3 font-medium';
    if (v > 0) return 'text-destructive font-medium';
    return 'text-muted-foreground';
  };

  // ---- Render ----
  return (
    <Card className="border-2 border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Revenue Attribution
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            {/* Attribution Model Selector */}
            <Select
              value={model}
              onValueChange={(v) => setModel(v as AttributionModel)}
            >
              <SelectTrigger className="w-[170px] h-8 text-xs">
                <Layers className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODEL_LABELS) as AttributionModel[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TooltipProvider>
              <UITooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  {MODEL_DESCRIPTIONS[model]}
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>

            {/* Sort */}
            <Tabs
              value={sortField}
              onValueChange={(v) =>
                setSortField(v as typeof sortField)
              }
            >
              <TabsList className="h-8">
                <TabsTrigger value="attributed_revenue" className="text-xs px-3 h-7">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Revenue
                </TabsTrigger>
                <TabsTrigger value="roas" className="text-xs px-3 h-7">
                  <Target className="h-3 w-3 mr-1" />
                  ROAS
                </TabsTrigger>
                <TabsTrigger value="deal_count" className="text-xs px-3 h-7">
                  <MousePointerClick className="h-3 w-3 mr-1" />
                  Deals
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <Badge variant="secondary" className="text-xs py-1 px-2.5">
            Total Revenue: {fmtCurrency(totals.revenue)}
          </Badge>
          <Badge variant="secondary" className="text-xs py-1 px-2.5">
            Total Spend: {fmtCurrency(totals.spend)}
          </Badge>
          <Badge variant="secondary" className="text-xs py-1 px-2.5">
            Blended ROAS: {fmtRoas(totals.roas)}
          </Badge>
          <Badge variant="secondary" className="text-xs py-1 px-2.5">
            Deals: {totals.deals}
          </Badge>
          <Badge variant="outline" className="text-xs py-1 px-2.5">
            Model: {MODEL_LABELS[model]}
          </Badge>
        </div>

        {/* Breadcrumb for drill-down */}
        {drillCampaign && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
            <button
              onClick={() => {
                setDrillCampaign(null);
                setDrillAdSet(null);
              }}
              className="hover:text-foreground transition-colors underline"
            >
              All Campaigns
            </button>
            <ChevronRight className="h-3 w-3" />
            <button
              onClick={() => setDrillAdSet(null)}
              className={cn(
                'transition-colors',
                drillAdSet
                  ? 'hover:text-foreground underline'
                  : 'text-foreground font-medium',
              )}
            >
              {activeCampaign?.campaign_name ?? drillCampaign}
            </button>
            {drillAdSet && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground font-medium">{drillAdSet}</span>
              </>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {!hasData ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No revenue attribution data available.</p>
            <p className="text-sm mt-1">
              Ensure deals have associated campaign touchpoints to populate this
              panel.
            </p>
          </div>
        ) : drillCampaign === null ? (
          <>
            {/* Campaign-level bar chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    type="number"
                    className="text-xs fill-muted-foreground"
                    tickFormatter={(v: number) => fmtCurrency(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    className="text-xs fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => fmtCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="Revenue"
                    fill="hsl(var(--chart-4))"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="Spend"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Campaign table */}
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right tabular-nums">Channel</TableHead>
                    <TableHead className="text-right tabular-nums">Revenue</TableHead>
                    <TableHead className="text-right tabular-nums">Spend</TableHead>
                    <TableHead className="text-right tabular-nums">ROAS</TableHead>
                    <TableHead className="text-right tabular-nums">Deals</TableHead>
                    <TableHead className="text-right tabular-nums">Touches</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignRows.map((row) => (
                    <TableRow
                      key={row.campaign_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDrillCampaign(row.campaign_id)}
                    >
                      <TableCell
                        className="font-medium max-w-[200px] truncate"
                        title={row.campaign_name}
                      >
                        {row.campaign_name}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {row.channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(row.attributed_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(row.attributed_spend)}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', roasColor(row.roas))}>
                        {fmtRoas(row.roas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.deal_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.touchpoint_count}
                      </TableCell>
                      <TableCell className="w-8">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : drillAdSet === null ? (
          <>
            {/* Ad Set drill-down */}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs mb-2"
              onClick={() => setDrillCampaign(null)}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              Back to Campaigns
            </Button>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad Set</TableHead>
                    <TableHead className="text-right tabular-nums">Revenue</TableHead>
                    <TableHead className="text-right tabular-nums">Spend</TableHead>
                    <TableHead className="text-right tabular-nums">ROAS</TableHead>
                    <TableHead className="text-right tabular-nums">Deals</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeAdSets.map((as) => (
                    <TableRow
                      key={as.ad_set_name}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDrillAdSet(as.ad_set_name)}
                    >
                      <TableCell
                        className="font-medium max-w-[220px] truncate"
                        title={as.ad_set_name}
                      >
                        {as.ad_set_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(as.attributed_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(as.attributed_spend)}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', roasColor(as.roas))}>
                        {fmtRoas(as.roas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {as.deal_count}
                      </TableCell>
                      <TableCell className="w-8">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <>
            {/* Ad drill-down */}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs mb-2"
              onClick={() => setDrillAdSet(null)}
            >
              <ArrowLeft className="h-3 w-3 mr-1" />
              Back to Ad Sets
            </Button>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead className="text-right tabular-nums">Revenue</TableHead>
                    <TableHead className="text-right tabular-nums">Spend</TableHead>
                    <TableHead className="text-right tabular-nums">ROAS</TableHead>
                    <TableHead className="text-right tabular-nums">Deals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(activeAdSet?.ads ?? []).map((ad) => (
                    <TableRow key={ad.ad_name}>
                      <TableCell
                        className="font-medium max-w-[220px] truncate"
                        title={ad.ad_name}
                      >
                        {ad.ad_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(ad.attributed_revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(ad.attributed_spend)}
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', roasColor(ad.roas))}>
                        {fmtRoas(ad.roas)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ad.deal_count}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
