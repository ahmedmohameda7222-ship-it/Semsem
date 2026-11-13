-- Start call history from this release; old attempts are intentionally excluded.
-- Data and historical rows remain unchanged. Tracking defaults only for future inserts.
alter table public.voice_calls
  add column if not exists logged boolean not null default false,
  add column if not exists connected_at timestamptz,
  add column if not exists ended_at timestamptz;
alter table public.voice_calls alter column logged set default true;

create index if not exists voice_calls_logged_created_idx
  on public.voice_calls(created_at desc) where logged;

-- Capture all terminal transitions, including Cron expiry, without changing
-- existing public.change_voice / private.change_voice RPC signatures.
create or replace function our_space_private.finish_voice_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status in ('ringing','answered')
    and new.status in ('declined','cancelled','missed','ended')
    and new.ended_at is null then
    new.ended_at := least(now(),old.expires_at);
  end if;
  return new;
end $$;
drop trigger if exists voice_call_history_finish on public.voice_calls;
create trigger voice_call_history_finish
  before update of status on public.voice_calls
  for each row execute function our_space_private.finish_voice_history();

-- A call counts as connected only after a real WebRTC connected state.
-- Both enrolled participants can confirm the same call, and writes are idempotent.
create or replace function our_space_private.mark_voice_connected(call_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare connected timestamptz;
begin
  if not our_space_private.is_member() or call_id is null then
    raise exception 'Call unavailable';
  end if;
  update public.voice_calls
  set connected_at=coalesce(connected_at,now())
  where id=call_id
    and logged
    and auth.uid() in (caller_id,recipient_id)
    and status='answered'
  returning connected_at into connected;
  if connected is null then raise exception 'Call unavailable'; end if;
  return connected;
end $$;

create or replace function public.mark_voice_connected(call_id uuid)
returns timestamptz language sql security invoker set search_path='' as $$
  select our_space_private.mark_voice_connected(call_id)
$$;
revoke all on function public.mark_voice_connected(uuid),
  our_space_private.mark_voice_connected(uuid) from public,anon,authenticated;
grant execute on function public.mark_voice_connected(uuid),
  our_space_private.mark_voice_connected(uuid) to authenticated;

-- SECURITY INVOKER means voice_calls RLS protects this aggregate as well.
-- Older calls logged=false contribute neither count nor talk duration.
create or replace view public.call_history_totals
with (security_invoker=true) as
select
  count(*)::integer as total_attempts,
  count(*) filter(where connected_at is not null)::integer as connected_calls,
  coalesce(sum(
    case when connected_at is not null then
      greatest(0,extract(epoch from coalesce(ended_at,now())-connected_at))
    else 0 end
  ),0)::bigint as total_seconds
from public.voice_calls
where logged=true;

revoke all on public.call_history_totals from public,anon,authenticated;
grant select on public.call_history_totals to authenticated;
