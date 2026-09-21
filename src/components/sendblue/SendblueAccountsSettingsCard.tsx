import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessageSquare } from 'lucide-react';
import { useClients } from '@/hooks/useClients';
import { useSendblueOverview } from '@/hooks/useSendblue';
import { SendblueAccounts } from './SendblueAccounts';

/**
 * Agency-wide Sendblue account onboarding, shown on Settings → API Keys so every
 * client's existing Sendblue account can be connected from one screen.
 */
export function SendblueAccountsSettingsCard() {
  const { data: clients } = useClients();
  const overview = useSendblueOverview();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Sendblue accounts (texting)
        </CardTitle>
        <CardDescription>
          Connect each client's existing Sendblue account. Keys are stored on the server, shown masked, and checked
          against Sendblue before anything is marked as connected. No texts are ever sent from here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {overview.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Sendblue accounts…
          </p>
        ) : overview.error ? (
          <p className="text-sm text-destructive">{(overview.error as Error).message}</p>
        ) : (
          <SendblueAccounts
            accounts={overview.data?.accounts || []}
            lines={overview.data?.lines || []}
            coverage={overview.data?.coverage}
            webhookConfigured={Boolean(overview.data?.webhook_secret_configured)}
            clients={(clients || []).map((c: any) => ({ id: c.id, name: c.name }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default SendblueAccountsSettingsCard;
