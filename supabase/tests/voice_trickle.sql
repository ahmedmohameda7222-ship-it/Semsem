-- Validation with a transaction rolled back by the caller.
-- Use BEGIN; [migration SQL]; [this file]; ROLLBACK; to verify before applying.
do $verify$
declare
  sasa uuid := (select id from public.profiles where stable_key='sasa');
  semsem uuid := (select id from public.profiles where stable_key='semsem');
  outsider uuid := gen_random_uuid();
  invitation uuid := gen_random_uuid();
  c1 jsonb := jsonb_build_object(
    'candidate','candidate:1 1 udp 1 192.0.2.1 3478 typ relay',
    'sdpMid','0','sdpMLineIndex',0
  );
begin
  if sasa is null or semsem is null then raise exception 'Profiles missing'; end if;
  insert into public.voice_calls(id,caller_id,recipient_id)
  values(invitation,sasa,semsem);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',sasa::text,true);
  perform public.push_voice_candidates(invitation,jsonb_build_array(c1));
  if (select jsonb_array_length(caller_candidates) from public.voice_calls where id=invitation)<>1 then
    raise exception 'Caller candidate not stored';
  end if;
  perform set_config('request.jwt.claim.sub',semsem::text,true);
  perform public.push_voice_candidates(invitation,jsonb_build_array(c1));
  if (select jsonb_array_length(recipient_candidates) from public.voice_calls where id=invitation)<>1 then
    raise exception 'Recipient candidate not stored';
  end if;

  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.push_voice_candidates(invitation,jsonb_build_array(c1));
    raise exception 'An outsider could inject ICE signaling' using errcode='ZQ120';
  exception
    when sqlstate 'ZQ120' then raise;
    when others then null;
  end;

  perform set_config('request.jwt.claim.sub',sasa::text,true);
  begin
    perform public.push_voice_candidates(invitation,
      jsonb_build_array(jsonb_build_object('candidate','invalid bad candidate')));
    raise exception 'Malformed ICE candidate was accepted' using errcode='ZQ121';
  exception
    when sqlstate 'ZQ121' then raise;
    when others then null;
  end;
end $verify$;
select 'PASS: both participants authorized, outsider rejected, invalid candidate rejected' as result;
