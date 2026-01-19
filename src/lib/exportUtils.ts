import { toast } from 'sonner';

export function exportToCSV<T extends object>(data: T[], filename: string) {
  if (data.length === 0) {
    toast.error('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = (row as any)[header];
        // Handle nulls, strings with commas, and other edge cases
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

  // Convert data to TSV format (Google Sheets friendly)
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
  
  // Encode content for URL
  const encodedData = encodeURIComponent(tsvContent);
  const encodedTitle = encodeURIComponent(title);
  
  // Google Sheets import URL - opens in new tab with data ready to paste
  // Users can paste from clipboard into a new Google Sheet
  navigator.clipboard.writeText(tsvContent).then(() => {
    // Open Google Sheets with a new blank sheet
    const googleSheetsUrl = `https://docs.google.com/spreadsheets/create?title=${encodedTitle}`;
    window.open(googleSheetsUrl, '_blank');
    toast.success('Data copied to clipboard! Paste it into the new Google Sheet (Ctrl+V or Cmd+V)');
  }).catch(() => {
    toast.error('Failed to copy data to clipboard');
  });
}
