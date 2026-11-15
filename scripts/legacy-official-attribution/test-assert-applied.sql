-- Legacy official attribution CI: after apply.sql only effect_settings of the
-- 28 targets changed (NULL -> {"legacyAttribution": ...}); every other column
-- and every non-target row equals the pre-apply fixture.
do $$ begin
  if to_regclass('libread_internal.legacy_attribution_series_20261115') is null then
    raise exception 'CI_SNAPSHOT_MISSING';
  end if;
  if (select count(*) from public.series where effect_settings ? 'legacyAttribution') <> 28 then
    raise exception 'CI_LEGACY_COUNT';
  end if;
  if exists (
    select 1 from public.series s
    join libread_internal.legacy_attribution_series_20261115 t on t.series_id = s.id
    where s.effect_settings ? 'publicDomain'
       or (select count(*) from jsonb_object_keys(s.effect_settings)) <> 1
       or s.effect_settings #> '{legacyAttribution,sourceMatchVerified}' <> 'false'::jsonb
  ) then raise exception 'CI_LEGACY_SHAPE'; end if;
  -- Non-target rows unchanged (all columns).
  if exists (
    (select * from public.series
     where id not in (select series_id from libread_internal.legacy_attribution_series_20261115)
     except select * from ci.series_before)
  ) then raise exception 'CI_NON_TARGET_CHANGED'; end if;
  -- Target rows unchanged except effect_settings.
  if exists (
    select 1 from public.series s
    join ci.series_before b on b.id = s.id
    join libread_internal.legacy_attribution_series_20261115 t on t.series_id = s.id
    where (s.author_id, s.title, s.description, s.is_public, s.created_at, s.tags,
           s.publication_status, s.source_language)
          is distinct from
          (b.author_id, b.title, b.description, b.is_public, b.created_at, b.tags,
           b.publication_status, b.source_language)
       or b.effect_settings is not null
  ) then raise exception 'CI_TARGET_OTHER_COLUMNS_CHANGED'; end if;
end $$;
select 'applied state OK' as result;
