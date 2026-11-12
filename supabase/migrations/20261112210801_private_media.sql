insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('our-space-chat-media','our-space-chat-media',false,8388608,array['image/jpeg','audio/mp4','audio/webm','audio/ogg']),
('our-space-memories','our-space-memories',false,2097152,array['image/jpeg']);

create policy pair_media_read on storage.objects for select to authenticated using (
  bucket_id in ('our-space-chat-media','our-space-memories') and (select our_space_private.is_member())
);
create policy own_media_upload on storage.objects for insert to authenticated with check (
  bucket_id in ('our-space-chat-media','our-space-memories')
  and (select our_space_private.is_member()) and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter table public.chat_entries add column media_kind text, add column media_path text,
  add constraint chat_media_shape check (
    (media_kind is null and media_path is null) or
    (title is null and media_kind is not null and media_kind in ('photo','audio')
      and media_path is not null and split_part(media_path,'/',1) = sender_id::text)
  );

create function our_space_private.send_media(entry uuid, kind text, object_path text, caption text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mime text;
begin
  if not our_space_private.is_member() or kind is null or kind not in ('photo','audio')
     or object_path is null or split_part(object_path,'/',1) <> me::text then
    raise exception 'Invalid chat attachment';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(entry::text, 0));
  if exists(select 1 from public.chat_entries c where c.id=entry and c.sender_id=me) then
    if exists(select 1 from public.chat_entries c where c.id=entry and c.sender_id=me and c.media_path=object_path and c.media_kind=kind) then
      return entry;
    end if;
    raise exception 'Entry already exists';
  end if;
  select metadata->>'mimetype' into mime from storage.objects
  where bucket_id='our-space-chat-media' and name=object_path and owner_id=me::text;
  if mime is null or (kind='photo' and mime <> 'image/jpeg') or
     (kind='audio' and mime not in ('audio/mp4','audio/webm','audio/ogg')) then
    raise exception 'Attachment is unavailable';
  end if;
  perform our_space_private.send_chat(entry,
    coalesce(nullif(trim(caption),''),case when kind='photo' then 'Photo' else 'Voice message' end), null);
  update public.chat_entries set media_kind=kind,media_path=object_path where id=entry and sender_id=me;
  return entry;
end $$;

create function public.send_media(entry uuid, kind text, object_path text, caption text default '') returns uuid
language sql security invoker set search_path = ''
as $$ select our_space_private.send_media(entry,kind,object_path,caption) $$;
revoke all on function public.send_media(uuid,text,text,text),our_space_private.send_media(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.send_media(uuid,text,text,text),our_space_private.send_media(uuid,text,text,text) to authenticated;

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  photo_path text not null unique check(split_part(photo_path,'/',1)=author_id::text),
  caption text not null default '' check(length(caption)<=300),
  created_at timestamptz not null default now()
);
alter table public.memories enable row level security;
revoke all on public.memories from public,anon,authenticated;
grant select,delete on public.memories to authenticated;
grant insert(photo_path,caption) on public.memories to authenticated;
create policy pair_memories_read on public.memories for select to authenticated using ((select our_space_private.is_member()));
create policy own_memory_add on public.memories for insert to authenticated with check (
  author_id=(select auth.uid()) and (select our_space_private.is_member()) and exists (
    select 1 from storage.objects o where o.bucket_id='our-space-memories' and o.name=photo_path and o.owner_id=author_id::text
  )
);
create policy own_memory_remove on public.memories for delete to authenticated using (
  author_id=(select auth.uid()) and (select our_space_private.is_member())
);
create policy unused_media_remove on storage.objects for delete to authenticated using (
  bucket_id in ('our-space-chat-media','our-space-memories') and (select our_space_private.is_member())
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.chat_entries c where c.media_path=name)
  and not exists(select 1 from public.memories m where m.photo_path=name)
);
alter publication supabase_realtime add table public.memories;
