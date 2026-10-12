-- Daily ad scoreboard snapshot + client claims.
-- DRAFT migration — do not run on a live database until reviewed.
-- cost_per_booked_call / cost_per_show are lifetime spend / attributed counts
-- until Meta daily ad insights (system-user token) exist.
-- snapshot_date is the America/Los_Angeles business day, not the UTC date.

create table if not exists public.ad_scoreboard_daily (
  snapshot_date date not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  meta_ad_id text not null,
  ad_name text,
  spend numeric,
  leads int,
  booked_calls int,
  shows int,
  funded int,
  cost_per_booked_call numeric,
  cost_per_show numeric,
  rank int,
  created_at timestamptz default now(),
  primary key (snapshot_date, client_id, meta_ad_id)
);

create index if not exists ad_scoreboard_daily_client
  on public.ad_scoreboard_daily(client_id, snapshot_date);

alter table public.ad_scoreboard_daily enable row level security;

drop policy if exists "auth read scoreboard" on public.ad_scoreboard_daily;
create policy "auth read scoreboard"
  on public.ad_scoreboard_daily
  for select
  to authenticated
  using (true);

grant select on public.ad_scoreboard_daily to authenticated;
grant all on public.ad_scoreboard_daily to service_role;

-- client_claims: one row per client offer. Service role only until a staff read policy is added.
create table if not exists public.client_claims (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  client_slug text not null,
  offer_name text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  claims jsonb not null, -- full claims file (SCHEMA.md v1.0)
  funnel_url text,
  required_footer text,
  banned_words text[] not null default '{}',
  last_approved_by text,
  last_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, offer_name)
);

create index if not exists client_claims_client_idx on public.client_claims(client_id);

alter table public.client_claims enable row level security;

grant all on public.client_claims to service_role;
