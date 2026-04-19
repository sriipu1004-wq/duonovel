create table if not exists public.series_popularity_daily (
  series_id text not null,
  bucket_date date not null,
  like_count integer not null default 0,
  bookmark_count integer not null default 0,
  view_count integer not null default 0,
  narration_play_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (series_id, bucket_date)
);

create index if not exists idx_series_popularity_daily_bucket_date
  on public.series_popularity_daily (bucket_date);

alter table public.series_popularity_daily enable row level security;

drop policy if exists "Public can read series_popularity_daily"
  on public.series_popularity_daily;

create policy "Public can read series_popularity_daily"
  on public.series_popularity_daily
  for select
  using (true);

create or replace function public.to_tokyo_bucket_date(input_ts timestamptz)
returns date
language sql
immutable
as $$
  select ((input_ts at time zone 'Asia/Tokyo')::date)
$$;

create or replace function public.upsert_series_popularity_daily(
  p_series_id text,
  p_bucket_date date,
  p_like_delta integer,
  p_bookmark_delta integer,
  p_view_delta integer,
  p_narration_play_delta integer
)
returns void
language plpgsql
as $$
begin
  if p_series_id is null or btrim(p_series_id) = '' or p_bucket_date is null then
    return;
  end if;

  insert into public.series_popularity_daily (
    series_id,
    bucket_date,
    like_count,
    bookmark_count,
    view_count,
    narration_play_count
  )
  values (
    p_series_id,
    p_bucket_date,
    greatest(p_like_delta, 0),
    greatest(p_bookmark_delta, 0),
    greatest(p_view_delta, 0),
    greatest(p_narration_play_delta, 0)
  )
  on conflict (series_id, bucket_date)
  do update
    set like_count = greatest(0, public.series_popularity_daily.like_count + p_like_delta),
        bookmark_count = greatest(0, public.series_popularity_daily.bookmark_count + p_bookmark_delta),
        view_count = greatest(0, public.series_popularity_daily.view_count + p_view_delta),
        narration_play_count = greatest(0, public.series_popularity_daily.narration_play_count + p_narration_play_delta),
        updated_at = now();
end;
$$;

create or replace function public.handle_user_series_reactions_popularity_daily()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.reaction_type = 'support' then
      perform public.upsert_series_popularity_daily(
        new.series_id::text,
        public.to_tokyo_bucket_date(coalesce(new.created_at, now())),
        1,
        0,
        0,
        0
      );
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.reaction_type = 'support' then
      perform public.upsert_series_popularity_daily(
        old.series_id::text,
        public.to_tokyo_bucket_date(coalesce(old.created_at, now())),
        -1,
        0,
        0,
        0
      );
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.reaction_type = 'support' then
      perform public.upsert_series_popularity_daily(
        old.series_id::text,
        public.to_tokyo_bucket_date(coalesce(old.created_at, now())),
        -1,
        0,
        0,
        0
      );
    end if;

    if new.reaction_type = 'support' then
      perform public.upsert_series_popularity_daily(
        new.series_id::text,
        public.to_tokyo_bucket_date(coalesce(new.created_at, now())),
        1,
        0,
        0,
        0
      );
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_user_series_reactions_popularity_daily
  on public.user_series_reactions;

create trigger trg_user_series_reactions_popularity_daily
after insert or update or delete
on public.user_series_reactions
for each row
execute function public.handle_user_series_reactions_popularity_daily();

create or replace function public.handle_user_series_bookmarks_popularity_daily()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.upsert_series_popularity_daily(
      new.series_id::text,
      public.to_tokyo_bucket_date(coalesce(new.created_at, now())),
      0,
      1,
      0,
      0
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.upsert_series_popularity_daily(
      old.series_id::text,
      public.to_tokyo_bucket_date(coalesce(old.created_at, now())),
      0,
      -1,
      0,
      0
    );

    return old;
  end if;

  if tg_op = 'UPDATE' then
    perform public.upsert_series_popularity_daily(
      old.series_id::text,
      public.to_tokyo_bucket_date(coalesce(old.created_at, now())),
      0,
      -1,
      0,
      0
    );

    perform public.upsert_series_popularity_daily(
      new.series_id::text,
      public.to_tokyo_bucket_date(coalesce(new.created_at, now())),
      0,
      1,
      0,
      0
    );

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_user_series_bookmarks_popularity_daily
  on public.user_series_bookmarks;

create trigger trg_user_series_bookmarks_popularity_daily
after insert or update or delete
on public.user_series_bookmarks
for each row
execute function public.handle_user_series_bookmarks_popularity_daily();

create or replace function public.handle_series_view_events_popularity_daily()
returns trigger
language plpgsql
as $$
begin
  perform public.upsert_series_popularity_daily(
    new.series_id::text,
    public.to_tokyo_bucket_date(coalesce(new.created_at, now())),
    0,
    0,
    1,
    0
  );

  return new;
end;
$$;

drop trigger if exists trg_series_view_events_popularity_daily
  on public.series_view_events;

create trigger trg_series_view_events_popularity_daily
after insert
on public.series_view_events
for each row
execute function public.handle_series_view_events_popularity_daily();

create or replace function public.handle_recording_play_events_popularity_daily()
returns trigger
language plpgsql
as $$
begin
  perform public.upsert_series_popularity_daily(
    new.series_id::text,
    public.to_tokyo_bucket_date(coalesce(new.created_at, now())),
    0,
    0,
    0,
    1
  );

  return new;
end;
$$;

drop trigger if exists trg_recording_play_events_popularity_daily
  on public.recording_play_events;

create trigger trg_recording_play_events_popularity_daily
after insert
on public.recording_play_events
for each row
execute function public.handle_recording_play_events_popularity_daily();

truncate table public.series_popularity_daily;

insert into public.series_popularity_daily (
  series_id,
  bucket_date,
  like_count,
  bookmark_count,
  view_count,
  narration_play_count
)
select
  source.series_id,
  source.bucket_date,
  sum(source.like_count) as like_count,
  sum(source.bookmark_count) as bookmark_count,
  sum(source.view_count) as view_count,
  sum(source.narration_play_count) as narration_play_count
from (
  select
    usr.series_id::text as series_id,
    public.to_tokyo_bucket_date(coalesce(usr.created_at, now())) as bucket_date,
    count(*)::integer as like_count,
    0::integer as bookmark_count,
    0::integer as view_count,
    0::integer as narration_play_count
  from public.user_series_reactions as usr
  where usr.reaction_type = 'support'
  group by usr.series_id::text, public.to_tokyo_bucket_date(coalesce(usr.created_at, now()))

  union all

  select
    usb.series_id::text as series_id,
    public.to_tokyo_bucket_date(coalesce(usb.created_at, now())) as bucket_date,
    0::integer as like_count,
    count(*)::integer as bookmark_count,
    0::integer as view_count,
    0::integer as narration_play_count
  from public.user_series_bookmarks as usb
  group by usb.series_id::text, public.to_tokyo_bucket_date(coalesce(usb.created_at, now()))

  union all

  select
    sve.series_id::text as series_id,
    public.to_tokyo_bucket_date(coalesce(sve.created_at, now())) as bucket_date,
    0::integer as like_count,
    0::integer as bookmark_count,
    count(*)::integer as view_count,
    0::integer as narration_play_count
  from public.series_view_events as sve
  group by sve.series_id::text, public.to_tokyo_bucket_date(coalesce(sve.created_at, now()))

  union all

  select
    rpe.series_id::text as series_id,
    public.to_tokyo_bucket_date(coalesce(rpe.created_at, now())) as bucket_date,
    0::integer as like_count,
    0::integer as bookmark_count,
    0::integer as view_count,
    count(*)::integer as narration_play_count
  from public.recording_play_events as rpe
  group by rpe.series_id::text, public.to_tokyo_bucket_date(coalesce(rpe.created_at, now()))
) as source
group by source.series_id, source.bucket_date;