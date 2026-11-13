-- User-made love notes and intimate request presets, shared only by the enrolled pair.
create table if not exists public.shared_cards (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('daily','intimate')),
  category text not null check(
    (kind='daily' and category='daily') or
    (kind='intimate' and category in ('direct','flirty','romantic'))
  ),
  title text not null check(length(trim(title)) between 1 and 70),
  message text not null check(length(trim(message)) between 1 and 160),
  created_at timestamptz not null default now()
);
create index if not exists shared_cards_kind_created_idx
  on public.shared_cards (kind,created_at desc);

alter table public.shared_cards enable row level security;
revoke all on table public.shared_cards from public, anon, authenticated;
grant select on table public.shared_cards to authenticated;
grant insert(kind,category,title,message),delete on table public.shared_cards to authenticated;
grant select,insert,update,delete on table public.shared_cards to service_role;

create policy shared_cards_pair_read on public.shared_cards
  for select to authenticated
  using ((select our_space_private.is_member()));
create policy shared_cards_author_add on public.shared_cards
  for insert to authenticated
  with check (author_id=(select auth.uid()) and (select our_space_private.is_member()));
create policy shared_cards_author_delete on public.shared_cards
  for delete to authenticated
  using (author_id=(select auth.uid()) and (select our_space_private.is_member()));

-- A dedicated private sender for new and user-written titles. A client cannot
-- convert a normal chat message into a hidden one; only an enrolled member may
-- invoke this function and title/body are always validated server-side.
create or replace function our_space_private.send_private_card(
  entry uuid,card_title text,card_message text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid := auth.uid();
  partner_id uuid;
  title_value text := trim(coalesce(card_title,''));
  body_value text := trim(coalesce(card_message,''));
  existing public.chat_entries%rowtype;
  inserted_id uuid;
begin
  if not our_space_private.is_member() then
    raise exception 'Membership required';
  end if;
  if entry is null or length(title_value) not between 1 and 70
    or length(body_value) not between 1 and 160 then
    raise exception 'Invalid private card';
  end if;

  select * into existing from public.chat_entries where id=entry;
  if found then
    if existing.sender_id=actor_id and existing.is_private
       and existing.title=title_value and existing.body=body_value then
      return entry;
    end if;
    raise exception 'Private request identifier already in use';
  end if;

  select id into partner_id from public.profiles where id <> actor_id;
  if partner_id is null then raise exception 'Your partner is not enrolled yet'; end if;
  insert into public.chat_entries(
    id,sender_id,recipient_id,title,icon,tint,body,is_private
  ) values (
    entry,actor_id,partner_id,title_value,'Heart','#BA314F',body_value,true
  ) on conflict(id) do nothing returning id into inserted_id;

  if inserted_id is null then
    select * into existing from public.chat_entries where id=entry;
    if not found or existing.sender_id is distinct from actor_id
       or existing.is_private is distinct from true
       or existing.title is distinct from title_value
       or existing.body is distinct from body_value then
      raise exception 'Private request identifier already in use';
    end if;
    return entry;
  end if;

  insert into public.notification_outbox(event_id,recipient_id)
    values(entry,partner_id);
  insert into public.notification_deliveries(event_id,endpoint)
    select entry,endpoint from public.push_subscriptions
    where user_id=partner_id;
  return entry;
end $$;

create or replace function public.send_private_card(
  entry uuid,card_title text,card_message text
) returns uuid
language sql security invoker set search_path='' as $$
  select our_space_private.send_private_card(entry,card_title,card_message)
$$;

revoke all on function our_space_private.send_private_card(uuid,text,text),
  public.send_private_card(uuid,text,text)
  from public,anon,authenticated;
grant execute on function our_space_private.send_private_card(uuid,text,text),
  public.send_private_card(uuid,text,text) to authenticated;
