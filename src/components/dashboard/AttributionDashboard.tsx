import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Layers, Target } from 'lucide-react';

interface Lead {
  id: string;
  campaign_name?: string | null;
  ad_set_name?: string | null;
  ad_id?: string | null;
}

interface Call {
  id: string;
  lead_id?: string | null;
  showed?: boolean | null;
  outcome?: string | null;
}

interface FundedInvestor {
  id: string;
  lead_id?: string | null;
}

interface AttributionDashboardProps {
  leads: Lead[];
  calls: Call[];
  fundedInvestors: FundedInvestor[];
}

interface AttributionData {
  name: string;
  leads: number;
  bookedCalls: number;
  showedCalls: number;
  fundedInvestors: number;
}

export function AttributionDashboard({ leads, calls, fundedInvestors }: AttributionDashboardProps) {
  const [view, setView] = useState<'campaign' | 'adset' | 'ad'>('campaign');

  // Create lead lookup map for calls and funded investors
  const leadMap = useMemo(() => {
    const map: Record<string, Lead> = {};
    leads.forEach(lead => {
      map[lead.id] = lead;
    });
    return map;
  }, [leads]);

  // Aggregate data by dimension
  const attributionData = useMemo(() => {
    const aggregated: Record<string, AttributionData> = {};

    // Process leads
    leads.forEach(lead => {
      let key: string | null = null;
      
      if (view === 'campaign') {
        key = lead.campaign_name || 'Unknown Campaign';
      } else if (view === 'adset') {
        key = lead.ad_set_name || 'Unknown Ad Set';
      } else {
        key = lead.ad_id || 'Unknown Ad';
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          name: key,
          leads: 0,
          bookedCalls: 0,
          showedCalls: 0,
          fundedInvestors: 0,
        };
      }
      aggregated[key].leads++;
    });

    // Process calls (join via lead_id)
    calls.forEach(call => {
      if (!call.lead_id) return;
      const lead = leadMap[call.lead_id];
      if (!lead) return;

      let key: string | null = null;
      if (view === 'campaign') {
        key = lead.campaign_name || 'Unknown Campaign';
      } else if (view === 'adset') {
        key = lead.ad_set_name || 'Unknown Ad Set';
      } else {
        key = lead.ad_id || 'Unknown Ad';
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          name: key,
          leads: 0,
          bookedCalls: 0,
          showedCalls: 0,
          fundedInvestors: 0,
        };
      }

      aggregated[key].bookedCalls++;
      if (call.showed) {
        aggregated[key].showedCalls++;
      }
    });

    // Process funded investors (join via lead_id)
    fundedInvestors.forEach(investor => {
      if (!investor.lead_id) return;
      const lead = leadMap[investor.lead_id];
      if (!lead) return;

      let key: string | null = null;
      if (view === 'campaign') {
        key = lead.campaign_name || 'Unknown Campaign';
      } else if (view === 'adset') {
        key = lead.ad_set_name || 'Unknown Ad Set';
      } else {
        key = lead.ad_id || 'Unknown Ad';
      }

      if (!aggregated[key]) {
        aggregated[key] = {
          name: key,
          leads: 0,
          bookedCalls: 0,
          showedCalls: 0,
          fundedInvestors: 0,
        };
      }

      aggregated[key].fundedInvestors++;
    });

    // Sort by leads descending
    return Object.values(aggregated).sort((a, b) => b.leads - a.leads);
  }, [leads, calls, fundedInvestors, leadMap, view]);

  const hasData = attributionData.length > 0 && attributionData.some(d => d.leads > 0);

  if (!hasData) {
    return null;
  }

  // Limit chart data to top 10
  const chartData = attributionData.slice(0, 10);

  return (
    <Card className="border-2 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Attribution Dashboard
          </CardTitle>
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="h-8">
              <TabsTrigger value="campaign" className="text-xs px-3 h-7">
                <Layers className="h-3 w-3 mr-1" />
                Campaigns
              </TabsTrigger>
              <TabsTrigger value="adset" className="text-xs px-3 h-7">
                <Target className="h-3 w-3 mr-1" />
                Ad Sets
              </TabsTrigger>
              <TabsTrigger value="ad" className="text-xs px-3 h-7">
                Ads
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bar Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs fill-muted-foreground" />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={120} 
                className="text-xs fill-muted-foreground"
                tickFormatter={(value) => value.length > 15 ? `${value.slice(0, 15)}...` : value}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }} 
              />
              <Legend />
              <Bar dataKey="leads" name="Leads" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="bookedCalls" name="Booked Calls" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="showedCalls" name="Showed Calls" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="fundedInvestors" name="Funded" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Data Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{view === 'campaign' ? 'Campaign' : view === 'adset' ? 'Ad Set' : 'Ad'}</TableHead>
                <TableHead className="text-right tabular-nums">Leads</TableHead>
                <TableHead className="text-right tabular-nums">Booked</TableHead>
                <TableHead className="text-right tabular-nums">Showed</TableHead>
                <TableHead className="text-right tabular-nums">Funded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attributionData.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium max-w-[200px] truncate" title={row.name}>
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.bookedCalls}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.showedCalls}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.fundedInvestors}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
