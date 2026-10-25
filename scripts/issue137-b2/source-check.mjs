// SOURCE checks (not the local GoTrue/PostgREST/Storage integration suite).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../', import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const migration=read('supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql');
const privateApi=read('src/app/api/recordings/ai-audio/[recordingId]/route.ts');
const catalog=read('src/lib/publicWorks.ts');
const required=[
 ['series restrictive',/on public\.series\s+as restrictive for select/],
 ['episode restrictive',/on public\.episodes\s+as restrictive for select/],
 ['recording restrictive',/on public\.recordings\s+as restrictive for select/],
 ['Human grant closed',/on public\.episode_human_translations as restrictive for select/],
 ['self-confirmation',/u\.r18_confirmed_at is not null/],
 ['OFF blocks',/u\.show_r18_content is true/],
 ['warning-only',/'sexual_r18'=any/],
 ['private bucket',/'r18-recording-audio','r18-recording-audio',false/],
 ['series guard',/create trigger issue137_b2_series_media_transition/],
 ['episode guard',/create trigger issue137_b2_episode_media_transition/],
 ['recording guard',/create trigger issue137_b2_recording_media_reference/],
 ['orphan guard',/public_audio_exists_for_series\(new\.id\)/],
 ['upload guard',/create trigger issue137_b2_public_audio_storage/],
 ['series lock',/where id=new\.series_id for share/],
 ['episode lock',/where id=new\.episode_id for share/],
 ['private streaming',/cache:"no-store"/],
 ['full publication check',/e\.posting_status!=="posted"/],
 ['auth R18',/getCurrentR18ViewerPreference/],
 ['viewer-specific query',/getViewerR18Cards/],
 ['anonymous general cache',/const generalCards = cards\.filter/]
];
assert.equal((migration.match(/\!~\* '\^\[a-f0-9-\]\{36\}\
for(const [name,pattern] of required) {assert.match(
 name==='private streaming'||name==='full publication check'||name==='auth R18'?privateApi:
 name==='viewer-specific query'||name==='anonymous general cache'?catalog:migration,
 pattern, name);checks++;}
assert.ok(!migration.includes("update storage.buckets set public"),'no public bucket flip');
assert.ok(!/delete\s+from\s+storage\.objects/i.test(migration),'no object deletion');
console.log('PASS: '+checks+' bounded B2 SOURCE contracts; dynamic RLS/Storage needs CI');
/g)||[]).length,2,'Storage UUID regex must include closing end-anchor and quote');
let checks=0;
for(const [name,pattern] of required) {assert.match(
 name==='private streaming'||name==='full publication check'||name==='auth R18'?privateApi:
 name==='viewer-specific query'||name==='anonymous general cache'?catalog:migration,
 pattern, name);checks++;}
assert.ok(!migration.includes("update storage.buckets set public"),'no public bucket flip');
assert.ok(!/delete\s+from\s+storage\.objects/i.test(migration),'no object deletion');
console.log('PASS: '+checks+' bounded B2 SOURCE contracts; dynamic RLS/Storage needs CI');
