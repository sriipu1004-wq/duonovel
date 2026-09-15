-- Security/integrity hardening for series reactions.
--
-- Current UI mutations already go through /api/series/reaction. Historically the
-- table also allowed authenticated PostgREST INSERT/UPDATE/DELETE directly, but
-- there was no UNIQUE(user_id, series_id) constraint. A caller could therefore
-- create multiple `support` rows for the same work and every insert would
-- increment series_popularity_daily through the existing trigger.

begin;

-- Remove orphan reactions first. The production audit found an existing row
-- whose series_id no longer resolves to public.series. DELETE fires the existing
-- popularity trigger, keeping any matching aggregate from increasing further.
delete from public.user_series_reactions reaction
where not exists (
  select 1
  from public.series s
  where s.id::text = reaction.series_id
);

-- Be defensive against duplicates created between audit and migration apply.
-- Keep the oldest row per user/work and delete the rest. The DELETE trigger
-- compensates the popularity count for each removed duplicate.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, series_id
      order by created_at asc, id asc
    ) as row_number_for_pair
  from public.user_series_reactions
)
delete from public.user_series_reactions reaction
using ranked
where reaction.id = ranked.id
  and ranked.row_number_for_pair > 1;

-- A reaction is a toggle, not an append-only event stream. Enforce that invariant
-- in the database so concurrent API requests cannot create duplicates either.
create unique index if not exists user_series_reactions_user_series_unique
  on public.user_series_reactions (user_id, series_id);

-- Browser code only SELECTs reaction state/counts. All current mutations are
-- authenticated server routes using the service role, so direct client writes
-- are unnecessary and permit bypassing route-level target validation.
revoke insert, update, delete
  on table public.user_series_reactions
  from anon, authenticated;

drop policy if exists user_series_reactions_insert_own
  on public.user_series_reactions;
drop policy if exists user_series_reactions_update_own
  on public.user_series_reactions;
drop policy if exists user_series_reactions_delete_own
  on public.user_series_reactions;

-- Remove aggregate rows for series that no longer exist. They cannot be rendered
-- as a valid work and otherwise preserve stale/manipulated ranking state.
delete from public.series_popularity_daily popularity
where not exists (
  select 1
  from public.series s
  where s.id::text = popularity.series_id
);

commit;
