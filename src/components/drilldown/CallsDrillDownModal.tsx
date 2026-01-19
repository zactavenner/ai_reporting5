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
import { Badge } from '@/components/ui/badge';
import { Download, Trash2, Plus } from 'lucide-react';
import { useCalls, Call } from '@/hooks/useLeadsAndCalls';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface CallsDrillDownModalProps {
  clientId?: string;
  showedOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CallWithLead extends Call {
  lead?: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export function CallsDrillDownModal({ clientId, showedOnly, open, onOpenChange }: CallsDrillDownModalProps) {
  const { data: calls = [], isLoading } = useCalls(clientId, showedOnly);
  const [isAdding, setIsAdding] = useState(false);
  const [newCall, setNewCall] = useState({
    scheduled_at: new Date().toISOString().slice(0, 16),
    showed: false,
    outcome: '',
  });
  const queryClient = useQueryClient();
  const title = showedOnly ? 'Showed Calls' : 'All Calls';

  const handleExport = () => {
    exportToCSV(calls, showedOnly ? 'showed-calls' : 'calls');
  };

  const deleteCall = async (callId: string) => {
    if (!confirm('Are you sure you want to delete this call?')) return;
    
    try {
      const { error } = await supabase
        .from('calls')
        .delete()
        .eq('id', callId);

      if (error) throw error;

      toast.success('Call deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to delete call: ' + error.message);
    }
  };

  const addCall = async () => {
    if (!clientId) return;
    
    try {
      const { error } = await supabase
        .from('calls')
        .insert({
          client_id: clientId,
          external_id: `manual-${Date.now()}`,
          scheduled_at: newCall.scheduled_at ? new Date(newCall.scheduled_at).toISOString() : null,
          showed: newCall.showed,
          outcome: newCall.outcome || null,
        });

      if (error) throw error;

      toast.success('Call added successfully');
      setIsAdding(false);
      setNewCall({
        scheduled_at: new Date().toISOString().slice(0, 16),
        showed: false,
        outcome: '',
      });
      queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
    } catch (error: any) {
      toast.error('Failed to add call: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{title} ({calls.length})</DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Call
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
              <h4 className="font-semibold mb-3">Add New Call</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Scheduled Date/Time</label>
                  <Input
                    type="datetime-local"
                    value={newCall.scheduled_at}
                    onChange={(e) => setNewCall({ ...newCall, scheduled_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Showed</label>
                  <div className="flex items-center gap-2 h-10">
                    <input
                      type="checkbox"
                      checked={newCall.showed}
                      onChange={(e) => setNewCall({ ...newCall, showed: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Prospect showed up</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Outcome</label>
                  <Input
                    value={newCall.outcome}
                    onChange={(e) => setNewCall({ ...newCall, outcome: e.target.value })}
                    placeholder="e.g., Committed, Follow-up, No interest"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button size="sm" onClick={addCall}>Add Call</Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading calls...</div>
          ) : calls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No calls found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">Date/Time</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Outcome</TableHead>
                  <TableHead className="font-bold">Created</TableHead>
                  <TableHead className="font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call: Call) => (
                  <TableRow key={call.id} className="border-b">
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
                    <TableCell className="font-mono text-sm">
                      {new Date(call.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteCall(call.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
