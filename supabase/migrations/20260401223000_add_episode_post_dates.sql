alter table public.episodes
  add column if not exists posted_at timestamptz null;

alter table public.episodes
  add column if not exists last_edited_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'episodes'
      and column_name = 'created_at'
  ) then
    execute $sql$
      update public.episodes
      set posted_at = coalesce(posted_at, created_at)
      where posting_status = 'posted'
        and posted_at is null
    $sql$;
  else
    update public.episodes
    set posted_at = coalesce(posted_at, now())
    where posting_status = 'posted'
      and posted_at is null;
  end if;
end $$;

create index if not exists episodes_series_id_posted_at_idx
  on public.episodes (series_id, posted_at);

comment on column public.episodes.posted_at is
  'First posted datetime for an episode.';

comment on column public.episodes.last_edited_at is
  'Last edited datetime after the episode became publicly visible.';