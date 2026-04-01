alter table public.series
  add column if not exists publication_status text not null default 'private';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'series_publication_status_check'
  ) then
    alter table public.series
      add constraint series_publication_status_check
      check (publication_status in ('private', 'public'));
  end if;
end $$;

alter table public.episodes
  add column if not exists posting_status text not null default 'draft';

alter table public.episodes
  add column if not exists scheduled_for timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episodes_posting_status_check'
  ) then
    alter table public.episodes
      add constraint episodes_posting_status_check
      check (posting_status in ('draft', 'scheduled', 'posted'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'episodes_scheduled_for_consistency_check'
  ) then
    alter table public.episodes
      add constraint episodes_scheduled_for_consistency_check
      check (
        (posting_status = 'scheduled' and scheduled_for is not null)
        or
        (posting_status in ('draft', 'posted') and scheduled_for is null)
      );
  end if;
end $$;

update public.episodes
set
  posting_status = case
    when coalesce(is_published, false) = true then 'posted'
    else 'draft'
  end,
  scheduled_for = null
where
  posting_status is distinct from case
    when coalesce(is_published, false) = true then 'posted'
    else 'draft'
  end
  or scheduled_for is not null;

update public.series s
set publication_status = case
  when exists (
    select 1
    from public.episodes e
    where e.series_id = s.id
      and (
        coalesce(e.is_published, false) = true
        or e.posting_status = 'posted'
      )
  ) then 'public'
  else 'private'
end;

create index if not exists series_publication_status_idx
  on public.series (publication_status);

create index if not exists episodes_series_id_posting_status_scheduled_for_idx
  on public.episodes (series_id, posting_status, scheduled_for);

comment on column public.series.publication_status is
  'Canonical publication state for a series. private or public.';

comment on column public.episodes.posting_status is
  'Canonical posting state for an episode. draft, scheduled, or posted.';

comment on column public.episodes.scheduled_for is
  'Scheduled publish datetime for posting_status = scheduled.';