import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useCreateImportLog } from '@/hooks/useImportLogs';

export type ImportType = 'ad_spend' | 'leads' | 'calls' | 'call_summary' | 'funded_investors';

interface CSVImportModalProps {
  clientId: string;
  importType: ImportType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  [key: string]: string;
}

const IMPORT_CONFIG = {
  ad_spend: {
    title: 'Import Ad Spend from CSV',
    description: 'Upload a CSV file exported from Meta Ads Manager or similar. Required columns: date, spend. Optional: time/reported_at, impressions, clicks, platform, campaign_name.',
    requiredFields: ['date'],
    optionalFields: ['spend', 'ad_spend', 'impressions', 'clicks', 'time', 'reported_at', 'platform', 'campaign_name', 'ad_set_name'],
    tableName: 'daily_metrics',
    exampleRow: 'date,time,spend,impressions,clicks,platform\n2024-01-15,14:30,150.50,5000,120,meta',
  },
  leads: {
    title: 'Import Leads from CSV',
    description: 'Upload a CSV file with lead data. At least email or phone required. Optional: name, source, status.',
    requiredFields: [],
    optionalFields: ['name', 'email', 'phone', 'source', 'status', 'created_at', 'date'],
    tableName: 'leads',
    exampleRow: 'name,email,phone,source\nJohn Doe,john@example.com,+1234567890,facebook',
  },
  calls: {
    title: 'Import Calls from CSV',
    description: 'Upload a CSV file with call data. Optional columns: scheduled_at, showed, outcome.',
    requiredFields: [],
    optionalFields: ['scheduled_at', 'date', 'showed', 'outcome', 'name', 'email', 'phone'],
    tableName: 'calls',
    exampleRow: 'scheduled_at,showed,outcome\n2024-01-15 10:00:00,true,interested',
  },
  call_summary: {
    title: 'Import Call Summary from CSV',
    description: 'Upload a CSV file with call summaries. Optional columns: scheduled_at, showed, outcome, summary, transcript, quality_score.',
    requiredFields: [],
    optionalFields: ['scheduled_at', 'date', 'showed', 'outcome', 'name', 'email', 'phone', 'summary', 'transcript', 'quality_score', 'recording_url'],
    tableName: 'calls',
    exampleRow: 'scheduled_at,showed,outcome,summary,quality_score\n2024-01-15 10:00:00,true,interested,Great call with potential investor,8',
  },
  funded_investors: {
    title: 'Import Funded Investors from CSV',
    description: 'Upload a CSV file with funded investor data. Required columns: funded_amount. Optional: name, funded_at, first_contact_at.',
    requiredFields: ['funded_amount', 'amount'],
    optionalFields: ['name', 'funded_at', 'date', 'first_contact_at', 'calls_to_fund'],
    tableName: 'funded_investors',
    exampleRow: 'name,funded_amount,funded_at,first_contact_at\nJane Smith,50000,2024-01-20,2024-01-01',
  },
};

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["\s]/g, ''));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: ParsedRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

export function CSVImportModal({ clientId, importType, open, onOpenChange }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const createImportLog = useCreateImportLog();

  const config = IMPORT_CONFIG[importType];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setImportResult(null);

    const text = await selectedFile.text();
    const parsed = parseCSV(text);
    setParsedData(parsed);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setIsImporting(true);
    let success = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (const row of parsedData) {
        try {
          if (importType === 'ad_spend') {
            const date = row.date;
            if (!date) {
              failed++;
              continue;
            }

            const spend = parseFloat(row.spend || row.ad_spend || '0') || 0;
            const impressions = parseInt(row.impressions || '0') || 0;
            const clicks = parseInt(row.clicks || '0') || 0;
            const platform = row.platform || 'meta';
            const campaignName = row.campaign_name || null;
            const adSetName = row.ad_set_name || null;
            
            // Build reported_at timestamp with optional time
            const timeValue = row.time || row.reported_at || null;
            let reportedAt: string;
            if (timeValue) {
              if (timeValue.includes('T') || timeValue.includes('-')) {
                reportedAt = new Date(timeValue).toISOString();
              } else {
                reportedAt = new Date(`${date}T${timeValue}:00`).toISOString();
              }
            } else {
              reportedAt = new Date(`${date}T12:00:00`).toISOString();
            }

            // Insert into ad_spend_reports for granular time tracking
            if (spend > 0 || impressions > 0 || clicks > 0) {
              await supabase.from('ad_spend_reports').insert({
                client_id: clientId,
                reported_at: reportedAt,
                platform,
                spend,
                impressions,
                clicks,
                campaign_name: campaignName,
                ad_set_name: adSetName,
              });
            }

            // Also upsert to daily_metrics for dashboard compatibility
            const { error } = await supabase
              .from('daily_metrics')
              .upsert({
                client_id: clientId,
                date: date,
                ad_spend: spend,
                impressions: impressions,
                clicks: clicks,
              }, { onConflict: 'client_id,date' });

            if (error) throw error;
            success++;
          } else if (importType === 'leads') {
            // Skip if no email AND no phone
            const hasEmail = row.email && row.email.trim();
            const hasPhone = row.phone && row.phone.trim();
            
            if (!hasEmail && !hasPhone) {
              skipped++;
              continue;
            }

            const { error } = await supabase
              .from('leads')
              .insert({
                client_id: clientId,
                external_id: `csv-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: row.name || null,
                email: row.email || null,
                phone: row.phone || null,
                source: row.source || 'csv-import',
                status: row.status || 'new',
                created_at: row.created_at || row.date || new Date().toISOString(),
              });

            if (error) throw error;
            success++;
          } else if (importType === 'calls' || importType === 'call_summary') {
            const { error } = await supabase
              .from('calls')
              .insert({
                client_id: clientId,
                external_id: `csv-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                scheduled_at: row.scheduled_at || row.date || null,
                showed: row.showed === 'true' || row.showed === '1' || row.showed === 'yes',
                outcome: row.outcome || null,
                summary: row.summary || null,
                transcript: row.transcript || null,
                quality_score: row.quality_score ? parseInt(row.quality_score) : null,
                recording_url: row.recording_url || null,
              });

            if (error) throw error;
            success++;
          } else if (importType === 'funded_investors') {
            const amount = parseFloat(row.funded_amount || row.amount || '0');
            if (amount <= 0) {
              failed++;
              continue;
            }

            const fundedAt = row.funded_at || row.date || new Date().toISOString();
            const firstContact = row.first_contact_at || null;
            
            // Calculate time to fund if we have both dates
            let timeToFundDays: number | null = null;
            if (firstContact && fundedAt) {
              const firstDate = new Date(firstContact);
              const fundDate = new Date(fundedAt);
              timeToFundDays = Math.floor((fundDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
            }

            const { error } = await supabase
              .from('funded_investors')
              .insert({
                client_id: clientId,
                external_id: `csv-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: row.name || null,
                funded_amount: amount,
                funded_at: fundedAt,
                first_contact_at: firstContact,
                time_to_fund_days: timeToFundDays,
                calls_to_fund: parseInt(row.calls_to_fund || '0') || 0,
              });

            if (error) throw error;
            success++;
          }
        } catch (err) {
          console.error('Failed to import row:', row, err);
          failed++;
        }
      }

      setImportResult({ success, failed, skipped });
      
      // Log the import
      await createImportLog.mutateAsync({
        client_id: clientId,
        import_type: importType,
        file_name: file?.name,
        records_count: parsedData.length,
        success_count: success,
        failed_count: failed,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['daily-metrics', clientId] });
      queryClient.invalidateQueries({ queryKey: ['all-daily-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['leads', clientId] });
      queryClient.invalidateQueries({ queryKey: ['calls', clientId] });
      queryClient.invalidateQueries({ queryKey: ['funded-investors', clientId] });

      if (success > 0) {
        toast.success(`Successfully imported ${success} records`);
      }
      if (skipped > 0) {
        toast.info(`Skipped ${skipped} records (missing email/phone)`);
      }
      if (failed > 0) {
        toast.error(`Failed to import ${failed} records`);
      }
    } catch (error: any) {
      toast.error('Import failed: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const resetModal = () => {
    setFile(null);
    setParsedData([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetModal();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* File Upload */}
          <div className="border-2 border-dashed border-border p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {file ? file.name : 'Click to upload or drag and drop a CSV file'}
              </p>
            </label>
          </div>

          {/* Example Format */}
          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Example CSV format:</p>
            <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto">
              {config.exampleRow}
            </pre>
          </div>

          {/* Preview */}
          {parsedData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Preview ({parsedData.length} rows)</h4>
                {importResult && (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-chart-2">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {importResult.success} imported
                    </Badge>
                    {importResult.skipped > 0 && (
                      <Badge variant="secondary">
                        {importResult.skipped} skipped
                      </Badge>
                    )}
                    {importResult.failed > 0 && (
                      <Badge variant="destructive">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {importResult.failed} failed
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="border border-border rounded-lg overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(parsedData[0] || {}).map(key => (
                        <TableHead key={key} className="font-bold text-xs">{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        {Object.values(row).map((value, i) => (
                          <TableCell key={i} className="text-xs">{value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {parsedData.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={Object.keys(parsedData[0] || {}).length} className="text-center text-muted-foreground text-xs">
                          ...and {parsedData.length - 10} more rows
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button 
            onClick={handleImport} 
            disabled={parsedData.length === 0 || isImporting}
          >
            <FileText className="h-4 w-4 mr-2" />
            {isImporting ? 'Importing...' : `Import ${parsedData.length} Records`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
