-- Safe production regression: all changes are isolated in a transaction and rolled back.
begin;
do $verification$
declare
 a uuid := (select id from public.profiles where stable_key='sasa');
 b uuid := (select id from public.profiles where stable_key='semsem');
 outsider uuid := gen_random_uuid();
 req uuid := gen_random_uuid();
 reply_id uuid := gen_random_uuid();
 mood_id uuid := gen_random_uuid();
begin
 if a is null or b is null then raise exception 'Profile fixture missing'; end if;
 insert into public.chat_entries(id,sender_id,recipient_id,body,title,icon,tint)
 values(req,a,b,'Would you like a hug?','Need a hug','Heart','#BA314F');
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 begin
   perform public.set_mood('happy',gen_random_uuid());
   raise exception 'Outsider could set mood' using errcode='ZQ101';
 exception
   when sqlstate 'ZQ101' then raise;
   when others then null;
 end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.respond(req,'Yes, my love!',reply_id);
 if not exists(select 1 from public.chat_entries where id=req and reply_text='Yes, my love!' and responded_at is not null) then
   raise exception 'Request reply not saved';
 end if;
 if not exists(select 1 from public.chat_entries where id=reply_id and in_reply_to=req and sender_id=b and body='Yes, my love!') then
   raise exception 'Linked reply message missing';
 end if;
 perform public.respond(req,'Yes, my love!',reply_id);
 perform public.set_mood('happy',mood_id);
 if not exists(select 1 from public.profiles where id=b and mood='happy') then
   raise exception 'Mood profile not set';
 end if;
 if not exists(select 1 from public.chat_entries where id=mood_id and sender_id=b and recipient_id=a) then
   raise exception 'Mood message missing';
 end if;
 perform public.set_mood('happy',mood_id); -- idempotent
end $verification$;
select 'PASS: RLS, mood, linked reply, idempotency' as test_result;
rollback;
