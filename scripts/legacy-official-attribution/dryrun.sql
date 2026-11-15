-- Legacy official attribution: READ-ONLY preflight for apply.sql.
-- Output is aggregates only (no bodies or account ids).
-- Expected before apply.sql (Production, 2026-11-15):
--   target_n=28, title_ok_n=28, settings_null_n=28, one_author=true,
--   official_author=true, not_applied=true, public_n=28,
--   public_domain_n=0, legacy_attribution_anywhere_n=0
begin read only;
with target(series_id, expected_title) as (
  values
    ('f0c430bd-daaf-4e70-8f8e-a6855c80a327'::uuid, '芥川龍之介・短編'),
    ('19b5f47e-e0c3-4833-a87e-32e3b0bde8af'::uuid, '芋粥・芥川龍之介'),
    ('1bca3c84-f58e-4020-aa57-b63ce401db9c'::uuid, '地獄変・芥川龍之介'),
    ('2e756c81-825d-4402-81f3-fff0fb9b4ed6'::uuid, 'あの頃の自分の事・芥川龍之介'),
    ('d23ea483-66fd-46e2-8520-30ac65f8adac'::uuid, '歯車・芥川龍之介'),
    ('555f50cb-18e9-4cdc-bb0c-1cef29865dfc'::uuid, '侏儒の言葉・芥川龍之介'),
    ('6d6d655c-25a3-4b65-936f-900f3ae90adb'::uuid, '河童・芥川龍之介'),
    ('a8d58532-24e1-4dad-84df-15709395011e'::uuid, '夏目漱石・短編'),
    ('99c79528-0cc1-4381-a723-1f4ebcc36477'::uuid, '永日小品・夏目漱石'),
    ('b8b3a2ba-f8a5-4837-90bc-37df2ec49b61'::uuid, '坊っちゃん・夏目漱石'),
    ('8e263f81-6348-4fb2-82a5-786b6c080515'::uuid, 'こころ・夏目漱石'),
    ('3bff7df0-a23f-4672-a957-22f1a5b2f508'::uuid, '草枕・夏目漱石'),
    ('b7b3ec89-207d-4e40-98aa-d3a30e7caf6f'::uuid, '三四郎・夏目漱石'),
    ('1caa86e6-ffff-47aa-bd06-36c454b97ebb'::uuid, 'それから・夏目漱石'),
    ('1dbf029f-ccd7-4e99-b875-432ad50abb50'::uuid, '吾輩は猫である・夏目漱石'),
    ('ea94cd2b-0172-4821-8a45-59b576a59e16'::uuid, '夢十夜・夏目漱石'),
    ('c8c0d8f9-7ecd-410b-b64d-90ab89fbfba5'::uuid, '虜美人草・夏目漱石'),
    ('1b86b07e-397b-4784-ad78-0feab39d5144'::uuid, '行人・夏目漱石'),
    ('742aa40a-e447-4851-8217-c1959d3fa346'::uuid, '明暗・夏目漱石'),
    ('44c36412-31ca-4c27-8266-684d06afed2b'::uuid, '門・夏目漱石'),
    ('8f791e1f-5e92-43ca-9e65-ea1bf5bf9aba'::uuid, '私の個人主義・夏目漱石'),
    ('dd176a0c-d139-44fe-a680-54b1073986fc'::uuid, '硝子戸の中・夏目漱石'),
    ('7fcf4e7b-3d80-4d26-88d6-a1948dd0cccb'::uuid, '宮沢賢治・短編'),
    ('d6e1de4e-1c21-4e30-94b5-3c13970ce55d'::uuid, '銀河鉄道の夜・宮沢賢治'),
    ('7c225e2f-8c46-4882-abf7-27bfeb1c5883'::uuid, 'グスコーブドリの伝記'),
    ('cffb4d1e-1925-41dc-bcb8-127ac73a393b'::uuid, '春と修羅・宮沢賢治'),
    ('85f48ae4-03b9-4338-8bdc-6bd0316333e3'::uuid, '風の又三郎・宮沢賢治'),
    ('d5e231b1-4f59-4d44-80a8-067cd49f8504'::uuid, '孤島の鬼・江戸川乱歩')
), s as (
  select t.*, s.title, s.author_id, s.effect_settings, s.publication_status, s.is_public
  from target t join public.series s on s.id = t.series_id
)
select
  count(*) target_n,
  count(*) filter (where s.title = s.expected_title) title_ok_n,
  count(*) filter (where s.effect_settings is null) settings_null_n,
  count(distinct s.author_id) = 1 one_author,
  coalesce(bool_and(s.author_id = (select u.id from auth.users u where u.email = 'libread08@gmail.com')), false)
    and (select count(*) from auth.users u where u.email = 'libread08@gmail.com') = 1 official_author,
  to_regclass('libread_internal.legacy_attribution_series_20261115') is null not_applied,
  count(*) filter (where s.publication_status = 'public' and s.is_public = true) public_n,
  count(*) filter (where s.effect_settings ? 'publicDomain') public_domain_n,
  (select count(*) from public.series x where x.effect_settings ? 'legacyAttribution') legacy_attribution_anywhere_n
from s;
rollback;
