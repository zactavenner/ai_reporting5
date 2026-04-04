import { Card, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export function SyncOverviewTab() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold mb-2">Sync Overview</h3>
        <p className="text-sm text-muted-foreground">Monitor sync status across all client integrations.</p>
      </CardContent>
    </Card>
  );
}
