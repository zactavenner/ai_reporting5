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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Trash2, Plus, ChevronLeft, ChevronRight, Eye, Filter, MoreVertical, Ban, CheckCircle } from 'lucide-react';
import { useLeads, Lead } from '@/hooks/useLeadsAndCalls';
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

interface LeadsDrillDownModalProps {
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 150;

export function LeadsDrillDownModal({ clientId, open, onOpenChange }: LeadsDrillDownModalProps) {
  const { startDate, endDate } = useDateFilter();
  const { data: client } = useClient(clientId);
  const { data: leads = [], isLoading } = useLeads(clientId, startDate, endDate);
  const [isAdding, setIsAdding] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'manual',
    utm_source: '',
    utm_campaign: '',
  });
  const queryClient = useQueryClient();

  // Filter leads by search
  const filteredLeads = useMemo(() => {
    if (!searchQuery) return leads;
    const query = searchQuery.toLowerCase();
    return leads.filter((lead: Lead) => 
      (lead.name?.toLowerCase().includes(query)) ||
      (lead.email?.toLowerCase().includes(query)) ||
      (lead.phone?.includes(query)) ||
      (lead.source?.toLowerCase().includes(query))
    );
  }, [leads, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, currentPage]);

  const handleExportAll = () => {
    exportToCSV(leads, 'leads-all');
  };

  const handleExportFiltered = () => {
    exportToCSV(filteredLeads, 'leads-filtered');
  };

  const deleteLead = async (leadId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Are you sure you want to delete this lead?')) return;
    
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;

      toast.success('Lead deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to delete lead: ' + error.message);
    }
  };

  const markAsSpam = async (leadId: string, isSpam: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('leads')
        .update({ is_spam: isSpam })
        .eq('id', leadId);

      if (error) throw error;

      toast.success(isSpam ? 'Lead marked as spam' : 'Lead unmarked as spam');
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
    } catch (error: any) {
      toast.error('Failed to update lead: ' + error.message);
    }
  };

  const addLead = async () => {
    if (!clientId) return;
    
    try {
      const { error } = await supabase
        .from('leads')
        .insert({
          client_id: clientId,
          external_id: `manual-${Date.now()}`,
          name: newLead.name || null,
          email: newLead.email || null,
          phone: newLead.phone || null,
          source: newLead.source,
          utm_source: newLead.utm_source || null,
          utm_campaign: newLead.utm_campaign || null,
        });

      if (error) throw error;

      toast.success('Lead added successfully');
      setIsAdding(false);
      setNewLead({ name: '', email: '', phone: '', source: 'manual', utm_source: '', utm_campaign: '' });
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
    } catch (error: any) {
      toast.error('Failed to add lead: ' + error.message);
    }
  };

  const viewLeadActivity = (lead: Lead) => {
    setSelectedLead(lead);
    setShowActivityModal(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                Leads ({filteredLeads.length} of {leads.length})
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {startDate} to {endDate}
                </span>
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Lead
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
              placeholder="Search by name, email, phone, or source..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="max-w-sm"
            />
            <span className="text-sm text-muted-foreground">
              Showing {paginatedLeads.length} of {filteredLeads.length}
            </span>
          </div>
          
          <div className="flex-1 overflow-auto">
            {isAdding && (
              <div className="border border-border bg-muted/50 p-4 mb-4 rounded-lg">
                <h4 className="font-semibold mb-3">Add New Lead</h4>
                <div className="grid grid-cols-6 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Name</label>
                    <Input
                      value={newLead.name}
                      onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Email</label>
                    <Input
                      type="email"
                      value={newLead.email}
                      onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Phone</label>
                    <Input
                      value={newLead.phone}
                      onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      placeholder="+1234567890"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Source</label>
                    <Input
                      value={newLead.source}
                      onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                      placeholder="manual"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">UTM Source</label>
                    <Input
                      value={newLead.utm_source}
                      onChange={(e) => setNewLead({ ...newLead, utm_source: e.target.value })}
                      placeholder="facebook"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">UTM Campaign</label>
                    <Input
                      value={newLead.utm_campaign}
                      onChange={(e) => setNewLead({ ...newLead, utm_campaign: e.target.value })}
                      placeholder="summer_2024"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button size="sm" onClick={addLead}>Add Lead</Button>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-12">
                <CashBagLoader message="Loading leads..." />
              </div>
            ) : paginatedLeads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No leads found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b-2">
                    <TableHead className="font-bold">Date</TableHead>
                    <TableHead className="font-bold">Name</TableHead>
                    <TableHead className="font-bold">Email</TableHead>
                    <TableHead className="font-bold">Phone</TableHead>
                     <TableHead className="font-bold">Source</TableHead>
                    <TableHead className="font-bold">Campaign</TableHead>
                    <TableHead className="font-bold">Ad Set</TableHead>
                    <TableHead className="font-bold">Ad ID</TableHead>
                    <TableHead className="font-bold">Questions</TableHead>
                    <TableHead className="font-bold">Status</TableHead>
                    <TableHead className="font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLeads.map((lead: Lead) => (
                    <TableRow key={lead.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => viewLeadActivity(lead)}>
                      <TableCell className="font-mono text-sm">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{lead.name || '-'}</TableCell>
                      <TableCell>{lead.email || '-'}</TableCell>
                      <TableCell>{lead.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{lead.source}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs" title={lead.campaign_name || ''}>
                        {lead.campaign_name || '-'}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs" title={lead.ad_set_name || ''}>
                        {lead.ad_set_name || '-'}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate text-xs" title={lead.ad_id || ''}>
                        {lead.ad_id || '-'}
                      </TableCell>
                      <TableCell>
                        {lead.questions && Array.isArray(lead.questions) && lead.questions.length > 0 ? (
                          <Badge variant="secondary" className="text-xs cursor-pointer" onClick={() => viewLeadActivity(lead)}>
                            {lead.questions.length} Q&A
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {lead.is_spam ? (
                          <Badge variant="destructive">Spam</Badge>
                        ) : (
                          <Badge variant="secondary">{lead.status || 'New'}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8" 
                            onClick={(e) => { e.stopPropagation(); viewLeadActivity(lead); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {lead.is_spam ? (
                                <DropdownMenuItem onClick={(e) => markAsSpam(lead.id, false, e as any)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Unmark as Spam
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={(e) => markAsSpam(lead.id, true, e as any)}>
                                  <Ban className="h-4 w-4 mr-2" />
                                  Mark as Spam
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={(e) => deleteLead(lead.id, e as any)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete from DB
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Record Detail Panel */}
      {selectedLead && clientId && (
        <UniversalRecordPanel
          open={showActivityModal}
          onOpenChange={setShowActivityModal}
          recordType="lead"
          record={selectedLead}
          clientId={clientId}
        />
      )}
    </>
  );
}
