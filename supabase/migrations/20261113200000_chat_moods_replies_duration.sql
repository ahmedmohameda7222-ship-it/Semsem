-- Our Space chat polish: persistent moods, voice duration and linked attention replies.
-- Existing messages and RPC names remain valid; migration is additive.
alter table public.profiles
  add column if not exists mood text,
  add column if not exists mood_updated_at timestamptz;
alter table public.profiles drop constraint if exists profiles_mood_check;
alter table public.profiles add constraint profiles_mood_check
  check (mood is null or mood in ('happy','missing','sad','tired','stressed','excited','loved'));

alter table public.chat_entries
  add column if not exists duration_seconds integer,
  add column if not exists reply_text text,
  add column if not exists in_reply_to uuid references public.chat_entries(id) on delete set null;
alter table public.chat_entries drop constraint if exists chat_entries_duration_seconds_check;
alter table public.chat_entries add constraint chat_entries_duration_seconds_check
  check (duration_seconds is null or (duration_seconds between 0 and 3600 and media_kind='audio'));
alter table public.chat_entries drop constraint if exists chat_entries_reply_text_check;
alter table public.chat_entries add constraint chat_entries_reply_text_check
  check(reply_text is null or (title is not null and responded_at is not null and length(trim(reply_text)) between 1 and 500));
create index if not exists chat_entries_reply_to_idx on public.chat_entries(in_reply_to)
  where in_reply_to is not null;

-- Preserve send_media(uuid,text,text,text) for older installed PWA versions.
create or replace function our_space_private.send_media_with_duration(
  entry uuid,kind text,object_path text,caption text,seconds integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
  if kind='audio' and (seconds is null or seconds not between 0 and 3600) then
    raise exception 'Invalid voice duration';
  end if;
  if kind='photo' and seconds is not null then raise exception 'Photo cannot have a duration'; end if;
  saved := our_space_private.send_media(entry,kind,object_path,caption);
  update public.chat_entries
     set duration_seconds=seconds
   where id=saved and sender_id=(select auth.uid()) and media_kind=kind
     and duration_seconds is distinct from seconds;
  return saved;
end $$;
create or replace function public.send_media_with_duration(
  entry uuid,kind text,object_path text,caption text,seconds integer
) returns uuid language sql security invoker set search_path='' as $$
  select our_space_private.send_media_with_duration(entry,kind,object_path,caption,seconds)
$$;
revoke all on function public.send_media_with_duration(uuid,text,text,text,integer),
  our_space_private.send_media_with_duration(uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.send_media_with_duration(uuid,text,text,text,integer),
  our_space_private.send_media_with_duration(uuid,text,text,text,integer) to authenticated;

-- Atomic reply: existing public.respond remains backwards-compatible, but new
-- nonempty replies are linked to their request and generate a normal notification.
create or replace function our_space_private.respond(entry uuid,reply text,reply_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  target public.chat_entries;
  saved uuid;
begin
  if not our_space_private.is_member() then raise exception 'Membership required'; end if;
  if reply_id is null or trim(coalesce(reply,''))='' or length(trim(reply))>500 then
    raise exception 'Reply must be between 1 and 500 characters';
  end if;
  select * into target from public.chat_entries
   where id=entry and recipient_id=auth.uid() and title is not null for update;
  if not found then raise exception 'Request unavailable'; end if;
  if target.responded_at is not null then
    if exists(select 1 from public.chat_entries c where c.id=reply_id and c.sender_id=auth.uid() and c.in_reply_to=entry) then
      return; -- safe retry of the exact same response
    end if;
    raise exception 'Request already answered';
  end if;
  saved := our_space_private.send_chat(reply_id,trim(reply),null);
  update public.chat_entries set in_reply_to=entry where id=saved and sender_id=auth.uid();
  update public.chat_entries set read_at=coalesce(read_at,now()),responded_at=now(),reply_text=trim(reply)
   where id=entry and recipient_id=auth.uid();
end $$;

create or replace function our_space_private.set_mood(new_mood text,entry uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid();
declare nickname text;
declare description text;
begin
  if not our_space_private.is_member() then raise exception 'Membership required'; end if;
  if new_mood not in ('happy','missing','sad','tired','stressed','excited','loved') or entry is null then
    raise exception 'Invalid mood';
  end if;
  if exists(select 1 from public.chat_entries where id=entry and sender_id=actor_id) then return entry; end if;
  update public.profiles set mood=new_mood,mood_updated_at=now()
   where id=actor_id returning profiles.nickname into nickname;
  if nickname is null then raise exception 'Profile unavailable'; end if;
  description:=case new_mood
    when 'happy' then 'Happy 😊'
    when 'missing' then 'Missing you 🥺'
    when 'sad' then 'Sad 😢'
    when 'tired' then 'Tired 😴'
    when 'stressed' then 'Stressed 😣'
    when 'excited' then 'Excited ✨'
    else 'Loved 🥰' end;
  perform our_space_private.send_chat(entry,nickname||' is feeling '||description||' right now ❤️',null);
  return entry;
end $$;
create or replace function public.set_mood(new_mood text,entry uuid)
returns uuid language sql security invoker set search_path='' as $$
  select our_space_private.set_mood(new_mood,entry)
$$;
revoke all on function public.set_mood(text,uuid),our_space_private.set_mood(text,uuid)
  from public,anon,authenticated;
grant execute on function public.set_mood(text,uuid),our_space_private.set_mood(text,uuid) to authenticated;
