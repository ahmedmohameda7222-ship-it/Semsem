create policy pair_voice_receive on realtime.messages for select to authenticated using (
  realtime.topic()='our-space:voice' and extension='broadcast' and (select our_space_private.is_member())
);
create policy pair_voice_send on realtime.messages for insert to authenticated with check (
  realtime.topic()='our-space:voice' and extension='broadcast' and (select our_space_private.is_member())
);
