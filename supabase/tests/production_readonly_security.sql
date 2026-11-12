-- Read-only checks against the enrolled production pair.
-- NEVER inserts/deletes user data, unlike the offline fixture-based RLS suite.
-- Run manually in Supabase SQL Editor after production security changes.
do $audit$
declare
  member_id uuid := (select id from public.profiles where stable_key='sasa');
  outsider_id uuid := gen_random_uuid();
begin
  if member_id is null then raise exception 'Enrolled member missing'; end if;
  if has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'Anonymous profile access is granted';
  end if;
  if has_column_privilege('authenticated','public.profiles','stable_key','UPDATE') then
    raise exception 'Authenticated users can change their identity key';
  end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  if exists (select 1 from public.profiles) then
    raise exception 'Outsider can read profiles';
  end if;
  if exists (select 1 from public.chat_entries) then
    raise exception 'Outsider can read chat';
  end if;
  if exists (select 1 from public.important_dates) then
    raise exception 'Outsider can read dates';
  end if;
  if exists (select 1 from public.voice_calls) then
    raise exception 'Outsider can read calls';
  end if;
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'Member cannot read the two enrolled profiles';
  end if;
  execute 'reset role';
end $audit$;
select 'Production RLS verified' as result;
