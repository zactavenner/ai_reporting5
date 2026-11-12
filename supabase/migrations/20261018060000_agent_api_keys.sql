-- DRAFT — NOT APPLIED. Needs Zac's direct approval before running.
-- Scoped, per-AI API keys for the agent-tasks-api edge function.
-- Keys are stored ONLY as SHA-256 hashes; the plaintext is shown once by scripts/generate-agent-key.ts.

create table if not exists public.agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                      -- e.g. 'claude', 'chatgpt', 'hermes', 'codex'
  member_id uuid references public.agency_members(id) on delete set null,  -- who the AI acts as on the board
  key_prefix text not null unique,                -- non-secret lookup hint, e.g. 'hpa_ak_3f9c1a2b'
  key_hash text not null unique,                  -- hex sha256(pepper || plaintext)
  scopes text[] not null default array['tasks:read','comments:read']::text[],
  rate_limit_per_min integer not null default 60 check (rate_limit_per_min between 1 and 600),
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint agent_api_keys_scopes_allowed check (
    scopes <@ array['tasks:read','tasks:create','tasks:update','comments:read','comments:create','comments:update']::text[]
  )
);
comment on table public.agent_api_keys is
  'Per-AI hashed API keys for agent-tasks-api. Allowed scopes are tasks/comments read, create, update only. No delete scope exists.';

create table if not exists public.agent_api_audit_log (
  id bigserial primary key,
  key_id uuid references public.agent_api_keys(id) on delete set null,
  key_name text,
  method text not null,
  route text not null,
  action text not null,           -- e.g. tasks.list, tasks.update, comments.create, auth.denied, rate_limited
  task_id uuid,
  comment_id uuid,
  status_code integer not null,
  ip text,
  user_agent text,
  details jsonb not null default '{}'::jsonb,   -- changed field NAMES only, never secrets or bodies
  created_at timestamptz not null default now()
);
create index if not exists agent_api_audit_log_key_time_idx on public.agent_api_audit_log (key_id, created_at desc);
create index if not exists agent_api_audit_log_task_idx on public.agent_api_audit_log (task_id);

create table if not exists public.agent_api_rate_buckets (
  key_id uuid not null references public.agent_api_keys(id) on delete cascade,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key_id, window_start)
);

-- Atomic fixed-window rate limiter. Returns true when the request is allowed.
create or replace function public.agent_api_hit(p_key_id uuid, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := date_trunc('minute', now());
  n integer;
begin
  insert into public.agent_api_rate_buckets as b (key_id, window_start, hits)
  values (p_key_id, w, 1)
  on conflict (key_id, window_start) do update set hits = b.hits + 1
  returning hits into n;
  -- opportunistic cleanup of old windows for this key
  delete from public.agent_api_rate_buckets where key_id = p_key_id and window_start < w - interval '1 hour';
  return n <= p_limit;
end;
$$;

-- Service-role only: no anon/authenticated access to keys, audit, or buckets.
alter table public.agent_api_keys enable row level security;
alter table public.agent_api_audit_log enable row level security;
alter table public.agent_api_rate_buckets enable row level security;
revoke all on public.agent_api_keys, public.agent_api_audit_log, public.agent_api_rate_buckets from anon, authenticated;
revoke all on function public.agent_api_hit(uuid, integer) from public, anon, authenticated;
grant execute on function public.agent_api_hit(uuid, integer) to service_role;
