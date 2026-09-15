do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'series'
      and column_name = 'translation_permission_mode'
      and is_nullable = 'NO'
      and column_default is not null
  ) then
    raise exception 'series.translation_permission_mode must exist as a non-null column with a default';
  end if;

  if exists (
    select 1
    from public.series
    where translation_permission_mode not in ('open', 'closed')
       or translation_permission_mode is null
  ) then
    raise exception 'series.translation_permission_mode contains an invalid value';
  end if;
end
$$;
