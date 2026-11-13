-- Rollback-only regression: the push worker must never receive private text.
do $private_push$
declare
  a uuid := (select id from public.profiles where stable_key='sasa');
  b uuid := (select id from public.profiles where stable_key='semsem');
  id_to_test uuid := gen_random_uuid();
  endpoint_to_test text := 'https://web.push.apple.com/private-test-'||gen_random_uuid()::text;
  redacted integer;
begin
  if a is null or b is null then raise exception 'Missing enrolled profiles'; end if;
  insert into public.push_subscriptions(endpoint,user_id,keys)
    values(endpoint_to_test,b,'{"p256dh":"fixture","auth":"fixture"}'::jsonb);
  insert into public.chat_entries(
    id,sender_id,recipient_id,body,title,icon,tint,is_private
  ) values(
    id_to_test,a,b,'SECRET PRIVATE MESSAGE','SECRET PRIVATE TITLE',
    'Heart','#BA314F',true
  );
  insert into public.notification_outbox(event_id,recipient_id)
    values(id_to_test,b);
  insert into public.notification_deliveries(event_id,endpoint,next_attempt)
    values(id_to_test,endpoint_to_test,now()-interval '1 day');
  select count(*) into redacted from public.claim_push(gen_random_uuid()) jobs
    where jobs.event_id=id_to_test
      and jobs.title='Private Request'
      and jobs.body='Open Our Space to view a private request.'
      and jobs.sender_nickname is not null;
  if redacted<>1 then
    raise exception 'Private content escaped into the push worker';
  end if;
end $private_push$;
select 'PASS: the push job contains no private title or message' as result;
