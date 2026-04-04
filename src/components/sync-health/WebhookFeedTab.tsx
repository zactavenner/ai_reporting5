import { Card, CardContent } from '@/components/ui/card';
import { Radio } from 'lucide-react';

export function WebhookFeedTab() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Radio className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold mb-2">Webhook Feed</h3>
        <p className="text-sm text-muted-foreground">Real-time feed of incoming webhook events.</p>
      </CardContent>
    </Card>
  );
}
