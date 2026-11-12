create extension if not exists pg_trgm with schema extensions;

create index chat_entries_body_search on public.chat_entries using gin (body extensions.gin_trgm_ops);
create index chat_entries_title_search on public.chat_entries using gin (title extensions.gin_trgm_ops);

create function public.search_chat(query_text text, before_at timestamptz default null, before_id uuid default null)
returns setof public.chat_entries language sql stable security invoker set search_path = ''
as $$
  with pattern as (
    select '%' || replace(replace(replace(trim(query_text), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%' as value
    where length(trim(query_text)) between 1 and 120
  )
  select c.* from public.chat_entries c cross join pattern p
  where (c.body ilike p.value or c.title ilike p.value)
    and (before_at is null or (c.created_at,c.id) < (before_at,before_id))
  order by c.created_at desc,c.id desc limit 25
$$;
revoke all on function public.search_chat(text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.search_chat(text,timestamptz,uuid) to authenticated;

create table public.chat_favorites (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.chat_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,entry_id)
);
alter table public.chat_favorites enable row level security;
revoke all on public.chat_favorites from public,anon,authenticated;
grant select,delete on public.chat_favorites to authenticated;
grant insert(entry_id) on public.chat_favorites to authenticated;
create policy own_favorites on public.chat_favorites for all to authenticated
using (user_id = (select auth.uid()) and (select our_space_private.is_member()))
with check (user_id = (select auth.uid()) and (select our_space_private.is_member()) and exists(select 1 from public.chat_entries c where c.id=entry_id));

alter table public.message_reactions drop constraint message_reactions_reaction_check;
alter table public.message_reactions add constraint message_reactions_reaction_check
  check(reaction in ('❤️','🩷','💕','💖','😍','🥰','😘','💋','🫶','🥹','😂','🤣','😭','🥺','😊','😢','😮','😡','🔥','✨','👍','👀')) not valid;
alter table public.message_reactions validate constraint message_reactions_reaction_check;

drop function public.claim_push(uuid);
create function public.claim_push(lease_id uuid)
returns table(event_id uuid,endpoint text,keys jsonb,attempts integer,title text,body text,sender_nickname text)
language sql set search_path = '' as $$
  with available as (
    select d.event_id,d.endpoint from public.notification_deliveries d
    where d.delivered_at is null and d.attempts<8 and d.next_attempt<=now()
    order by d.next_attempt limit 25 for update skip locked
  ), claimed as (
    update public.notification_deliveries d set lease=lease_id, attempts=d.attempts+1,next_attempt=now()+interval '2 minutes'
    from available a where d.event_id=a.event_id and d.endpoint=a.endpoint
    returning d.*
  )
  select d.event_id,d.endpoint,s.keys,d.attempts,c.title,c.body,p.nickname
  from claimed d join public.push_subscriptions s on s.endpoint=d.endpoint
  join public.notification_outbox o on o.event_id=d.event_id and o.recipient_id=s.user_id
  join public.chat_entries c on c.id=d.event_id and c.recipient_id=o.recipient_id
  join public.profiles p on p.id=c.sender_id
$$;
revoke all on function public.claim_push(uuid) from public,anon,authenticated;
grant execute on function public.claim_push(uuid) to service_role;
