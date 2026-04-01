alter table public.episodes
add column if not exists is_published boolean;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'episodes'
      and column_name = 'published'
  ) then
    execute $sql$
      update public.episodes
      set is_published = coalesce(is_published, published, true)
      where is_published is null
    $sql$;
  else
    update public.episodes
    set is_published = true
    where is_published is null;
  end if;
end
$$;

alter table public.episodes
alter column is_published set default true;

update public.episodes
set is_published = true
where is_published is null;

alter table public.episodes
alter column is_published set not null;

comment on column public.episodes.is_published is
  'Canonical publish flag for episodes. true = public, false = draft.';