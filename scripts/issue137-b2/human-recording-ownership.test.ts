// F2-H: execute the real Human writer + publisher with in-memory PostgREST
// and Storage fakes. No network, real media, credentials or Production SQL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const humanPath = "src/lib/recording/humanRecordingPublish.ts";
const mainSource = readFileSync(new URL(humanPath, root), "utf8");
const humanStateSource = readFileSync(new URL("src/lib/recording/humanRecordingState.ts",root),"utf8");
const series = "11111111-1111-4111-8111-111111111111";
const episode = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
let checks=0;

type Row = {
  id:string; series_id:string; episode_id:string; reader_id:string;
  reader_name:string; audio_storage_path:string; voice_model_id:string|null;
  is_public:boolean;
};
const playback=(who:string,version:string)=>"human/"+series+"/"+episode+"/"+who+"/"+version+"/playback-from-mp3.m4a";
const seed=(who=owner,name="Human Reader",path=playback(who,"old")):Row=>({
  id:"recording-"+who,series_id:series,episode_id:episode,
  reader_id:who,reader_name:name,audio_storage_path:path,voice_model_id:null,is_public:true
});
type WriteInput = {seriesId:string;episodeId:string;readerId:string;readerName:string;audioStoragePath:string;isPublic:boolean};
class Query {
  private op:"list"|"update"|"insert"="list";
  private criteria:Array<[string,unknown]>=[];
  private payload:Partial<Row>={};
  constructor(private db:FakeDB){}
  select(_s?:string){return this;}
  eq(name:string,value:unknown){this.criteria.push([name,value]);return this;}
  is(name:string,value:unknown){this.criteria.push([name,value]);return this;}
  order(_s:string,_o?:unknown){return this;}
  update(p:Partial<Row>){this.op="update";this.payload=p;return this;}
  insert(p:Partial<Row>){this.op="insert";this.payload=p;return this;}
  delete():never{throw Error("no database DELETE permitted");}
  private execute(single:boolean):{data:unknown,error:{message:string}|null}{
    const found=this.db.rows.filter(row=>this.criteria.every(([k,v])=>
      (row as unknown as Record<string,unknown>)[k]===v));
    if(this.op==="list"){
      if(this.db.lookupError)return {data:null,error:{message:"synthetic lookup failure"}};
      return {data:found.map(x=>({...x})),error:null};
    }
    if(this.op==="update"){
      if(this.db.failUpdate)return {data:null,error:{message:"synthetic UPDATE failed"}};
      if(found.length!==1)return {data:single?null:[],error:null};
      Object.assign(found[0],this.payload);
      if(this.db.responseLostAfterCommit)
        return {data:null,error:{message:"synthetic response lost after DB commit"}};
      return {data:single?{id:found[0].id}:[{id:found[0].id}],error:null};
    }
    if(this.db.failInsert)return {data:null,error:{message:"synthetic INSERT failed"}};
    const row={...this.payload,id:"inserted-"+(++this.db.nextId)} as Row;
    this.db.rows.push(row);
    if(this.db.responseLostAfterCommit)
      return {data:null,error:{message:"synthetic response lost after DB insert"}};
    return {data:single?{id:row.id}:[{id:row.id}],error:null};
  }
  maybeSingle(){return Promise.resolve(this.execute(true));}
  single(){return Promise.resolve(this.execute(true));}
  then<T>(onFulfilled:(value:{data:unknown;error:{message:string}|null})=>T, onRejected?:(reason:unknown)=>unknown){
    return Promise.resolve(this.execute(false)).then(onFulfilled,onRejected);
  }
}
class FakeDB {
  rows:Row[];nextId=0; failUpdate=false;failInsert=false;lookupError=false;
  responseLostAfterCommit=false;
  uploads:string[]=[];removed=0;failUploadAt=0;
  constructor(rows:Row[]=[]){this.rows=rows.map(x=>({...x}));}
  from(name:string){
    assert.equal(name,"recordings","only recordings DB table may be touched");
    return new Query(this);
  }
  storage={
    from:(bucket:string)=>{
      assert.equal(bucket,"human-recording-audio");
      return {
        upload:async(path:string,_bytes:unknown,opts:{upsert:boolean})=>{
          assert.equal(opts.upsert,false,"Human Storage writes must not overwrite prior keys");
          this.uploads.push(path);
          return {error:this.failUploadAt===this.uploads.length?{message:"synthetic Storage timeout"}:null};
        },
        remove:async(_paths:string[])=>{
          this.removed++;throw Error("destructive storage removal forbidden");
        }
      };
    }
  };
}
function extract(source:string,path:string,names:string[]){
  const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  return names.map(name=>{
    const n=sf.statements.find((n):n is ts.FunctionDeclaration=>
      ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert.ok(n,"missing real function "+name);
    return n.getText(sf).replace(/^export\s+/u,"");
  }).join("\n");
}
const stateDecls=extract(humanStateSource,"humanRecordingState.ts",[
  "getRecordingAudioStoragePath","hasHumanRecordingStorageProvenance","isHumanRecordingRow"
]);
const sourceDecls=extract(mainSource,humanPath,[
  "pickText","sanitizeStorageSegment","buildHumanRecordingObjectPaths",
  "mapRecordingRows","isCanonicalOwnedHumanPlaybackPath","findExistingRecordings",
  "writeRecording","publishHumanRecording"
]);
const compiled=ts.transpileModule(stateDecls+"\n"+sourceDecls+
    "\n({writeRecording,publishHumanRecording,isCanonicalOwnedHumanPlaybackPath});",
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
let unique=0;
let active:FakeDB|null=null;
const code=vm.runInNewContext(compiled,{
  URL,Error,Uint8Array,TextEncoder,
  Date:{now:()=>1700000000000},
  crypto:{randomUUID:()=>String(++unique).padStart(32,"0")},
  createAdminClient:()=>{assert.ok(active);return active;},
  getHumanRecordingAudioBucketName:()=> "human-recording-audio",
  guessExtension:()=> "mp3",
  getAudioContentType:()=> "audio/mpeg",
  PLAYBACK_AUDIO_EXTENSION:"m4a",
  PLAYBACK_AUDIO_CONTENT_TYPE:"audio/mp4",
  buildNemoTimingObjectPathFromAudioObjectPath:(path:string)=>path.replace(/\.m4a$/u,".timing.json"),
  loadPublishAccess:async()=>{},
  resolveCanonicalEpisodeIdForSeries:async()=>episode,
  fetchEpisodeBodyForAlignment:async()=> "SYNTHETIC PUBLIC DOMAIN TEXT",
  normalizeAudioForPlayback:async()=>({bytes:new Uint8Array([1,2,3])}),
  transcribeHumanPlaybackAudio:async()=>({text:"SYNTHETIC PUBLIC DOMAIN TEXT"}),
  alignHumanRecordingToBodyOrThrow:()=>({manifest:{wordTimings:[]}}),
  ensureReaderUserRow:async()=>{},
  buildHumanRecordingPlaybackHref:(id:string)=>"/api/recordings/human-audio/"+id
}) as {
  writeRecording:(db:FakeDB,input:WriteInput)=>Promise<{recordingId:string}>;
  publishHumanRecording:(input:unknown)=>Promise<{
    recordingId:string;audioStoragePath:string;playbackStorageObjectPath:string
  }>;
  isCanonicalOwnedHumanPlaybackPath:(path:string,s:string,e:string,u:string)=>boolean;
};
assert.doesNotMatch(mainSource,/\.from\("recordings"\)\s*\.delete\(|\.storage\.from\([^)]*\)\.remove\(/u);
assert.doesNotMatch(mainSource,/deleteDuplicateRecordings|removeObsoleteRecordingArtifacts|removeStorageObjectPaths/u);
checks+=2;
const input=(version:string,custom:Partial<WriteInput>={}):WriteInput=>({
  seriesId:series,episodeId:episode,readerId:owner,readerName:"Human Reader",
  audioStoragePath:playback(owner,version),isPublic:true,...custom
});
const withDB=<T>(db:FakeDB,cb:()=>Promise<T>):Promise<T>=>{active=db;return cb();};
async function writerCases(){
  {
    const old=seed(),db=new FakeDB([old]);const result=await code.writeRecording(db,input("next",{isPublic:false}));
    assert.equal(result.recordingId,old.id);
    assert.equal(db.rows.length,1);
    assert.equal(db.rows[0].audio_storage_path,playback(owner,"next"));
    assert.equal(db.rows[0].is_public,false,"owner can keep private Human recording");
    checks+=4;
  }
  {
    const old=seed(other),db=new FakeDB([old]);await code.writeRecording(db,input("next"));
    assert.equal(db.rows.length,2);
    assert.equal(db.rows[0].reader_id,other);
    assert.equal(db.rows[0].audio_storage_path,old.audio_storage_path);
    checks+=3;
  }
  {
    const old=seed(owner,"Another name"),db=new FakeDB([old]);await code.writeRecording(db,input("next"));
    assert.equal(db.rows.length,2,"no reader-name-only matching");
    assert.equal(db.rows[0].audio_storage_path,old.audio_storage_path);
    checks+=2;
  }
  {
    const old={...seed(),series_id:other},db=new FakeDB([old]);await code.writeRecording(db,input("next"));
    assert.equal(db.rows.length,2,"same episode wrong series remains unchanged");
    checks++;
  }
  {
    const old={...seed(),voice_model_id:"aivis-model"},db=new FakeDB([old]);await code.writeRecording(db,input("next"));
    assert.equal(db.rows.length,2,"AI with Human-like path cannot be overwritten");
    checks++;
  }
  for(const path of [
    "https://not-trusted.test/storage/v1/object/public/human-recording-audio/"+playback(owner,"old"),
    "human/"+series+"/"+episode+"/"+other+"/old/playback-from-mp3.m4a",
    "human/"+series+"/"+episode+"/"+owner+"/old/original.mp3",
    "human/"+series+"/"+episode+"/"+owner+"/old/playback.m4a",
    "human/"+series+"/"+episode+"/"+owner+"/old/playback-from-mp3.m4a/../../bad",
    "human/"+series+"/"+episode+"/"+owner+"/../playback-from-mp3.m4a"
  ]){
    const old=seed(owner,"Human Reader",path),db=new FakeDB([old]);
    await code.writeRecording(db,input("next"));
    assert.equal(db.rows.length,2,"legacy, mismatched or untrusted media path preserved");
    assert.equal(db.rows[0].audio_storage_path,path);
    checks+=2;
  }
  {
    const old1=seed(),old2={...seed(),id:"second",audio_storage_path:playback(owner,"older")};
    const db=new FakeDB([old1,old2]);await code.writeRecording(db,input("next"));
    assert.equal(db.rows.length,2,"existing duplicate Human rows must never be removed");
    assert.ok(db.rows.some(r=>r.id==="second"&&r.audio_storage_path===playback(owner,"older")));
    checks+=2;
  }
  {
    const db=new FakeDB([seed()]);
    const settled=await Promise.allSettled([code.writeRecording(db,input("a")),code.writeRecording(db,input("b"))]);
    assert.equal(settled.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(settled.filter(x=>x.status==="rejected").length,1);
    assert.match(String((settled.find(x=>x.status==="rejected") as PromiseRejectedResult).reason),/human_recording_write_conflict/u);
    assert.equal(db.rows.length,1);
    checks+=4;
  }
  {
    const db=new FakeDB();
    const results=await Promise.allSettled([code.writeRecording(db,input("a")),code.writeRecording(db,input("b"))]);
    assert.ok(results.every(x=>x.status==="fulfilled"));
    assert.equal(db.rows.length,2,"first simultaneous INSERTs must remain non-destructive");
    checks+=2;
  }
  {
    const db=new FakeDB([seed()]);db.failUpdate=true;
    await assert.rejects(()=>code.writeRecording(db,input("next")),/recording_update_failed/u);
    assert.equal(db.rows[0].audio_storage_path,playback(owner,"old"));
    checks+=2;
  }
  {
    const db=new FakeDB();db.failInsert=true;
    await assert.rejects(()=>code.writeRecording(db,input("next")),/recording_insert_failed/u);
    assert.equal(db.rows.length,0);
    checks+=2;
  }
  {
    const db=new FakeDB();db.lookupError=true;
    await assert.rejects(()=>code.writeRecording(db,input("next")),/recording_lookup_failed/u);
    checks++;
  }
}
const sourceFile={
  name:"synthetic.mp3",type:"audio/mpeg",
  arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer
};
const publish=()=>code.publishHumanRecording({
  userId:owner,seriesId:series,episodeId:episode,readerName:"Human Reader",
  isPublic:true,sourceFile
});
async function publisherCases(){
  {
    const old=seed(),db=new FakeDB([old]);const res=await withDB(db,publish);
    assert.equal(res.recordingId,old.id,"publisher should retain Human ID");
    assert.equal(db.uploads.length,3,"original, playback, timing uploaded");
    assert.equal(db.removed,0,"never remove prior media");
    assert.ok(res.audioStoragePath.endsWith(old.id));
    checks+=4;
  }
  for(const failureStep of [1,2,3]){
    const old=seed(),db=new FakeDB([old]);db.failUploadAt=failureStep;
    await assert.rejects(()=>withDB(db,publish),/storage_upload_failed|human_timing_upload_failed/u);
    assert.equal(db.removed,0,"ambiguous Storage result must retain all written keys");
    assert.equal(db.rows[0].audio_storage_path,old.audio_storage_path);
    assert.equal(db.uploads.length,failureStep);
    checks+=4;
  }
  {
    const old=seed(),db=new FakeDB([old]);db.responseLostAfterCommit=true;
    await assert.rejects(()=>withDB(db,publish),/recording_update_failed/u);
    assert.equal(db.removed,0,"lost DB response cannot trigger Storage deletion");
    assert.equal(db.uploads.length,3);
    assert.notEqual(db.rows[0].audio_storage_path,old.audio_storage_path,
      "synthetic DB committed before response loss; cannot claim rollback");
    checks+=4;
  }
  {
    const old=seed(),db=new FakeDB([old]);db.failUpdate=true;
    await assert.rejects(()=>withDB(db,publish),/recording_update_failed/u);
    assert.equal(db.rows[0].audio_storage_path,old.audio_storage_path);
    assert.equal(db.removed,0);
    checks+=3;
  }
  {
    const db=new FakeDB();db.failInsert=true;
    await assert.rejects(()=>withDB(db,publish),/recording_insert_failed/u);
    assert.equal(db.removed,0);
    assert.equal(db.uploads.length,3);
    checks+=3;
  }
}
async function main(){
  await writerCases();
  await publisherCases();
  console.log("PASS: "+checks+" F2-H actual Human writer/publisher synthetic owner, CAS and no-delete checks; no hosted DB/Storage");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
