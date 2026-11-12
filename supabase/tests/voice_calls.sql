-- Exercises enrolled identities in a rolled-back transaction.
do $test$
declare
  a uuid := (select id from public.profiles where stable_key='sasa');
  b uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  call_key uuid := gen_random_uuid();
  stale_key uuid := gen_random_uuid();
  cancelled_key uuid := gen_random_uuid();
  declined_key uuid := gen_random_uuid();
  row public.voice_calls;
begin
  begin
    insert into auth.users(id) values(outsider);
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',a::text,true);
    row := public.start_voice(call_key,'test offer');
    if row.caller_id<>a or row.recipient_id<>b or row.status<>'ringing' then raise exception 'Incorrect call participants'; end if;
    begin
      perform public.start_voice(gen_random_uuid(),'duplicate');
      raise exception 'Duplicate active call allowed' using errcode='ZZ101';
    exception when sqlstate 'ZZ101' then raise;
    when others then
      if SQLERRM not like '%Another call is already active%' then raise; end if;
    end;
    begin
      perform public.change_voice(call_key,'answer','forged');
      raise exception 'Caller could forge answer' using errcode='ZZ102';
    exception when sqlstate 'ZZ102' then raise;
    when others then
      if SQLERRM not like '%Invalid call transition%' then raise; end if;
    end;
    perform set_config('request.jwt.claim.sub',outsider::text,true);
    if exists(select 1 from public.voice_calls where id=call_key) then raise exception 'Outsider can read invitation'; end if;
    begin
      perform public.change_voice(call_key,'answer','outsider');
      raise exception 'Outsider could answer' using errcode='ZZ103';
    exception when sqlstate 'ZZ103' then raise;
    when others then
      if SQLERRM not like '%Call unavailable%' then raise; end if;
    end;
    perform set_config('request.jwt.claim.sub',b::text,true);
    row := public.change_voice(call_key,'answer','test answer');
    if row.status<>'answered' or row.answer<>'test answer' then raise exception 'Recipient could not answer'; end if;
    row := public.change_voice(call_key,'touch');
    if row.expires_at<=now() then raise exception 'Heartbeat failed'; end if;
    row := public.change_voice(call_key,'end');
    if row.status<>'ended' or row.offer is not null or row.answer is not null then raise exception 'End did not erase SDP'; end if;
    row := public.start_voice(cancelled_key,'cancel offer');
    row := public.change_voice(cancelled_key,'end');
    if row.status<>'cancelled' then raise exception 'Caller cancellation failed'; end if;
    row := public.start_voice(declined_key,'decline offer');
    perform set_config('request.jwt.claim.sub',a::text,true);
    row := public.change_voice(declined_key,'decline');
    if row.status<>'declined' then raise exception 'Decline failed'; end if;
    row := public.start_voice(stale_key,'expiring offer');
    reset role;
    update public.voice_calls set expires_at=now()-interval '2 seconds' where id=stale_key;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub',b::text,true);
    row := public.change_voice(stale_key,'answer','late answer');
    if row.status<>'missed' or row.answer is not null then raise exception 'Expired invite could be answered'; end if;
    raise exception 'Rollback fixtures' using errcode='ZZ199';
  exception when sqlstate 'ZZ199' then null;
  end;
end
$test$;
select 'Voice invitation identity, exclusivity, heartbeat, answer, end, decline, cancel and expiry passed' as result;
