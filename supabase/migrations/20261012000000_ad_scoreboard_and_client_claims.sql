create table if not exists public.ad_scoreboard_daily (
  snapshot_date date not null, client_id uuid not null, meta_ad_id text not null, ad_name text,
  spend numeric, leads int, booked_calls int, shows int, funded int,
  cost_per_booked_call numeric, cost_per_show numeric, rank int,
  created_at timestamptz default now(), primary key (snapshot_date, meta_ad_id));
create index if not exists ad_scoreboard_daily_client on public.ad_scoreboard_daily(client_id, snapshot_date);
alter table public.ad_scoreboard_daily enable row level security;
create policy "auth read scoreboard" on public.ad_scoreboard_daily for select to authenticated using (true);
-- client_claims: one row per client offer. DRAFT migration — do not run on live DB without Zac.
create table if not exists public.client_claims (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  client_slug text not null,
  offer_name text not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  claims jsonb not null,              -- full claims file (SCHEMA.md v1.0)
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
-- service role only by default; add read policy for agency staff as needed.
