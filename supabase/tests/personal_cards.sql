-- Execute this file inside BEGIN / ROLLBACK. No message or push is committed.
do $check$
declare
  sasa uuid := (select id from public.profiles where stable_key='sasa');
  semsem uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  card_id uuid;
  request_id uuid := gen_random_uuid();
begin
  if sasa is null or semsem is null then raise exception 'Enrolled pair missing'; end if;
  if has_function_privilege('anon','public.send_private_card(uuid,text,text)','EXECUTE')
    then raise exception 'Anonymous can invoke private sender'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.send_private_card(gen_random_uuid(),'No','Not enrolled');
    raise exception 'Outsider sent private message' using errcode='ZX301';
  exception when sqlstate 'ZX301' then raise; when others then null; end;
  perform set_config('request.jwt.claim.sub',sasa::text,true);
  insert into public.shared_cards(kind,category,title,message)
    values('daily','daily','Our secret hello','Thinking of you ❤️') returning id into card_id;
  perform public.send_private_card(request_id,'A private evening','Just us ❤️');
  perform public.send_private_card(request_id,'A private evening','Just us ❤️');
  if (select count(*) from public.chat_entries where id=request_id)<>1
    then raise exception 'Non-idempotent private request'; end if;
  if not exists(select 1 from public.chat_entries where id=request_id
    and sender_id=sasa and recipient_id=semsem and is_private
    and title='A private evening' and body='Just us ❤️')
    then raise exception 'Private request contents wrong'; end if;
  begin
    perform public.send_private_card(request_id,'Different title','Different text');
    raise exception 'Retry overwrote request' using errcode='ZX302';
  exception when sqlstate 'ZX302' then raise; when others then null; end;
  perform set_config('request.jwt.claim.sub',semsem::text,true);
  if not exists(select 1 from public.shared_cards where id=card_id)
    then raise exception 'Partner cannot see shared note'; end if;
  delete from public.shared_cards where id=card_id;
  if not exists(select 1 from public.shared_cards where id=card_id)
    then raise exception 'Partner deleted someone else''s note'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if exists(select 1 from public.shared_cards where id=card_id)
    or exists(select 1 from public.chat_entries where id=request_id)
    then raise exception 'Outsider can read pair data'; end if;
end $check$;
select 'PASS: paired shared cards, private sender, outsider denial and idempotency' as result;
