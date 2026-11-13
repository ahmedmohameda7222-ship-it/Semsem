-- Run inside BEGIN; [new migration]; [this test]; ROLLBACK;
-- Uses temporary IDs only, never commits messages or sends pushes.
do $verify$
declare
  sasa uuid := (select id from public.profiles where stable_key='sasa');
  semsem uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  reply_id uuid := gen_random_uuid();
begin
  if sasa is null or semsem is null then
    raise exception 'Missing enrolled pair';
  end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  begin
    perform public.send_intimate_request(gen_random_uuid(),'sex_tonight','Unauthorized test');
    raise exception 'Outsider inserted private request' using errcode='ZQ301';
  exception when sqlstate 'ZQ301' then raise; when others then null; end;

  perform set_config('request.jwt.claim.sub', sasa::text, true);
  perform public.send_intimate_request(request_id,'sex_tonight','Only if you want to ❤️');
  perform public.send_intimate_request(request_id,'sex_tonight','Only if you want to ❤️');
  if (select count(*) from public.chat_entries where id=request_id)<>1 then
    raise exception 'Private request retry was not idempotent';
  end if;
  if not exists(
    select 1 from public.chat_entries where id=request_id
      and is_private and sender_id=sasa and recipient_id=semsem
      and title='I want to have sex with you ❤️‍🔥'
      and body='Only if you want to ❤️'
  ) then raise exception 'Private request stored incorrectly'; end if;

  begin
    perform public.send_intimate_request(gen_random_uuid(),'invalid_request','invalid');
    raise exception 'Server accepted unknown private request' using errcode='ZQ302';
  exception when sqlstate 'ZQ302' then raise; when others then null; end;
  begin
    perform public.send_intimate_request(gen_random_uuid(),'make_love','');
    raise exception 'Server accepted empty private request' using errcode='ZQ303';
  exception when sqlstate 'ZQ303' then raise; when others then null; end;

  perform set_config('request.jwt.claim.sub', semsem::text, true);
  if not exists(select 1 from public.chat_entries where id=request_id) then
    raise exception 'Other enrolled partner cannot read request';
  end if;
  perform public.respond(request_id,'Maybe later, my love ❤️',reply_id);
  if not exists(
    select 1 from public.chat_entries where id=reply_id and is_private
      and in_reply_to=request_id and sender_id=semsem
  ) then raise exception 'Linked reply is not private'; end if;
  if not exists(
    select 1 from public.chat_entries where id=request_id
      and reply_text='Maybe later, my love ❤️' and responded_at is not null
  ) then raise exception 'Optional reply not stored'; end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  if exists(select 1 from public.chat_entries where id in (request_id,reply_id)) then
    raise exception 'Outsider can read private chat entries';
  end if;
end $verify$;
select 'PASS: enrolled pair only, private reply, validated code and idempotent retry' as result;
