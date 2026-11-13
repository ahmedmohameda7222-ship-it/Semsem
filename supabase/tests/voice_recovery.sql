-- Run inside BEGIN ... ROLLBACK after recovery migration, without touching existing calls.
do $verify$
declare
  sasa uuid := (select id from public.profiles where stable_key='sasa');
  semsem uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  call_id uuid := gen_random_uuid();
  result public.voice_calls;
begin
  if sasa is null or semsem is null then raise exception 'Pair missing'; end if;
  insert into public.voice_calls(id,caller_id,recipient_id,status,offer,answer,expires_at)
    values(call_id,sasa,semsem,'answered','initial offer','initial answer',now()+interval '60 seconds');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.recover_voice(call_id,'request');
    raise exception 'Outsider recovery was allowed' using errcode='ZR300';
  exception when sqlstate 'ZR300' then raise; when others then null; end;
  perform set_config('request.jwt.claim.sub',semsem::text,true);
  begin
    perform public.recover_voice(call_id,'offer','forged offer',0);
    raise exception 'Recipient could forge ICE restart offer' using errcode='ZR301';
  exception when sqlstate 'ZR301' then raise; when others then null; end;
  result := public.recover_voice(call_id,'request');
  if result.recovery_requested_at is null then raise exception 'Request not persisted'; end if;
  perform set_config('request.jwt.claim.sub',sasa::text,true);
  result := public.recover_voice(call_id,'offer','restart SDP offer',0);
  if result.recovery_seq<>1 or result.recovery_offer<>'restart SDP offer'
     or result.recovery_answer is not null then raise exception 'ICE restart offer failed'; end if;
  perform set_config('request.jwt.claim.sub',semsem::text,true);
  result := public.recover_voice(call_id,'answer','restart SDP answer',1);
  if result.recovery_answer<>'restart SDP answer' then raise exception 'ICE restart answer failed'; end if;
  begin
    perform public.recover_voice(call_id,'answer','stale SDP answer',0);
    raise exception 'Stale ICE answer was accepted' using errcode='ZR302';
  exception when sqlstate 'ZR302' then raise; when others then null; end;
  perform set_config('request.jwt.claim.sub',sasa::text,true);
  perform public.push_voice_candidates_v2(call_id,
    '[{"candidate":"candidate:1 1 udp 1 192.0.2.1 3478 typ relay","sdpMid":"0","sdpMLineIndex":0}]'::jsonb,1);
  begin
    perform public.push_voice_candidates_v2(call_id,
      '[{"candidate":"candidate:1 1 udp 1 192.0.2.1 3478 typ relay"}]'::jsonb,0);
    raise exception 'Stale ICE candidate accepted' using errcode='ZR303';
  exception when sqlstate 'ZR303' then raise; when others then null; end;
  result := public.change_voice(call_id,'end');
  if result.recovery_offer is not null or result.recovery_answer is not null
     then raise exception 'Ended call retained private recovery SDP'; end if;
end $verify$;
select 'PASS: ICE restart authorized, stale generations denied, ended call cleared' as result;
