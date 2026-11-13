-- Durable ICE-restart negotiation between the same two call participants.
alter table public.voice_calls
  add column if not exists recovery_seq integer not null default 0,
  add column if not exists recovery_requested_at timestamptz,
  add column if not exists recovery_started_at timestamptz,
  add column if not exists recovery_offer text,
  add column if not exists recovery_answer text;
alter table public.voice_calls
  add constraint voice_recovery_revision_check check (recovery_seq between 0 and 1000),
  add constraint voice_recovery_sdp_size_check
    check (length(recovery_offer)<=20000 and length(recovery_answer)<=20000);

create or replace function our_space_private.recover_voice(
  call_id uuid, operation text, offer_sdp text default null, expected_seq integer default null
) returns public.voice_calls
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  row public.voice_calls;
  content text := trim(coalesce(offer_sdp,''));
begin
  if actor is null or not our_space_private.is_member() or call_id is null then
    raise exception 'Call unavailable';
  end if;
  select * into row from public.voice_calls c
    where c.id=call_id and actor in (c.caller_id,c.recipient_id) for update;
  if not found or row.status<>'answered' or row.expires_at<=now() then
    raise exception 'Call unavailable';
  end if;
  if operation='request' and actor=row.recipient_id then
    if row.recovery_requested_at is null or
       row.recovery_requested_at<=now()-interval '6 seconds' then
      update public.voice_calls set recovery_requested_at=clock_timestamp()
        where id=call_id returning * into row;
    end if;
    return row;
  elsif operation='offer' and actor=row.caller_id then
    if length(content) not between 1 and 20000 or
       expected_seq is distinct from row.recovery_seq or
       row.recovery_seq>=1000 then
      raise exception 'Invalid restart offer or generation';
    end if;
    if row.recovery_answer is null and row.recovery_started_at is not null
       and row.recovery_started_at>now()-interval '6 seconds' then
      raise exception 'Recovery already underway';
    end if;
    update public.voice_calls
      set recovery_seq=recovery_seq+1,
          recovery_started_at=clock_timestamp(),
          recovery_offer=content,recovery_answer=null,
          caller_candidates='[]'::jsonb,recipient_candidates='[]'::jsonb
      where id=call_id returning * into row;
    return row;
  elsif operation='answer' and actor=row.recipient_id then
    if length(content) not between 1 and 20000 or
       expected_seq is distinct from row.recovery_seq or
       row.recovery_offer is null then
      raise exception 'Invalid restart answer or generation';
    end if;
    if row.recovery_answer is not null then
      if row.recovery_answer=content then return row; end if;
      raise exception 'Restart answer already recorded';
    end if;
    update public.voice_calls set recovery_answer=content
      where id=call_id returning * into row;
    return row;
  end if;
  raise exception 'Invalid recovery operation';
end $$;

create or replace function public.recover_voice(
  call_id uuid, operation text, offer_sdp text default null, expected_seq integer default null
) returns public.voice_calls
language sql security invoker set search_path='' as $$
  select our_space_private.recover_voice(call_id,operation,offer_sdp,expected_seq)
$$;
revoke all on function public.recover_voice(uuid,text,text,integer),
  our_space_private.recover_voice(uuid,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.recover_voice(uuid,text,text,integer),
  our_space_private.recover_voice(uuid,text,text,integer) to authenticated;

create or replace function our_space_private.push_voice_candidates_v2(
  call_id uuid,candidate_list jsonb,expected_seq integer
) returns void language plpgsql security definer set search_path='' as $$
declare seq integer;
begin
  if not our_space_private.is_member() or call_id is null then
    raise exception 'Call unavailable';
  end if;
  select c.recovery_seq into seq from public.voice_calls c
    where c.id=call_id and auth.uid() in(c.caller_id,c.recipient_id)
      and c.status in ('ringing','answered') and c.expires_at>now() for update;
  if not found or seq is distinct from expected_seq then
    raise exception 'Stale ICE generation';
  end if;
  perform our_space_private.push_voice_candidates(call_id,candidate_list);
end $$;
create or replace function public.push_voice_candidates_v2(
  call_id uuid,candidate_list jsonb,expected_seq integer
) returns void language sql security invoker set search_path='' as $$
  select our_space_private.push_voice_candidates_v2(call_id,candidate_list,expected_seq)
$$;
revoke all on function public.push_voice_candidates_v2(uuid,jsonb,integer),
  our_space_private.push_voice_candidates_v2(uuid,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.push_voice_candidates_v2(uuid,jsonb,integer),
  our_space_private.push_voice_candidates_v2(uuid,jsonb,integer) to authenticated;

create or replace function our_space_private.clear_voice_recovery_on_finish()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('ended','missed','cancelled','declined')
     and old.status is distinct from new.status then
    new.recovery_offer := null;
    new.recovery_answer := null;
  end if;
  return new;
end $$;
create trigger voice_recovery_cleanup
  before update of status on public.voice_calls
  for each row execute function our_space_private.clear_voice_recovery_on_finish();
