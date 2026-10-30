-- B2 F2-P: LOCAL PostgreSQL pg_temp-only cohort classifier negative controls.
-- No SELECT of hosted/user data, and the entire fixture is rolled back.
begin;
create temp table audit_buckets(id text, public boolean);
create temp table audit_objects(bucket_id text, name text, mime text);
create temp table audit_series(id uuid, publication_status text, content_rating text, warnings text[]);
create temp table audit_episodes(id uuid, series_id uuid, status text, published boolean);
create temp table audit_recordings(url text);
create temp table audit_bgm(bucket_id text, name text);
insert into audit_buckets values ('recording-audio',true),('other-public',true),('other-private',false);
insert into audit_series values
('10000000-0000-4000-8000-000000000001','public','general','{}'),
('10000000-0000-4000-8000-000000000002','private','general','{}'),
('10000000-0000-4000-8000-000000000003','public','r18','{}'),
('10000000-0000-4000-8000-000000000004','public','general','{sexual_r18}');
insert into audit_episodes values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','posted',true),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','posted',true),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','posted',true),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','posted',true),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','scheduled',false);
insert into audit_objects values
('recording-audio','aivis/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/current.wav','audio/wav'),
('recording-audio','aivis/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/current.timing.json','application/json'),
('recording-audio','aivis/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/unused.wav','audio/wav'),
('recording-audio','nemo/10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002/private.wav','audio/wav'),
('recording-audio','nemo/10000000-0000-4000-8000-000000000003/20000000-0000-4000-8000-000000000003/restricted.wav','audio/wav'),
('recording-audio','nemo/10000000-0000-4000-8000-000000000004/20000000-0000-4000-8000-000000000004/warned.wav','audio/wav'),
('recording-audio','nemo/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000005/draft.wav','audio/wav'),
('recording-audio','nemo/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/mismatch.wav','audio/wav'),
('recording-audio','nemo/50000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/missing.wav','audio/wav'),
('recording-audio','nemo/invalid/invalid/opaque.wav','audio/wav'),
('recording-audio','human/50000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/legacy.m4a','audio/mp4'),
('other-public','misc/sound.wav','audio/wav'),
('other-public','misc/opaque.bin','audio/wav'),
('other-public','docs/note.txt','text/plain'),
('other-public','misc/disguised.bin','text/plain'),
('other-private','misc/private.wav','audio/wav');
insert into audit_recordings values
('https://local.invalid/storage/v1/object/public/recording-audio/aivis/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/current.wav');
insert into audit_bgm values
('recording-audio','aivis/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/unused.wav'),
('other-public','misc/sound.wav');
create temp table audit_result as with
refs as (
 select distinct split_part(split_part(url,'/storage/v1/object/public/recording-audio/',2),'?',1) as key from audit_recordings
), linked as (
 select key from refs union select regexp_replace(key,'[.]wav$','.timing.json','i') from refs where key ~* '[.]wav$'
), candidates as (
 select o.bucket_id,o.name,
 case when o.bucket_id='recording-audio' then split_part(o.name,'/',1) else 'other_public' end cohort
 from audit_objects o join audit_buckets b on b.id=o.bucket_id and b.public
 where (o.bucket_id='recording-audio' and not exists(select 1 from linked x where x.key=o.name))
 or (o.bucket_id<>'recording-audio' and
 (o.name ~* '[.](wav|mp3|m4a|aac|flac|ogg|opus|webm|mp4)$' or coalesce(o.mime,'') ~* '^audio/'))
), keys as (
 select c.*, case when split_part(c.name,'/',1) in ('nemo','aivis','human')
 and split_part(c.name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then split_part(c.name,'/',2)::uuid end sid,
 case when split_part(c.name,'/',1) in ('nemo','aivis','human')
 and split_part(c.name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then split_part(c.name,'/',3)::uuid end eid from candidates c
)
select k.*,(s.id is not null) has_series,(e.id is not null) has_episode,
(e.id is not null and e.series_id=k.sid) parent_matches,
(s.id is not null and s.publication_status='public' and e.id is not null and e.series_id=k.sid
 and e.status='posted' and e.published) published_path,
(s.id is not null and (s.content_rating='r18' or 'sexual_r18'=any(coalesce(s.warnings,'{}')))) effective_r18,
exists(select 1 from audit_bgm b where b.bucket_id=k.bucket_id and b.name=k.name) bgm_link
from keys k left join audit_series s on s.id=k.sid
left join audit_episodes e on e.id=k.eid;
do $$
begin
 if (select count(*) from audit_result)<>11 then raise exception 'expected 11 candidates'; end if;
 if (select count(*) from audit_result where cohort='nemo')<>7 then raise exception 'Nemo cohort mismatch'; end if;
 if (select count(*) from audit_result where cohort='other_public')<>2 then raise exception 'other public MIME/extension mismatch'; end if;
 if (select count(*) from audit_result where published_path)<>3 then raise exception 'publication join mismatch'; end if;
 if (select count(*) from audit_result where effective_r18)<>2 then raise exception 'R18 rating/warning mismatch'; end if;
 if (select count(*) from audit_result where published_path and effective_r18)<>2 then raise exception 'published R18 mismatch'; end if;
 if (select count(*) from audit_result where has_episode and not parent_matches)<>3 then raise exception 'wrong/missing parent missed'; end if;
 if (select count(*) from audit_result where has_series and not published_path)<>3 then raise exception 'private, draft or parent mismatch'; end if;
 if (select count(*) from audit_result where not has_series)<>5 then raise exception 'missing/invalid ID missed'; end if;
 if (select count(*) from audit_result where bgm_link)<>2 then raise exception 'BGM cross-reference mismatch'; end if;
 if (select count(*) from audit_result where cohort='human' and not has_series)<>1 then raise exception 'Human provenance loss'; end if;
 if exists(select 1 from audit_result where name like '%current.wav' or name like '%current.timing.json') then
 raise exception 'current recording/timing wrongly unlinked'; end if;
 if exists(select 1 from audit_result where name='misc/disguised.bin') then raise exception 'metadata disguise negative case failure'; end if;
 raise notice 'PASS: F2-P 11 synthetic candidate PostgreSQL cases; URL/timing, published/R18/warning, Human, BGM, unknown/invalid paths and MIME false negative';
end $$;
rollback;
