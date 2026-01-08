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
import { Download } from 'lucide-react';
import { useFundedInvestors, FundedInvestor } from '@/hooks/useMetrics';
import { exportToCSV } from '@/lib/exportUtils';

interface FundedInvestorsDrillDownModalProps {
  clientId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FundedInvestorsDrillDownModal({ clientId, open, onOpenChange }: FundedInvestorsDrillDownModalProps) {
  const { data: investors = [], isLoading } = useFundedInvestors(clientId);

  const handleExport = () => {
    exportToCSV(investors, 'funded-investors');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Funded Investors ({investors.length})</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
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
                  <TableHead className="font-bold text-right">Time to Fund</TableHead>
                  <TableHead className="font-bold text-right">Calls to Fund</TableHead>
                  <TableHead className="font-bold">First Contact</TableHead>
                  <TableHead className="font-bold">Funded Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor: FundedInvestor) => (
                  <TableRow key={investor.id} className="border-b">
                    <TableCell className="font-medium">{investor.name || 'Unknown'}</TableCell>
                    <TableCell className="text-right font-mono text-chart-2">
                      ${Number(investor.funded_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {investor.time_to_fund_days !== null ? `${investor.time_to_fund_days} days` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{investor.calls_to_fund}</TableCell>
                    <TableCell>
                      {investor.first_contact_at 
                        ? new Date(investor.first_contact_at).toLocaleDateString() 
                        : '-'}
                    </TableCell>
                    <TableCell>{new Date(investor.funded_at).toLocaleDateString()}</TableCell>
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
