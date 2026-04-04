import { useState, useMemo } from 'react';
import { RefreshCw, Trophy, FileText, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClients } from '@/hooks/useClients';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function fmt$(val: number | null) {
  if (!val) return '$0';
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface AdminAdsManagerTabProps { platform?: 'meta' | 'google' | 'all'; }

export function AdminAdsManagerTab({ platform = 'all' }: AdminAdsManagerTabProps) {
  const { data: clients = [] } = useClients();
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<string>('campaigns');

  const { data: allCampaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['admin-all-campaigns', clientFilter],
    queryFn: async () => {
      let q = (supabase as any).from('meta_campaigns').select('*').order('spend', { ascending: false });
      if (clientFilter !== 'all') q = q.eq('client_id', clientFilter);
      const { data, error } = await q;
      if (error) return [];
      return data || [];
    },
  });

  const clientMap = useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [clients]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">Ads Manager</h2>
          <p className="text-sm text-muted-foreground">Agency-wide view of campaigns and performance</p>
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center"><p className="text-2xl font-bold">{allCampaigns.length}</p><p className="text-xs text-muted-foreground">Campaigns</p></Card>
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-1.5"><Filter className="h-3.5 w-3.5" />Campaigns</TabsTrigger>
          <TabsTrigger value="winning" className="gap-1.5"><Trophy className="h-3.5 w-3.5" />Proven Winners</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="space-y-4">
          {campaignsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading campaigns...</div>
          ) : allCampaigns.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
              <p className="text-muted-foreground">No campaigns found. Sync Meta Ads from a client's settings.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Campaign</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader>
                <TableBody>
                  {allCampaigns.slice(0, 50).map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium">{clientMap[c.client_id] || 'Unknown'}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[300px] truncate">{c.name}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt$(c.spend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="winning">
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Run attribution on client ads to identify top performers</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
