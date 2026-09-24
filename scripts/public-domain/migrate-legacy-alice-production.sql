begin;

create or replace function pg_temp.pd_child75_split(input text)
returns table(part_no integer, part_body text)
language plpgsql
as $$
declare pos integer:=1; total integer:=length(input); target integer; hard_max integer; min_cut integer; cut_end integer; p integer:=0; win text; loc integer;
begin
 while pos<=total loop
  if total-pos+1<=10000 then p:=p+1; part_no:=p; part_body:=substr(input,pos); return next; exit; end if;
  target:=least(pos+7999,total); hard_max:=least(pos+9999,total); min_cut:=least(target,pos+5199); cut_end:=null;
  win:=substr(input,min_cut,target-min_cut+1); loc:=strpos(reverse(win),E'\n\n'); if loc>0 then cut_end:=min_cut+length(win)-loc; end if;
  if cut_end is null then win:=substr(input,target,hard_max-target+1); loc:=strpos(win,E'\n\n'); if loc>0 and target+loc<=hard_max then cut_end:=target+loc; end if; end if;
  if cut_end is null then win:=substr(input,min_cut,target-min_cut+1); loc:=regexp_instr(win,'.*[.!?。！？]["''”’」』）】］»]?',1,1,1); if loc>0 then cut_end:=min_cut+loc-2; end if; end if;
  if cut_end is null then win:=substr(input,target,hard_max-target+1); loc:=regexp_instr(win,'[.!?。！？]["''”’」』）】］»]?',1,1,1); if loc>0 then cut_end:=target+loc-2; end if; end if;
  if cut_end is null then cut_end:=target; end if;
  if cut_end<pos or cut_end-pos+1>10000 then raise exception 'ALICE_UNSAFE_CUT'; end if;
  p:=p+1; part_no:=p; part_body:=substr(input,pos,cut_end-pos+1); return next; pos:=cut_end+1;
 end loop;
end $$;

create temporary table alice_source on commit drop as
select * from episodes where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db';

do $$
declare n integer; pd jsonb;
begin
 select count(*) into n from alice_source;
 if n<>12 then raise exception 'ALICE_EPISODE_DRIFT expected=12 actual=%',n; end if;
 select effect_settings->'publicDomain' into pd from series where id='9103f394-e8d7-42ff-af46-6e83739ec6db';
 if pd is not null then raise exception 'ALICE_ALREADY_PD'; end if;
 select count(*) into n from episode_translations et join alice_source s on s.id=et.episode_id where et.status in ('ready','translating');
 if n<>0 then raise exception 'ALICE_ACTIVE_TRANSLATION count=%',n; end if;
 select count(*) into n from public_episode_translation_unlocks u join alice_source s on s.id=u.episode_id;
 if n<>0 then raise exception 'ALICE_UNLOCK count=%',n; end if;
 select count(*) into n from recordings r join alice_source s on s.id=r.episode_id;
 if n<>0 then raise exception 'ALICE_RECORDING count=%',n; end if;
end $$;

create temporary table alice_plan on commit drop as
with raw as (
 select s.id source_episode_id,s.series_id,s.episode_number source_episode_number,s.title source_title,s.body original_body,
        encode(digest(s.body,'sha256'),'hex') original_sha256,p.part_no,p.part_body
 from alice_source s cross join lateral pg_temp.pd_child75_split(s.body) p
), counted as (
 select raw.*,count(*) over(partition by source_episode_id) part_count from raw
)
select counted.*,row_number() over(order by source_episode_number,part_no)::integer final_episode_number
from counted;

do $$
declare n integer;
begin
 select count(*) into n from alice_plan;
 if n<>23 then raise exception 'ALICE_PLAN_DRIFT expected=23 actual=%',n; end if;
 select count(*) into n from alice_plan where length(part_body)>10000;
 if n<>0 then raise exception 'ALICE_OVERSIZED count=%',n; end if;
 select count(*) into n from (
   select source_episode_id,max(original_body) original_body,string_agg(part_body,'' order by part_no) rebuilt
   from alice_plan group by source_episode_id
 ) x where rebuilt<>original_body;
 if n<>0 then raise exception 'ALICE_TEXT_MISMATCH count=%',n; end if;
end $$;

delete from episode_translations et using alice_source s
where et.episode_id=s.id and et.status='failed';

update episodes
set episode_number=-1000000-episode_number
where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db';

update episodes e
set episode_number=p.final_episode_number,
    title=case when p.part_count=1 then p.source_title else p.source_title||' — Part '||p.part_no||'/'||p.part_count end,
    body=p.part_body,
    effect_settings=coalesce(s.effect_settings,'{}'::jsonb)||jsonb_build_object(
      'child75Repartition',jsonb_build_object(
        'sourceEpisodeId',p.source_episode_id::text,
        'sourceEpisodeNumber',p.source_episode_number,
        'partIndex',p.part_no,
        'partCount',p.part_count,
        'originalTitle',p.source_title,
        'originalBodySha256',p.original_sha256
      )
    )
from alice_plan p join alice_source s on s.id=p.source_episode_id
where p.part_no=1 and e.id=p.source_episode_id;

insert into episodes(
 id,series_id,episode_number,title,body,bgm_storage_path,bgm_volume,invert_colors,created_at,
 bgm_title,bgm_audio_path,bgm_settings,effect_settings,is_published,posting_status,scheduled_for,posted_at,last_edited_at
)
select gen_random_uuid(),s.series_id,p.final_episode_number,
       p.source_title||' — Part '||p.part_no||'/'||p.part_count,p.part_body,
       s.bgm_storage_path,s.bgm_volume,s.invert_colors,s.created_at,
       s.bgm_title,s.bgm_audio_path,s.bgm_settings,
       coalesce(s.effect_settings,'{}'::jsonb)||jsonb_build_object(
        'child75Repartition',jsonb_build_object(
          'sourceEpisodeId',p.source_episode_id::text,
          'sourceEpisodeNumber',p.source_episode_number,
          'partIndex',p.part_no,
          'partCount',p.part_count,
          'originalTitle',p.source_title,
          'originalBodySha256',p.original_sha256
        )
       ),
       s.is_published,s.posting_status,s.scheduled_for,s.posted_at,s.last_edited_at
from alice_plan p join alice_source s on s.id=p.source_episode_id
where p.part_no>1
order by p.final_episode_number;

update series
set translation_permission_mode='open',
    recording_permission_mode='open',
    effect_settings=coalesce(effect_settings,'{}'::jsonb)||jsonb_build_object(
      'publicDomain',jsonb_build_object(
        'manifestId','gutenberg-000011',
        'originalTitle','Alice''s Adventures in Wonderland',
        'originalAuthor','Lewis Carroll',
        'firstPublicationYear',1865,
        'sourceProvider','Project Gutenberg',
        'sourceUrl','https://www.gutenberg.org/ebooks/11',
        'sourceHash','01b38ea4c710a84bc18d0bd41271a5a1a92b94e97b2812f4dece97d4a694725e',
        'rightsChecked',true,
        'reviewedAt','2026-09-22T08:01:00+10:00',
        'reviewedBy','LIB read operator (explicit user approval in Child72 chat)',
        'jurisdictionsReviewed',jsonb_build_array('JP','US','KR')
      )
    )
where id='9103f394-e8d7-42ff-af46-6e83739ec6db';

do $$
declare n integer;
begin
 select count(*) into n from episodes where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db';
 if n<>23 then raise exception 'ALICE_POST_COUNT actual=%',n; end if;
 select count(*) into n from episodes where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db' and length(body)>10000;
 if n<>0 then raise exception 'ALICE_POST_OVERSIZED count=%',n; end if;
 select count(*) into n from (
   select effect_settings->'child75Repartition'->>'sourceEpisodeId' source_id,
          max(effect_settings->'child75Repartition'->>'originalBodySha256') original_sha,
          encode(digest(string_agg(body,'' order by (effect_settings->'child75Repartition'->>'partIndex')::integer),'sha256'),'hex') rebuilt_sha
   from episodes where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db'
   group by effect_settings->'child75Repartition'->>'sourceEpisodeId'
 ) x where source_id is null or rebuilt_sha<>original_sha;
 if n<>0 then raise exception 'ALICE_POST_HASH_MISMATCH count=%',n; end if;
end $$;

select
 (select count(*) from episodes where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db') alice_episodes,
 (select max(length(body)) from episodes where series_id='9103f394-e8d7-42ff-af46-6e83739ec6db') alice_max_chars,
 (select effect_settings->'publicDomain'->>'manifestId' from series where id='9103f394-e8d7-42ff-af46-6e83739ec6db') manifest_id,
 (select count(*) from series where (effect_settings->'publicDomain'->>'rightsChecked')::boolean is true) total_rights_checked;

commit;