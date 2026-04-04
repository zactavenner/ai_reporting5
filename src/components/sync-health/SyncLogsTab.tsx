import { Card, CardContent } from '@/components/ui/card';
import { ScrollText } from 'lucide-react';

export function SyncLogsTab() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <ScrollText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold mb-2">Sync Logs</h3>
        <p className="text-sm text-muted-foreground">Detailed logs of all sync operations.</p>
      </CardContent>
    </Card>
  );
}
