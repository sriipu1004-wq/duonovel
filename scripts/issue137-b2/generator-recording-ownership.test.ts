// F2-A/B: exercise the ACTUAL generator DB writers against an isolated,
// deterministic PostgREST-like in-memory adapter. No hosted DB or Storage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

type Row = {
  id: string;
  series_id: string;
  episode_id: string;
  reader_id: string;
  reader_name: string;
  voice_model_id: string | null;
  audio_storage_path: string;
  is_public?: boolean;
};
type Input = {
  seriesId: string; episodeId: string; readerId: string; readerName: string;
  audioStoragePath: string; voiceModelId?: string | null;
};
const seriesId = "11111111-1111-4111-8111-111111111111";
const episodeId = "22222222-2222-4222-8222-222222222222";
const own = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const root = new URL("../../", import.meta.url);
let checks = 0;

class Query {
  private criteria: Array<[string, unknown]> = [];
  private operation: "list" | "update" | "insert" = "list";
  private payload: Partial<Row> = {};
  constructor(private db: FakeDatabase) {}
  select(_columns?: string) { return this; }
  eq(name: string, value: unknown) { this.criteria.push([name,value]); return this; }
  is(name: string, value: unknown) { this.criteria.push([name,value]); return this; }
  order(_name: string, _options?: unknown) { return this; }
  update(payload: Partial<Row>) { this.operation="update"; this.payload=payload; return this; }
  insert(payload: Partial<Row>) { this.operation="insert"; this.payload=payload; return this; }
  delete(): never { throw Error("F2-B forbids automatic recording DELETE"); }
  private execute(many: boolean) {
    const matches=(row: Row)=>this.criteria.every(([key,value])=>
      (row as unknown as Record<string,unknown>)[key]===value);
    if (this.operation==="list") {
      return { data: this.db.rows.filter(matches).map(x=>({...x})), error:null };
    }
    if (this.operation==="update") {
      if (this.db.failUpdate) return { data:null, error:{message:"synthetic update failure"} };
      const found=this.db.rows.filter(matches);
      if (found.length!==1) return { data:many?[]:null, error:null };
      Object.assign(found[0],this.payload);
      return { data:many?found.map(x=>({id:x.id})):{id:found[0].id}, error:null };
    }
    if (this.db.failInsert) return { data:null,error:{message:"synthetic insert failure"} };
    const row={...this.payload,id:"generated-"+(++this.db.idCounter)} as Row;
    this.db.rows.push(row);
    return { data:many?[{id:row.id}]:{id:row.id}, error:null };
  }
  maybeSingle() { return Promise.resolve(this.execute(false)); }
  single() { return Promise.resolve(this.execute(false)); }
  then<T>(onFulfilled:(value:{data:unknown;error:unknown})=>T, onRejected?:(reason:unknown)=>unknown) {
    return Promise.resolve(this.execute(true)).then(onFulfilled,onRejected);
  }
}
class FakeDatabase {
  rows:Row[];
  idCounter=0;
  failUpdate=false;
  failInsert=false;
  constructor(rows:Row[] = []) { this.rows=rows.map(x=>({...x})); }
  from(name:string) {
    assert.equal(name,"recordings","writer must only use recordings table");
    return new Query(this);
  }
}
function row(kind:"nemo"|"aivis"|"human", user:string, name:string,
  model:string|null=null, path?:string):Row {
  const audio=path??(kind==="human"
    ? "https://example.test/storage/v1/object/public/recording-audio/human/"+seriesId+"/"+episodeId+"/original.wav"
    : "https://example.test/storage/v1/object/public/recording-audio/"+kind+"/"+seriesId+"/"+episodeId+"/original.wav");
  return {id:"seed-"+kind+"-"+user+"-"+name,series_id:seriesId,episode_id:episodeId,
    reader_id:user,reader_name:name,voice_model_id:model,audio_storage_path:audio,is_public:true};
}
function newPath(kind:"nemo"|"aivis",v:string) {
  return "r18-private:"+kind+"/"+seriesId+"/"+episodeId+"/"+v+".wav";
}
function realWriters(kind:"nemo"|"aivis") {
  const path="src/lib/recording/"+kind+"Generation.ts";
  const source=readFileSync(new URL(path,root),"utf8");
  const sf=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const names=["is"+(kind==="nemo"?"Nemo":"Aivis")+"RecordingReference",
    "findExistingRecordings","writeRecording"];
  if(kind==="nemo") names.unshift("isNemoNarratorName");
  const pieces=names.map(name=>{
    const fn=sf.statements.find((node):node is ts.FunctionDeclaration=>
      ts.isFunctionDeclaration(node)&&node.name?.text===name);
    assert.ok(fn,kind+" requires real writer "+name);
    return fn.getText(sf).replace(/^export\s+/u,"");
  });
  // No reimplementation of the writer: transpile the real TypeScript
  // declarations, run under a minimal standalone global context.
  const js=ts.transpileModule(
    pieces.join("\n")+"\nwriteRecording;"+
      "\n", {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}
  ).outputText;
  const write=vm.runInNewContext(js,{
    URL, Error,
    pickText:(...values:unknown[])=>{
      for(const v of values) if(typeof v==="string"&&v.trim()) return v.trim();
      return "";
    }
  }) as (db:FakeDatabase,input:Input)=>Promise<{recordingId:string}>;
  assert.doesNotMatch(source,/deleteDuplicateRecordings|\.from\("recordings"\)\s*\.delete\(/u,
    kind+" should not delete recording rows");
  checks++;
  return write;
}

async function verify(kind:"nemo"|"aivis") {
  const write=realWriters(kind);
  const name=kind==="nemo"?"VOICEVOX Nemo 1":"Aivis 1";
  const model=kind==="nemo"?null:"model-1";
  const input=(version:string,overrides:Partial<Input>={}):Input=>({
    seriesId,episodeId,readerId:own,readerName:name,voiceModelId:model,
    audioStoragePath:newPath(kind,version),...overrides
  });
  const original=row(kind,own,name,model);
  {
    const human=row("human",own,name,null);
    const db=new FakeDatabase([human]);
    await write(db,input("new"));
    assert.equal(db.rows.length,2,"Human and AI must be distinct rows");
    assert.deepEqual(db.rows[0],human,"Human record and attribution untouched");
    assert.equal(db.rows[1].reader_id,own);
    checks+=3;
  }
  {
    const another=row(kind,other,name,model);
    const db=new FakeDatabase([another]);
    await write(db,input("new"));
    assert.equal(db.rows.length,2,"same name/model cannot replace other reader");
    assert.deepEqual(db.rows[0],another,"other reader pointer retained");
    checks+=2;
  }
  {
    const incompatible=row(kind,own,name,"different-model");
    const db=new FakeDatabase([incompatible]);
    await write(db,input("new"));
    assert.deepEqual(db.rows[0],incompatible,"mismatched voice model untouched");
    assert.equal(db.rows.length,2);
    checks+=2;
  }
  {
    const wrongGenerator=row(kind==="nemo"?"aivis":"nemo",own,name,model);
    const db=new FakeDatabase([wrongGenerator]);
    await write(db,input("new"));
    assert.deepEqual(db.rows[0],wrongGenerator,"other generator untouched");
    assert.equal(db.rows.length,2);
    checks+=2;
  }
  {
    const old={...original,id:"primary"};
    const db=new FakeDatabase([old]);
    const result=await write(db,input("updated"));
    assert.equal(result.recordingId,"primary","same owner/model/kind updates stable ID");
    assert.equal(db.rows.length,1);
    assert.equal(db.rows[0].audio_storage_path,newPath(kind,"updated"));
    checks+=3;
  }
  {
    const wrongName=row(kind,own,"Other name",model);
    const db=new FakeDatabase([wrongName]);
    await write(db,input("new"));
    assert.deepEqual(db.rows[0],wrongName,"same owner but different voice identity preserved");
    checks++;
  }
  {
    const original1={...original,id:"version-1"};
    const original2={...original,id:"version-2",audio_storage_path:newPath(kind,"older")};
    const db=new FakeDatabase([original1,original2]);
    await write(db,input("latest"));
    assert.equal(db.rows.length,2,"no duplicate-row DELETE");
    assert.ok(db.rows.some(x=>x.id==="version-1"));
    assert.ok(db.rows.some(x=>x.id==="version-2"));
    checks+=3;
  }
  {
    const db=new FakeDatabase([{...original,id:"shared"}]);
    const results=await Promise.allSettled([
      write(db,input("racer-a")),write(db,input("racer-b"))]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1,
      "CAS must reject one simultaneous writer after the same old pointer");
    assert.equal(results.filter(x=>x.status==="rejected").length,1);
    const failed=results.find(x=>x.status==="rejected");
    assert.match(String((failed as PromiseRejectedResult).reason),/recording_write_conflict/u);
    assert.equal(db.rows.length,1);
    assert.ok([newPath(kind,"racer-a"),newPath(kind,"racer-b")].includes(db.rows[0].audio_storage_path));
    checks+=5;
  }
  {
    const db=new FakeDatabase();
    const results=await Promise.allSettled([
      write(db,input("first")),write(db,input("second"))]);
    assert.ok(results.every(x=>x.status==="fulfilled"));
    assert.equal(db.rows.length,2,"no first-insert uniqueness guarantee without DB migration; preserve both");
    assert.equal(new Set(db.rows.map(x=>x.audio_storage_path)).size,2);
    checks+=3;
  }
  {
    const db=new FakeDatabase([original]);db.failUpdate=true;
    await assert.rejects(()=>write(db,input("failure")) ,/recording_update_failed/u);
    assert.deepEqual(db.rows[0],original,"failed write retains old pointer");
    checks+=2;
  }
  {
    const db=new FakeDatabase();db.failInsert=true;
    await assert.rejects(()=>write(db,input("failure")) ,/recording_insert_failed/u);
    assert.equal(db.rows.length,0);
    checks+=2;
  }
  {
    // Even if path contents contain the generator word, a Human public URL
    // must not count as a canonical AI object.
    const forged=row("human",own,name,model,
      "https://example.test/storage/v1/object/public/recording-audio/human/"+
      kind+"/"+seriesId+"/"+episodeId+"/forged.wav");
    const db=new FakeDatabase([forged]);
    await write(db,input("new"));
    assert.equal(db.rows.length,2);
    assert.deepEqual(db.rows[0],forged);
    checks+=2;
  }
}
async function main() {
  await verify("nemo");
  await verify("aivis");
  console.log("PASS: "+checks+" F2-A/B actual Nemo/Aivis DB-writer synthetic ownership, provenance and CAS checks; no hosted DB/Storage");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
