import { Card, CardContent } from '@/components/ui/card';

export function ReportHistory({ memberId }: { memberId: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <h3 className="font-semibold mb-2">Report History</h3>
        <p className="text-sm text-muted-foreground">View previous daily reports.</p>
      </CardContent>
    </Card>
  );
}
