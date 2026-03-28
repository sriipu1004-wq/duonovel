create table if not exists public.user_series_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id text not null,
  reaction_type text not null default 'support',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_series_reactions_reaction_type_check
    check (reaction_type in ('support'))
);

create unique index if not exists user_series_reactions_user_series_uidx
  on public.user_series_reactions (user_id, series_id);

create index if not exists user_series_reactions_series_id_idx
  on public.user_series_reactions (series_id);

create index if not exists user_series_reactions_series_reaction_idx
  on public.user_series_reactions (series_id, reaction_type);

alter table public.user_series_reactions enable row level security;

grant select on table public.user_series_reactions to anon, authenticated;
grant insert, update, delete on table public.user_series_reactions to authenticated;

create or replace function public.set_user_series_reactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_series_reactions_updated_at on public.user_series_reactions;
create trigger set_user_series_reactions_updated_at
before update on public.user_series_reactions
for each row
execute function public.set_user_series_reactions_updated_at();

drop policy if exists "user_series_reactions_select_all" on public.user_series_reactions;
create policy "user_series_reactions_select_all"
on public.user_series_reactions
for select
using (true);

drop policy if exists "user_series_reactions_insert_own" on public.user_series_reactions;
create policy "user_series_reactions_insert_own"
on public.user_series_reactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_series_reactions_update_own" on public.user_series_reactions;
create policy "user_series_reactions_update_own"
on public.user_series_reactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_series_reactions_delete_own" on public.user_series_reactions;
create policy "user_series_reactions_delete_own"
on public.user_series_reactions
for delete
to authenticated
using (auth.uid() = user_id);