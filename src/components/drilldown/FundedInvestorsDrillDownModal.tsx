import { useState, useMemo } from 'react';
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
import { Download, Trash2, Plus, ChevronLeft, ChevronRight, Eye, Filter } from 'lucide-react';
import { useFundedInvestors, FundedInvestor } from '@/hooks/useMetrics';
import { useLeads } from '@/hooks/useLeadsAndCalls';
import { useClient } from '@/hooks/useClients';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { UniversalRecordPanel } from '@/components/records/UniversalRecordPanel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FundedInvestorsDrillDownModalProps {
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 150;

function getInvestorStatus(investor: FundedInvestor): 'funded' | 'committed' | 'pending' {
  if (Number(investor.funded_amount) > 0) return 'funded';
  if (Number(investor.commitment_amount || 0) > 0) return 'committed';
  return 'pending';
}

function StatusBadge({ status }: { status: 'funded' | 'committed' | 'pending' }) {
  if (status === 'funded') return <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30 text-xs">Funded</Badge>;
  if (status === 'committed') return <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Committed</Badge>;
  return <Badge variant="outline" className="text-xs">Pending</Badge>;
}

export function FundedInvestorsDrillDownModal({ clientId, open, onOpenChange }: FundedInvestorsDrillDownModalProps) {
  const { startDate, endDate } = useDateFilter();
  const { data: client } = useClient(clientId);
  const { data: investors = [], isLoading } = useFundedInvestors(clientId, startDate, endDate);
  const { data: leads = [] } = useLeads(clientId, startDate, endDate);
  const [isAdding, setIsAdding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvestor, setSelectedInvestor] = useState<FundedInvestor | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [newInvestor, setNewInvestor] = useState({
    name: '',
    funded_amount: 0,
    funded_at: new Date().toISOString().split('T')[0],
    first_contact_at: '',
    calls_to_fund: 0,
  });
  const queryClient = useQueryClient();

  // Filter investors by search
  const filteredInvestors = useMemo(() => {
    if (!searchQuery) return investors;
    const query = searchQuery.toLowerCase();
    return investors.filter((investor: FundedInvestor) => 
      (investor.name?.toLowerCase().includes(query))
    );
  }, [investors, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredInvestors.length / PAGE_SIZE);
  const paginatedInvestors = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvestors.slice(start, start + PAGE_SIZE);
  }, [filteredInvestors, currentPage]);

  const handleExportAll = () => {
    exportToCSV(investors, 'funded-investors-all');
  };

  const handleExportFiltered = () => {
    exportToCSV(filteredInvestors, 'funded-investors-filtered');
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

  const viewInvestorActivity = (investor: FundedInvestor) => {
    setSelectedInvestor(investor);
    setShowActivityModal(true);
  };

  const getLeadForInvestor = (leadId: string | null) => {
    if (!leadId) return null;
    return leads.find((lead: any) => lead.id === leadId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                Funded Investors ({filteredInvestors.length} of {investors.length})
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {startDate} to {endDate}
                </span>
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Investor
                </Button>
                <Select onValueChange={(v) => v === 'all' ? handleExportAll() : handleExportFiltered()}>
                  <SelectTrigger className="w-36">
                    <Download className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Export" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="filtered">Export Filtered</SelectItem>
                    <SelectItem value="all">Export All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          {/* Search */}
          <div className="flex items-center gap-2 py-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="max-w-sm"
            />
            <span className="text-sm text-muted-foreground">
              Showing {paginatedInvestors.length} of {filteredInvestors.length}
            </span>
          </div>
          
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
              <div className="flex justify-center py-12">
                <CashBagLoader message="Loading investors..." />
              </div>
            ) : paginatedInvestors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No funded investors found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="font-bold">Name</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="font-bold text-right">Commitment $</TableHead>
                    <TableHead className="font-bold text-right">Funded $</TableHead>
                    <TableHead className="font-bold">First Contact</TableHead>
                    <TableHead className="font-bold">Funded Date</TableHead>
                    <TableHead className="font-bold text-right">Time to Fund</TableHead>
                    <TableHead className="font-bold text-right">Calls</TableHead>
                    <TableHead className="font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInvestors.map((investor: FundedInvestor) => {
                    const status = getInvestorStatus(investor);
                    return (
                      <TableRow key={investor.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => viewInvestorActivity(investor)}>
                        <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell className="text-right font-mono text-primary">
                          {Number(investor.commitment_amount || 0) > 0
                            ? `$${Number(investor.commitment_amount).toLocaleString()}`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-chart-2">
                          {Number(investor.funded_amount) > 0
                            ? `$${Number(investor.funded_amount).toLocaleString()}`
                            : '-'}
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
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8" 
                              onClick={(e) => { e.stopPropagation(); viewInvestorActivity(investor); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8" 
                              onClick={(e) => { e.stopPropagation(); deleteInvestor(investor.id); }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Detail Panel */}
      {selectedInvestor && clientId && (
        <UniversalRecordPanel
          open={showActivityModal}
          onOpenChange={setShowActivityModal}
          recordType="funded"
          record={selectedInvestor}
          clientId={clientId}
          linkedLead={selectedInvestor.lead_id ? getLeadForInvestor(selectedInvestor.lead_id) : undefined}
        />
      )}
    </>
  );
}
