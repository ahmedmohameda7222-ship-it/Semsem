-- Run against an enrolled project. All fixtures are rolled back.
do $test$
declare
  a uuid := (select id from public.profiles where stable_key='sasa');
  b uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  entry uuid := gen_random_uuid();
  attachment uuid := gen_random_uuid();
  object_path text := a::text || '/' || gen_random_uuid()::text;
  marker text := 'SpaceQA' || left(entry::text,8) || ' %_ 🫶';
  endpoint_url text := 'https://fcm.googleapis.com/fcm/send/rollback-' || entry::text;
  lease_id uuid := gen_random_uuid();
begin
  if a is null or b is null then raise exception 'Two enrolled profiles required'; end if;
  begin
    insert into auth.users(id) values(outsider);
    insert into public.push_subscriptions(endpoint,user_id,keys) values(endpoint_url,b,'{}');
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',a::text,true);
    perform public.send_chat(entry,marker,null);
    if not exists(select 1 from public.search_chat(lower(marker)) x where x.id=entry) then raise exception 'Case-insensitive Unicode search failed'; end if;
    if exists(select 1 from public.search_chat(replace(marker,'%_','%__')) x where x.id=entry) then raise exception 'Wildcard search was not literal'; end if;
    insert into public.chat_favorites(entry_id) values(entry);
    insert into public.message_reactions(entry_id,user_id,reaction) values(entry,a,'🫶');
    update public.message_reactions set reaction='🩷' where entry_id=entry and user_id=a;
    if not exists(select 1 from public.message_reactions where entry_id=entry and reaction='🩷') then raise exception 'Reaction update failed'; end if;
    delete from public.message_reactions where entry_id=entry and user_id=a;
    insert into storage.objects(bucket_id,name,owner_id,metadata) values('our-space-chat-media',object_path,a::text,'{"mimetype":"audio/mp4"}');
    perform public.send_media(attachment,'audio',object_path,'');
    perform public.send_media(attachment,'audio',object_path,'');
    if (select count(*) from public.chat_entries where id=attachment and media_kind='audio') <> 1 then raise exception 'Attachment not persisted idempotently'; end if;
    perform set_config('request.jwt.claim.sub',b::text,true);
    if exists(select 1 from public.chat_favorites where entry_id=entry) then raise exception 'Partner can see saved entry'; end if;
    if not exists(select 1 from public.search_chat(marker) x where x.id=entry) then raise exception 'Partner cannot search entry'; end if;
    insert into public.chat_favorites(entry_id) values(entry);
    delete from public.chat_favorites where entry_id=entry;
    begin
      perform public.send_media(gen_random_uuid(),'audio',object_path,'');
      raise exception 'Partner could send media as owner' using errcode='ZZ101';
    exception when raise_exception then null;
    end;
    perform set_config('request.jwt.claim.sub',outsider::text,true);
    if exists(select 1 from public.search_chat(marker)) or exists(select 1 from public.chat_favorites where entry_id=entry) then raise exception 'Outsider can see chat or favorites'; end if;
    if exists(select 1 from storage.objects where bucket_id='our-space-chat-media' and name=object_path) then raise exception 'Outsider can see media'; end if;
    reset role;
    update public.notification_deliveries set next_attempt=now()-interval '100 years' where event_id=entry;
    if not exists(select 1 from public.claim_push(lease_id) p where p.event_id=entry and p.endpoint=endpoint_url and p.body=marker and p.sender_nickname=(select nickname from public.profiles where id=a)) then
      raise exception 'Personalized push claim failed';
    end if;
    raise exception 'Rollback fixtures' using errcode='ZZ199';
  exception when sqlstate 'ZZ199' then null;
  end;
end
$test$;
select 'Private search, favorites, reactions, media and push claim passed' as result;
