-- Secure low-latency WebRTC Trickle ICE signaling.
-- Existing voice_calls and RPCs are preserved for already-installed PWA builds.
alter table public.voice_calls
  add column if not exists caller_candidates jsonb not null default '[]'::jsonb,
  add column if not exists recipient_candidates jsonb not null default '[]'::jsonb;
alter table public.voice_calls drop constraint if exists voice_calls_caller_candidates_check;
alter table public.voice_calls add constraint voice_calls_caller_candidates_check
  check (jsonb_typeof(caller_candidates)='array' and jsonb_array_length(caller_candidates)<=64);
alter table public.voice_calls drop constraint if exists voice_calls_recipient_candidates_check;
alter table public.voice_calls add constraint voice_calls_recipient_candidates_check
  check (jsonb_typeof(recipient_candidates)='array' and jsonb_array_length(recipient_candidates)<=64);

create or replace function our_space_private.push_voice_candidates(call_id uuid, candidate_list jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  call_record public.voice_calls;
  candidate jsonb;
  items integer;
begin
  if not our_space_private.is_member() or call_id is null or
    jsonb_typeof(candidate_list) <> 'array' or candidate_list is null then
    raise exception 'Invalid ICE signaling';
  end if;
  items:=jsonb_array_length(candidate_list);
  if items<1 or items>12 then raise exception 'Invalid ICE candidate batch size'; end if;
  for candidate in select value from jsonb_array_elements(candidate_list) loop
    if jsonb_typeof(candidate)<>'object' or
      jsonb_typeof(candidate->'candidate') <> 'string' or
      left(candidate->>'candidate',10)<>'candidate:' or
      length(candidate->>'candidate')>2048 or
      (candidate ? 'sdpMid' and candidate->'sdpMid' <> 'null'::jsonb and
        (jsonb_typeof(candidate->'sdpMid')<>'string' or length(candidate->>'sdpMid')>24)) or
      (candidate ? 'sdpMLineIndex' and candidate->'sdpMLineIndex' <> 'null'::jsonb and
        ((candidate->>'sdpMLineIndex') !~ '^[0-9]$')) or
      (candidate ? 'usernameFragment' and candidate->'usernameFragment' <> 'null'::jsonb and
        (jsonb_typeof(candidate->'usernameFragment')<>'string' or length(candidate->>'usernameFragment')>64))
    then
      raise exception 'Invalid ICE candidate';
    end if;
  end loop;

  select * into call_record from public.voice_calls
    where id=call_id and actor in (caller_id,recipient_id)
      and status in ('ringing','answered') and expires_at>now()
    for update;
  if not found then raise exception 'Call unavailable'; end if;

  if actor=call_record.caller_id then
    if jsonb_array_length(call_record.caller_candidates)+items>64 then
      raise exception 'Too many ICE candidates';
    end if;
    update public.voice_calls set caller_candidates=caller_candidates||candidate_list
      where id=call_id;
  else
    if jsonb_array_length(call_record.recipient_candidates)+items>64 then
      raise exception 'Too many ICE candidates';
    end if;
    update public.voice_calls set recipient_candidates=recipient_candidates||candidate_list
      where id=call_id;
  end if;
end $$;

create or replace function public.push_voice_candidates(call_id uuid,candidate_list jsonb)
returns void language sql security invoker set search_path='' as $$
  select our_space_private.push_voice_candidates(call_id,candidate_list)
$$;

revoke all on function public.push_voice_candidates(uuid,jsonb),
  our_space_private.push_voice_candidates(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.push_voice_candidates(uuid,jsonb),
  our_space_private.push_voice_candidates(uuid,jsonb) to authenticated;
