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
import { Download, Trash2, Plus } from 'lucide-react';
import { useFundedInvestors, FundedInvestor } from '@/hooks/useMetrics';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface FundedInvestorsDrillDownModalProps {
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FundedInvestorsDrillDownModal({ clientId, open, onOpenChange }: FundedInvestorsDrillDownModalProps) {
  const { data: investors = [], isLoading } = useFundedInvestors(clientId);
  const [isAdding, setIsAdding] = useState(false);
  const [newInvestor, setNewInvestor] = useState({
    name: '',
    funded_amount: 0,
    funded_at: new Date().toISOString().split('T')[0],
    first_contact_at: '',
    calls_to_fund: 0,
  });
  const queryClient = useQueryClient();

  const handleExport = () => {
    exportToCSV(investors, 'funded-investors');
  };

  const deleteInvestor = async (investorId: string) => {
    if (!confirm('Are you sure you want to delete this funded investor record?')) return;
    
    try {
      const { error } = await supabase
        .from('funded_investors')
        .delete()
        .eq('id', investorId);

      if (error) throw error;

      toast.success('Investor deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['funded-investors', clientId] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to delete investor: ' + error.message);
    }
  };

  const addInvestor = async () => {
    if (!clientId) return;
    
    // Calculate time to fund if both dates provided
    let timeToFund: number | null = null;
    if (newInvestor.first_contact_at && newInvestor.funded_at) {
      const firstContact = new Date(newInvestor.first_contact_at);
      const fundedDate = new Date(newInvestor.funded_at);
      timeToFund = Math.ceil((fundedDate.getTime() - firstContact.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    try {
      const { error } = await supabase
        .from('funded_investors')
        .insert({
          client_id: clientId,
          external_id: `manual-${Date.now()}`,
          name: newInvestor.name || null,
          funded_amount: newInvestor.funded_amount,
          funded_at: new Date(newInvestor.funded_at).toISOString(),
          first_contact_at: newInvestor.first_contact_at ? new Date(newInvestor.first_contact_at).toISOString() : null,
          time_to_fund_days: timeToFund,
          calls_to_fund: newInvestor.calls_to_fund || 0,
        });

      if (error) throw error;

      toast.success('Funded investor added successfully');
      setIsAdding(false);
      setNewInvestor({
        name: '',
        funded_amount: 0,
        funded_at: new Date().toISOString().split('T')[0],
        first_contact_at: '',
        calls_to_fund: 0,
      });
      queryClient.invalidateQueries({ queryKey: ['funded-investors', clientId] });
    } catch (error: any) {
      toast.error('Failed to add investor: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Funded Investors ({investors.length})</DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Investor
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
              <h4 className="font-semibold mb-3">Add New Funded Investor</h4>
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Name</label>
                  <Input
                    value={newInvestor.name}
                    onChange={(e) => setNewInvestor({ ...newInvestor, name: e.target.value })}
                    placeholder="Investor name"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Amount Funded ($)</label>
                  <Input
                    type="number"
                    value={newInvestor.funded_amount}
                    onChange={(e) => setNewInvestor({ ...newInvestor, funded_amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">First Contact Date</label>
                  <Input
                    type="date"
                    value={newInvestor.first_contact_at}
                    onChange={(e) => setNewInvestor({ ...newInvestor, first_contact_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Funded Date</label>
                  <Input
                    type="date"
                    value={newInvestor.funded_at}
                    onChange={(e) => setNewInvestor({ ...newInvestor, funded_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Calls to Fund</label>
                  <Input
                    type="number"
                    value={newInvestor.calls_to_fund}
                    onChange={(e) => setNewInvestor({ ...newInvestor, calls_to_fund: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button size="sm" onClick={addInvestor}>Add Investor</Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading investors...</div>
          ) : investors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No funded investors found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">Name</TableHead>
                  <TableHead className="font-bold text-right">Amount</TableHead>
                  <TableHead className="font-bold">First Contact</TableHead>
                  <TableHead className="font-bold">Funded Date</TableHead>
                  <TableHead className="font-bold text-right">Time to Fund</TableHead>
                  <TableHead className="font-bold text-right">Calls to Fund</TableHead>
                  <TableHead className="font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor: FundedInvestor) => (
                  <TableRow key={investor.id} className="border-b">
                    <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                    <TableCell className="text-right font-mono text-chart-2">
                      ${Number(investor.funded_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {investor.first_contact_at 
                        ? new Date(investor.first_contact_at).toLocaleDateString() 
                        : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {new Date(investor.funded_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {investor.time_to_fund_days !== null ? `${investor.time_to_fund_days} days` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{investor.calls_to_fund || 0}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteInvestor(investor.id)}>
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
