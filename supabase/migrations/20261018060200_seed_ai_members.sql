-- DRAFT — NOT APPLIED. Needs Zac's direct approval before running.
-- AI team members for the 24/7 board. Rows in agency_members only:
-- no auth users are created and no invite emails are sent (nothing here calls an invite function).
-- Pod: 'AI Agent' (5076b256-528c-449d-bed9-ef7f1b22532a). Emails are non-routable placeholders on the
-- reserved .invalid TLD so task-assignment notifications can never reach a real inbox.

-- 1) Codex reuses the existing Alfred member (rename only; id, email, pod unchanged).
update public.agency_members
   set name = 'Codex', updated_at = now()
 where id = '32328983-a004-41a3-8c65-25f9fea3b2d9'
   and name = 'Alfred';

-- 2) Specialist bots (idempotent: skipped if a member with that name already exists).
insert into public.agency_members (name, email, role, pod_id)
select v.name, v.email, 'member', '5076b256-528c-449d-bed9-ef7f1b22532a'
from (values
  ('Media Buyer Bot',      'media-buyer.bot@hpa-agents.invalid'),
  ('Video Editor Bot',     'video-editor.bot@hpa-agents.invalid'),
  ('Static Creatives Bot', 'static-creatives.bot@hpa-agents.invalid'),
  ('QA Bot',               'qa.bot@hpa-agents.invalid'),
  ('Finances Bot',         'finances.bot@hpa-agents.invalid'),
  ('Viral Scout',          'viral-scout.bot@hpa-agents.invalid'),
  ('Comment Guard',        'comment-guard.bot@hpa-agents.invalid'),
  ('Sales Bot',            'sales.bot@hpa-agents.invalid'),
  ('Copywriter Bot',       'copywriter.bot@hpa-agents.invalid'),
  ('Video Ads Bot',        'video-ads.bot@hpa-agents.invalid')
) as v(name, email)
where not exists (
  select 1 from public.agency_members m
  where lower(m.name) = lower(v.name) or lower(m.email) = lower(v.email)
);
