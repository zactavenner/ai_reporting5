import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Cable, ChevronDown, PlugZap, ShieldCheck, Loader2 } from 'lucide-react';
import { useExternalAgentAction, useExternalAgents, type ExternalAgent, type ExternalAgentState } from '@/hooks/useExternalAgents';

const STATE: Record<ExternalAgentState, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  missing_connection: { label: 'Missing connection', variant: 'outline' },
  not_tested: { label: 'Not tested', variant: 'secondary' },
  test_failed: { label: 'Test failed', variant: 'destructive' },
  pull_only: { label: 'Pull only', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
};

function AgentRow({ a, members, callbackUrl }: { a: ExternalAgent; members: { id: string; name: string; email: string | null }[]; callbackUrl: string }) {
  const act = useExternalAgentAction();
  const [transport, setTransport] = useState(a.transport);
  const [endpoint, setEndpoint] = useState('');
  const [idem, setIdem] = useState(a.supports_idempotency);
  const [oauthEmail, setOauthEmail] = useState('');
  const [runtime, setRuntime] = useState<string>(a.runtime ?? (a.slug === 'alfred' ? 'codex_cli' : a.slug === 'claude' ? 'claude_code' : 'service'));
  const [tool, setTool] = useState(a.mcp_tool_name ?? '');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const sameName = members.filter((m) => m.name.toLowerCase().includes(a.display_name.split(' ')[0].toLowerCase()));
  const linked = members.find((m) => m.id === a.member_id);
  const run = (body: Record<string, unknown>) => act.mutateAsync({ agent_id: a.id, ...body });

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <Cable className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{a.display_name} <span className="text-muted-foreground font-normal">· {a.provider_label}</span></p>
          <p className="text-xs text-muted-foreground truncate">
            {linked ? `Task member: ${linked.name}${linked.email ? ` (${linked.email})` : ''}` : 'No task member linked'}
            {a.transport === 'pull_mcp' && ' · waits for its own worker to poll'}
            {a.transport === 'local_worker' && (a.worker_last_seen_at ? ` · Mac worker last checked in ${new Date(a.worker_last_seen_at).toLocaleString()}${a.worker_info?.cli_authenticated === false ? ' (CLI not signed in)' : ''}` : ' · Mac worker never checked in')}
            {a.test_pending && ' · test waiting for worker'}
          </p>
        </div>
        <Badge variant={STATE[a.state].variant}>{STATE[a.state].label}</Badge>
        <Badge variant={a.enabled ? 'default' : 'outline'}>{a.enabled ? 'Delivering' : 'Off'}</Badge>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-4 py-4 space-y-4 text-sm">
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Task member this agent receives</Label>
            <Select value={a.member_id ?? 'none'} onValueChange={(v) => run({ action: 'link_member', member_id: v === 'none' ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.email ? ` — ${m.email}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            {!a.member_id && sameName.length > 0 && (
              <p className="text-xs text-muted-foreground">Possible match: {sameName.map((m) => `${m.name} (${m.email ?? 'no email'})`).join(', ')}. Confirm before linking — nothing is linked automatically.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">How Reporting reaches it</Label>
            <Select value={transport} onValueChange={(v) => setTransport(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not connected</SelectItem>
                <SelectItem value="local_worker">Mac worker — dials out, no open port</SelectItem>
                <SelectItem value="push_webhook">Service webhook — signed push</SelectItem>
                <SelectItem value="remote_mcp">Service MCP — call the agent's tool</SelectItem>
                <SelectItem value="pull_mcp">Pull — agent polls Reporting (cannot wake it)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {transport === 'local_worker' && (
          <div className="space-y-1">
            <Label className="text-xs">Runtime on the Mac</Label>
            <Select value={runtime} onValueChange={setRuntime}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="codex_cli">Codex CLI (ChatGPT)</SelectItem>
                <SelectItem value="claude_code">Claude Code</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Your ChatGPT/Claude app chats don't carry over. The worker keeps one CLI session per task (and one for team chat) and resumes it on follow-ups.</p>
          </div>
        )}
        {transport === 'remote_mcp' && (
          <div className="space-y-1">
            <Label className="text-xs">MCP tool that starts work</Label>
            <Input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="e.g. start_task" />
          </div>
        )}
        {(transport === 'push_webhook' || transport === 'remote_mcp') && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Agent endpoint (https){a.endpoint ? ` — current: ${a.endpoint}` : ''}</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://agent.example.com/hpa/wake" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={idem} onCheckedChange={setIdem} id={`idem-${a.id}`} />
              <Label htmlFor={`idem-${a.id}`} className="text-xs">Endpoint deduplicates by Idempotency-Key (allows safe retry after timeouts)</Label>
            </div>
          </div>
        )}
        {transport === 'pull_mcp' && (
          <div className="space-y-1">
            <Label className="text-xs">Agent's own Reporting sign-in email {a.oauth_linked ? '— linked' : ''}</Label>
            <Input value={oauthEmail} onChange={(e) => setOauthEmail(e.target.value)} placeholder="agent-account@highperformanceads.com" />
          </div>
        )}
        <Button size="sm" variant="secondary" disabled={act.isPending}
          onClick={() => run({ action: 'configure', transport, endpoint_url: endpoint, supports_idempotency: idem, oauth_user_email: oauthEmail, runtime: transport === 'local_worker' ? runtime : transport === 'none' || transport === 'pull_mcp' ? null : 'service', mcp_tool_name: tool })}>
          Save connection
        </Button>

        {(transport === 'push_webhook' || transport === 'local_worker' || transport === 'remote_mcp') && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{transport === 'local_worker' ? 'Worker secret (also saved on the Mac)' : 'Signing secret'} (shared with agent) — {a.signing_secret_set ? 'set' : 'not set'}</Label>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Write-only, 32+ characters" />
                <Button size="sm" variant="outline" disabled={!secret} onClick={() => run({ action: 'set_secret', field: 'signing_secret', value: secret }).then(() => setSecret(''))}>Save</Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bearer token for endpoint (optional) — {a.outbound_token_set ? 'set' : 'not set'}</Label>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Write-only" />
                <Button size="sm" variant="outline" disabled={!token} onClick={() => run({ action: 'set_secret', field: 'outbound_token', value: token }).then(() => setToken(''))}>Save</Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run({ action: 'test' })}>
            {act.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <PlugZap className="h-3 w-3 mr-1" />} Test connection
          </Button>
          <div className="flex items-center gap-2">
            <Switch checked={a.enabled} disabled={!a.enabled && !(a.state === 'ready' || a.state === 'pull_only')}
              onCheckedChange={(v) => run({ action: 'set_enabled', enabled: v })} id={`en-${a.id}`} />
            <Label htmlFor={`en-${a.id}`} className="text-xs">Deliver new assignments and mentions</Label>
          </div>
          {a.last_test_at && <span className="text-xs text-muted-foreground">Last test {new Date(a.last_test_at).toLocaleString()}: {a.last_test_detail}</span>}
        </div>

        {transport === 'local_worker' && (
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <p className="font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Mac worker</p>
            <p>Run <code>tools/mac-agent-worker/worker.mjs</code> with AGENT_ID={a.slug} and the same worker secret. It only dials out to {callbackUrl}; no incoming port.</p>
            <p>Test connection queues a test code; it passes only when the worker answers it with its CLI signed in.</p>
          </div>
        )}
        {transport === 'push_webhook' && (
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <p className="font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Agent-side requirements</p>
            <p>Receive POST with headers Idempotency-Key, X-HPA-Timestamp, X-HPA-Nonce, X-HPA-Signature = hex HMAC-SHA256(secret, "timestamp.nonce.body"). Reply within 15s.</p>
            <p>Ping: reply <code>{'{"ok":true}'}</code>. Task/mention: reply <code>{'{"accepted":true,"run_id":"…"}'}</code>. Anything else is not counted as delivered.</p>
            <p>Report back: POST {callbackUrl} with X-Agent-Id: {a.slug}, X-Agent-Timestamp, X-Agent-Nonce, X-Agent-Signature (same scheme); body {'{"event":"accepted|progress|completed|failed|message","delivery_id","summary","result_url"}'}.</p>
          </div>
        )}

        {a.recent.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Recent deliveries</p>
            {a.recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">{r.kind}</Badge>
                <span>{r.status === 'waiting_pull' ? 'Waiting for external worker' : r.status.replace(/_/g, ' ')}</span>
                {r.last_error && <span className="text-muted-foreground truncate">— {r.last_error}</span>}
                {(r.status === 'needs_review' || r.status === 'failed') && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => act.mutate({ action: 'retry_review', delivery_id: r.id })}>Resend</Button>
                )}
                <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ExternalAgentsPanel() {
  const { data, isLoading, error } = useExternalAgents();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">External agents</CardTitle>
        <p className="text-xs text-muted-foreground">Your own assistants outside Reporting. Assigning a task to a linked member delivers it only when that agent is connected and switched on. Existing tasks are never sent.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
        {data?.agents.map((a) => <AgentRow key={a.id} a={a} members={data.members} callbackUrl={data.callback_url} />)}
      </CardContent>
    </Card>
  );
}
