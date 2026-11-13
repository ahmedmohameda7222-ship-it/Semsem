-- Private custom card drafts are visible to their creator only.
-- This replaces the original partner-wide read policy; the author still
-- has insert/delete rights under the original strict policies.
drop policy if exists shared_cards_pair_read on public.shared_cards;
create policy shared_cards_author_read on public.shared_cards
  for select to authenticated
  using (
    author_id = (select auth.uid())
    and (select our_space_private.is_member())
  );
