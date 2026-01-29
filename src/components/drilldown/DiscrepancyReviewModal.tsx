import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Loader2, AlertTriangle, Globe } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DataDiscrepancy } from '@/hooks/useDataDiscrepancies';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DiscrepancyReviewModalProps {
  discrepancy: DataDiscrepancy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GapLead {
  id: string;
  external_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  created_at: string;
  ingestion_source: 'webhook' | 'api_sync' | 'unknown';
  has_webhook: boolean;
  campaign_name: string | null;
  ad_set_name: string | null;
  utm_source: string | null;
}

export function DiscrepancyReviewModal({ discrepancy, open, onOpenChange }: DiscrepancyReviewModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: gapLeads = [], isLoading } = useQuery({
    queryKey: ['gap-leads', discrepancy?.id],
    queryFn: async (): Promise<GapLead[]> => {
      if (!discrepancy) return [];

      // Fetch leads in the date range
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, external_id, name, email, phone, source, created_at, campaign_name, ad_set_name, utm_source')
        .eq('client_id', discrepancy.client_id)
        .gte('created_at', `${discrepancy.date_range_start}T00:00:00`)
        .lte('created_at', `${discrepancy.date_range_end}T23:59:59`)
        .order('created_at', { ascending: false });

      if (leadsError) throw leadsError;
      if (!leads) return [];

      // Fetch webhook logs for these leads
      const { data: webhookLogs, error: webhookError } = await supabase
        .from('webhook_logs')
        .select('payload')
        .eq('client_id', discrepancy.client_id)
        .eq('webhook_type', 'lead')
        .eq('status', 'success')
        .gte('processed_at', `${discrepancy.date_range_start}T00:00:00`)
        .lte('processed_at', `${discrepancy.date_range_end}T23:59:59`);

      if (webhookError) {
        console.error('Error fetching webhook logs:', webhookError);
      }

      // Create a set of external IDs and emails from webhooks
      const webhookExternalIds = new Set<string>();
      const webhookEmails = new Set<string>();
      
      if (webhookLogs) {
        for (const log of webhookLogs) {
          const payload = log.payload as Record<string, unknown> | null;
          if (payload) {
            if (payload.contact_id) webhookExternalIds.add(String(payload.contact_id));
            if (payload.id) webhookExternalIds.add(String(payload.id));
            if (payload.email) webhookEmails.add(String(payload.email).toLowerCase());
          }
        }
      }

      // Only return leads WITHOUT webhook matches (the gap)
      const gapOnlyLeads: GapLead[] = [];
      
      for (const lead of leads) {
        const hasWebhook = webhookExternalIds.has(lead.external_id) || 
                          (lead.email && webhookEmails.has(lead.email.toLowerCase()));
        
        // Skip leads that have webhook matches - we only want the gap
        if (hasWebhook) continue;
        
        gapOnlyLeads.push({
          ...lead,
          ingestion_source: 'api_sync',
          has_webhook: false,
          campaign_name: lead.campaign_name,
          ad_set_name: lead.ad_set_name,
          utm_source: lead.utm_source,
        });
      }

      return gapOnlyLeads;
    },
    enabled: open && !!discrepancy,
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`Deleted ${ids.length} lead(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['gap-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error) => {
      toast.error('Failed to delete leads: ' + (error as Error).message);
    },
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    // All leads in gapLeads are already API-only (the gap)
    setSelectedIds(new Set(gapLeads.map(l => l.id)));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    deleteMutation.mutate(Array.from(selectedIds));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-chart-4" />
            Review Data Gap
          </DialogTitle>
          <DialogDescription>
            {discrepancy && (
              <>
                {discrepancy.clients?.name} • {format(new Date(discrepancy.date_range_start), 'MMM d')} - {format(new Date(discrepancy.date_range_end), 'MMM d, yyyy')}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary stats */}
          <div className="flex flex-wrap gap-4 text-sm items-center">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-chart-4" />
              <span><strong>{gapLeads.length}</strong> leads in gap (API-only, no webhook)</span>
            </div>
            <div className="ml-auto flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={selectAll}
                disabled={gapLeads.length === 0}
              >
                Select All
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0 || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                Delete Selected ({selectedIds.size})
              </Button>
            </div>
          </div>

          {/* Legend */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            These are leads that were added via GHL API sync but have no matching real-time webhook. 
            They may be duplicates or backfilled data that shouldn't count toward your metrics.
          </div>

          {/* Leads table */}
          <ScrollArea className="h-[400px] border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : gapLeads.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No leads found in this date range
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.size === gapLeads.length && gapLeads.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds(new Set(gapLeads.map(l => l.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Campaign / Ad Set</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gapLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.name || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="space-y-0.5">
                          {lead.campaign_name ? (
                            <div className="text-foreground font-medium truncate max-w-[180px]" title={lead.campaign_name}>
                              {lead.campaign_name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                          {lead.ad_set_name && (
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={lead.ad_set_name}>
                              {lead.ad_set_name}
                            </div>
                          )}
                          {lead.utm_source && !lead.campaign_name && (
                            <div className="text-xs text-muted-foreground">
                              via {lead.utm_source}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.email || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.phone || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lead.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
