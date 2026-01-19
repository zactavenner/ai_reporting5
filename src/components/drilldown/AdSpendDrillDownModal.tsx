import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Save, X, Pencil } from 'lucide-react';
import { useDailyMetrics, DailyMetric } from '@/hooks/useMetrics';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface AdSpendDrillDownModalProps {
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdSpendDrillDownModal({ clientId, open, onOpenChange }: AdSpendDrillDownModalProps) {
  const { data: metrics = [], isLoading } = useDailyMetrics(clientId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<DailyMetric>>({});
  const queryClient = useQueryClient();

  const handleExport = () => {
    exportToCSV(metrics, 'ad-spend-metrics');
  };

  const startEdit = (metric: DailyMetric) => {
    setEditingId(metric.id);
    setEditValues({
      ad_spend: metric.ad_spend,
      impressions: metric.impressions,
      clicks: metric.clicks,
      leads: metric.leads,
      calls: metric.calls,
      showed_calls: metric.showed_calls,
      funded_investors: metric.funded_investors,
      funded_dollars: metric.funded_dollars,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (metricId: string) => {
    try {
      const { error } = await supabase
        .from('daily_metrics')
        .update({
          ad_spend: editValues.ad_spend,
          impressions: editValues.impressions,
          clicks: editValues.clicks,
          leads: editValues.leads,
          calls: editValues.calls,
          showed_calls: editValues.showed_calls,
          funded_investors: editValues.funded_investors,
          funded_dollars: editValues.funded_dollars,
        })
        .eq('id', metricId);

      if (error) throw error;

      toast.success('Record updated successfully');
      setEditingId(null);
      setEditValues({});
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to update record: ' + error.message);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Ad Spend Records ({metrics.length})</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading records...</div>
          ) : metrics.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No ad spend records found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">Date</TableHead>
                  <TableHead className="font-bold text-right">Ad Spend</TableHead>
                  <TableHead className="font-bold text-right">Impressions</TableHead>
                  <TableHead className="font-bold text-right">Clicks</TableHead>
                  <TableHead className="font-bold text-right">Leads</TableHead>
                  <TableHead className="font-bold text-right">Calls</TableHead>
                  <TableHead className="font-bold text-right">Showed</TableHead>
                  <TableHead className="font-bold text-right">Funded</TableHead>
                  <TableHead className="font-bold text-right">$ Funded</TableHead>
                  <TableHead className="font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => (
                  <TableRow key={metric.id} className="border-b">
                    <TableCell className="font-medium">{metric.date}</TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.ad_spend ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, ad_spend: parseFloat(e.target.value) || 0 })}
                          className="w-24 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono text-chart-1">{formatCurrency(metric.ad_spend)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          value={editValues.impressions ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, impressions: parseInt(e.target.value) || 0 })}
                          className="w-24 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono">{(metric.impressions || 0).toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          value={editValues.clicks ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, clicks: parseInt(e.target.value) || 0 })}
                          className="w-20 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono">{(metric.clicks || 0).toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          value={editValues.leads ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, leads: parseInt(e.target.value) || 0 })}
                          className="w-16 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono">{metric.leads || 0}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          value={editValues.calls ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, calls: parseInt(e.target.value) || 0 })}
                          className="w-16 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono">{metric.calls || 0}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          value={editValues.showed_calls ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, showed_calls: parseInt(e.target.value) || 0 })}
                          className="w-16 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono">{metric.showed_calls || 0}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          value={editValues.funded_investors ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, funded_investors: parseInt(e.target.value) || 0 })}
                          className="w-16 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono">{metric.funded_investors || 0}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === metric.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editValues.funded_dollars ?? ''}
                          onChange={(e) => setEditValues({ ...editValues, funded_dollars: parseFloat(e.target.value) || 0 })}
                          className="w-24 h-8 text-right"
                        />
                      ) : (
                        <span className="font-mono text-chart-2">{formatCurrency(metric.funded_dollars)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === metric.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveEdit(metric.id)}>
                            <Save className="h-4 w-4 text-chart-2" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(metric)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}