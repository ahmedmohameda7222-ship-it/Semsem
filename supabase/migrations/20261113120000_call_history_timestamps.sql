-- Record actual media-connection time, not ring/answer time.
-- Previous calls remain untouched: their historical duration cannot be reconstructed.
alter table public.voice_calls
  add column if not exists connected_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table public.voice_calls drop constraint if exists voice_calls_connected_end_order_check;
alter table public.voice_calls add constraint voice_calls_connected_end_order_check
  check (connected_at is null or ended_at is null or ended_at >= connected_at);

-- All existing call termination paths (RPC, stale-call cron, old PWA) use this.
create or replace function our_space_private.stamp_voice_call_end()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('declined','cancelled','missed','ended')
     and old.status is distinct from new.status then
    new.ended_at := coalesce(new.ended_at,
      greatest(clock_timestamp(),coalesce(new.connected_at,clock_timestamp())));
  end if;
  return new;
end $$;

drop trigger if exists voice_call_end_stamp on public.voice_calls;
create trigger voice_call_end_stamp
  before update of status on public.voice_calls
  for each row execute function our_space_private.stamp_voice_call_end();

-- Both participants may confirm the WebRTC peer actually connected.
-- Idempotent and cannot mark ringing/expired/other people's calls.
create or replace function our_space_private.mark_voice_connected(call_id uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  recorded timestamptz;
  actor uuid := auth.uid();
begin
  if not our_space_private.is_member() or call_id is null then
    raise exception 'Call unavailable';
  end if;
  update public.voice_calls
     set connected_at = coalesce(connected_at,clock_timestamp())
   where id = call_id
     and actor in (caller_id,recipient_id)
     and status = 'answered'
     and expires_at > now()
  returning connected_at into recorded;
  if recorded is null then raise exception 'Call unavailable'; end if;
  return recorded;
end $$;

create or replace function public.mark_voice_connected(call_id uuid)
returns timestamptz language sql security invoker set search_path = '' as $$
  select our_space_private.mark_voice_connected(call_id)
$$;
revoke all on function public.mark_voice_connected(uuid),
  our_space_private.mark_voice_connected(uuid) from public,anon,authenticated;
grant execute on function public.mark_voice_connected(uuid),
  our_space_private.mark_voice_connected(uuid) to authenticated;

-- Totals are for confirmed, FINISHED audio connections only. Attempts
-- include missed/declined/cancelled calls; returning no private SDP/media.
create or replace function our_space_private.call_history_totals()
returns table(connected_calls bigint,total_seconds bigint,total_attempts bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not our_space_private.is_member() then
    raise exception 'Membership required';
  end if;
  return query
    select
      count(*) filter(where c.connected_at is not null
          and c.ended_at is not null)::bigint,
      coalesce(sum(greatest(0,floor(extract(epoch from
        (c.ended_at-c.connected_at)))))
        filter(where c.connected_at is not null
          and c.ended_at is not null),0)::bigint,
      count(*)::bigint
    from public.voice_calls c
    where auth.uid() in (c.caller_id,c.recipient_id);
end $$;

create or replace function public.call_history_totals()
returns table(connected_calls bigint,total_seconds bigint,total_attempts bigint)
language sql security invoker set search_path = '' as $$
  select * from our_space_private.call_history_totals()
$$;
revoke all on function public.call_history_totals(),
  our_space_private.call_history_totals() from public,anon,authenticated;
grant execute on function public.call_history_totals(),
  our_space_private.call_history_totals() to authenticated;

create index if not exists voice_calls_connected_idx
  on public.voice_calls(connected_at)
  where connected_at is not null;
