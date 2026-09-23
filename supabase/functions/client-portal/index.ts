import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { corsHeaders as sdkCors } from 'npm:@supabase/supabase-js@2.115.0/cors';

const corsHeaders = {
  ...sdkCors,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const authClient = (authHeader: string) => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
);

type PortalProfile = {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  status: 'invited' | 'active' | 'disabled';
};

type PortalClient = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  status: string;
};

type PortalTask = {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  stage: string;
  due_date: string | null;
  created_by: string | null;
  completed_at: string | null;
  parent_task_id: string | null;
  visible_to_client: boolean;
  created_at: string;
  updated_at: string;
};

type PortalComment = {
  id: string;
  task_id: string;
  author_name: string;
  content: string;
  created_at: string;
  comment_type: string | null;
};

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);
const ALLOWED_STAGES = new Set(['client_tasks', 'todo', 'in_progress', 'stuck', 'review', 'revisions', 'done']);
const ALLOWED_STATUS = new Set(['todo', 'in_progress', 'completed']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function safeDate(value: unknown): string | null {
  const raw = cleanText(value, 20);
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function statusForStage(stage: string): string {
  if (stage === 'done') return 'completed';
  if (stage === 'in_progress') return 'in_progress';
  return 'todo';
}

async function authenticate(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: json({ error: 'Please sign in to view client tasks.' }, 401) };
  }

  const token = authHeader.slice(7).trim();
  const { data, error } = await authClient(authHeader).auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id || !user.email) {
    return { error: json({ error: 'Please sign in again to view client tasks.' }, 401) };
  }

  const email = String(user.email).trim().toLowerCase();
  let { data: profile, error: profileError } = await admin
    .from('client_portal_profiles')
    .select('id,user_id,email,name,status')
    .eq('email_normalized', email)
    .maybeSingle();

  if (profileError) return { error: json({ error: 'Unable to load your client portal access.' }, 500) };
  if (!profile) return { error: json({ error: 'This email is not assigned to any client projects yet.' }, 403) };
  if (profile.status === 'disabled') return { error: json({ error: 'This client portal account is disabled.' }, 403) };
  if (profile.user_id && profile.user_id !== user.id) return { error: json({ error: 'This client portal invite is already linked to another login.' }, 403) };

  if (!profile.user_id) {
    const { data: updated, error: updateError } = await admin
      .from('client_portal_profiles')
      .update({ user_id: user.id, status: 'active', last_login_at: new Date().toISOString() })
      .eq('id', profile.id)
      .is('user_id', null)
      .select('id,user_id,email,name,status')
      .single();
    if (updateError || !updated) return { error: json({ error: 'Unable to activate your client portal access.' }, 409) };
    profile = updated;
  } else {
    await admin.from('client_portal_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', profile.id);
  }

  return { user, profile: profile as PortalProfile };
}

async function assignedClientIds(profileId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('client_portal_access')
    .select('client_id')
    .eq('portal_profile_id', profileId);
  if (error) throw error;
  return (data || []).map((row: { client_id: string }) => row.client_id).filter(Boolean);
}

async function getPortalData(profile: PortalProfile) {
  const clientIds = await assignedClientIds(profile.id);
  if (clientIds.length === 0) {
    return { profile, clients: [] as PortalClient[], tasks: [] as PortalTask[], comments: [] as PortalComment[] };
  }

  const [{ data: clients, error: clientsError }, { data: tasks, error: tasksError }] = await Promise.all([
    admin.from('clients').select('id,name,slug,logo_url,status').in('id', clientIds).order('name'),
    admin
      .from('tasks')
      .select('id,client_id,title,description,status,priority,stage,due_date,created_by,completed_at,parent_task_id,visible_to_client,created_at,updated_at')
      .in('client_id', clientIds)
      .eq('visible_to_client', true)
      .order('created_at', { ascending: false }),
  ]);
  if (clientsError) throw clientsError;
  if (tasksError) throw tasksError;

  const taskIds = (tasks || []).map((task: PortalTask) => task.id);
  let comments: PortalComment[] = [];
  if (taskIds.length > 0) {
    const { data, error } = await admin
      .from('task_comments')
      .select('id,task_id,author_name,content,created_at,comment_type')
      .in('task_id', taskIds)
      .order('created_at', { ascending: true });
    if (error) throw error;
    comments = (data || []) as PortalComment[];
  }

  return { profile, clients: (clients || []) as PortalClient[], tasks: (tasks || []) as PortalTask[], comments };
}

async function ensureClientAccess(profileId: string, clientId: string) {
  const ids = await assignedClientIds(profileId);
  if (!ids.includes(clientId)) throw new Error('You do not have access to that client project.');
}

async function ensureTaskAccess(profileId: string, taskId: string) {
  const ids = await assignedClientIds(profileId);
  const { data: task, error } = await admin
    .from('tasks')
    .select('id,client_id,visible_to_client')
    .eq('id', taskId)
    .maybeSingle();
  if (error) throw error;
  if (!task || task.visible_to_client === false || !task.client_id || !ids.includes(task.client_id)) {
    throw new Error('You do not have access to that task.');
  }
  return task;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action, 40) || 'overview';

    if (action === 'overview') {
      return json({ ok: true, ...(await getPortalData(auth.profile)) });
    }

    if (action === 'create_task') {
      const clientId = cleanText(body.client_id, 80);
      await ensureClientAccess(auth.profile.id, clientId);
      const title = cleanText(body.title, 180);
      if (!title) return json({ error: 'Task title is required.' }, 400);
      const description = cleanText(body.description, 4000) || null;
      const priority = ALLOWED_PRIORITIES.has(cleanText(body.priority, 20)) ? cleanText(body.priority, 20) : 'medium';
      const dueDate = safeDate(body.due_date);
      const { error } = await admin.from('tasks').insert({
        client_id: clientId,
        title,
        description,
        priority,
        status: 'todo',
        stage: 'client_tasks',
        created_by: auth.profile.name || auth.profile.email,
        visible_to_client: true,
        due_date: dueDate,
      });
      if (error) throw error;
      return json({ ok: true, ...(await getPortalData(auth.profile)) });
    }

    if (action === 'update_task') {
      const taskId = cleanText(body.task_id, 80);
      await ensureTaskAccess(auth.profile.id, taskId);
      const updates: Record<string, unknown> = {};
      if (typeof body.stage !== 'undefined') {
        const stage = cleanText(body.stage, 40);
        if (!ALLOWED_STAGES.has(stage)) return json({ error: 'That task stage is not available in the client portal.' }, 400);
        updates.stage = stage;
        updates.status = statusForStage(stage);
        updates.completed_at = stage === 'done' ? new Date().toISOString() : null;
      }
      if (typeof body.status !== 'undefined') {
        const status = cleanText(body.status, 40);
        if (!ALLOWED_STATUS.has(status)) return json({ error: 'That task status is not available in the client portal.' }, 400);
        updates.status = status;
        if (status === 'completed') {
          updates.stage = 'done';
          updates.completed_at = new Date().toISOString();
        } else if (status === 'in_progress') {
          updates.stage = 'in_progress';
          updates.completed_at = null;
        } else {
          updates.completed_at = null;
        }
      }
      if (typeof body.priority !== 'undefined') {
        const priority = cleanText(body.priority, 20);
        if (!ALLOWED_PRIORITIES.has(priority)) return json({ error: 'That priority is not available.' }, 400);
        updates.priority = priority;
      }
      if (typeof body.due_date !== 'undefined') updates.due_date = safeDate(body.due_date);
      if (Object.keys(updates).length === 0) return json({ error: 'No task changes were provided.' }, 400);
      const { error } = await admin.from('tasks').update(updates).eq('id', taskId);
      if (error) throw error;
      return json({ ok: true, ...(await getPortalData(auth.profile)) });
    }

    if (action === 'add_comment') {
      const taskId = cleanText(body.task_id, 80);
      await ensureTaskAccess(auth.profile.id, taskId);
      const content = cleanText(body.content, 4000);
      if (!content) return json({ error: 'Comment is required.' }, 400);
      const { error } = await admin.from('task_comments').insert({
        task_id: taskId,
        author_name: auth.profile.name || auth.profile.email,
        content,
        comment_type: 'text',
      });
      if (error) throw error;
      return json({ ok: true, ...(await getPortalData(auth.profile)) });
    }

    return json({ error: 'Unknown client portal action.' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Client portal request failed.';
    return json({ error: message }, 500);
  }
});
