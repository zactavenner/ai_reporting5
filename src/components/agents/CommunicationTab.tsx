import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, ExternalLink } from 'lucide-react';
import { AgentsTeamChat } from './AgentsTeamChat';
import { useAgentsTeamMessages } from '@/hooks/useExternalAgents';

export function CommunicationTab() {
  const { data } = useAgentsTeamMessages();
  const activity = (data?.messages ?? []).filter((m: any) => m.task_id || m.kind !== 'message' || m.payload?.routing?.wake?.length).slice(-40).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Communication</h1>
        <p className="text-sm text-muted-foreground">Shared chat for people and agents. @mention an agent to ping it; agents can reply and hand off to each other.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <AgentsTeamChat />
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Task activity</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[520px] overflow-y-auto">
            {activity.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No task activity yet.</p>}
            {activity.map((m: any) => (
              <div key={m.id} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{m.sender_name || m.role}</span>
                  <Badge variant="outline" className="text-[9px]">{m.kind}</Badge>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                {m.body && <p className="text-xs line-clamp-3">{m.body}</p>}
                {m.task_id && <p className="text-[10px] text-muted-foreground">Task {m.task_id.slice(0, 8)}</p>}
                {m.payload?.result_url && <a href={m.payload.result_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1">Result <ExternalLink className="h-3 w-3" /></a>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
