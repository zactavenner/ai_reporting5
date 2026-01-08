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
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { useCalls, Call } from '@/hooks/useLeadsAndCalls';
import { exportToCSV } from '@/lib/exportUtils';

interface CallsDrillDownModalProps {
  clientId?: string;
  showedOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallsDrillDownModal({ clientId, showedOnly, open, onOpenChange }: CallsDrillDownModalProps) {
  const { data: calls = [], isLoading } = useCalls(clientId, showedOnly);
  const title = showedOnly ? 'Showed Calls' : 'All Calls';

  const handleExport = () => {
    exportToCSV(calls, showedOnly ? 'showed-calls' : 'calls');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{title} ({calls.length})</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading calls...</div>
          ) : calls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No calls found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead className="font-bold">Scheduled</TableHead>
                  <TableHead className="font-bold">Status</TableHead>
                  <TableHead className="font-bold">Outcome</TableHead>
                  <TableHead className="font-bold">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call: Call) => (
                  <TableRow key={call.id} className="border-b">
                    <TableCell className="font-medium">
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
                    <TableCell>{new Date(call.created_at).toLocaleDateString()}</TableCell>
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
