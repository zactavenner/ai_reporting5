-- DRAFT — NOT APPLIED. Needs Zac's direct approval before running.
-- Task stages v2: To Do → In Progress → Needs QA → Needs Zac Approval → Done.
-- No backfill: existing tasks keep their stored stage. tasks.stage stays free text,
-- so the EOD flow that writes 'agency_review' keeps working; the board shows
-- 'agency_review' inside the "Needs QA" column (see src/lib/taskStages.ts).

create table if not exists public.task_stage_definitions (
  id text primary key,
  label text not null,
  sort_order integer not null,
  is_primary boolean not null default false,
  agency_only boolean not null default false,
  maps_to text references public.task_stage_definitions(id),   -- legacy alias → board column
  created_at timestamptz not null default now()
);

insert into public.task_stage_definitions (id, label, sort_order, is_primary, agency_only, maps_to) values
  ('todo',               'To Do',              10, true,  false, null),
  ('in_progress',        'In Progress',        20, true,  false, null),
  ('needs_qa',           'Needs QA',           30, true,  true,  null),
  ('needs_zac_approval', 'Needs Zac Approval', 40, true,  true,  null),
  ('done',               'Done',               50, true,  false, null)
on conflict (id) do nothing;

insert into public.task_stage_definitions (id, label, sort_order, is_primary, agency_only, maps_to) values
  ('agency_review', 'Agency Review (legacy)', 31, false, true,  'needs_qa'),
  ('client_tasks',  'Client Tasks (legacy)',  5,  false, false, null),
  ('stuck',         'Stuck (legacy)',         25, false, false, null),
  ('review',        'Client Review (legacy)', 45, false, false, null),
  ('revisions',     'Revisions (legacy)',     46, false, false, null)
on conflict (id) do nothing;

alter table public.task_stage_definitions enable row level security;
drop policy if exists "task stages readable" on public.task_stage_definitions;
create policy "task stages readable" on public.task_stage_definitions for select to anon, authenticated using (true);
grant select on public.task_stage_definitions to anon, authenticated;
