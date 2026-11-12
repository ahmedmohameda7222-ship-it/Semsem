-- The fixture secrets and cron job are rolled back before a job can run.
do $test$
begin
  begin
    set local role service_role;
    perform public.setup_push_scheduler('https://our-space-sage.vercel.app',repeat('a',64));
    perform public.setup_push_scheduler('https://our-space-sage.vercel.app',repeat('b',64));
    reset role;
    if (select count(*) from cron.job where jobname='our-space-push-retry' and active) <> 1 then
      raise exception 'Expected exactly one scheduled job';
    end if;
    if (select count(*) from vault.secrets where name='our-space-push-cron') <> 1 then
      raise exception 'Expected exactly one Vault record';
    end if;
    if has_function_privilege('authenticated','public.setup_push_scheduler(text,text)','execute') then
      raise exception 'Scheduler setup available to authenticated browser';
    end if;
    raise exception 'Rollback fixture' using errcode='ZZ199';
  exception when sqlstate 'ZZ199' then null;
  end;
end
$test$;
select 'Scheduler setup, rotation, and privilege checks passed' as result;
