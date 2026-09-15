-- Security audit hardening for public recording visibility.
--
-- A recording marked is_public=true must not remain directly readable through
-- PostgREST after its work/episode is unpublished. Recording visibility follows
-- the same canonical publication state as the text itself.

begin;

drop policy if exists recordings_select_public_visible
  on public.recordings;

create policy recordings_select_public_visible
on public.recordings
for select
to anon, authenticated
using (
  is_public = true
  and exists (
    select 1
    from public.episodes e
    join public.series s on s.id = e.series_id
    where e.id = recordings.episode_id
      and s.id = recordings.series_id
      and s.publication_status = 'public'
      and e.posting_status = 'posted'
      and e.is_published = true
  )
);

commit;
