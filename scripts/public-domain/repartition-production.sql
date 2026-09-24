begin;

create or replace function pg_temp.pd_child75_split(input text)
returns table(part_no integer, part_body text)
language plpgsql
as $$
declare
  pos integer := 1;
  total integer := length(input);
  target integer;
  hard_max integer;
  min_cut integer;
  cut_end integer;
  p integer := 0;
  win text;
  loc integer;
begin
  while pos <= total loop
    if total - pos + 1 <= 10000 then
      p := p + 1;
      part_no := p;
      part_body := substr(input, pos);
      return next;
      exit;
    end if;

    target := least(pos + 7999, total);
    hard_max := least(pos + 9999, total);
    min_cut := least(target, pos + 5199);
    cut_end := null;

    win := substr(input, min_cut, target - min_cut + 1);
    loc := strpos(reverse(win), E'\n\n');
    if loc > 0 then cut_end := min_cut + length(win) - loc; end if;

    if cut_end is null then
      win := substr(input, target, hard_max - target + 1);
      loc := strpos(win, E'\n\n');
      if loc > 0 and target + loc <= hard_max then cut_end := target + loc; end if;
    end if;

    if cut_end is null then
      win := substr(input, min_cut, target - min_cut + 1);
      loc := regexp_instr(win, '.*[.!?。！？]["''”’」』）】］»]?', 1, 1, 1);
      if loc > 0 then cut_end := min_cut + loc - 2; end if;
    end if;

    if cut_end is null then
      win := substr(input, target, hard_max - target + 1);
      loc := regexp_instr(win, '[.!?。！？]["''”’」』）】］»]?', 1, 1, 1);
      if loc > 0 then cut_end := target + loc - 2; end if;
    end if;

    if cut_end is null then cut_end := target; end if;
    if cut_end < pos or cut_end - pos + 1 > 10000 then
      raise exception 'CHILD75_UNSAFE_CUT pos=% cut=%', pos, cut_end;
    end if;

    p := p + 1;
    part_no := p;
    part_body := substr(input, pos, cut_end - pos + 1);
    return next;
    pos := cut_end + 1;
  end loop;
end
$$;

create temporary table pd_child75_target_series on commit drop as
select distinct s.id
from series s
join episodes e on e.series_id = s.id
where (s.effect_settings->'publicDomain'->>'rightsChecked')::boolean is true
  and length(e.body) > 10000;

do $$
declare n integer;
begin
  select count(*) into n from pd_child75_target_series;
  if n <> 57 then raise exception 'CHILD75_TARGET_SERIES_DRIFT expected=57 actual=%', n; end if;
end $$;

create temporary table pd_child75_source on commit drop as
select e.*
from episodes e
join pd_child75_target_series t on t.id = e.series_id;

do $$
declare n integer;
begin
  select count(*) into n from pd_child75_source;
  if n <> 724 then raise exception 'CHILD75_SOURCE_EPISODE_DRIFT expected=724 actual=%', n; end if;
end $$;

do $$
declare n integer;
begin
  select count(*) into n
  from episode_translations et
  join pd_child75_source s on s.id = et.episode_id
  where et.status in ('ready','translating');
  if n <> 0 then raise exception 'CHILD75_ACTIVE_TRANSLATIONS_PRESENT count=%', n; end if;

  select count(*) into n
  from public_episode_translation_unlocks u
  join pd_child75_source s on s.id = u.episode_id;
  if n <> 0 then raise exception 'CHILD75_UNLOCKS_PRESENT count=%', n; end if;

  select count(*) into n
  from recordings r
  join pd_child75_source s on s.id = r.episode_id;
  if n <> 0 then raise exception 'CHILD75_RECORDINGS_PRESENT count=%', n; end if;

  select count(*) into n
  from user_episode_comments c
  join pd_child75_source s on s.id = c.episode_id;
  if n <> 0 then raise exception 'CHILD75_COMMENTS_PRESENT count=%', n; end if;

  select count(*) into n
  from time_fit_story_continuation_reservations r
  join pd_child75_source s on s.id = r.source_episode_id;
  if n <> 0 then raise exception 'CHILD75_CONTINUATION_RESERVATIONS_PRESENT count=%', n; end if;
end $$;

create temporary table pd_child75_plan on commit drop as
with raw as (
  select
    s.id as source_episode_id,
    s.series_id,
    s.episode_number as source_episode_number,
    s.title as source_title,
    s.body as original_body,
    encode(digest(s.body, 'sha256'), 'hex') as original_sha256,
    p.part_no,
    p.part_body
  from pd_child75_source s
  cross join lateral pg_temp.pd_child75_split(s.body) p
), counted as (
  select raw.*, count(*) over (partition by source_episode_id) as part_count
  from raw
)
select
  counted.*,
  row_number() over (
    partition by series_id
    order by source_episode_number, part_no
  )::integer as final_episode_number
from counted;

do $$
declare n integer;
begin
  select count(*) into n from pd_child75_plan;
  if n <> 2799 then raise exception 'CHILD75_PLAN_COUNT_DRIFT expected=2799 actual=%', n; end if;

  select count(*) into n from pd_child75_plan where length(part_body) > 10000;
  if n <> 0 then raise exception 'CHILD75_OVERSIZED_PLAN count=%', n; end if;

  select count(*) into n
  from (
    select source_episode_id, max(original_body) original_body,
           string_agg(part_body, '' order by part_no) rebuilt
    from pd_child75_plan
    group by source_episode_id
  ) x
  where rebuilt <> original_body;
  if n <> 0 then raise exception 'CHILD75_TEXT_MISMATCH count=%', n; end if;
end $$;

delete from episode_translations et
using pd_child75_source s
where et.episode_id = s.id
  and et.status = 'failed';

update episodes e
set episode_number = -1000000 - e.episode_number
from pd_child75_target_series t
where e.series_id = t.id;

update episodes e
set
  episode_number = p.final_episode_number,
  title = case
    when p.part_count = 1 then p.source_title
    else p.source_title || ' — Part ' || p.part_no || '/' || p.part_count
  end,
  body = p.part_body,
  effect_settings = coalesce(s.effect_settings, '{}'::jsonb) ||
    jsonb_build_object(
      'child75Repartition',
      jsonb_build_object(
        'sourceEpisodeId', p.source_episode_id::text,
        'sourceEpisodeNumber', p.source_episode_number,
        'partIndex', p.part_no,
        'partCount', p.part_count,
        'originalTitle', p.source_title,
        'originalBodySha256', p.original_sha256
      )
    )
from pd_child75_plan p
join pd_child75_source s on s.id = p.source_episode_id
where p.part_no = 1
  and e.id = p.source_episode_id;

insert into episodes (
  id, series_id, episode_number, title, body,
  bgm_storage_path, bgm_volume, invert_colors, created_at,
  bgm_title, bgm_audio_path, bgm_settings, effect_settings,
  is_published, posting_status, scheduled_for, posted_at, last_edited_at
)
select
  gen_random_uuid(),
  s.series_id,
  p.final_episode_number,
  p.source_title || ' — Part ' || p.part_no || '/' || p.part_count,
  p.part_body,
  s.bgm_storage_path,
  s.bgm_volume,
  s.invert_colors,
  s.created_at,
  s.bgm_title,
  s.bgm_audio_path,
  s.bgm_settings,
  coalesce(s.effect_settings, '{}'::jsonb) ||
    jsonb_build_object(
      'child75Repartition',
      jsonb_build_object(
        'sourceEpisodeId', p.source_episode_id::text,
        'sourceEpisodeNumber', p.source_episode_number,
        'partIndex', p.part_no,
        'partCount', p.part_count,
        'originalTitle', p.source_title,
        'originalBodySha256', p.original_sha256
      )
    ),
  s.is_published,
  s.posting_status,
  s.scheduled_for,
  s.posted_at,
  s.last_edited_at
from pd_child75_plan p
join pd_child75_source s on s.id = p.source_episode_id
where p.part_no > 1
order by p.series_id, p.final_episode_number;

do $$
declare n integer;
begin
  select count(*) into n
  from episodes e
  join pd_child75_target_series t on t.id = e.series_id;
  if n <> 2799 then raise exception 'CHILD75_POST_EPISODE_COUNT expected=2799 actual=%', n; end if;

  select count(*) into n
  from episodes e
  join pd_child75_target_series t on t.id = e.series_id
  where length(e.body) > 10000;
  if n <> 0 then raise exception 'CHILD75_POST_OVERSIZED count=%', n; end if;

  select count(*) into n
  from (
    select
      e.effect_settings->'child75Repartition'->>'sourceEpisodeId' source_episode_id,
      max(e.effect_settings->'child75Repartition'->>'originalBodySha256') original_sha,
      encode(
        digest(
          string_agg(
            e.body,
            ''
            order by (e.effect_settings->'child75Repartition'->>'partIndex')::integer
          ),
          'sha256'
        ),
        'hex'
      ) rebuilt_sha
    from episodes e
    join pd_child75_target_series t on t.id = e.series_id
    group by e.effect_settings->'child75Repartition'->>'sourceEpisodeId'
  ) x
  where source_episode_id is null or rebuilt_sha <> original_sha;
  if n <> 0 then raise exception 'CHILD75_POST_HASH_MISMATCH count=%', n; end if;

  select count(*) into n
  from (
    select e.series_id, min(e.episode_number) min_no, max(e.episode_number) max_no,
           count(*) row_count, count(distinct e.episode_number) distinct_count
    from episodes e
    join pd_child75_target_series t on t.id = e.series_id
    group by e.series_id
  ) x
  where min_no <> 1 or max_no <> row_count or distinct_count <> row_count;
  if n <> 0 then raise exception 'CHILD75_NUMBERING_GAP series_count=%', n; end if;
end $$;

select
  (select count(*) from pd_child75_target_series) migrated_works,
  (select count(*) from pd_child75_source) old_episodes,
  (select count(*) from pd_child75_plan) new_episodes,
  (select max(length(e.body)) from episodes e join pd_child75_target_series t on t.id=e.series_id) max_episode_chars,
  (select count(*) from episode_translations et join pd_child75_source s on s.id=et.episode_id) remaining_translation_rows;

commit;