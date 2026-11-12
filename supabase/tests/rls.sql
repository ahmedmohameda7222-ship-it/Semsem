-- Each test row exists only inside this rolled-back subtransaction.
do $test$
declare
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  entry_id uuid := gen_random_uuid();
  button_id uuid;
begin
  begin
    insert into auth.users(id) values(first_id),(second_id),(outsider_id);
    insert into public.profiles(id,stable_key,real_name,nickname,role,dob)
      values (first_id,'sasa','Test A','A','Husband','2000-01-01'),(second_id,'semsem','Test B','B','Wife','2000-01-01');
    set local role anon;
    begin
      perform count(*) from public.profiles;
      raise exception 'Anonymous profile query succeeded';
    exception when insufficient_privilege then null;
    end;
    reset role;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',outsider_id::text,true);
    if exists(select from public.profiles) then raise exception 'Outsider can read profiles'; end if;
    begin
      perform public.send_chat(entry_id,'Outsider message');
      raise exception 'Outsider message succeeded' using errcode='ZZ101';
    exception when raise_exception then null;
    end;
    perform set_config('request.jwt.claim.sub',first_id::text,true);
    if (select count(*) from public.profiles) <> 2 then raise exception 'Member cannot see pair'; end if;
    update public.profiles set nickname='Changed' where id=second_id;
    if found then raise exception 'Partner profile changed'; end if;
    insert into public.attention_buttons(title,icon,message) values('Test request','Heart','Test text') returning id into button_id;
    perform public.send_chat(entry_id,null,button_id);
    perform public.send_chat(entry_id,null,button_id);
    perform public.respond(entry_id,'Unauthorised response',gen_random_uuid());
    if exists(select from public.chat_entries where id=entry_id and responded_at is not null) then raise exception 'Sender responded to own request'; end if;
    perform set_config('request.jwt.claim.sub',second_id::text,true);
    if exists(select from public.attention_buttons where id=button_id) then raise exception 'Partner can see private button'; end if;
    perform public.read_chat(array[entry_id]);
    if not exists(select from public.chat_entries where id=entry_id and read_at is not null) then raise exception 'Recipient cannot mark read'; end if;
    perform public.respond(entry_id,'A valid response',gen_random_uuid());
    if not exists(select from public.chat_entries where id=entry_id and responded_at is not null) then raise exception 'Recipient cannot respond'; end if;
    reset role;
    if (select count(*) from public.notification_outbox where event_id=entry_id and recipient_id=second_id) <> 1 then raise exception 'Outbox lost, duplicated or misrouted event'; end if;
    raise exception 'Rollback test fixtures' using errcode='ZZ199';
  exception when sqlstate 'ZZ199' then null;
  end;
end
$test$;
select 'RLS, request lifecycle, and outbox assertions passed' as result;
