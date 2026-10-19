import { McpClient } from '../mcpClient.ts';
import { decide, hmacHex, isPushTransport, mentionKey, routeMentions, signingString, type SendOutcome } from './core.ts';

const APP_URL = 'https://reporting.highperformanceads.com';
export const callbackUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/external-agent-callback`;
const SEND_TIMEOUT_MS = 15_000;

export async function teamChannelId(sb: any): Promise<string> {
  const { data } = await sb.from('agent_channels').select('id').eq('kind', 'agents-team').limit(1).maybeSingle();
  if (!data) throw new Error('agents-team channel missing');
  return data.id;
}

/** Route @mentions on messages not yet routed. Idempotent per (message, agent). */
export async function routePendingMentions(sb: any) {
  const ch = await teamChannelId(sb);
  const { data: msgs } = await sb.from('agent_messages').select('id,body,hop,from_external_agent_id,task_id')
    .eq('channel_id', ch).is('routed_at', null).gte('created_at', new Date(Date.now() - 86400_000).toISOString()).limit(50);
  if (!msgs?.length) return 0;
  const { data: agents } = await sb.from('external_agents').select('id,slug,enabled,member_id,transport,mention_hourly_limit');
  let woken = 0;
  for (const m of msgs) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { data: recent } = await sb.from('agent_assignment_outbox').select('agent_id').eq('kind', 'mention').gte('created_at', since);
    const recentWakes: Record<string, number> = {};
    for (const r of recent ?? []) recentWakes[r.agent_id] = (recentWakes[r.agent_id] ?? 0) + 1;
    const res = routeMentions({ body: m.body || '', senderAgentId: m.from_external_agent_id, hop: m.hop ?? 0, agents: agents ?? [], recentWakes });
    for (const agentId of res.wake) {
      const a = agents!.find((x: any) => x.id === agentId)!;
      const { error } = await sb.from('agent_assignment_outbox').insert({
        agent_id: agentId, task_id: m.task_id, kind: 'mention', idempotency_key: mentionKey(m.id, agentId),
        status: isPushTransport(a.transport) ? 'pending' : 'waiting_pull', source_message_id: m.id, hop: m.hop ?? 0,
      });
      if (!error) woken++;
    }
    await sb.from('agent_messages').update({ routed_at: new Date().toISOString(), payload: { routing: res } }).eq('id', m.id).is('routed_at', null);
  }
  return woken;
}

export async function buildPayload(sb: any, row: any) {
  let task: any = null;
  if (row.task_id) {
    const { data } = await sb.from('tasks').select('id,title,description,status,priority,due_date,client_id').eq('id', row.task_id).maybeSingle();
    if (data) {
      let clientName: string | null = null;
      if (data.client_id) clientName = (await sb.from('clients').select('name').eq('id', data.client_id).maybeSingle()).data?.name ?? null;
      task = { ...data, client_name: clientName, url: `${APP_URL}/?task=${data.id}` };
    }
  }
  let message: any = null;
  if (row.source_message_id) {
    const { data } = await sb.from('agent_messages').select('id,body,sender_name,role,created_at').eq('id', row.source_message_id).maybeSingle();
    message = data;
  }
  return {
    type: row.kind === 'mention' ? 'chat.mention' : 'task.assigned',
    delivery_id: row.id, idempotency_key: row.idempotency_key, revision: row.revision, hop: row.hop,
    task, message, callback_url: callbackUrl(),
  };
}

export async function signedPost(url: string, secret: string, token: string | null, idemKey: string, payload: unknown): Promise<SendOutcome> {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', 'Idempotency-Key': idemKey,
    'X-HPA-Timestamp': ts, 'X-HPA-Nonce': nonce, 'X-HPA-Signature': await hmacHex(secret, signingString(ts, nonce, body)),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ctl.signal, redirect: 'error' });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
    return { kind: 'response', status: res.status, body: parsed };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'network', message: (e as Error).message.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** Claim and deliver due push rows. Every state change is fenced by lease_owner. */
export async function dispatchPush(sb: any, owner: string, limit = 10) {
  const { data: rows, error } = await sb.rpc('claim_agent_outbox', { p_owner: owner, p_limit: limit, p_lease_seconds: 120 });
  if (error) throw error;
  const out = { claimed: rows?.length ?? 0, accepted: 0, retry: 0, failed: 0, review: 0 };
  for (const row of rows ?? []) {
    const { data: a } = await sb.from('external_agents').select('*').eq('id', row.agent_id).single();
    const { data: cred } = await sb.from('external_agent_credentials').select('signing_secret,outbound_token').eq('agent_id', row.agent_id).maybeSingle();
    const attempt = row.attempts + 1;
    // Re-check scope at send time: assignment must still be live for this agent's member.
    if (row.kind === 'assignment') {
      const { data: still } = await sb.from('task_assignees').select('id').eq('task_id', row.task_id).eq('member_id', a.member_id).limit(1);
      if (!still?.length) {
        await sb.from('agent_assignment_outbox').update({ status: 'cancelled', lease_owner: null, last_error: 'No longer assigned' }).eq('id', row.id).eq('lease_owner', owner);
        continue;
      }
    }
    if (!a.enabled || !a.endpoint_url || (a.transport === 'push_webhook' && !cred?.signing_secret) || (a.transport === 'remote_mcp' && !a.mcp_tool_name)) {
      await sb.from('agent_assignment_outbox').update({ status: 'pending', lease_owner: null, last_error: 'Agent not connected' }).eq('id', row.id).eq('lease_owner', owner);
      continue;
    }
    const { data: marked } = await sb.from('agent_assignment_outbox').update({ status: 'sending', attempts: attempt, updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('lease_owner', owner).eq('status', 'claimed').select('id');
    if (!marked?.length) continue; // lost the lease or cancelled meanwhile
    const payload = await buildPayload(sb, row);
    const outcome = a.transport === 'remote_mcp'
      ? await mcpCall(a.endpoint_url, cred?.outbound_token ?? null, a.mcp_tool_name, payload)
      : await signedPost(a.endpoint_url, cred!.signing_secret, cred!.outbound_token, row.idempotency_key, payload);
    const d = decide(outcome, attempt, a.supports_idempotency, row.max_attempts);
    const patch: Record<string, unknown> = { lease_owner: null, updated_at: new Date().toISOString() };
    if (d.status === 'accepted') { Object.assign(patch, { status: 'accepted', external_run_id: d.runId, accepted_at: new Date().toISOString(), last_error: null }); out.accepted++; }
    else if (d.status === 'failed_retryable') { Object.assign(patch, { status: 'failed_retryable', last_error: d.error, next_attempt_at: new Date(Date.now() + d.nextInSeconds * 1000).toISOString() }); out.retry++; }
    else if (d.status === 'failed') { Object.assign(patch, { status: 'failed', last_error: d.error }); out.failed++; }
    else { Object.assign(patch, { status: 'needs_review', last_error: d.error }); out.review++; }
    await sb.from('agent_assignment_outbox').update(patch).eq('id', row.id).eq('lease_owner', owner).eq('status', 'sending');
  }
  return out;
}

/** Remote MCP adapter: call the agent's configured tool; its JSON result must contain {accepted:true, run_id}. */
export async function mcpCall(url: string, token: string | null, tool: string, args: Record<string, unknown>): Promise<SendOutcome> {
  const timeout = new Promise<SendOutcome>((r) => setTimeout(() => r({ kind: 'timeout' }), SEND_TIMEOUT_MS));
  const call = (async (): Promise<SendOutcome> => {
    try {
      const text = await new McpClient(url, token).callTool(tool, args);
      if (text.startsWith('TOOL ERROR:')) return { kind: 'response', status: 502, body: null };
      let body: any = null;
      try { body = JSON.parse(text); } catch { /* not JSON */ }
      return { kind: 'response', status: 200, body };
    } catch (e) {
      const m = /\[(\d{3})\]/.exec((e as Error).message);
      return m ? { kind: 'response', status: Number(m[1]), body: null } : { kind: 'network', message: (e as Error).message.slice(0, 200) };
    }
  })();
  return Promise.race([call, timeout]);
}
