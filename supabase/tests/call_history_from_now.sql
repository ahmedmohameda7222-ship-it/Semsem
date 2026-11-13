-- Execute within BEGIN; migration; [test]; ROLLBACK; on production.
do $test$
declare
  sasa uuid := (select id from public.profiles where stable_key='sasa');
  semsem uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  new_call uuid := gen_random_uuid();
  connected timestamptz;
begin
  if sasa is null or semsem is null then raise exception 'Expected two profiles'; end if;
  if exists(select 1 from public.voice_calls where created_at < now()-interval '5 seconds' and logged) then
    raise exception 'Historical rows unexpectedly marked as tracked';
  end if;
  insert into public.voice_calls (id,caller_id,recipient_id,status,created_at,expires_at)
  values(new_call,sasa,semsem,'answered',now()-interval '15 seconds',now()+interval '75 seconds');
  if not exists(select 1 from public.voice_calls where id=new_call and logged) then
    raise exception 'New calls must be tracked';
  end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if exists(select 1 from public.voice_calls where id=new_call) then
    raise exception 'Outsider can read call';
  end if;
  begin
    perform public.mark_voice_connected(new_call);
    raise exception 'Outsider started call timer' using errcode='ZQ201';
  exception when sqlstate 'ZQ201' then raise; when others then null; end;
  if (select connected_calls from public.call_history_totals) <> 0 then
    raise exception 'Outsider leaked call totals';
  end if;
  perform set_config('request.jwt.claim.sub',sasa::text,true);
  connected:=public.mark_voice_connected(new_call);
  if connected is null then raise exception 'No connected timestamp'; end if;
  if public.mark_voice_connected(new_call)<>connected then
    raise exception 'Connection timestamps not idempotent';
  end if;
  if (select connected_calls from public.call_history_totals)<>1 then
    raise exception 'Connected calls count failed';
  end if;
  perform public.change_voice(new_call,'end',null);
  if not exists(select 1 from public.voice_calls where id=new_call and ended_at is not null) then
    raise exception 'Terminal transition did not save end time';
  end if;
  if (select total_seconds from public.call_history_totals)>3 then
    raise exception 'Talk duration incorrectly counted ringing interval';
  end if;
end $test$;
select 'PASS: new-only call logs, connected-only duration, RLS and finalization' as result;
