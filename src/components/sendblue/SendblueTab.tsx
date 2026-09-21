import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useSendblueOverview, useRunSendblueMirrors } from '@/hooks/useSendblue';
import { SendblueInbox } from './SendblueInbox';
import { SendblueLines } from './SendblueLines';

interface Props {
  /** When set, everything is scoped to this client's numbers only. */
  clientId?: string;
  clients?: { id: string; name: string }[];
}

export function SendblueTab({ clientId, clients }: Props) {
  const overview = useSendblueOverview(clientId);
  const runMirrors = useRunSendblueMirrors();

  if (overview.isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Sendblue…
      </div>
    );
  }

  if (overview.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-destructive" /> Sendblue could not be loaded
          </CardTitle>
          <CardDescription>{(overview.error as Error).message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" onClick={() => overview.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = overview.data!;
  const lines = data.lines;
  const health = data.health;

  return (
    <div className="space-y-4">
      {!clientId && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={data.agency_credentials_configured ? 'secondary' : 'destructive'}>
            {data.agency_credentials_configured ? 'Sendblue account keys saved' : 'Sendblue account keys missing'}
          </Badge>
          <Badge variant={data.webhook_secret_configured ? 'secondary' : 'destructive'}>
            {data.webhook_secret_configured ? 'Incoming messages verified' : 'Incoming message secret missing'}
          </Badge>
          <Badge variant="outline">CRM notes: {data.mirrors.mirrored} written</Badge>
          {data.mirrors.pending > 0 && <Badge variant="outline">{data.mirrors.pending} waiting</Badge>}
          {data.mirrors.failed > 0 && <Badge variant="destructive">{data.mirrors.failed} failed</Badge>}
        </div>
      )}

      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox">Messages</TabsTrigger>
          <TabsTrigger value="lines">Numbers</TabsTrigger>
          <TabsTrigger value="health">Connection</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <SendblueInbox lines={lines} clientId={clientId} clients={clients} />
        </TabsContent>

        <TabsContent value="lines" className="mt-4">
          <SendblueLines lines={lines} clientId={clientId} clients={clients} />
        </TabsContent>

        <TabsContent value="health" className="mt-4 space-y-3">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No numbers to check yet.</p>
          ) : (
            lines.map((line) => {
              const h = health.find((x) => x.line_id === line.id);
              const blockers: string[] = [];
              if (!line.active) blockers.push('The number is switched off.');
              if (line.status !== 'connected') blockers.push(line.last_error || 'Credentials have not checked out yet.');
              if (!data.webhook_secret_configured) blockers.push('Incoming messages cannot be verified until the Sendblue signing secret is saved.');
              if (!h?.webhook_receiving) blockers.push('No incoming message has arrived on this number yet.');
              return (
                <Card key={line.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{line.label}</CardTitle>
                    <CardDescription>{line.phone_e164}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={line.status === 'connected' ? 'secondary' : 'destructive'}>
                        {line.status === 'connected' ? 'Credentials valid' : 'Credentials not valid'}
                      </Badge>
                      <Badge variant={h?.webhook_receiving ? 'secondary' : 'outline'}>
                        {h?.webhook_receiving ? 'Receiving messages' : 'Nothing received yet'}
                      </Badge>
                      <Badge variant="outline">{h?.message_count || 0} messages</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Last received: {h?.last_inbound_at ? new Date(h.last_inbound_at).toLocaleString() : '—'} · Last sent:{' '}
                      {h?.last_outbound_at ? new Date(h.last_outbound_at).toLocaleString() : '—'}
                    </p>
                    {blockers.length > 0 && (
                      <ul className="list-inside list-disc text-muted-foreground">
                        {blockers.map((b) => <li key={b}>{b}</li>)}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
          {!clientId && (
            <Button size="sm" variant="outline" onClick={() => runMirrors.mutate({})} disabled={runMirrors.isPending}>
              {runMirrors.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Retry CRM notes
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SendblueTab;
