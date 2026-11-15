-- Exact revert of apply.sql: removes only the row it inserted.
begin;
set local lock_timeout = '5s';
delete from public.series_region_restrictions r
using public.series s
where r.series_id = s.id
  and s.effect_settings->'publicDomain'->>'manifestId' = 'aozora-053520'
  and r.blocked_countries = array['CO','GQ']::text[]
  and r.reason like 'aozora-053520: 上司小剣 d.1947.%';
commit;
