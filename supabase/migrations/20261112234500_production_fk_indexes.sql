-- Production hardening: covering indexes for foreign keys and their real hot-path lookups.
-- All statements are additive and preserve existing rows, RLS policies and RPCs.
create index if not exists attention_buttons_owner_created_idx
  on public.attention_buttons(owner_id, created_at);
create index if not exists chat_entries_recipient_read_idx
  on public.chat_entries(recipient_id, read_at);
create index if not exists chat_entries_sender_created_idx
  on public.chat_entries(sender_id, created_at desc);
create index if not exists chat_favorites_entry_idx
  on public.chat_favorites(entry_id);
create index if not exists love_notes_author_created_idx
  on public.love_notes(author_id, created_at);
create index if not exists memories_author_created_idx
  on public.memories(author_id, created_at);
create index if not exists message_reactions_user_idx
  on public.message_reactions(user_id);
create index if not exists notification_deliveries_endpoint_idx
  on public.notification_deliveries(endpoint);
create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox(recipient_id);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
create index if not exists voice_calls_caller_created_idx
  on public.voice_calls(caller_id, created_at desc);
create index if not exists voice_calls_recipient_created_idx
  on public.voice_calls(recipient_id, created_at desc);
