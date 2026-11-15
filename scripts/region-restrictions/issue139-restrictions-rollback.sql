-- Undo issue139-restrictions.sql: deletes exactly its 21 rows.
-- Refuses while any of the 8 re-published works is public: lifting their
-- restriction would serve them in countries where they are protected. Make
-- them private first (scripts/issue139-us104a-unpublish/apply.sql).
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (
    select 1 from public.series
    where id in ('8514e9da-7864-4dad-a397-de06abee8fdc','d5cc7bf2-c76e-49e8-a078-150636fc0344',
                 '4d328931-ca04-4843-bcb5-9ac080cfbbf1','ac25272b-fc09-4f20-a94a-816791e750d0',
                 '82309887-add7-4406-aa18-d8a435c3b967','f7ba9cd3-0ede-48df-92d7-2ea297f33475',
                 '833b0303-d034-4ebb-ae6f-e023dd765a64','4f48c202-3ba1-47cb-b887-90880534c96e')
      and publication_status <> 'private'
  ) then raise exception 'REGION_RESTRICTIONS_ROLLBACK_WORKS_STILL_PUBLIC'; end if;
end $$;
delete from public.series_region_restrictions where series_id in (
  '8514e9da-7864-4dad-a397-de06abee8fdc',
  'd5cc7bf2-c76e-49e8-a078-150636fc0344',
  '4d328931-ca04-4843-bcb5-9ac080cfbbf1',
  'ac25272b-fc09-4f20-a94a-816791e750d0',
  '82309887-add7-4406-aa18-d8a435c3b967',
  'f7ba9cd3-0ede-48df-92d7-2ea297f33475',
  '833b0303-d034-4ebb-ae6f-e023dd765a64',
  '4f48c202-3ba1-47cb-b887-90880534c96e',
  'd5e231b1-4f59-4d44-80a8-067cd49f8504',
  'd04d1991-fea4-4a00-bdc5-fff5824da279',
  '279a345c-1909-43f6-b8e7-f8fa2a88e8e8',
  'ede12239-2e68-404a-b851-a249d53f6847',
  '2fe58339-8663-4261-a667-59b8e3cff70e',
  '8dac7389-18b1-40f3-b762-ff9c7bdac8b9',
  '90242e07-a73c-4b80-adb4-66f707f6f604',
  '65d31567-9d24-4128-84e5-c5f1164ebf36',
  'fe1f24d1-39b6-4dc3-a260-8aa609a2a8ec',
  'f9f1f6aa-fd85-4a8b-b0f8-1bc7fb821280',
  '42ea90b4-fb8b-4c9d-8a50-3b5c952ed72d',
  '7ce1cf6b-f5de-4d21-849f-76e35f86725b',
  'b9840fca-0192-4fdb-b1cf-4a00a7d92645'
);
commit;
