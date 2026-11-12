create schema our_space_private;
revoke all on schema our_space_private from public;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  stable_key text unique not null check (stable_key in ('sasa','semsem')),
  real_name text not null,
  nickname text not null check (length(trim(nickname)) between 1 and 32),
  role text not null,
  dob date not null,
  avatar_path text,
  theme text not null default 'cherry' check (theme in ('cherry','scarlet','velvet','sunset','berry','night')),
  reduce_motion boolean not null default false,
  check (avatar_path is null or split_part(avatar_path,'/',1) = id::text)
);

create function our_space_private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = (select auth.uid())) $$;
revoke all on function our_space_private.is_member() from public;
grant execute on function our_space_private.is_member() to authenticated;

create table public.attention_buttons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check(length(trim(title)) between 1 and 40),
  icon text not null check(length(icon) between 1 and 40),
  tint text not null default '#BA314F' check(tint ~ '^#[0-9A-Fa-f]{6}$'),
  message text not null check(length(trim(message)) between 1 and 160),
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.chat_entries (
  id uuid primary key,
  sender_id uuid not null references public.profiles on delete cascade,
  recipient_id uuid not null references public.profiles on delete cascade,
  body text not null check(length(trim(body)) between 1 and 2000),
  title text,
  icon text,
  tint text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  responded_at timestamptz,
  check (sender_id <> recipient_id),
  check ((title is null and icon is null and tint is null) or (title is not null and icon is not null and tint is not null)),
  check (responded_at is null or (title is not null and read_at is not null))
);
create index chat_history on public.chat_entries (created_at desc, id desc);

create table public.message_reactions (
  entry_id uuid references public.chat_entries on delete cascade,
  user_id uuid default auth.uid() references public.profiles on delete cascade,
  reaction text not null check(reaction in ('❤️','🥰','😂','✨')),
  primary key(entry_id,user_id)
);

create table public.important_dates (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null check(length(trim(title)) between 1 and 70),
  original_date date,
  annual boolean not null default true,
  reserved boolean not null default false,
  celebration text not null default 'none' check(celebration in ('none','anniversary','kisses')),
  note text not null default '' check(length(note) <= 500),
  photo_path text check(photo_path is null or photo_path like 'dates/%')
);

create table public.family_children (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 1 and 60),
  gender text not null check(gender in ('boy','girl')),
  status text not null default 'not_born_yet' check(status in ('born','not_born_yet')),
  birth_date date,
  avatar_path text check(avatar_path is null or avatar_path like 'children/%'),
  check (status <> 'born' or birth_date is not null)
);

create table public.love_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check(length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  endpoint text primary key check(length(endpoint) <= 2048),
  user_id uuid not null references public.profiles on delete cascade,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create table public.notification_outbox (
  event_id uuid primary key references public.chat_entries on delete cascade,
  recipient_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create table public.notification_deliveries (
  event_id uuid references public.notification_outbox on delete cascade,
  endpoint text references public.push_subscriptions on delete cascade,
  attempts integer not null default 0,
  next_attempt timestamptz not null default now(),
  delivered_at timestamptz,
  lease uuid,
  primary key(event_id,endpoint)
);
create table public.otp_limits (
  bucket text primary key,
  started_at timestamptz not null,
  hits integer not null
);

do $$
declare t text;
begin
  foreach t in array array['profiles','attention_buttons','chat_entries','message_reactions','important_dates','family_children','love_notes','push_subscriptions','notification_outbox','notification_deliveries','otp_limits']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;

grant select on public.profiles,public.chat_entries,public.message_reactions,public.important_dates,public.family_children,public.love_notes,public.attention_buttons to authenticated;
grant update(nickname,theme,avatar_path,reduce_motion) on public.profiles to authenticated;
grant insert(title,icon,tint,message,favorite), update(title,icon,tint,message,favorite),delete on public.attention_buttons to authenticated;
grant insert(entry_id,user_id,reaction),update(reaction),delete on public.message_reactions to authenticated;
grant insert(title,original_date,annual,note,photo_path),update(title,original_date,annual,note,photo_path),delete on public.important_dates to authenticated;
grant insert(name,gender,status,birth_date,avatar_path),update(name,gender,status,birth_date,avatar_path),delete on public.family_children to authenticated;
grant insert(body),update(body),delete on public.love_notes to authenticated;

create policy pair_profiles on public.profiles for select to authenticated using ((select our_space_private.is_member()));
create policy own_profile on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy own_buttons on public.attention_buttons for all to authenticated using (owner_id = (select auth.uid()) and (select our_space_private.is_member())) with check (owner_id = (select auth.uid()) and (select our_space_private.is_member()));
create policy pair_chat on public.chat_entries for select to authenticated using ((select our_space_private.is_member()));
create policy pair_reactions on public.message_reactions for select to authenticated using ((select our_space_private.is_member()));
create policy own_reactions on public.message_reactions for all to authenticated using (user_id = (select auth.uid()) and (select our_space_private.is_member())) with check (user_id = (select auth.uid()) and (select our_space_private.is_member()));
create policy pair_dates on public.important_dates for select to authenticated using ((select our_space_private.is_member()));
create policy add_date on public.important_dates for insert to authenticated with check ((select our_space_private.is_member()));
create policy edit_date on public.important_dates for update to authenticated using ((select our_space_private.is_member()) and (slug is null or reserved));
create policy delete_date on public.important_dates for delete to authenticated using ((select our_space_private.is_member()) and slug is null);
create policy pair_children on public.family_children for all to authenticated using ((select our_space_private.is_member())) with check ((select our_space_private.is_member()));
create policy pair_notes on public.love_notes for select to authenticated using ((select our_space_private.is_member()));
create policy own_notes on public.love_notes for all to authenticated using (author_id = (select auth.uid()) and (select our_space_private.is_member())) with check (author_id = (select auth.uid()) and (select our_space_private.is_member()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('our-space-photos','our-space-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy pair_photos on storage.objects for select to authenticated using (bucket_id='our-space-photos' and (select our_space_private.is_member()));
create policy upload_photos on storage.objects for insert to authenticated with check (
  bucket_id='our-space-photos' and (select our_space_private.is_member())
  and (storage.foldername(name))[1] in ((select auth.uid())::text,'children','dates')
);
create policy delete_photos on storage.objects for delete to authenticated using (
  bucket_id='our-space-photos' and (select our_space_private.is_member())
  and (storage.foldername(name))[1] in ((select auth.uid())::text,'children','dates')
);

create function our_space_private.send_chat(entry uuid, content text, button uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  partner uuid;
  saved uuid;
  template public.attention_buttons;
begin
  if not our_space_private.is_member() then raise exception 'Membership required'; end if;
  select id into partner from public.profiles where id <> me;
  if partner is null then raise exception 'Your partner is not enrolled yet'; end if;
  if exists(select 1 from public.chat_entries where id=entry and sender_id=me) then return entry; end if;
  if button is not null then
    select * into strict template from public.attention_buttons where id=button and owner_id=me;
    content := template.message;
  end if;
  insert into public.chat_entries(id,sender_id,recipient_id,body,title,icon,tint)
  values(entry,me,partner,trim(content),template.title,template.icon,template.tint)
  on conflict (id) do nothing returning id into saved;
  if saved is not null then
    insert into public.notification_outbox(event_id,recipient_id) values(saved,partner);
    insert into public.notification_deliveries(event_id,endpoint)
      select saved,endpoint from public.push_subscriptions where user_id=partner;
  elsif not exists(select 1 from public.chat_entries where id=entry and sender_id=me) then
    raise exception 'Invalid entry identifier';
  end if;
  return entry;
end $$;

create function public.send_chat(entry uuid, content text default null, button uuid default null) returns uuid
language sql security invoker set search_path = '' as $$ select our_space_private.send_chat(entry,content,button) $$;

create function our_space_private.read_chat(entries uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.chat_entries set read_at=now()
  where id=any(entries) and recipient_id=(select auth.uid()) and read_at is null and (select our_space_private.is_member())
$$;
create function public.read_chat(entries uuid[]) returns void
language sql security invoker set search_path = '' as $$ select our_space_private.read_chat(entries) $$;

create function our_space_private.respond(entry uuid, reply text, reply_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not our_space_private.is_member() then raise exception 'Membership required'; end if;
  update public.chat_entries set read_at=coalesce(read_at,now()),responded_at=now()
  where id=entry and recipient_id=(select auth.uid()) and title is not null and responded_at is null;
  if found and reply is not null then perform our_space_private.send_chat(reply_id,reply,null); end if;
end $$;
create function public.respond(entry uuid, reply text default null, reply_id uuid default null) returns void
language sql security invoker set search_path = '' as $$ select our_space_private.respond(entry,reply,reply_id) $$;

create function public.consume_otp(bucket_key text, max_hits integer, window_seconds integer) returns boolean
language sql set search_path = '' as $$
  insert into public.otp_limits values(bucket_key,now(),1)
  on conflict (bucket) do update set
    hits=case when public.otp_limits.started_at <= now()-make_interval(secs=>window_seconds) then 1 else least(public.otp_limits.hits+1,max_hits+1) end,
    started_at=case when public.otp_limits.started_at <= now()-make_interval(secs=>window_seconds) then now() else public.otp_limits.started_at end
  returning hits <= max_hits
$$;

create function public.claim_push(lease_id uuid)
returns table(event_id uuid,endpoint text,keys jsonb,attempts integer,title text,body text)
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
  select d.event_id,d.endpoint,s.keys,d.attempts,c.title,c.body
  from claimed d join public.push_subscriptions s on s.endpoint=d.endpoint
  join public.notification_outbox o on o.event_id=d.event_id and o.recipient_id=s.user_id
  join public.chat_entries c on c.id=d.event_id
$$;
revoke all on all functions in schema our_space_private from public,anon,authenticated;
grant usage on schema our_space_private to authenticated;
grant execute on function our_space_private.is_member(),our_space_private.send_chat(uuid,text,uuid),our_space_private.read_chat(uuid[]),our_space_private.respond(uuid,text,uuid) to authenticated;
revoke all on function public.send_chat(uuid,text,uuid),public.read_chat(uuid[]),public.respond(uuid,text,uuid),public.consume_otp(text,integer,integer),public.claim_push(uuid) from public,anon,authenticated;
grant execute on function public.send_chat(uuid,text,uuid),public.read_chat(uuid[]),public.respond(uuid,text,uuid) to authenticated;
grant execute on function public.consume_otp(text,integer,integer),public.claim_push(uuid) to service_role;

alter publication supabase_realtime add table public.chat_entries,public.message_reactions,public.profiles,public.important_dates,public.family_children,public.love_notes,public.attention_buttons;
create policy pair_typing_receive on realtime.messages for select to authenticated using (realtime.topic()='our-space:typing' and extension='presence' and (select our_space_private.is_member()));
create policy pair_typing_send on realtime.messages for insert to authenticated with check (realtime.topic()='our-space:typing' and extension='presence' and (select our_space_private.is_member()));
