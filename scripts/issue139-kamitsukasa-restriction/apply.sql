-- Issue #139 / D030: 上司小剣「死刑」(aozora-053520, published, author d.1947).
-- CO is life+80 with no shorter-term rule found (protected to end-2027); GQ
-- life+80 unverified. Same treatment as Dazai (d.1948). Adds one block-list
-- row; changes nothing else. Aborts if the work is not the expected one or a
-- restriction row already exists.
begin;
set local lock_timeout = '5s';
do $$
declare
  v_id uuid;
begin
  select s.id into strict v_id
  from public.series s
  where s.effect_settings->'publicDomain'->>'manifestId' = 'aozora-053520';
  if exists (select 1 from public.series_region_restrictions r where r.series_id = v_id) then
    raise exception 'ISSUE139_KAMITSUKASA_ALREADY_RESTRICTED';
  end if;
  insert into public.series_region_restrictions (series_id, blocked_countries, reason)
  values (v_id, array['CO','GQ']::text[],
          'aozora-053520: 上司小剣 d.1947. CO life+80 (to end-2027), GQ life+80 unverified. docs/rights/region-research-2026-11-15.md');
end $$;
commit;
