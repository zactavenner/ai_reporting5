import { useState } from 'react';
import { useClients } from '@/hooks/useClients';
import { useQuizFunnels, useCreateQuizFunnel, useDeleteQuizFunnel, QuizFunnel } from '@/hooks/useQuizFunnels';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function QuizBuilderTab() {
  const { data: clients = [] } = useClients();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { data: funnels = [], isLoading } = useQuizFunnels(selectedClientId || undefined);
  const allFunnels = useQuizFunnels();
  const displayFunnels = selectedClientId ? funnels : (allFunnels.data || []);
  const createFunnel = useCreateQuizFunnel();
  const deleteFunnel = useDeleteQuizFunnel();

  const clientMap: Record<string, string> = {};
  clients.forEach(c => { clientMap[c.id] = c.name; });

  const handleCreate = async () => {
    if (!selectedClientId) { toast.error('Select a client first'); return; }
    const client = clients.find(c => c.id === selectedClientId);
    try {
      await createFunnel.mutateAsync({ client_id: selectedClientId, name: `${client?.name || 'New'} Quiz`, title: `Invest in ${client?.name || 'Opportunity'}` } as any);
      toast.success('Quiz funnel created');
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div><h2 className="text-lg font-bold">Quiz Builder</h2><p className="text-sm text-muted-foreground">Create multi-step qualifying quiz funnels</p></div>
        <div className="flex items-center gap-3">
          <Select value={selectedClientId || ''} onValueChange={(v) => setSelectedClientId(v || null)}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent><SelectItem value="">All Clients</SelectItem>{clients.map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent>
          </Select>
          <Button onClick={handleCreate} disabled={!selectedClientId || createFunnel.isPending}><Plus className="h-4 w-4 mr-2" />New Quiz</Button>
        </div>
      </div>
      {displayFunnels.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No quiz funnels yet. Select a client and create one.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayFunnels.map(funnel => (
            <Card key={funnel.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1"><CardTitle className="text-base">{funnel.name}</CardTitle><p className="text-xs text-muted-foreground">{clientMap[funnel.client_id] || 'Unknown'}</p></div>
                  <Badge variant={funnel.is_active ? 'default' : 'secondary'}>{funnel.is_active ? 'Active' : 'Inactive'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {funnel.slug && <p className="text-xs font-mono text-muted-foreground truncate">/quiz/{funnel.slug}</p>}
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/quiz/${funnel.slug || funnel.id}`); toast.success('Link copied'); }}><Copy className="h-3.5 w-3.5 mr-1" />Link</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteFunnel.mutate(funnel.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
