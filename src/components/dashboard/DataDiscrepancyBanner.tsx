import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle, Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  DataDiscrepancy, 
  useAcknowledgeDiscrepancy, 
  useResolveDiscrepancy 
} from '@/hooks/useDataDiscrepancies';
import { format } from 'date-fns';

interface DataDiscrepancyBannerProps {
  discrepancies: DataDiscrepancy[];
  compact?: boolean;
}

export function DataDiscrepancyBanner({ discrepancies, compact = false }: DataDiscrepancyBannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<DataDiscrepancy | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  
  const acknowledgeDiscrepancy = useAcknowledgeDiscrepancy();
  const resolveDiscrepancy = useResolveDiscrepancy();
  
  if (!discrepancies || discrepancies.length === 0) {
    return null;
  }
  
  const criticalCount = discrepancies.filter(d => d.severity === 'critical').length;
  const warningCount = discrepancies.filter(d => d.severity === 'warning').length;
  const infoCount = discrepancies.filter(d => d.severity === 'info').length;
  
  const hasCritical = criticalCount > 0;
  const hasWarning = warningCount > 0;
  
  const bannerClass = hasCritical 
    ? 'bg-destructive/10 border-destructive/50 text-destructive' 
    : hasWarning 
      ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400' 
      : 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400';
  
  const handleAcknowledge = (id: string) => {
    acknowledgeDiscrepancy.mutate(id);
  };
  
  const handleOpenResolve = (discrepancy: DataDiscrepancy) => {
    setSelectedDiscrepancy(discrepancy);
    setResolutionNotes('');
    setResolveModalOpen(true);
  };
  
  const handleResolve = () => {
    if (selectedDiscrepancy) {
      resolveDiscrepancy.mutate({ 
        id: selectedDiscrepancy.id, 
        notes: resolutionNotes 
      });
      setResolveModalOpen(false);
      setSelectedDiscrepancy(null);
    }
  };
  
  const getDiscrepancyTypeLabel = (type: string) => {
    switch (type) {
      case 'lead_count_mismatch': return 'Lead Count Mismatch';
      case 'call_count_mismatch': return 'Call Count Mismatch';
      case 'failed_webhooks': return 'Failed Webhooks';
      case 'missing_api_leads': return 'Missing API Leads';
      default: return type;
    }
  };
  
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'warning':
        return <Badge variant="outline" className="border-chart-4 text-chart-4">Warning</Badge>;
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };
  
  if (compact) {
    return (
      <div className={`rounded-lg border px-4 py-2 ${bannerClass}`}>
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">{discrepancies.length} Data Issue{discrepancies.length !== 1 ? 's' : ''}</span>
          {criticalCount > 0 && <Badge variant="destructive" className="text-xs">{criticalCount} critical</Badge>}
          {warningCount > 0 && <Badge variant="outline" className="border-chart-4 text-chart-4 text-xs">{warningCount} warning</Badge>}
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className={`rounded-lg border-2 ${bannerClass}`}>
          <CollapsibleTrigger asChild>
            <button className="w-full px-4 py-3 flex items-center justify-between hover:bg-background/50 transition-colors">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-bold">
                  {discrepancies.length} Data Discrepanc{discrepancies.length !== 1 ? 'ies' : 'y'} Detected
                </span>
                <div className="flex gap-2 text-sm">
                  {criticalCount > 0 && <span>{criticalCount} critical</span>}
                  {warningCount > 0 && <span>• {warningCount} warning</span>}
                  {infoCount > 0 && <span>• {infoCount} info</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {isOpen ? 'Hide' : 'View All'}
                </span>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="border-t border-border/50 divide-y divide-border/50">
              {discrepancies.map((d) => (
                <div key={d.id} className="px-4 py-3 bg-background/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.clients?.name || 'Unknown Client'}</span>
                        {getSeverityBadge(d.severity)}
                        {d.status === 'acknowledged' && (
                          <Badge variant="outline">Acknowledged</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {getDiscrepancyTypeLabel(d.discrepancy_type)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Period: {format(new Date(d.date_range_start), 'MMM d')} - {format(new Date(d.date_range_end), 'MMM d, yyyy')}
                      </p>
                      <div className="flex gap-4 text-xs">
                        <span>Webhook: <strong>{d.webhook_count}</strong></span>
                        <span>API: <strong>{d.api_count}</strong></span>
                        <span>DB: <strong>{d.db_count}</strong></span>
                        <span className="text-destructive">Gap: <strong>{d.difference}</strong></span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {d.status === 'open' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleAcknowledge(d.id)}
                          disabled={acknowledgeDiscrepancy.isPending}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Acknowledge
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleOpenResolve(d)}
                        disabled={resolveDiscrepancy.isPending}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      
      <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Discrepancy</DialogTitle>
            <DialogDescription>
              Mark this data discrepancy as resolved. Add notes about how it was addressed.
            </DialogDescription>
          </DialogHeader>
          
          {selectedDiscrepancy && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><strong>Client:</strong> {selectedDiscrepancy.clients?.name}</p>
                <p><strong>Type:</strong> {getDiscrepancyTypeLabel(selectedDiscrepancy.discrepancy_type)}</p>
                <p><strong>Gap:</strong> {selectedDiscrepancy.difference} records</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Resolution Notes (optional)</label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe how this was resolved..."
                  className="mt-1"
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setResolveModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleResolve} disabled={resolveDiscrepancy.isPending}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Resolved
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
