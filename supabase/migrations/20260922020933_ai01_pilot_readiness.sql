-- Private operational packets. The existing signed dashboard session is
-- verified by pilot-readiness; public report viewers never access these tables.
create table public.pilot_readiness_packets (
  client_id uuid not null references public.clients(id),
  scope text not null check (scope in ('agency_acquisition', 'capital_raising')),
  input jsonb not null,
  version integer not null check (version > 0),
  status text not null check (status in ('needs_input', 'ready_for_review', 'accepted')),
  blockers jsonb not null,
  source_snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  accepted_at timestamptz,
  accepted_by text,
  primary key (client_id, scope),
  check ((status = 'accepted') = (accepted_at is not null and accepted_by is not null))
);
create table public.pilot_readiness_history (
  client_id uuid not null,
  scope text not null,
  version integer not null,
  event text not null check (event in ('saved', 'accepted')),
  actor text not null,
  recorded_at timestamptz not null default now(),
  snapshot jsonb not null,
  primary key (client_id, scope, version),
  foreign key (client_id, scope) references public.pilot_readiness_packets(client_id, scope)
);
alter table public.pilot_readiness_packets enable row level security;
alter table public.pilot_readiness_history enable row level security;
revoke all on public.pilot_readiness_packets, public.pilot_readiness_history from public, anon, authenticated;
grant select, insert, update on public.pilot_readiness_packets to service_role;
grant select, insert on public.pilot_readiness_history to service_role;

-- CAS, source validation, approval and its audit snapshot commit together.
-- SECURITY INVOKER and service-only EXECUTE prevent a browser forging approvals.
create function public.write_pilot_readiness(
  p_client_id uuid, p_scope text, p_input jsonb, p_expected_version integer,
  p_accept boolean, p_actor text, p_sources jsonb, p_blockers jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.pilot_readiness_packets%rowtype;
  v_new public.pilot_readiness_packets%rowtype;
  v_client jsonb;
  v_offer jsonb;
  v_members jsonb;
  v_status text;
begin
  if p_scope not in ('agency_acquisition', 'capital_raising') or p_expected_version is null or p_expected_version < 0
     or p_actor is null or p_actor !~ '^(member|user):[0-9a-f-]{36}$'
     or jsonb_typeof(p_blockers) is distinct from 'array' or jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid packet request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_id::text || ':' || p_scope, 0));
  select * into v_old from public.pilot_readiness_packets where client_id = p_client_id and scope = p_scope for update;
  if coalesce(v_old.version, 0) <> p_expected_version then raise exception 'Version conflict' using errcode = '40001'; end if;
  perform 1 from public.clients where id = p_client_id for share;
  select to_jsonb(c) into v_client from (
    select id, name, status, meta_ad_account_id, meta_ad_account_ids, ghl_location_id from public.clients where id = p_client_id
  ) c;
  if nullif(p_input->>'offer_id', '') is not null then
    perform 1 from public.client_offers where id = (p_input->>'offer_id')::uuid for share;
    select to_jsonb(o) into v_offer from (
      select id, client_id, title, offer_type, status, meta_ad_account_id, ghl_location_id from public.client_offers where id = (p_input->>'offer_id')::uuid
    ) o;
  end if;
  perform 1 from public.agency_members where id::text in (
    select p_input->>'primary_owner_id' union select p_input->>'backup_owner_id' union select p_input->>'account_verified_by'
    union select value from jsonb_each_text(coalesce(p_input->'issue_owners', '{}'::jsonb))
  ) for share;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) into v_members from (
    select id, name, role from public.agency_members where id::text in (
      select p_input->>'primary_owner_id' union select p_input->>'backup_owner_id' union select p_input->>'account_verified_by'
      union select value from jsonb_each_text(coalesce(p_input->'issue_owners', '{}'::jsonb))
    )
  ) m;
  if jsonb_build_object('client', v_client, 'offer', v_offer, 'members', v_members) is distinct from p_sources then
    raise exception 'Source mappings changed' using errcode = '40001';
  end if;
  if v_client is null or v_client->>'status' not in ('active', 'onboarding')
    or (v_offer is not null and v_offer->>'client_id' <> p_client_id::text) then
    raise exception 'Invalid client or offer' using errcode = '22023';
  end if;
  if p_accept and (v_old.version is null or v_old.input is distinct from p_input or jsonb_array_length(p_blockers) > 0) then
    raise exception 'Save and resolve inputs before approval' using errcode = '22023';
  end if;
  v_status := case when p_accept then 'accepted' when jsonb_array_length(p_blockers) > 0 then 'needs_input' else 'ready_for_review' end;
  insert into public.pilot_readiness_packets (client_id, scope, input, version, status, blockers, source_snapshot, updated_by, accepted_at, accepted_by)
  values (p_client_id, p_scope, p_input, p_expected_version + 1, v_status, p_blockers, p_sources, p_actor, case when p_accept then now() end, case when p_accept then p_actor end)
  on conflict (client_id, scope) do update set input = excluded.input, version = excluded.version, status = excluded.status,
    blockers = excluded.blockers, source_snapshot = excluded.source_snapshot, updated_at = now(), updated_by = excluded.updated_by,
    accepted_at = excluded.accepted_at, accepted_by = excluded.accepted_by
  returning * into v_new;
  insert into public.pilot_readiness_history (client_id, scope, version, event, actor, snapshot)
  values (p_client_id, p_scope, v_new.version, case when p_accept then 'accepted' else 'saved' end, p_actor, to_jsonb(v_new));
  return to_jsonb(v_new);
end;
$$;
revoke all on function public.write_pilot_readiness(uuid,text,jsonb,integer,boolean,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.write_pilot_readiness(uuid,text,jsonb,integer,boolean,text,jsonb,jsonb) to service_role;
