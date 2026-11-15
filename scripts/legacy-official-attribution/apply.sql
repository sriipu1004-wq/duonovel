-- Legacy official works: record the original author WITHOUT a rights check.
-- Owner decision: button answer 2026-11-15「原作者だけ先に表示 (推奨)」.
--
-- Writes only series.effect_settings of the 28 legacy official works that
-- have no rights record (NULL today), setting it to
--   {"legacyAttribution": {originalAuthor, authorDeathYear, sourceCandidates,
--     sourceMatchVerified: false, jurisdictionsAssessed, recordedAt, recordedBy}}
-- It does NOT add effect_settings.publicDomain / rightsChecked: the Production
-- bodies are not yet matched to a source edition, so the works must not be
-- marked rights-checked (no Public Domain notice, provenance panel, JSON-LD
-- or Human translation eligibility change). The app reads this record with
-- readLegacyAttribution (src/lib/legacyAttribution.ts), separately from
-- readPublicDomainMetadata, and only for works of the official account.
--
-- Targets, authors, death years and candidate cards come only from
-- public-domain/audits/legacy-official-{rights-classification,provenance-recovery}-2026-09-25.json
-- (scripts/legacy-official-attribution/targets.mjs; scope-check.mjs proves
-- this file matches it). Titles are the Production titles read 2026-11-15.
-- Excluded: 文鳥 (already Public Domain) and the 8 works made private by #210.
--
-- Every previous value is stored first in libread_internal so rollback.sql
-- can restore it exactly. Run once, in one transaction. Run dryrun.sql first.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regclass('libread_internal.legacy_attribution_series_20261115') is not null then
    raise exception 'LEGACY_ATTRIBUTION_ALREADY_APPLIED';
  end if;
end $$;

create schema if not exists libread_internal;
create table libread_internal.legacy_attribution_series_20261115 (
  series_id uuid primary key,
  expected_title text not null,
  title_before text,
  author_id_before uuid,
  effect_settings_was_null boolean not null,
  effect_settings_before jsonb,
  effect_settings_after jsonb not null
);
alter table libread_internal.legacy_attribution_series_20261115 enable row level security;
revoke all on libread_internal.legacy_attribution_series_20261115 from public, anon, authenticated;

-- Target list. The 28 series rows are read and locked in the same statement
-- (for update); a missing row fails the count guard below.
insert into libread_internal.legacy_attribution_series_20261115
  (series_id, expected_title, title_before, author_id_before,
   effect_settings_was_null, effect_settings_before, effect_settings_after)
select t.series_id, t.expected_title, s.title, s.author_id,
       s.effect_settings is null, s.effect_settings,
       jsonb_build_object('legacyAttribution', t.legacy)
from (values
  ('f0c430bd-daaf-4e70-8f8e-a6855c80a327'::uuid, '芥川龍之介・短編',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card92.html","https://www.aozora.gr.jp/cards/000879/card42.html","https://www.aozora.gr.jp/cards/000879/card19.html","https://www.aozora.gr.jp/cards/000879/card20.html","https://www.aozora.gr.jp/cards/000879/card3827.html","https://www.aozora.gr.jp/cards/000879/card122.html","https://www.aozora.gr.jp/cards/000879/card21.html","https://www.aozora.gr.jp/cards/000879/card56.html","https://www.aozora.gr.jp/cards/000879/card16034.html","https://www.aozora.gr.jp/cards/000879/card3814.html","https://www.aozora.gr.jp/cards/000879/card68.html","https://www.aozora.gr.jp/cards/000879/card95.html","https://www.aozora.gr.jp/cards/000879/card140.html","https://www.aozora.gr.jp/cards/000879/card176.html","https://www.aozora.gr.jp/cards/000879/card14.html","https://www.aozora.gr.jp/cards/000879/card43014.html","https://www.aozora.gr.jp/cards/000879/card4872.html","https://www.aozora.gr.jp/cards/000879/card16.html","https://www.aozora.gr.jp/cards/000879/card3804.html","https://www.aozora.gr.jp/cards/000879/card129.html","https://www.aozora.gr.jp/cards/000879/card43017.html","https://www.aozora.gr.jp/cards/000879/card100.html","https://www.aozora.gr.jp/cards/000879/card179.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('19b5f47e-e0c3-4833-a87e-32e3b0bde8af'::uuid, '芋粥・芥川龍之介',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card55.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('1bca3c84-f58e-4020-aa57-b63ce401db9c'::uuid, '地獄変・芥川龍之介',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card60.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('2e756c81-825d-4402-81f3-fff0fb9b4ed6'::uuid, 'あの頃の自分の事・芥川龍之介',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card17.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('d23ea483-66fd-46e2-8520-30ac65f8adac'::uuid, '歯車・芥川龍之介',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card40.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('555f50cb-18e9-4cdc-bb0c-1cef29865dfc'::uuid, '侏儒の言葉・芥川龍之介',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card158.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('6d6d655c-25a3-4b65-936f-900f3ae90adb'::uuid, '河童・芥川龍之介',
   '{"originalAuthor":"芥川龍之介","authorDeathYear":1927,"sourceCandidates":["https://www.aozora.gr.jp/cards/000879/card69.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('a8d58532-24e1-4dad-84df-15709395011e'::uuid, '夏目漱石・短編',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card2314.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('99c79528-0cc1-4381-a723-1f4ebcc36477'::uuid, '永日小品・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card758.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('b8b3a2ba-f8a5-4837-90bc-37df2ec49b61'::uuid, '坊っちゃん・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card752.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('8e263f81-6348-4fb2-82a5-786b6c080515'::uuid, 'こころ・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card773.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('3bff7df0-a23f-4672-a957-22f1a5b2f508'::uuid, '草枕・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card776.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('b7b3ec89-207d-4e40-98aa-d3a30e7caf6f'::uuid, '三四郎・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card794.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('1caa86e6-ffff-47aa-bd06-36c454b97ebb'::uuid, 'それから・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card56143.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('1dbf029f-ccd7-4e99-b875-432ad50abb50'::uuid, '吾輩は猫である・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card789.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('ea94cd2b-0172-4821-8a45-59b576a59e16'::uuid, '夢十夜・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card799.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('c8c0d8f9-7ecd-410b-b64d-90ab89fbfba5'::uuid, '虜美人草・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card761.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('1b86b07e-397b-4784-ad78-0feab39d5144'::uuid, '行人・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card775.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('742aa40a-e447-4851-8217-c1959d3fa346'::uuid, '明暗・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card782.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('44c36412-31ca-4c27-8266-684d06afed2b'::uuid, '門・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card785.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('8f791e1f-5e92-43ca-9e65-ea1bf5bf9aba'::uuid, '私の個人主義・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card772.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('dd176a0c-d139-44fe-a680-54b1073986fc'::uuid, '硝子戸の中・夏目漱石',
   '{"originalAuthor":"夏目漱石","authorDeathYear":1916,"sourceCandidates":["https://www.aozora.gr.jp/cards/000148/card760.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('7fcf4e7b-3d80-4d26-88d6-a1948dd0cccb'::uuid, '宮沢賢治・短編',
   '{"originalAuthor":"宮沢賢治","authorDeathYear":1933,"sourceCandidates":["https://www.aozora.gr.jp/cards/000081/card43754.html","https://www.aozora.gr.jp/cards/000081/card1925.html","https://www.aozora.gr.jp/cards/000081/card466.html","https://www.aozora.gr.jp/cards/000081/card470.html","https://www.aozora.gr.jp/cards/000081/card46605.html","https://www.aozora.gr.jp/cards/000081/card473.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('d6e1de4e-1c21-4e30-94b5-3c13970ce55d'::uuid, '銀河鉄道の夜・宮沢賢治',
   '{"originalAuthor":"宮沢賢治","authorDeathYear":1933,"sourceCandidates":["https://www.aozora.gr.jp/cards/000081/card456.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('7c225e2f-8c46-4882-abf7-27bfeb1c5883'::uuid, 'グスコーブドリの伝記',
   '{"originalAuthor":"宮沢賢治","authorDeathYear":1933,"sourceCandidates":["https://www.aozora.gr.jp/cards/000081/card1924.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('cffb4d1e-1925-41dc-bcb8-127ac73a393b'::uuid, '春と修羅・宮沢賢治',
   '{"originalAuthor":"宮沢賢治","authorDeathYear":1933,"sourceCandidates":["https://www.aozora.gr.jp/cards/000081/card1058.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('85f48ae4-03b9-4338-8bdc-6bd0316333e3'::uuid, '風の又三郎・宮沢賢治',
   '{"originalAuthor":"宮沢賢治","authorDeathYear":1933,"sourceCandidates":["https://www.aozora.gr.jp/cards/000081/card462.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb),
  ('d5e231b1-4f59-4d44-80a8-067cd49f8504'::uuid, '孤島の鬼・江戸川乱歩',
   '{"originalAuthor":"江戸川乱歩","authorDeathYear":1965,"sourceCandidates":["https://www.aozora.gr.jp/cards/001779/card57849.html"],"sourceMatchVerified":false,"jurisdictionsAssessed":["JP","US","KR"],"recordedAt":"2026-11-15","recordedBy":"LIB read operator (owner decision 2026-11-15)"}'::jsonb)
) t(series_id, expected_title, legacy)
join public.series s on s.id = t.series_id
for update of s;

-- Guards: exact scope, same Production titles, still no settings, one
-- official author; abort on any drift (nothing is written).
do $$ begin
  if (select count(*) from libread_internal.legacy_attribution_series_20261115) <> 28 then
    raise exception 'LEGACY_ATTRIBUTION_TARGET_COUNT_MISMATCH';
  end if;
  if exists (
    select 1 from libread_internal.legacy_attribution_series_20261115
    where title_before is null or author_id_before is null
  ) then raise exception 'LEGACY_ATTRIBUTION_SERIES_MISSING'; end if;
  if exists (
    select 1 from libread_internal.legacy_attribution_series_20261115
    where title_before <> expected_title
  ) then raise exception 'LEGACY_ATTRIBUTION_TITLE_DRIFT'; end if;
  if exists (
    select 1 from libread_internal.legacy_attribution_series_20261115
    where not effect_settings_was_null or effect_settings_before is not null
  ) then raise exception 'LEGACY_ATTRIBUTION_SETTINGS_NOT_NULL'; end if;
  -- One author for all 28, and it is the single official account
  -- (OFFICIAL_ACCOUNT_EMAIL in src/lib/auth/officialAccount.ts).
  if (select count(distinct author_id_before)
      from libread_internal.legacy_attribution_series_20261115) <> 1
     or (select count(*) from auth.users where email = 'libread08@gmail.com') <> 1
     or exists (
       select 1 from libread_internal.legacy_attribution_series_20261115 t
       where t.author_id_before is distinct from
             (select u.id from auth.users u where u.email = 'libread08@gmail.com'))
  then raise exception 'LEGACY_ATTRIBUTION_AUTHOR_DRIFT'; end if;
  -- The record never claims a verified source match or a rights check.
  if exists (
    select 1 from libread_internal.legacy_attribution_series_20261115
    where effect_settings_after ? 'publicDomain'
       or effect_settings_after #> '{legacyAttribution,sourceMatchVerified}' is distinct from 'false'::jsonb
       or jsonb_typeof(effect_settings_after #> '{legacyAttribution,originalAuthor}') is distinct from 'string'
       or jsonb_typeof(effect_settings_after #> '{legacyAttribution,authorDeathYear}') is distinct from 'number'
  ) then raise exception 'LEGACY_ATTRIBUTION_RECORD_SHAPE'; end if;
end $$;

do $$
declare
  v_series integer;
begin
  update public.series s
    set effect_settings = t.effect_settings_after
  from libread_internal.legacy_attribution_series_20261115 t
  where s.id = t.series_id
    and s.effect_settings is null;
  get diagnostics v_series = row_count;
  if v_series <> 28 then
    raise exception 'LEGACY_ATTRIBUTION_ROWCOUNT_MISMATCH %', v_series;
  end if;

  if (select count(*)
      from libread_internal.legacy_attribution_series_20261115 t
      join public.series s on s.id = t.series_id
      where s.effect_settings = t.effect_settings_after
        and s.title = t.title_before
        and s.author_id = t.author_id_before) <> 28 then
    raise exception 'LEGACY_ATTRIBUTION_POSTCHECK_FAILED';
  end if;
  -- No series anywhere gained a rights record from this script.
  if exists (
    select 1 from libread_internal.legacy_attribution_series_20261115 t
    join public.series s on s.id = t.series_id
    where s.effect_settings ? 'publicDomain'
  ) then raise exception 'LEGACY_ATTRIBUTION_PUBLIC_DOMAIN_ADDED'; end if;
end $$;
commit;

-- After commit (no SQL needed): the Work page, Reader, metadata, share text
-- and OG image read effect_settings per request and show the original author
-- (the OG image is cached up to about 5 minutes, the catalog cards about
-- 60 s). The Public Domain notice, provenance panel and JSON-LD stay off.
