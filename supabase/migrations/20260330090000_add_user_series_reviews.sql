create table if not exists public.user_series_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id text not null,
  body text not null,
  is_public boolean not null default true,
  author_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_series_reviews_user_series_key unique (user_id, series_id),
  constraint user_series_reviews_body_length_check
    check (
      char_length(btrim(body)) >= 1
      and char_length(btrim(body)) <= 300
    )
);

create index if not exists user_series_reviews_series_id_updated_at_idx
  on public.user_series_reviews (series_id, updated_at desc);

create index if not exists user_series_reviews_user_id_updated_at_idx
  on public.user_series_reviews (user_id, updated_at desc);

grant select on table public.user_series_reviews to anon, authenticated;
grant insert, update, delete on table public.user_series_reviews to authenticated;

alter table public.user_series_reviews enable row level security;

create or replace function public.touch_user_series_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_user_series_reviews_updated_at
on public.user_series_reviews;

create trigger touch_user_series_reviews_updated_at
before update on public.user_series_reviews
for each row
execute function public.touch_user_series_reviews_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_series_reviews'
      and policyname = 'public_select_user_series_reviews'
  ) then
    create policy public_select_user_series_reviews
      on public.user_series_reviews
      for select
      using (is_public = true or auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_series_reviews'
      and policyname = 'authenticated_insert_own_user_series_reviews'
  ) then
    create policy authenticated_insert_own_user_series_reviews
      on public.user_series_reviews
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_series_reviews'
      and policyname = 'authenticated_update_own_user_series_reviews'
  ) then
    create policy authenticated_update_own_user_series_reviews
      on public.user_series_reviews
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_series_reviews'
      and policyname = 'authenticated_delete_own_user_series_reviews'
  ) then
    create policy authenticated_delete_own_user_series_reviews
      on public.user_series_reviews
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;