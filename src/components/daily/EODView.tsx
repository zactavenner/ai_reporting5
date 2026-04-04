import { Card, CardContent } from '@/components/ui/card';

export function EODView({ memberId }: { memberId: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <h3 className="font-semibold mb-2">End of Day Report</h3>
        <p className="text-sm text-muted-foreground">Review completed tasks and share wins from today.</p>
      </CardContent>
    </Card>
  );
}
