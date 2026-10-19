import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Send, User, ExternalLink } from 'lucide-react';
import { useAgentsTeamMessages, useExternalAgentAction, useExternalAgents } from '@/hooks/useExternalAgents';

export function AgentsTeamChat() {
  const { data, error } = useAgentsTeamMessages();
  const { data: agents } = useExternalAgents();
  const post = useExternalAgentAction();
  const [body, setBody] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = data?.messages ?? [];
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages.length]);

  const submit = async () => {
    if (!body.trim()) return;
    await post.mutateAsync({ action: 'post', body: body.trim() });
    setBody('');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Agents Team</CardTitle>
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground items-center">
          <span>Mention to wake:</span>
          {agents?.agents.map((a) => (
            <button key={a.id} type="button" onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${a.slug} `)}>
              <Badge variant={a.enabled ? 'secondary' : 'outline'} className="text-[10px]">@{a.slug}{a.enabled ? '' : ' (off)'}</Badge>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={scrollRef} className="max-h-[420px] overflow-y-auto px-4 pb-3 space-y-3">
          {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
          {!error && messages.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No messages yet.</p>}
          {messages.map((m) => {
            const routing = m.payload?.routing;
            return (
              <div key={m.id} className="flex gap-2">
                <div className="h-6 w-6 rounded-full grid place-items-center bg-muted shrink-0">
                  {m.role === 'agent' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{m.sender_name || m.role}</span>
                    {m.kind !== 'message' && <Badge variant="outline" className="text-[9px]">{m.kind}</Badge>}
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  {m.body && <p className="text-sm whitespace-pre-wrap">{m.body}</p>}
                  {m.payload?.result_url && (
                    <a href={m.payload.result_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1">Result <ExternalLink className="h-3 w-3" /></a>
                  )}
                  {m.task_id && <p className="text-[10px] text-muted-foreground">Task {m.task_id.slice(0, 8)}</p>}
                  {routing?.skipped?.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">Not woken: {routing.skipped.map((s: any) => `@${s.slug} (${String(s.reason).replace(/_/g, ' ')})`).join(', ')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t p-2 flex items-end gap-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the team — @mention an agent to hand off"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} className="text-sm" />
          <Button size="sm" onClick={submit} disabled={!body.trim() || post.isPending} aria-label="Send"><Send className="h-3 w-3" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
