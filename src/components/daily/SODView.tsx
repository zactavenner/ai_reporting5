import { Card, CardContent } from '@/components/ui/card';

export function SODView({ memberId }: { memberId: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <h3 className="font-semibold mb-2">Start of Day Report</h3>
        <p className="text-sm text-muted-foreground">Set your priorities for the day and review assigned tasks.</p>
      </CardContent>
    </Card>
  );
}
