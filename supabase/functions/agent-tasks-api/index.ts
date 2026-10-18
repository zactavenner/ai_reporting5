// agent-tasks-api — scoped board access for AI team members (Claude, ChatGPT, Hermes, Codex, bots).
//
// DRAFT — not deployed. Needs migration 20261018060000_agent_api_keys.sql and Zac's approval.
//
// Auth: per-AI key, `Authorization: Bearer hpa_ak_<prefix>_<secret>` (or `x-agent-key`).
//   Only the SHA-256 hash is stored (agent_api_keys.key_hash). The shared dashboard
//   password is NEVER accepted here: any request carrying a `password` field or an
//   `x-dashboard-password` header is rejected.
// Scope: tasks and task comments only — read, create, update. There is no delete
//   route and no delete scope. Agents cannot move a task out of "Needs Zac Approval".
// Limits: fixed-window rate limit per key (agent_api_hit RPC). Every request is
//   written to agent_api_audit_log (field names only, never bodies or secrets).
//
// Surfaces:
//   REST  GET    /tasks                 ?client_id=&stage=&assignee_id=&updated_since=&limit=
//         GET    /tasks/:id
//         POST   /tasks
//         PATCH  /tasks/:id
//         GET    /tasks/:id/comments
//         POST   /tasks/:id/comments
//         PATCH  /comments/:id          (only comments this key created)
//         GET    /stages
//   MCP   POST   /mcp                   (JSON-RPC 2.0, streamable-HTTP style, JSON responses)
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Optional server-side pepper; must match the one used by scripts/generate-agent-key.ts.
const PEPPER = Deno.env.get("AGENT_KEY_PEPPER") ?? "";

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-agent-key, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

export const STAGES = ["todo", "in_progress", "needs_qa", "needs_zac_approval", "done"] as const;
const LEGACY_STAGES = ["agency_review", "client_tasks", "stuck", "review", "revisions"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const STATUSES = ["todo", "in_progress", "completed", "blocked"];

const TASK_COLUMNS =
  "id,title,description,stage,status,priority,due_date,client_id,project_id,parent_task_id,category,visible_to_client,created_by,created_at,updated_at,completed_at";
const COMMENT_COLUMNS = "id,task_id,author_name,content,comment_type,created_at";

type Scope = "tasks:read" | "tasks:create" | "tasks:update" | "comments:read" | "comments:create" | "comments:update";
type AgentKey = { id: string; name: string; member_id: string | null; scopes: Scope[]; rate_limit_per_min: number };

class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const KEY_RE = /^hpa_ak_([a-f0-9]{8})_([A-Za-z0-9_-]{32,})$/;

async function authenticate(req: Request, body: unknown): Promise<AgentKey> {
  // Never accept the shared dashboard password on this surface.
  if (req.headers.has("x-dashboard-password")) throw new ApiError(401, "shared_password_not_accepted");
  if (body && typeof body === "object" && !Array.isArray(body) && "password" in (body as Record<string, unknown>)) {
    throw new ApiError(401, "shared_password_not_accepted");
  }
  const raw = (req.headers.get("x-agent-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")).trim();
  const m = KEY_RE.exec(raw);
  if (!m) throw new ApiError(401, "missing_or_malformed_key");
  const prefix = `hpa_ak_${m[1]}`;
  const { data, error } = await db
    .from("agent_api_keys")
    .select("id,name,member_id,scopes,rate_limit_per_min,key_hash,revoked_at,expires_at")
    .eq("key_prefix", prefix)
    .maybeSingle();
  if (error) throw new ApiError(500, "key_lookup_failed");
  const hash = await sha256Hex(PEPPER + raw);
  if (!data || !timingSafeEqual(hash, data.key_hash)) throw new ApiError(401, "invalid_key");
  if (data.revoked_at) throw new ApiError(401, "key_revoked");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new ApiError(401, "key_expired");

  const { data: allowed, error: rlErr } = await db.rpc("agent_api_hit", { p_key_id: data.id, p_limit: data.rate_limit_per_min });
  if (rlErr) throw new ApiError(500, "rate_limit_unavailable");
  if (allowed !== true) throw new ApiError(429, "rate_limited");

  db.from("agent_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {}, () => {});
  return { id: data.id, name: data.name, member_id: data.member_id, scopes: data.scopes as Scope[], rate_limit_per_min: data.rate_limit_per_min };
}

function need(key: AgentKey, scope: Scope) {
  if (!key.scopes.includes(scope)) throw new ApiError(403, "missing_scope", `This key lacks scope ${scope}`);
}

async function displayName(key: AgentKey): Promise<string> {
  if (!key.member_id) return key.name;
  const { data } = await db.from("agency_members").select("name").eq("id", key.member_id).maybeSingle();
  return data?.name || key.name;
}

function str(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function uuidOrThrow(v: unknown, field: string): string {
  if (!isUuid(v)) throw new ApiError(400, "invalid_field", `${field} must be a UUID`);
  return v;
}

/** Whitelists task fields. Unknown fields are rejected so agents can't touch anything else. */
function taskFields(input: Record<string, unknown>, creating: boolean) {
  const allowed = new Set([
    "title", "description", "stage", "status", "priority", "due_date", "client_id", "project_id",
    "parent_task_id", "category", "visible_to_client", "assignee_ids",
  ]);
  for (const k of Object.keys(input)) if (!allowed.has(k)) throw new ApiError(400, "field_not_allowed", `Field not allowed: ${k}`);
  const out: Record<string, unknown> = {};
  const title = str(input.title, 300);
  if (creating && !title) throw new ApiError(400, "title_required");
  if (title !== undefined) out.title = title;
  if (input.description !== undefined) out.description = str(input.description, 20000) ?? null;
  if (input.stage !== undefined) {
    const s = String(input.stage);
    if (!(STAGES as readonly string[]).includes(s)) throw new ApiError(400, "invalid_stage", `stage must be one of ${STAGES.join(", ")}`);
    out.stage = s;
  }
  if (input.status !== undefined) {
    if (!STATUSES.includes(String(input.status))) throw new ApiError(400, "invalid_status");
    out.status = String(input.status);
  }
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(String(input.priority))) throw new ApiError(400, "invalid_priority");
    out.priority = String(input.priority);
  }
  if (input.due_date !== undefined) {
    if (input.due_date === null) out.due_date = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.due_date))) out.due_date = String(input.due_date);
    else throw new ApiError(400, "invalid_due_date", "due_date must be YYYY-MM-DD");
  }
  for (const f of ["client_id", "project_id", "parent_task_id"] as const) {
    if (input[f] !== undefined) out[f] = input[f] === null ? null : uuidOrThrow(input[f], f);
  }
  if (input.category !== undefined) out.category = str(input.category, 100) ?? null;
  if (input.visible_to_client !== undefined) out.visible_to_client = input.visible_to_client === true;
  let assigneeIds: string[] = [];
  if (input.assignee_ids !== undefined) {
    if (!Array.isArray(input.assignee_ids) || input.assignee_ids.length > 10) throw new ApiError(400, "invalid_assignee_ids");
    assigneeIds = input.assignee_ids.map((x) => uuidOrThrow(x, "assignee_ids[]"));
  }
  return { fields: out, assigneeIds };
}

// ───────────────────────── operations ─────────────────────────

async function listTasks(key: AgentKey, q: Record<string, string | undefined>) {
  need(key, "tasks:read");
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  let query = db.from("tasks").select(TASK_COLUMNS).order("updated_at", { ascending: false }).limit(limit);
  if (q.client_id) query = query.eq("client_id", uuidOrThrow(q.client_id, "client_id"));
  if (q.stage) {
    // "needs_qa" also returns legacy agency_review tasks.
    query = q.stage === "needs_qa" ? query.in("stage", ["needs_qa", "agency_review"]) : query.eq("stage", q.stage);
  }
  if (q.updated_since) query = query.gte("updated_at", new Date(q.updated_since).toISOString());
  if (q.assignee_id) {
    const { data: rows } = await db.from("task_assignees").select("task_id").eq("member_id", uuidOrThrow(q.assignee_id, "assignee_id")).limit(1000);
    const ids = (rows || []).map((r) => r.task_id);
    if (ids.length === 0) return { tasks: [] };
    query = query.in("id", ids);
  }
  const { data, error } = await query;
  if (error) throw new ApiError(500, "query_failed");
  return { tasks: data };
}

async function getTask(key: AgentKey, id: string) {
  need(key, "tasks:read");
  const { data, error } = await db.from("tasks").select(TASK_COLUMNS).eq("id", uuidOrThrow(id, "task_id")).maybeSingle();
  if (error) throw new ApiError(500, "query_failed");
  if (!data) throw new ApiError(404, "task_not_found");
  const { data: assignees } = await db.from("task_assignees").select("member_id,pod_id").eq("task_id", id);
  return { task: { ...data, assignees: assignees || [] } };
}

async function addAssignees(taskId: string, memberIds: string[]) {
  if (memberIds.length === 0) return;
  const { data: valid } = await db.from("agency_members").select("id").in("id", memberIds);
  const validIds = new Set((valid || []).map((m) => m.id));
  const missing = memberIds.filter((m) => !validIds.has(m));
  if (missing.length) throw new ApiError(400, "unknown_assignee", `Unknown member ids: ${missing.join(", ")}`);
  const { data: existing } = await db.from("task_assignees").select("member_id").eq("task_id", taskId);
  const have = new Set((existing || []).map((r) => r.member_id));
  const rows = memberIds.filter((m) => !have.has(m)).map((member_id) => ({ task_id: taskId, member_id }));
  if (rows.length) {
    const { error } = await db.from("task_assignees").insert(rows);
    if (error) throw new ApiError(500, "assign_failed");
  }
}

async function createTask(key: AgentKey, input: Record<string, unknown>) {
  need(key, "tasks:create");
  const { fields, assigneeIds } = taskFields(input, true);
  if (fields.stage === "done") throw new ApiError(400, "cannot_create_done");
  const who = await displayName(key);
  const row = {
    stage: "todo",
    status: "todo",
    priority: "medium",
    ...fields,
    created_by: who,
    source: `agent:${key.name}`,
  };
  const { data, error } = await db.from("tasks").insert(row).select(TASK_COLUMNS).single();
  if (error || !data) throw new ApiError(500, "create_failed");
  await addAssignees(data.id, assigneeIds);
  await db.from("task_history").insert({ task_id: data.id, action: "created", new_value: data.title, changed_by: who });
  return { task: data, changed: Object.keys(fields) };
}

async function updateTask(key: AgentKey, id: string, input: Record<string, unknown>) {
  need(key, "tasks:update");
  uuidOrThrow(id, "task_id");
  const { fields, assigneeIds } = taskFields(input, false);
  const { data: current, error: curErr } = await db.from("tasks").select("id,stage,status,title").eq("id", id).maybeSingle();
  if (curErr) throw new ApiError(500, "query_failed");
  if (!current) throw new ApiError(404, "task_not_found");

  if (fields.stage !== undefined && fields.stage !== current.stage) {
    // Only Zac moves work out of "Needs Zac Approval" (from the dashboard, not the API).
    if (current.stage === "needs_zac_approval") throw new ApiError(403, "awaiting_zac_approval", "Only Zac can move a task out of Needs Zac Approval.");
    // Agents can't skip review: work reaches Done only via QA/approval columns.
    if (fields.stage === "done" && !["needs_qa", "agency_review"].includes(current.stage)) {
      throw new ApiError(403, "done_requires_qa", "Move the task to needs_qa first; QA moves it to done or needs_zac_approval.");
    }
    if (fields.stage === "done") {
      fields.status = "completed";
      fields.completed_at = new Date().toISOString();
    } else if (current.status === "completed") {
      fields.status = "in_progress";
      fields.completed_at = null;
    }
  }
  const who = await displayName(key);
  if (Object.keys(fields).length > 0) {
    const { error } = await db.from("tasks").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new ApiError(500, "update_failed");
  }
  await addAssignees(id, assigneeIds);
  if (fields.stage !== undefined && fields.stage !== current.stage) {
    await db.from("task_history").insert({
      task_id: id,
      action: fields.stage === "done" ? "completed" : "status_changed",
      old_value: current.stage,
      new_value: String(fields.stage),
      changed_by: who,
    });
  }
  const { task } = await getTask({ ...key, scopes: [...key.scopes, "tasks:read"] }, id);
  return { task, changed: [...Object.keys(fields), ...(assigneeIds.length ? ["assignee_ids"] : [])] };
}

async function listComments(key: AgentKey, taskId: string) {
  need(key, "comments:read");
  const { data, error } = await db
    .from("task_comments")
    .select(COMMENT_COLUMNS)
    .eq("task_id", uuidOrThrow(taskId, "task_id"))
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new ApiError(500, "query_failed");
  return { comments: data };
}

async function addComment(key: AgentKey, taskId: string, input: Record<string, unknown>) {
  need(key, "comments:create");
  uuidOrThrow(taskId, "task_id");
  const content = str(input.content, 20000);
  if (!content) throw new ApiError(400, "content_required");
  const { data: t } = await db.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (!t) throw new ApiError(404, "task_not_found");
  const { data, error } = await db
    .from("task_comments")
    .insert({ task_id: taskId, author_name: await displayName(key), content, comment_type: "text" })
    .select(COMMENT_COLUMNS)
    .single();
  if (error || !data) throw new ApiError(500, "comment_failed");
  return { comment: data };
}

async function updateComment(key: AgentKey, commentId: string, input: Record<string, unknown>) {
  need(key, "comments:update");
  uuidOrThrow(commentId, "comment_id");
  const content = str(input.content, 20000);
  if (!content) throw new ApiError(400, "content_required");
  // A key may only edit comments it created (proven by the audit log), never humans' comments.
  const { data: own } = await db
    .from("agent_api_audit_log")
    .select("id")
    .eq("key_id", key.id)
    .eq("action", "comments.create")
    .eq("comment_id", commentId)
    .lt("status_code", 300)
    .limit(1);
  if (!own || own.length === 0) throw new ApiError(403, "not_your_comment");
  const { data, error } = await db.from("task_comments").update({ content }).eq("id", commentId).select(COMMENT_COLUMNS).single();
  if (error || !data) throw new ApiError(500, "comment_update_failed");
  return { comment: data };
}

function stagesInfo() {
  return { stages: STAGES, legacy_stages: LEGACY_STAGES, aliases: { agency_review: "needs_qa" } };
}

// ───────────────────────── MCP (JSON-RPC 2.0) ─────────────────────────

const MCP_TOOLS = [
  { name: "list_tasks", description: "List board tasks (newest activity first). Filters: client_id, stage, assignee_id, updated_since, limit (max 200).", inputSchema: { type: "object", properties: { client_id: { type: "string" }, stage: { type: "string", enum: [...STAGES] }, assignee_id: { type: "string" }, updated_since: { type: "string" }, limit: { type: "number" } } } },
  { name: "get_task", description: "Get one task with its assignees.", inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } } } },
  { name: "create_task", description: "Create a task. Stages: todo, in_progress, needs_qa, needs_zac_approval.", inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" }, description: { type: "string" }, stage: { type: "string", enum: ["todo", "in_progress", "needs_qa", "needs_zac_approval"] }, priority: { type: "string", enum: PRIORITIES }, due_date: { type: "string", description: "YYYY-MM-DD" }, client_id: { type: "string" }, project_id: { type: "string" }, parent_task_id: { type: "string" }, assignee_ids: { type: "array", items: { type: "string" } } } } },
  { name: "update_task", description: "Update a task (no deletes). Cannot move out of needs_zac_approval; done only from needs_qa.", inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, stage: { type: "string", enum: [...STAGES] }, priority: { type: "string", enum: PRIORITIES }, due_date: { type: "string" }, assignee_ids: { type: "array", items: { type: "string" }, description: "Adds assignees; never removes." } } } },
  { name: "list_comments", description: "List comments on a task.", inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } } } },
  { name: "add_comment", description: "Add a comment to a task as this AI.", inputSchema: { type: "object", required: ["task_id", "content"], properties: { task_id: { type: "string" }, content: { type: "string" } } } },
  { name: "list_stages", description: "List the board stages.", inputSchema: { type: "object", properties: {} } },
];

async function mcpCall(key: AgentKey, name: string, args: Record<string, unknown>, audit: AuditCtx) {
  const a = { ...args };
  switch (name) {
    case "list_tasks": audit.action = "tasks.list"; return listTasks(key, a as Record<string, string>);
    case "get_task": audit.action = "tasks.get"; audit.task_id = String(a.task_id); return getTask(key, String(a.task_id));
    case "create_task": { audit.action = "tasks.create"; const r = await createTask(key, a); audit.task_id = r.task.id; audit.details = { fields: r.changed }; return r; }
    case "update_task": { audit.action = "tasks.update"; const id = String(a.task_id); delete a.task_id; audit.task_id = id; const r = await updateTask(key, id, a); audit.details = { fields: r.changed }; return r; }
    case "list_comments": audit.action = "comments.list"; audit.task_id = String(a.task_id); return listComments(key, String(a.task_id));
    case "add_comment": { audit.action = "comments.create"; const id = String(a.task_id); audit.task_id = id; const r = await addComment(key, id, { content: a.content }); audit.comment_id = r.comment.id; return r; }
    case "list_stages": audit.action = "stages.list"; return stagesInfo();
    default: throw new ApiError(400, "unknown_tool");
  }
}

async function handleMcp(req: Request, key: AgentKey, msg: any, audit: AuditCtx): Promise<Response> {
  const id = msg?.id ?? null;
  const reply = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid Request");
  if (msg.method.startsWith("notifications/")) return new Response(null, { status: 202, headers: CORS });
  switch (msg.method) {
    case "initialize":
      audit.action = "mcp.initialize";
      return reply({
        protocolVersion: msg.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "hpa-agent-tasks", version: "0.1.0" },
        instructions: "HPA task board. Tasks and comments only: read, create, update. No deletes. Work flows todo → in_progress → needs_qa → needs_zac_approval → done.",
      });
    case "ping": return reply({});
    case "tools/list": audit.action = "mcp.tools_list"; return reply({ tools: MCP_TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name || "");
      try {
        const result = await mcpCall(key, name, msg.params?.arguments || {}, audit);
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(500, "internal_error");
        audit.status = err.status;
        return reply({ content: [{ type: "text", text: `${err.code}: ${err.message}` }], isError: true });
      }
    }
    default: return fail(-32601, "Method not found");
  }
}

// ───────────────────────── routing + audit ─────────────────────────

type AuditCtx = { action: string; status: number; task_id?: string; comment_id?: string; details?: Record<string, unknown> };

async function writeAudit(req: Request, route: string, key: AgentKey | null, a: AuditCtx) {
  try {
    await db.from("agent_api_audit_log").insert({
      key_id: key?.id ?? null,
      key_name: key?.name ?? null,
      method: req.method,
      route: route.slice(0, 200),
      action: a.action,
      task_id: isUuid(a.task_id) ? a.task_id : null,
      comment_id: isUuid(a.comment_id) ? a.comment_id : null,
      status_code: a.status,
      ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || null,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 200) || null,
      details: a.details ?? {},
    });
  } catch {
    // Audit failures must not leak details; they surface in function logs only.
    console.error("[agent-tasks-api] audit write failed");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const idx = url.pathname.indexOf("/agent-tasks-api");
  const route = (idx >= 0 ? url.pathname.slice(idx + "/agent-tasks-api".length) : url.pathname) || "/";
  const parts = route.split("/").filter(Boolean);
  const audit: AuditCtx = { action: "unknown", status: 200 };
  let key: AgentKey | null = null;

  if (req.method === "DELETE") {
    audit.action = "delete.denied";
    audit.status = 405;
    await writeAudit(req, route, null, audit);
    return json({ error: "method_not_allowed", message: "Deletes are not available on this API." }, 405);
  }

  let body: any = undefined;
  if (req.method === "POST" || req.method === "PATCH") {
    const text = await req.text();
    if (text.length > 100_000) return json({ error: "payload_too_large" }, 413);
    try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: "invalid_json" }, 400); }
  }

  try {
    key = await authenticate(req, body);

    if (parts[0] === "mcp" && req.method === "POST") {
      if (Array.isArray(body)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batching not supported" } });
      const res = await handleMcp(req, key, body, audit);
      return res;
    }

    const q = Object.fromEntries(url.searchParams.entries());
    let result: unknown;
    if (parts[0] === "stages" && req.method === "GET") { audit.action = "stages.list"; result = stagesInfo(); }
    else if (parts[0] === "tasks" && parts.length === 1 && req.method === "GET") { audit.action = "tasks.list"; result = await listTasks(key, q); }
    else if (parts[0] === "tasks" && parts.length === 1 && req.method === "POST") {
      audit.action = "tasks.create";
      const r = await createTask(key, body || {}); audit.task_id = r.task.id; audit.details = { fields: r.changed }; result = r; audit.status = 201;
    }
    else if (parts[0] === "tasks" && parts.length === 2 && req.method === "GET") { audit.action = "tasks.get"; audit.task_id = parts[1]; result = await getTask(key, parts[1]); }
    else if (parts[0] === "tasks" && parts.length === 2 && req.method === "PATCH") {
      audit.action = "tasks.update"; audit.task_id = parts[1];
      const r = await updateTask(key, parts[1], body || {}); audit.details = { fields: r.changed }; result = r;
    }
    else if (parts[0] === "tasks" && parts[2] === "comments" && parts.length === 3 && req.method === "GET") { audit.action = "comments.list"; audit.task_id = parts[1]; result = await listComments(key, parts[1]); }
    else if (parts[0] === "tasks" && parts[2] === "comments" && parts.length === 3 && req.method === "POST") {
      audit.action = "comments.create"; audit.task_id = parts[1];
      const r = await addComment(key, parts[1], body || {}); audit.comment_id = r.comment.id; result = r; audit.status = 201;
    }
    else if (parts[0] === "comments" && parts.length === 2 && req.method === "PATCH") {
      audit.action = "comments.update"; audit.comment_id = parts[1]; result = await updateComment(key, parts[1], body || {});
    }
    else throw new ApiError(404, "route_not_found");

    return json(result, audit.status);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "internal_error");
    if (!(e instanceof ApiError)) console.error("[agent-tasks-api] unexpected error");
    audit.status = err.status;
    if (audit.action === "unknown") audit.action = err.status === 401 ? "auth.denied" : err.status === 429 ? "rate_limited" : "error";
    audit.details = { ...(audit.details || {}), error: err.code };
    return json({ error: err.code, message: err.message }, err.status, err.status === 429 ? { "Retry-After": "60" } : {});
  } finally {
    await writeAudit(req, route, key, audit);
  }
});
