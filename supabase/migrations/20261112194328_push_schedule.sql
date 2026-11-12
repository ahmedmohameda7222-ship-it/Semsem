create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create function our_space_private.setup_push_scheduler(origin text, token text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  secret_id uuid;
begin
  if origin !~ '^https://[a-z0-9-]+\.vercel\.app$' or token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid push scheduler configuration';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('our-space-push-scheduler',0));

  select id into secret_id from vault.secrets where name='our-space-push-cron';
  if secret_id is null then
    perform vault.create_secret(token,'our-space-push-cron');
  elsif (select decrypted_secret from vault.decrypted_secrets where id=secret_id) is distinct from token then
    perform vault.update_secret(secret_id, token);
  end if;

  perform cron.schedule('our-space-push-retry','* * * * *',format($job$
    select net.http_get(
      url:=%L,
      headers:=jsonb_build_object('Authorization','Bearer ' || s.decrypted_secret),
      timeout_milliseconds:=12000
    )
    from vault.decrypted_secrets s
    where s.name='our-space-push-cron' and exists (
      select 1 from public.notification_deliveries d
      where d.delivered_at is null and d.attempts<8 and d.next_attempt<=now()
    )
  $job$,origin || '/api/push-cron'));
end
$$;

create function public.setup_push_scheduler(origin text, token text)
returns void
language sql security invoker set search_path = ''
as $$ select our_space_private.setup_push_scheduler(origin,token) $$;

revoke all on function public.setup_push_scheduler(text,text), our_space_private.setup_push_scheduler(text,text) from public, anon, authenticated;
grant usage on schema our_space_private to service_role;
grant execute on function public.setup_push_scheduler(text,text), our_space_private.setup_push_scheduler(text,text) to service_role;
