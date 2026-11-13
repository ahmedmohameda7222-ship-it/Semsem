-- A private, optional request between the two enrolled partners.
-- Existing chat rows are unchanged; default false preserves rich notifications.
alter table public.chat_entries
  add column if not exists is_private boolean not null default false;

-- All writes flow through an authorized private-schema SECURITY DEFINER RPC.
-- The request code selects a server-approved title. A caller cannot set the
-- private flag on arbitrary chat entries, and a retry uses the same UUID.
create or replace function our_space_private.send_intimate_request(
  entry uuid, request_code text, message text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  partner_id uuid;
  saved_id uuid;
  title_value text;
  icon_value text;
  tint_value text;
begin
  if not our_space_private.is_member() then
    raise exception 'Membership required';
  end if;
  if entry is null or request_code is null then
    raise exception 'Invalid private request';
  end if;
  if trim(coalesce(message,'')) = '' or length(trim(message)) > 160 then
    raise exception 'The private message must contain 1 to 160 characters';
  end if;
  title_value := case request_code
    when 'sex_tonight' then 'I want to have sex with you ❤️‍🔥'
    when 'make_love' then 'I want to make love to you ❤️'
    when 'in_the_mood' then 'I''m in the mood for you 😏'
    when 'want_tonight' then 'I want you tonight 🌙'
    when 'intimate_night' then 'Can we have an intimate night? 💋'
    when 'passionate_kiss' then 'I need a passionate kiss 💋'
    when 'thinking_of_you' then 'I can''t stop thinking about you 😘'
    when 'come_closer' then 'Come closer, baby ❤️‍🔥'
    when 'your_touch' then 'I want your touch 🫶'
    when 'surprise_tonight' then 'Surprise me tonight 😉'
    when 'cuddle' then 'I want to cuddle with you 🥺'
    when 'sleep_in_arms' then 'I want to fall asleep in your arms 🥰'
    when 'alone_time' then 'Let''s have some alone time 🔒'
    when 'shower_together' then 'Can we take a shower together? 🚿'
    when 'just_us' then 'Tonight, just you and me ❤️'
    else null end;
  if title_value is null then raise exception 'Unknown private request'; end if;
  icon_value := case request_code
    when 'in_the_mood' then 'kiss'
    when 'passionate_kiss' then 'kiss'
    when 'want_tonight' then 'Moon'
    when 'sleep_in_arms' then 'Moon'
    when 'intimate_night' then 'BedDouble'
    when 'cuddle' then 'BedDouble'
    when 'thinking_of_you' then 'HeartPulse'
    when 'sex_tonight' then 'HeartPulse'
    when 'come_closer' then 'HeartHandshake'
    when 'alone_time' then 'HeartHandshake'
    when 'your_touch' then 'HandHeart'
    when 'surprise_tonight' then 'Gift'
    when 'just_us' then 'CalendarHeart'
    else 'Heart' end;
  tint_value := '#BA314F';

  if exists (
    select 1 from public.chat_entries c
    where c.id=entry and c.sender_id=actor_id and c.is_private
  ) then return entry; end if;

  select id into partner_id from public.profiles where id <> actor_id;
  if partner_id is null then raise exception 'Your partner is not enrolled yet'; end if;

  insert into public.chat_entries(
    id,sender_id,recipient_id,title,icon,tint,body,is_private
  ) values (
    entry,actor_id,partner_id,title_value,icon_value,tint_value,trim(message),true
  )
  on conflict (id) do nothing returning id into saved_id;

  if saved_id is not null then
    insert into public.notification_outbox(event_id,recipient_id)
      values(saved_id,partner_id);
    insert into public.notification_deliveries(event_id,endpoint)
      select saved_id,endpoint from public.push_subscriptions
      where user_id=partner_id;
  elsif not exists (
    select 1 from public.chat_entries
    where id=entry and sender_id=actor_id and is_private
  ) then
    raise exception 'Invalid private request identifier';
  end if;
  return entry;
end $$;

create or replace function public.send_intimate_request(
  entry uuid, request_code text, message text
) returns uuid language sql security invoker set search_path='' as $$
  select our_space_private.send_intimate_request(entry,request_code,message)
$$;
revoke all on function public.send_intimate_request(uuid,text,text),
  our_space_private.send_intimate_request(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.send_intimate_request(uuid,text,text),
  our_space_private.send_intimate_request(uuid,text,text) to authenticated;

-- Reply links to a private request retain the private notification treatment.
-- Keep existing respond RPC signature, read receipts, idempotency and messages.
create or replace function our_space_private.respond(
  entry uuid, reply text, reply_id uuid
) returns void language plpgsql security definer set search_path='' as $$
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
    if exists(select 1 from public.chat_entries c
      where c.id=reply_id and c.sender_id=auth.uid() and c.in_reply_to=entry)
    then return; end if;
    raise exception 'Request already answered';
  end if;
  saved := our_space_private.send_chat(reply_id,trim(reply),null);
  update public.chat_entries
    set in_reply_to=entry,is_private=target.is_private
    where id=saved and sender_id=auth.uid();
  update public.chat_entries
    set read_at=coalesce(read_at,now()),responded_at=now(),reply_text=trim(reply)
    where id=entry and recipient_id=auth.uid();
end $$;

-- Redact at the earliest server-controlled boundary: the service-role
-- claim_push result never carries the private title/body. Preserve output
-- signature so the deployed push worker requires no schema change.
create or replace function public.claim_push(lease_id uuid)
returns table(
  event_id uuid,endpoint text,keys jsonb,attempts integer,
  title text,body text,sender_nickname text
)
language sql set search_path='' as $$
  with available as (
    select d.event_id,d.endpoint from public.notification_deliveries d
    where d.delivered_at is null and d.attempts<8 and d.next_attempt<=now()
    order by d.next_attempt limit 25 for update skip locked
  ), claimed as (
    update public.notification_deliveries d
       set lease=lease_id,attempts=d.attempts+1,
           next_attempt=now()+interval '2 minutes'
    from available a
    where d.event_id=a.event_id and d.endpoint=a.endpoint
    returning d.*
  )
  select d.event_id,d.endpoint,s.keys,d.attempts,
         case when c.is_private then 'Private Request' else c.title end,
         case when c.is_private
           then 'Open Our Space to view a private request.'
           else c.body end,
         p.nickname
  from claimed d
  join public.push_subscriptions s on s.endpoint=d.endpoint
  join public.notification_outbox o
    on o.event_id=d.event_id and o.recipient_id=s.user_id
  join public.chat_entries c
    on c.id=d.event_id and c.recipient_id=o.recipient_id
  join public.profiles p on p.id=c.sender_id
$$;
revoke all on function public.claim_push(uuid) from public,anon,authenticated;
grant execute on function public.claim_push(uuid) to service_role;
