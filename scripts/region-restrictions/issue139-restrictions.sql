-- Issue #139 / D030: per-country restriction rows for 21 works.
-- Basis: docs/rights/region-research-2026-11-15.md. Run AFTER the migration
-- 20261116090000_region_restrictions.sql is applied and PR #214 is deployed.
-- Writes series_region_restrictions only. Publishing the 8 private works is a
-- separate step (issue139-republish.sql), at least 2 minutes later, so the
-- app's 60 s caches know the restriction before the works go public.
-- Aborts with no change if any target drifted or already has a row.
-- Undo: issue139-restrictions-rollback.sql (only while the 8 works are private).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table region_targets (
  series_id uuid primary key,
  expected_title text not null,
  expected_status text not null,
  mode text not null check (mode in ('block', 'allow')),
  countries text[] not null,
  reason text not null
) on commit drop;

insert into region_targets values
  ('8514e9da-7864-4dad-a397-de06abee8fdc', '太宰治・短編', 'private', 'block', array['US','CO','GQ'], 'Dazai d.1948: US 104A restored (pub+95); CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('d5cc7bf2-c76e-49e8-a078-150636fc0344', '女生徒・太宰治', 'private', 'block', array['US','CO','GQ'], 'Dazai d.1948: US 104A restored (pub+95); CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('4d328931-ca04-4843-bcb5-9ac080cfbbf1', '人間失格・太宰治', 'private', 'block', array['US','CO','GQ'], 'Dazai d.1948: US 104A restored (pub+95); CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('ac25272b-fc09-4f20-a94a-816791e750d0', '斜陽・太宰治', 'private', 'block', array['US','CO','GQ'], 'Dazai d.1948: US 104A restored (pub+95); CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('82309887-add7-4406-aa18-d8a435c3b967', '津軽・太宰治', 'private', 'block', array['US','CO','GQ'], 'Dazai d.1948: US 104A restored (pub+95); CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('f7ba9cd3-0ede-48df-92d7-2ea297f33475', '右大臣実朝・太宰治', 'private', 'block', array['US','CO','GQ'], 'Dazai d.1948: US 104A restored (pub+95); CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('833b0303-d034-4ebb-ae6f-e023dd765a64', '少年探偵団・江戸川乱歩', 'private', 'allow', array['JP','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CA','NZ','KR','TW','CN','HK','IN','RU','SG'], 'Rampo d.1965: life+70+ without the shorter-term rule in AU/BR/MX and others; US: first published 1937. Allow list. docs/rights/region-research-2026-11-15.md'),
  ('4f48c202-3ba1-47cb-b887-90880534c96e', '江戸川乱歩・短編', 'private', 'allow', array['JP','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CA','NZ','KR','TW','CN','HK','IN','RU','SG'], 'Rampo d.1965: life+70+ without the shorter-term rule in AU/BR/MX and others; US: includes 赤いカブトムシ (1958). Allow list. docs/rights/region-research-2026-11-15.md'),
  ('d5e231b1-4f59-4d44-80a8-067cd49f8504', '孤島の鬼・江戸川乱歩', 'public', 'allow', array['JP','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CA','NZ','KR','TW','CN','HK','IN','RU','SG'], 'Rampo d.1965: life+70+ without the shorter-term rule in AU/BR/MX and others; US: post-war base text, revisions unverified. Allow list. docs/rights/region-research-2026-11-15.md'),
  ('d04d1991-fea4-4a00-bdc5-fff5824da279', '감자・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('279a345c-1909-43f6-b8e7-f8fa2a88e8e8', '광염 소나타・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('ede12239-2e68-404a-b851-a249d53f6847', '딸의 업을 이으려・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('2fe58339-8663-4261-a667-59b8e3cff70e', '명문・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('8dac7389-18b1-40f3-b762-ff9c7bdac8b9', '목숨・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('90242e07-a73c-4b80-adb4-66f707f6f604', '배따라기・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('65d31567-9d24-4128-84e5-c5f1164ebf36', '약한 자의 슬픔・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('fe1f24d1-39b6-4dc3-a260-8aa609a2a8ec', '유서・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('f9f1f6aa-fd85-4a8b-b0f8-1bc7fb821280', '태형・김동인', 'public', 'block', array['CO','GQ'], 'Kim Dong-in d.1951: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('42ea90b4-fb8b-4c9d-8a50-3b5c952ed72d', '모란이 피기까지는・김영랑', 'public', 'block', array['CO','GQ'], 'Kim Yeong-rang d.1950: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('7ce1cf6b-f5de-4d21-849f-76e35f86725b', '윤광호(尹光浩)・이광수', 'public', 'block', array['CO','GQ'], 'Yi Kwang-su d.1950: CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md'),
  ('b9840fca-0192-4fdb-b1cf-4a00a7d92645', '향수(鄕愁)・정지용', 'public', 'block', array['CO','GQ'], 'Jeong Ji-yong d.1950 (presumed): CO life+80 (no shorter-term rule found), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md');

do $$ begin
  if (select count(*) from region_targets) <> 21 then
    raise exception 'REGION_RESTRICTIONS_TARGET_COUNT';
  end if;
  if exists (
    select 1 from region_targets t left join public.series s on s.id = t.series_id
    where s.id is null or s.title <> t.expected_title or s.publication_status <> t.expected_status
  ) then raise exception 'REGION_RESTRICTIONS_TARGET_DRIFT'; end if;
  if exists (select 1 from public.series_region_restrictions r join region_targets t using (series_id)) then
    raise exception 'REGION_RESTRICTIONS_ALREADY_PRESENT';
  end if;
end $$;

insert into public.series_region_restrictions(series_id, blocked_countries, allowed_countries, reason)
select series_id,
       case when mode = 'block' then countries end,
       case when mode = 'allow' then countries end,
       reason
from region_targets;

do $$ begin
  if (select count(*) from public.series_region_restrictions r join region_targets t using (series_id)) <> 21 then
    raise exception 'REGION_RESTRICTIONS_ROWCOUNT';
  end if;
end $$;
commit;
