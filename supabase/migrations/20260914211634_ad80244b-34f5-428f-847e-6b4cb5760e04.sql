create table if not exists public.meeting_sheet_deliveries (
  id uuid primary key default gen_random_uuid(),
  meeting_record_id uuid not null references public.meeting_records(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  spreadsheet_id text,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  readback_verified boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_record_id)
);

create index if not exists meeting_sheet_deliveries_due_idx
  on public.meeting_sheet_deliveries (status, next_attempt_at);

grant all on public.meeting_sheet_deliveries to service_role;

alter table public.meeting_sheet_deliveries enable row level security;
