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
import { useLeads, Lead } from '@/hooks/useLeadsAndCalls';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV } from '@/lib/exportUtils';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface LeadsDrillDownModalProps {
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadsDrillDownModal({ clientId, open, onOpenChange }: LeadsDrillDownModalProps) {
  const { data: leads = [], isLoading } = useLeads(clientId);
  const [isAdding, setIsAdding] = useState(false);
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    source: 'manual',
  });
  const queryClient = useQueryClient();

  const handleExport = () => {
    exportToCSV(leads, 'leads');
  };

  const deleteLead = async (leadId: string) => {
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
        });

      if (error) throw error;

      toast.success('Lead added successfully');
      setIsAdding(false);
      setNewLead({ name: '', email: '', phone: '', source: 'manual' });
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
    } catch (error: any) {
      toast.error('Failed to add lead: ' + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Leads ({leads.length})</DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lead
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
              <h4 className="font-semibold mb-3">Add New Lead</h4>
              <div className="grid grid-cols-4 gap-4">
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
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button size="sm" onClick={addLead}>Add Lead</Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading leads...</div>
          ) : leads.length === 0 ? (
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
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead: Lead) => (
                  <TableRow key={lead.id} className="border-b">
                    <TableCell className="font-mono text-sm">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-medium">{lead.name || '-'}</TableCell>
                    <TableCell>{lead.email || '-'}</TableCell>
                    <TableCell>{lead.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.source}</Badge>
                    </TableCell>
                    <TableCell>
                      {lead.is_spam ? (
                        <Badge variant="destructive">Spam</Badge>
                      ) : (
                        <Badge variant="secondary">{lead.status || 'New'}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLead(lead.id)}>
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
