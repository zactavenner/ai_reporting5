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
import { useCalls, Call, useLeads } from '@/hooks/useLeadsAndCalls';
import { useDateFilter } from '@/contexts/DateFilterContext';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CashBagLoader } from '@/components/ui/CashBagLoader';
import { RecordActivityModal } from './RecordActivityModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

const PAGE_SIZE = 150;

export function CallsDrillDownModal({ clientId, showedOnly, open, onOpenChange }: CallsDrillDownModalProps) {
  const { startDate, endDate } = useDateFilter();
  const { data: calls = [], isLoading } = useCalls(clientId, showedOnly, startDate, endDate);
  const { data: leads = [] } = useLeads(clientId, startDate, endDate);
  const [isAdding, setIsAdding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [newCall, setNewCall] = useState({
    scheduled_at: new Date().toISOString().slice(0, 16),
    showed: false,
    outcome: '',
    is_reconnect: false,
  });
  const queryClient = useQueryClient();
  const title = showedOnly ? 'Showed Calls' : 'All Calls';

  // Filter calls by search
  const filteredCalls = useMemo(() => {
    if (!searchQuery) return calls;
    const query = searchQuery.toLowerCase();
    return calls.filter((call: Call) => 
      (call.outcome?.toLowerCase().includes(query)) ||
      (call.external_id?.toLowerCase().includes(query))
    );
  }, [calls, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / PAGE_SIZE);
  const paginatedCalls = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCalls.slice(start, start + PAGE_SIZE);
  }, [filteredCalls, currentPage]);

  const handleExportAll = () => {
    exportToCSV(calls, showedOnly ? 'showed-calls-all' : 'calls-all');
  };

  const handleExportFiltered = () => {
    exportToCSV(filteredCalls, showedOnly ? 'showed-calls-filtered' : 'calls-filtered');
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
          is_reconnect: newCall.is_reconnect,
        });

      if (error) throw error;

      toast.success('Call added successfully');
      setIsAdding(false);
      setNewCall({
        scheduled_at: new Date().toISOString().slice(0, 16),
        showed: false,
        outcome: '',
        is_reconnect: false,
      });
      queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
    } catch (error: any) {
      toast.error('Failed to add call: ' + error.message);
    }
  };

  const viewCallActivity = (call: Call) => {
    setSelectedCall(call);
    setShowActivityModal(true);
  };

  const getLeadForCall = (leadId: string | null) => {
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
                {title} ({filteredCalls.length} of {calls.length})
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {startDate} to {endDate}
                </span>
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Call
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
              placeholder="Search by outcome or ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="max-w-sm"
            />
            <span className="text-sm text-muted-foreground">
              Showing {paginatedCalls.length} of {filteredCalls.length}
            </span>
          </div>
          
          <div className="flex-1 overflow-auto">
            {isAdding && (
              <div className="border border-border bg-muted/50 p-4 mb-4 rounded-lg">
                <h4 className="font-semibold mb-3">Add New Call</h4>
                <div className="grid grid-cols-4 gap-4">
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
                    <label className="text-sm text-muted-foreground">Reconnect?</label>
                    <div className="flex items-center gap-2 h-10">
                      <input
                        type="checkbox"
                        checked={newCall.is_reconnect}
                        onChange={(e) => setNewCall({ ...newCall, is_reconnect: e.target.checked })}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">Reconnect call</span>
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
              <div className="flex justify-center py-12">
                <CashBagLoader message="Loading calls..." />
              </div>
            ) : paginatedCalls.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No calls found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="font-bold">Date/Time</TableHead>
                    <TableHead className="font-bold">Type</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="font-bold">Outcome</TableHead>
                    <TableHead className="font-bold">Created</TableHead>
                    <TableHead className="font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCalls.map((call: Call) => (
                    <TableRow key={call.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => viewCallActivity(call)}>
                      <TableCell className="font-mono text-sm">
                        {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell>
                        {(call as any).is_reconnect ? (
                          <Badge variant="outline" className="bg-secondary text-secondary-foreground">
                            Reconnect
                          </Badge>
                        ) : (
                          <Badge variant="outline">Initial</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                            Confirmed
                          </Badge>
                          <span className="text-muted-foreground">→</span>
                          {call.showed ? (
                            <Badge className="bg-chart-2 text-chart-2-foreground">SHOWED</Badge>
                          ) : (
                            <Badge variant="destructive">NO SHOW</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{call.outcome || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {new Date(call.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8" 
                            onClick={() => viewCallActivity(call)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8" 
                            onClick={() => deleteCall(call.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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

      {/* Activity Modal */}
      <RecordActivityModal
        open={showActivityModal}
        onOpenChange={setShowActivityModal}
        recordType="call"
        record={selectedCall}
        lead={selectedCall ? getLeadForCall(selectedCall.lead_id) : null}
      />
    </>
  );
}
