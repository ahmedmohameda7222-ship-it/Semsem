create table public.voice_calls (
  id uuid primary key,
  caller_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'ringing' check(status in ('ringing','answered','declined','cancelled','missed','ended')),
  offer text,
  answer text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '45 seconds',
  notified_at timestamptz,
  caller_alive timestamptz,
  recipient_alive timestamptz,
  check(caller_id <> recipient_id),
  check(length(offer)<=20000 and length(answer)<=20000)
);
create index voice_calls_created on public.voice_calls(created_at desc);
alter table public.voice_calls enable row level security;
revoke all on public.voice_calls from public,anon,authenticated;
grant select on public.voice_calls to authenticated;
grant select,update on public.voice_calls to service_role;
create policy voice_participant_read on public.voice_calls for select to authenticated using (
  (select our_space_private.is_member()) and (select auth.uid()) in (caller_id,recipient_id)
);
alter publication supabase_realtime add table public.voice_calls;

create function our_space_private.start_voice(call_id uuid, offer_sdp text) returns public.voice_calls
language plpgsql security definer set search_path='' as $$
declare
  me uuid := auth.uid();
  partner uuid;
  result public.voice_calls;
begin
  if not our_space_private.is_member() or call_id is null or offer_sdp is null or length(offer_sdp) not between 1 and 20000 then raise exception 'Invalid call'; end if;
  select id into partner from public.profiles where id<>me;
  if partner is null then raise exception 'Partner unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('our-space:voice-calls',0));
  update public.voice_calls set status=case status when 'ringing' then 'missed' else 'ended' end,offer=null,answer=null
    where status in ('ringing','answered') and expires_at<=now();
  select * into result from public.voice_calls where id=call_id and caller_id=me;
  if found then return result; end if;
  if exists(select 1 from public.voice_calls where status in ('ringing','answered') and expires_at>now()) then raise exception 'Another call is already active'; end if;
  if (select count(*) from public.voice_calls where caller_id=me and created_at>now()-interval '1 minute')>=5 then raise exception 'Please wait before calling again'; end if;
  insert into public.voice_calls(id,caller_id,recipient_id,offer) values(call_id,me,partner,offer_sdp) returning * into result;
  return result;
end $$;

create function our_space_private.change_voice(call_id uuid, operation text, answer_sdp text) returns public.voice_calls
language plpgsql security definer set search_path='' as $$
declare
  me uuid := auth.uid();
  result public.voice_calls;
  next_status text;
begin
  if not our_space_private.is_member() then raise exception 'Invalid call'; end if;
  select * into result from public.voice_calls where id=call_id and me in (caller_id,recipient_id) for update;
  if not found then raise exception 'Call unavailable'; end if;
  if result.expires_at<=now() and result.status in ('ringing','answered') then
    next_status := case result.status when 'ringing' then 'missed' else 'ended' end;
  elsif operation='answer' and result.status='ringing' and me=result.recipient_id and length(answer_sdp) between 1 and 20000 then
    update public.voice_calls set status='answered',answer=answer_sdp,caller_alive=now(),recipient_alive=now(),expires_at=now()+interval '75 seconds' where id=call_id returning * into result;
    return result;
  elsif operation='touch' and result.status='answered' then
    update public.voice_calls set
      caller_alive=case when me=caller_id then now() else caller_alive end,
      recipient_alive=case when me=recipient_id then now() else recipient_alive end,
      expires_at=(case when me=caller_id then recipient_alive else caller_alive end)+interval '75 seconds'
    where id=call_id returning * into result;
    return result;
  elsif operation='decline' and result.status='ringing' and me=result.recipient_id then next_status := 'declined';
  elsif operation='end' and result.status='ringing' and me=result.caller_id then next_status := 'cancelled';
  elsif operation='end' and result.status='answered' then next_status := 'ended';
  elsif result.status not in ('ringing','answered') then return result;
  else raise exception 'Invalid call transition';
  end if;
  update public.voice_calls set status=next_status,offer=null,answer=null where id=call_id returning * into result;
  return result;
end $$;

create function public.start_voice(call_id uuid,offer_sdp text) returns public.voice_calls
language sql security invoker set search_path='' as $$ select our_space_private.start_voice(call_id,offer_sdp) $$;
create function public.change_voice(call_id uuid,operation text,answer_sdp text default null) returns public.voice_calls
language sql security invoker set search_path='' as $$ select our_space_private.change_voice(call_id,operation,answer_sdp) $$;
revoke all on function public.start_voice(uuid,text),public.change_voice(uuid,text,text),our_space_private.start_voice(uuid,text),our_space_private.change_voice(uuid,text,text) from public,anon,authenticated;
grant execute on function public.start_voice(uuid,text),public.change_voice(uuid,text,text),our_space_private.start_voice(uuid,text),our_space_private.change_voice(uuid,text,text) to authenticated;

drop policy if exists pair_voice_receive on realtime.messages;
drop policy if exists pair_voice_send on realtime.messages;

select cron.schedule('our-space-expire-calls','* * * * *',$job$
  update public.voice_calls set status=case status when 'ringing' then 'missed' else 'ended' end,offer=null,answer=null
  where status in ('ringing','answered') and expires_at<=now()
$job$);
