-- Account deletion verification: observe CURRENT foreign-key behaviour (LT-004 draft).
-- LOCAL fixture ONLY. This is NOT a deletion procedure: every attempt runs inside a
-- transaction that is always rolled back, so nothing is changed.
-- Checks docs/account-deletion-design.md §3-1: series.author_id / recordings.reader_id are
-- "no action", so deleting the Auth user who owns a work fails.

\set ON_ERROR_STOP on

do $$
begin
  if to_regnamespace('acctdel_fx') is null then
    raise exception 'acctdel_fx missing: load scripts/account-deletion/fixture.sql into a LOCAL stack first';
  end if;
end;
$$;

create temporary table acctdel_fk_results (
  step text primary key,
  outcome text not null,
  detail text not null
);

-- Step 1: delete A from auth.users as-is. Expected: blocked by series.author_id (no action).
do $$
declare
  a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
begin
  begin
    delete from auth.users where id = a;
    raise exception 'acctdel_rollback';
  exception
    when foreign_key_violation then
      insert into acctdel_fk_results values ('1_delete_auth_user_as_is', 'BLOCKED', sqlerrm);
    when raise_exception then
      if sqlerrm <> 'acctdel_rollback' then raise; end if;
      insert into acctdel_fk_results values ('1_delete_auth_user_as_is', 'DELETED_THEN_ROLLED_BACK', 'no FK blocked the delete');
  end;
end;
$$;

-- Step 2: what cascade / set null would do once A's own works and readings are removed.
-- Runs in a sub-block that is always rolled back; counts are kept in variables and written after the rollback.
do $$
declare
  a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  n_series bigint; n_rec bigint; n_ht_by_a bigint; n_ht_on_a_by_b bigint;
  n_billing bigint; n_ledger bigint; n_lots bigint; n_wx_null bigint; n_view_null bigint;
  n_storage bigint; n_b_rec bigint;
begin
  begin
    delete from acctdel_fx.recordings where reader_id = a;  -- would otherwise block (no action)
    delete from acctdel_fx.series where author_id = a;      -- would otherwise block (no action)
    delete from auth.users where id = a;

    select count(*) into n_series from acctdel_fx.series where author_id = a;
    select count(*) into n_rec from acctdel_fx.recordings where reader_id = a or reader_user_id = a;
    select count(*) into n_ht_by_a from acctdel_fx.episode_human_translations where translator_user_id = a;
    select count(*) into n_ht_on_a_by_b from acctdel_fx.episode_human_translations where translator_user_id = b;
    select count(*) into n_b_rec from acctdel_fx.recordings where reader_id = b;
    select count(*) into n_billing from acctdel_fx.libread_billing_customers where user_id = a;
    select count(*) into n_ledger from acctdel_fx.credit_ledger where user_id = a;
    select count(*) into n_lots from acctdel_fx.credit_purchase_lots where user_id = a;
    select count(*) into n_wx_null from acctdel_fx.bilingual_word_explanations where owner_user_id is null;
    select count(*) into n_view_null from acctdel_fx.series_view_events where user_id is null;
    select count(*) into n_storage from storage.objects where bucket_id = 'acctdel-fx-private' and owner_id::text = a::text;

    raise exception 'acctdel_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'acctdel_rollback' then raise; end if;
  end;
  -- The block above was rolled back; plpgsql variables keep the counted values.
  insert into acctdel_fk_results values
    ('2a_series_of_a_left', n_series::text, 'deleted explicitly before auth delete'),
    ('2b_recordings_by_a_left', n_rec::text, 'reader_id no action -> removed explicitly'),
    ('2c_human_translations_by_a_left', n_ht_by_a::text, 'cascade: A''s translation on B''s work disappears (design §3-2)'),
    ('2d_human_translations_by_b_left', n_ht_on_a_by_b::text, 'B''s translation on A''s work: cascades with A''s series (series_id on delete cascade)'),
    ('2e_recordings_by_b_left', n_b_rec::text, 'B''s narration of A''s work: cascades with A''s series'),
    ('2f_billing_customers_of_a_left', n_billing::text, 'cascade: billing record gone (design §3-3, owner decision pending)'),
    ('2g_credit_ledger_of_a_left', n_ledger::text, 'no FK: stays with dangling user_id (design §3-5)'),
    ('2h_credit_lots_of_a_left', n_lots::text, 'no FK: stays with dangling user_id'),
    ('2i_word_explanations_unowned', n_wx_null::text, 'set null: row kept, owner unlinked'),
    ('2j_view_events_unlinked', n_view_null::text, 'set null: row kept, user unlinked'),
    ('2k_storage_objects_of_a_left', n_storage::text, 'Storage rows are not tied by FK here: they remain (design §3-4)');
end;
$$;

select step, outcome, detail from acctdel_fk_results order by step;

-- Confirm nothing changed (all synthetic users still present).
select 'UNCHANGED_AFTER_ROLLBACK' as status,
       (select count(*) from auth.users where email like 'acctdel-%@example.invalid') as synthetic_users,
       (select count(*) from acctdel_fx.series) as series_rows;
