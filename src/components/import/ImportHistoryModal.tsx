import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useImportLogs, useDeleteImportWithRecords } from '@/hooks/useImportLogs';
import { Trash2, FileText, History } from 'lucide-react';
import { format } from 'date-fns';

interface ImportHistoryModalProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportHistoryModal({ clientId, open, onOpenChange }: ImportHistoryModalProps) {
  const { data: logs = [], isLoading } = useImportLogs(clientId);
  const deleteImport = useDeleteImportWithRecords();

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'leads':
        return <Badge variant="outline">Leads</Badge>;
      case 'calls':
        return <Badge variant="outline">Calls</Badge>;
      case 'funded_investors':
        return <Badge variant="outline">Funded</Badge>;
      case 'ad_spend':
        return <Badge variant="outline">Ad Spend</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const handleDelete = (logId: string, importType: string) => {
    deleteImport.mutate({ logId, clientId, importType });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Import History
          </DialogTitle>
          <DialogDescription>
            View past CSV imports and delete imported records if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No import history yet</p>
              <p className="text-sm">Import records will appear here</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-2">
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>{getTypeBadge(log.import_type)}</TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {log.file_name || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {log.records_count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {log.success_count}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      {log.failed_count}
                    </TableCell>
                    <TableCell>
                      {log.import_type !== 'ad_spend' && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Import & Records?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will delete all {log.success_count} records from this import.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(log.id, log.import_type)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete All Records
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
