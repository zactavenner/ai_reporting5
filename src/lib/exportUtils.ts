import { toast } from 'sonner';

export function exportToCSV<T extends object>(
  data: T[],
  filename: string,
  dateRange?: { startDate?: string; endDate?: string }
) {
  if (data.length === 0) {
    toast.error('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  
  // Add date range info rows at top if provided
  const metaRows: string[] = [];
  if (dateRange) {
    if (dateRange.startDate) metaRows.push(`"Date Range Start","${dateRange.startDate}"`);
    if (dateRange.endDate) metaRows.push(`"Date Range End","${dateRange.endDate}"`);
    if (metaRows.length > 0) metaRows.push(''); // blank separator row
  }

  const csvRows = [
    ...metaRows,
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = (row as any)[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    ),
  ];

  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  toast.success(`Exported ${data.length} records to ${filename}.csv`);
}

export function exportToGoogleSheets<T extends object>(data: T[], title: string) {
  if (data.length === 0) {
    toast.error('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  const tsvRows = [
    headers.join('\t'),
    ...data.map(row =>
      headers.map(header => {
        const value = (row as any)[header];
        if (value === null || value === undefined) return '';
        return String(value).replace(/\t/g, ' ').replace(/\n/g, ' ');
      }).join('\t')
    ),
  ];

  const tsvContent = tsvRows.join('\n');
  
  const encodedTitle = encodeURIComponent(title);
  
  navigator.clipboard.writeText(tsvContent).then(() => {
    const googleSheetsUrl = `https://docs.google.com/spreadsheets/create?title=${encodedTitle}`;
    window.open(googleSheetsUrl, '_blank');
    toast.success('Data copied to clipboard! Paste it into the new Google Sheet (Ctrl+V or Cmd+V)');
  }).catch(() => {
    toast.error('Failed to copy data to clipboard');
  });
}

export function exportDashboardPDF() {
  // Use the browser's print functionality to generate a PDF snapshot
  toast.info('Preparing PDF export...');
  
  // Small delay to let toast render then print
  setTimeout(() => {
    window.print();
  }, 300);
}
