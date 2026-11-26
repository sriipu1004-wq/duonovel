-- Account deletion verification: row-count snapshot (LT-004 draft). LOCAL fixture ONLY.
-- Usage: psql "$DB_URL" -v ON_ERROR_STOP=1 -v label=before -f scripts/account-deletion/snapshot.sql
-- Counts only; never selects bodies or personal data. Requires fixture.sql to be loaded.

\set ON_ERROR_STOP on
\if :{?label}
\else
  \echo 'set -v label=before|after|after2'
  \quit
\endif

do $$
begin
  if to_regnamespace('acctdel_fx') is null then
    raise exception 'acctdel_fx missing: load scripts/account-deletion/fixture.sql into a LOCAL stack first';
  end if;
end;
$$;

-- A = deleted account, B = other author, C = unrelated user (fixed UUIDs from fixture.sql)
\set a '''a0000000-0000-4000-8000-00000000000a'''
\set b '''b0000000-0000-4000-8000-00000000000b'''
\set c '''c0000000-0000-4000-8000-00000000000c'''

delete from acctdel_fx.snapshots where label = :'label';

insert into acctdel_fx.snapshots (label, check_name, row_count)
select :'label', check_name, row_count from (
  values
  -- rows linked to A
  ('a.auth_users',                    (select count(*) from auth.users where id = :a)),
  ('a.users',                         (select count(*) from acctdel_fx.users where id = :a)),
  ('a.series',                        (select count(*) from acctdel_fx.series where author_id = :a)),
  ('a.episodes_of_a_series',          (select count(*) from acctdel_fx.episodes e join acctdel_fx.series s on s.id = e.series_id where s.author_id = :a)),
  ('a.recordings_read_by_a',          (select count(*) from acctdel_fx.recordings where reader_id = :a or reader_user_id = :a)),
  ('a.human_translations_by_a',       (select count(*) from acctdel_fx.episode_human_translations where translator_user_id = :a)),
  ('a.billing_customers',             (select count(*) from acctdel_fx.libread_billing_customers where user_id = :a)),
  ('a.billing_subscriptions',         (select count(*) from acctdel_fx.libread_billing_subscriptions where user_id = :a)),
  ('a.translation_unlocks',           (select count(*) from acctdel_fx.public_episode_translation_unlocks where user_id = :a)),
  ('a.credit_ledger',                 (select count(*) from acctdel_fx.credit_ledger where user_id = :a)),
  ('a.credit_purchase_lots',          (select count(*) from acctdel_fx.credit_purchase_lots where user_id = :a)),
  ('a.word_explanations_owned',       (select count(*) from acctdel_fx.bilingual_word_explanations where owner_user_id = :a)),
  ('a.view_events',                   (select count(*) from acctdel_fx.series_view_events where user_id = :a)),
  ('a.bookmarks',                     (select count(*) from acctdel_fx.user_series_bookmarks where user_id = :a)),
  ('a.private_library_works',         (select count(*) from acctdel_fx.private_library_works where owner_user_id = :a)),
  ('a.storage_objects',               (select count(*) from storage.objects where bucket_id = 'acctdel-fx-private' and owner_id::text = :a)),
  -- orphan-candidate rows (kept but unlinked when FK is set null)
  ('anon.word_explanations_unowned',  (select count(*) from acctdel_fx.bilingual_word_explanations where owner_user_id is null)),
  ('anon.view_events_unlinked',       (select count(*) from acctdel_fx.series_view_events where user_id is null)),
  -- rows of other users that must survive
  ('b.auth_users',                    (select count(*) from auth.users where id = :b)),
  ('b.series',                        (select count(*) from acctdel_fx.series where author_id = :b)),
  ('b.recordings_on_a_series',        (select count(*) from acctdel_fx.recordings r join acctdel_fx.series s on s.id = r.series_id where r.reader_id = :b and s.author_id = :a)),
  ('b.human_translations_on_a_series',(select count(*) from acctdel_fx.episode_human_translations t join acctdel_fx.series s on s.id = t.series_id where t.translator_user_id = :b and s.author_id = :a)),
  ('b.storage_objects',               (select count(*) from storage.objects where bucket_id = 'acctdel-fx-private' and owner_id::text = :b)),
  ('c.auth_users',                    (select count(*) from auth.users where id = :c)),
  ('c.billing_customers',             (select count(*) from acctdel_fx.libread_billing_customers where user_id = :c)),
  ('c.credit_ledger',                 (select count(*) from acctdel_fx.credit_ledger where user_id = :c)),
  ('c.unlocks_on_a_series',           (select count(*) from acctdel_fx.public_episode_translation_unlocks u join acctdel_fx.episodes e on e.id = u.episode_id join acctdel_fx.series s on s.id = e.series_id where u.user_id = :c and s.author_id = :a)),
  ('c.bookmarks_on_a_series',         (select count(*) from acctdel_fx.user_series_bookmarks k join acctdel_fx.series s on s.id = k.series_id where k.user_id = :c and s.author_id = :a))
) as t(check_name, row_count);

select label, check_name, row_count
from acctdel_fx.snapshots
where label = :'label'
order by check_name;

-- Compare two labels (run after both exist), e.g. before vs after:
-- select b.check_name, b.row_count as before, a.row_count as after
-- from acctdel_fx.snapshots b join acctdel_fx.snapshots a using (check_name)
-- where b.label = 'before' and a.label = 'after' and b.row_count <> a.row_count
-- order by 1;
