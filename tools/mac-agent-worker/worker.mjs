#!/usr/bin/env node
// Reporting 5.0 — outbound-only Mac worker for one external agent (Alfred via Codex CLI,
// or Claude via Claude Code). It never opens a port: it polls Reporting over HTTPS,
// claims work for ITS OWN agent identity, runs the local CLI, and reports back.
//
// Env:
//   AGENT_ID          alfred | claude            (must match the agent in Reporting)
//   WORKER_SECRET     same value saved as the agent's worker secret in Reporting
//   CALLBACK_URL      shown on the agent card in Reporting
//   RUNTIME           codex_cli | claude_code
//   AUTH_CHECK_CMD    optional; command whose exit 0 means the CLI is signed in
//                     (defaults: "codex login status" / "claude auth status")
//   WORKDIR           directory the CLI runs in (default: cwd)
//   POLL_SECONDS      default 15
//
// Continuity: Reporting stores one CLI session id per task (and one for team chat).
// New work arrives with resume_session_id when a session exists; ChatGPT/Claude app
// chats are NOT shared with these CLI sessions.
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';

const { AGENT_ID, WORKER_SECRET, CALLBACK_URL, RUNTIME } = process.env;
const POLL = Number(process.env.POLL_SECONDS || 15) * 1000;
const WORKDIR = process.env.WORKDIR || process.cwd();
if (!AGENT_ID || !WORKER_SECRET || !CALLBACK_URL || !['codex_cli', 'claude_code'].includes(RUNTIME)) {
  console.error('Set AGENT_ID, WORKER_SECRET, CALLBACK_URL and RUNTIME=codex_cli|claude_code');
  process.exit(1);
}

function run(cmd, args, input) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: WORKDIR, env: process.env });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
    p.on('close', (code) => resolve({ code, out, err }));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

async function cliInfo() {
  const bin = RUNTIME === 'codex_cli' ? 'codex' : 'claude';
  const v = await run(bin, ['--version']);
  const check = (process.env.AUTH_CHECK_CMD || (RUNTIME === 'codex_cli' ? 'codex login status' : 'claude auth status')).split(' ');
  const a = await run(check[0], check.slice(1));
  return { host: os.hostname().slice(0, 60), runtime: RUNTIME, version: v.out.trim().slice(0, 40), cli_authenticated: a.code === 0 };
}

async function call(payload) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', WORKER_SECRET).update(`${ts}.${nonce}.${body}`).digest('hex');
  const res = await fetch(CALLBACK_URL, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'X-Agent-Id': AGENT_ID, 'X-Agent-Timestamp': ts, 'X-Agent-Nonce': nonce, 'X-Agent-Signature': sig },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${payload.event} → HTTP ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function promptFor(item) {
  const t = item.task;
  const lines = [`You are ${AGENT_ID} on the HPA agent team, working from Reporting 5.0.`];
  if (t) lines.push(`Task: ${t.title}`, t.description ? `Details: ${t.description}` : '', t.client_name ? `Client: ${t.client_name}` : '', `Task link: ${t.url}`);
  if (item.message) lines.push(`Team chat message from ${item.message.sender_name || 'a teammate'}: ${item.message.body}`);
  lines.push('Reply with a concise result summary. Do not contact clients or take external actions without approval.');
  return lines.filter(Boolean).join('\n');
}

async function runCli(item) {
  const prompt = promptFor(item);
  if (RUNTIME === 'claude_code') {
    const args = ['-p', prompt, '--output-format', 'json'];
    if (item.resume_session_id) args.push('--resume', item.resume_session_id);
    const r = await run('claude', args);
    let j = null; try { j = JSON.parse(r.out); } catch { /* ignore */ }
    return { ok: r.code === 0 && !j?.is_error, sessionId: j?.session_id ?? null, text: j?.result ?? (r.out || r.err) };
  }
  const args = item.resume_session_id ? ['exec', 'resume', item.resume_session_id, '--json', prompt] : ['exec', '--json', prompt];
  const r = await run('codex', args);
  let sessionId = null, text = '';
  for (const line of r.out.split('\n')) {
    try {
      const e = JSON.parse(line);
      sessionId ||= e.thread_id || e.session_id || e.msg?.session_id || null;
      const t = e.item?.text || e.msg?.message || e.text;
      if (typeof t === 'string') text = t;
    } catch { /* non-JSON line */ }
  }
  return { ok: r.code === 0, sessionId, text: text || r.err };
}

async function tick() {
  const worker = await cliInfo();
  const res = await call({ event: 'poll', worker, max: 1 });
  if (res.test) await call({ event: 'ping_ack', worker, test_nonce: res.test.test_nonce });
  if (!worker.cli_authenticated) return; // never run work with a signed-out CLI
  for (const item of res.work || []) {
    const runId = `${os.hostname()}:${Date.now()}`;
    await call({ event: 'accepted', delivery_id: item.delivery_id, run_id: runId });
    const out = await runCli(item);
    if (out.sessionId) await call({ event: 'session', scope_key: item.scope_key, external_session_id: String(out.sessionId) });
    await call({ event: out.ok ? 'completed' : 'failed', delivery_id: item.delivery_id, summary: String(out.text || '').slice(0, 3900) });
  }
}

console.log(`[worker] ${AGENT_ID} (${RUNTIME}) polling every ${POLL / 1000}s`);
for (;;) {
  try { await tick(); } catch (e) { console.error('[worker]', e.message); }
  await new Promise((r) => setTimeout(r, POLL));
}
