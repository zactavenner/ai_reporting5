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
import { Download, Save, X, Pencil, Trash2, Plus } from 'lucide-react';
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
  const [isAdding, setIsAdding] = useState(false);
  const [newRecord, setNewRecord] = useState({
    date: new Date().toISOString().split('T')[0],
    ad_spend: 0,
    impressions: 0,
    clicks: 0,
  });
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

  const deleteRecord = async (metricId: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    
    try {
      const { error } = await supabase
        .from('daily_metrics')
        .delete()
        .eq('id', metricId);

      if (error) throw error;

      toast.success('Record deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to delete record: ' + error.message);
    }
  };

  const addRecord = async () => {
    if (!clientId) return;
    
    try {
      const { error } = await supabase
        .from('daily_metrics')
        .upsert({
          client_id: clientId,
          date: newRecord.date,
          ad_spend: newRecord.ad_spend,
          impressions: newRecord.impressions,
          clicks: newRecord.clicks,
        }, { onConflict: 'client_id,date' });

      if (error) throw error;

      toast.success('Record added successfully');
      setIsAdding(false);
      setNewRecord({
        date: new Date().toISOString().split('T')[0],
        ad_spend: 0,
        impressions: 0,
        clicks: 0,
      });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to add record: ' + error.message);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Ad Spend Records ({metrics.length})</DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Record
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isAdding && (
            <div className="border border-border bg-muted/50 p-4 mb-4 rounded-lg">
              <h4 className="font-semibold mb-3">Add New Ad Spend Record</h4>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Date</label>
                  <Input
                    type="date"
                    value={newRecord.date}
                    onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Ad Spend ($)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newRecord.ad_spend}
                    onChange={(e) => setNewRecord({ ...newRecord, ad_spend: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Impressions</label>
                  <Input
                    type="number"
                    value={newRecord.impressions}
                    onChange={(e) => setNewRecord({ ...newRecord, impressions: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Clicks</label>
                  <Input
                    type="number"
                    value={newRecord.clicks}
                    onChange={(e) => setNewRecord({ ...newRecord, clicks: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button size="sm" onClick={addRecord}>Add Record</Button>
              </div>
            </div>
          )}

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
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(metric)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteRecord(metric.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
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
