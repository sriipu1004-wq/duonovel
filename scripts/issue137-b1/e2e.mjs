// Issue #137 B1: local GoTrue-signed JWT -> PostgREST RLS -> Storage.
// Never connects to hosted Supabase; uses only synthetic users/files.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const endpoint = process.env.B1_LOCAL_URL;
const anonKey = process.env.B1_ANON_KEY;
const adminKey = process.env.B1_SERVICE_KEY;
assert.equal(process.env.B1_EPHEMERAL_CONFIRM, 'local-only');
assert.ok(endpoint && anonKey && adminKey && anonKey!==adminKey);
const parsed = new URL(endpoint);
assert.equal(parsed.protocol, 'http:');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname), 'REFUSE hosted endpoint');
assert.ok(['54321','54331'].includes(parsed.port), 'REFUSE unexpected port');
const base = parsed.origin;
async function request(path, {method='GET',key=anonKey,token=key,body,plain=false,contentType='application/json'}={}) {
 const headers={apikey:key,Authorization:'Bearer '+token};
 if (body!==undefined) headers['Content-Type']=contentType;
 const res=await fetch(base+path,{
   method,headers,body:body===undefined?undefined:plain?body:JSON.stringify(body),
   signal:AbortSignal.timeout(12000)
 });
 const text=await res.text();
 let data; try {data=text?JSON.parse(text):null;} catch {data=text;}
 return {status:res.status,data};
}
function check(r,label,codes=[200,201]) {
 assert.ok(codes.includes(r.status),label+' returned HTTP '+r.status+' (body hidden)');
 return r.data;
}
const uuid=()=>randomUUID();
const people={};
const password='synthetic-B1-'+uuid()+'!xAa3';
for(const name of ['owner-off','reader-on','reader-off','reader-unconfirmed','reader-no-profile']){
 const email='issue137-b1-'+uuid()+'@example.invalid';
 const created=check(await request('/auth/v1/admin/users',{method:'POST',key:adminKey,
   body:{email,password,email_confirm:true}}),'create synthetic '+name);
 const signed=check(await request('/auth/v1/token?grant_type=password',{method:'POST',
   body:{email,password}}),'GoTrue sign-in '+name);
 assert.ok(signed.access_token && signed.access_token!==anonKey);
 assert.equal(signed.user?.id,created.id,'signed JWT identity mismatch');
 people[name]={id:created.id,token:signed.access_token};
}
const names=['general','ratingR18','warningR18','privateGeneral','privateR18','draft','unpublished'];
const rows=Object.fromEntries(names.map(name=>[name,{series:uuid(),episode:uuid(),recording:uuid()}]));
const author=people['owner-off'].id;
const series=names.map(name=>({
 id:rows[name].series,author_id:author,
 publication_status:name.startsWith('private')?'private':'public',
 content_rating:['ratingR18','privateR18'].includes(name)?'r18':'general',
 content_warnings:name==='warningR18'?['sexual_r18']:[]
}));
const episodes=names.map(name=>({
 id:rows[name].episode,series_id:rows[name].series,
 posting_status:name==='draft'?'draft':'posted',
 is_published:!['draft','unpublished'].includes(name),
 body:'SYNTHETIC-'+name
}));
const recordings=names.map(name=>({
 id:rows[name].recording,series_id:rows[name].series,episode_id:rows[name].episode,
 is_public:true,bucket_id:name==='general'?'issue137-b1-general':'issue137-b1-private',
 storage_path:'synthetic/'+rows[name].series+'/audio.txt'
}));
for(const [table,content] of [
 ['issue137_b1_series',series],
 ['issue137_b1_episodes',episodes],
 ['issue137_b1_recordings',recordings]]) {
 check(await request('/rest/v1/'+table,{method:'POST',key:adminKey,body:content}),
   'synthetic seed '+table,[201]);
}
const confirmedAt='2026-01-01T00:00:00Z';
const profiles=[
 {id:author,show_r18_content:false,r18_confirmed_at:confirmedAt},
 {id:people['reader-on'].id,show_r18_content:true,r18_confirmed_at:confirmedAt},
 {id:people['reader-off'].id,show_r18_content:false,r18_confirmed_at:confirmedAt},
 {id:people['reader-unconfirmed'].id,show_r18_content:true,r18_confirmed_at:null}
];
check(await request('/rest/v1/issue137_b1_profiles',{method:'POST',key:adminKey,body:profiles}),
 'synthetic preference seed',[201]);
const s=(...ns)=>ns.map(n=>rows[n].series);
const e=(...ns)=>ns.map(n=>rows[n].episode);
const m=(...ns)=>ns.map(n=>rows[n].recording);
let passed=0;
async function ids(table,actor,expected,select='id') {
 const token=actor?people[actor].token:anonKey;
 const r=check(await request('/rest/v1/'+table+'?select='+encodeURIComponent(select),{token}),
   table+' '+(actor||'anon'),[200]);
 assert.deepEqual(r.map(x=>x.id).sort(),expected.slice().sort(),
   table+' not correctly filtered for '+(actor||'anon'));
 passed++;
}
for(const actor of [null,'reader-unconfirmed','reader-off','reader-no-profile']){
 await ids('issue137_b1_series',actor,s('general','draft','unpublished'));
 await ids('issue137_b1_episodes',actor,e('general'),'id,body');
 await ids('issue137_b1_recordings',actor,m('general'),'id,storage_path');
}
await ids('issue137_b1_series','reader-on',s('general','ratingR18','warningR18','draft','unpublished'));
await ids('issue137_b1_episodes','reader-on',e('general','ratingR18','warningR18'),'id,body');
await ids('issue137_b1_recordings','reader-on',m('general','ratingR18','warningR18'),'id,storage_path');
await ids('issue137_b1_series','owner-off',s(...names));
await ids('issue137_b1_episodes','owner-off',e(...names),'id,body');
await ids('issue137_b1_recordings','owner-off',m(...names));
const invalid=await request('/rest/v1/issue137_b1_episodes?select=id,body',{token:'invalid-JWT'});
assert.ok([401,403].includes(invalid.status),'invalid signed token must be denied');passed++;
for(const [actor,count] of [[null,1],['reader-off',1],['reader-unconfirmed',1],['reader-on',3]]){
 const data=check(await request('/rest/v1/issue137_b1_public_episode_counts?select=series_id,episode_count',
 {token:actor?people[actor].token:anonKey}),'security_invoker view',[200]);
 assert.equal(data.length,count,'invoker view must retain R18 filter');passed++;
}
for(const [bucket,isPublic] of [['issue137-b1-general',true],['issue137-b1-private',false]]){
 check(await request('/storage/v1/bucket',{method:'POST',key:adminKey,
   body:{id:bucket,name:bucket,public:isPublic}}),'create local bucket '+bucket);
}
for(const row of recordings){
 check(await request('/storage/v1/object/'+row.bucket_id+'/'+row.storage_path,{
  method:'POST',key:adminKey,body:'SYNTHETIC-'+row.id,plain:true,
  contentType:'text/plain'
 }),'upload synthetic object',[200,201]);
}
async function download(row,actor,variant='authenticated'){
 return request('/storage/v1/object/'+variant+'/'+row.bucket_id+'/'+row.storage_path,
  {token:actor?people[actor].token:anonKey});
}
assert.equal((await download(recordings[0],null,'public')).status,200,
 'general AI audio stays public');passed++;
for(const name of ['ratingR18','warningR18']){
 const row=recordings.find(r=>r.id===rows[name].recording);
 assert.notEqual((await download(row,null,'public')).status,200,
  'known public URL must not expose private R18');passed++;
 for(const actor of [null,'reader-off','reader-unconfirmed','reader-no-profile']){
  assert.notEqual((await download(row,actor)).status,200,
  'restricted audio unavailable for '+(actor||'anon'));passed++;
 }
 for(const actor of ['reader-on','owner-off']){
  assert.equal((await download(row,actor)).status,200,
   'restricted audio must be accessible for '+actor);passed++;
 }
}
// Verify changing a REAL server-side viewer preference immediately revokes
// direct PostgREST body access and private Storage (no JWT client claim change).
check(await request('/rest/v1/issue137_b1_profiles?id=eq.'+people['reader-on'].id,
 {method:'PATCH',key:adminKey,body:{show_r18_content:false}}),
 'synthetic confirmed viewer toggles OFF',[204]);
await ids('issue137_b1_episodes','reader-on',e('general'),'id,body');
await ids('issue137_b1_recordings','reader-on',m('general'),'id,storage_path');
assert.notEqual(
 (await download(recordings.find(r=>r.id===rows.ratingR18.recording),'reader-on')).status,
 200,'OFF must revoke direct R18 Storage reads');passed++;
check(await request('/rest/v1/issue137_b1_profiles?id=eq.'+people['reader-on'].id,
 {method:'PATCH',key:adminKey,body:{show_r18_content:true}}),
 'synthetic confirmed viewer toggles back ON',[204]);
await ids('issue137_b1_episodes','reader-on',e('general','ratingR18','warningR18'),'id,body');
assert.equal(
 (await download(recordings.find(r=>r.id===rows.ratingR18.recording),'reader-on')).status,
 200,'ON must restore eligible private Storage access');passed++;
const invalidStorage=await download(recordings.find(r=>r.id===rows.ratingR18.recording),'reader-on');
assert.equal(invalidStorage.status,200,'local authenticated Storage positive control');passed++;
assert.notEqual((await request('/storage/v1/object/authenticated/issue137-b1-private/'
 +recordings.find(r=>r.id===rows.ratingR18.recording).storage_path,
 {token:'invalid-JWT'})).status,200,'invalid JWT must not fetch private audio');passed++;

// Publication transitions revoke direct SELECT and fresh download access.
// Previously issued signed URLs may remain bearer-usable until expiry.
check(await request('/rest/v1/issue137_b1_series?id=eq.'+rows.ratingR18.series,
 {method:'PATCH',key:adminKey,body:{publication_status:'private'}}),
 'synthetic public -> private',[204]);
await ids('issue137_b1_episodes','reader-on',e('general','warningR18'),'id,body');
assert.notEqual((await download(recordings.find(r=>r.id===rows.ratingR18.recording),'reader-on')).status,200);passed++;
check(await request('/rest/v1/issue137_b1_episodes?id=eq.'+rows.warningR18.episode,
 {method:'PATCH',key:adminKey,body:{is_published:false}}),
 'synthetic published -> unpublished',[204]);
await ids('issue137_b1_episodes','reader-on',e('general'),'id,body');
assert.notEqual((await download(recordings.find(r=>r.id===rows.warningR18.recording),'reader-on')).status,200);passed++;
// EXPECTED B2 DEFECT CONTROL: a public bucket URL does NOT become private
// just because the linked series changes from general to R18 in Postgres.
// This synthetic counterexample is NOT an accepted production state; B2 must
// block unsafe rating transitions or re-home/revoke the public media first.
check(await request('/rest/v1/issue137_b1_series?id=eq.'+rows.general.series,
 {method:'PATCH',key:adminKey,body:{content_rating:'r18'}}),
 'synthetic general -> R18 without audio relocation',[204]);
await ids('issue137_b1_episodes',null,[],'id,body');
assert.equal((await download(recordings[0],null,'public')).status,200,
 'expected B2 gap: old general public media URL still anonymously accessible');
console.log('EXPECTED_B2_GAP: rating change alone does not revoke existing public Storage URL');
check(await request('/rest/v1/issue137_b1_series?id=eq.'+rows.general.series,
 {method:'PATCH',key:adminKey,body:{content_rating:'general'}}),
 'restore local general fixture',[204]);
console.log('PASS: '+passed+' positive/negative isolated integration assertions (if actually executed)');
console.log('B2 GAP REMAINS: general->R18 media transition must be separately hardened');
console.log('SOURCE SCOPE: synthetic B contract only, NOT Production/app HTML/RSC/E2E.');
