// Issue #137 isolated test-only experiment: no imported app runtime changes.
// Generate small valid WAV incrementally -> FFmpeg stdin -> fragmented MP4 stdout
// -> bounded-size on-disk output. No entire input/output Buffer in JS.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { performance } from 'node:perf_hooks';
const mib=1024*1024, chunkBytes=64*1024;
const MAX_INPUT=8*mib, MAX_OUTPUT=2*mib;
const command=process.env.FFMPEG_PATH;
assert.ok(command&&isAbsolute(command)&&existsSync(command), 'FFMPEG_PINNED_PATH_MISSING_HOLD');
// CI provides the existing lockfile-pinned ffmpeg-static. No API or remote IO.
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,'true');
// Network is disabled by standalone tests, not by module imports.
const rss=()=>Math.round(process.memoryUsage().rss/mib*10)/10;
function childRss(pid){
 try {
  const s=readFileSync('/proc/'+pid+'/status','utf8');
  const m=s.match(/^VmRSS:\s+(\d+) kB$/m);
  return m?Math.round(Number(m[1])/1024*10)/10:null;
 }catch{return null;}
}
function hdr(duration){
 const rate=48000,frames=duration*rate,bytes=44+frames*2;
 if(!Number.isSafeInteger(frames)||bytes>MAX_INPUT||bytes<=44)throw Error('INPUT_BUDGET_HOLD');
 const b=Buffer.alloc(44);b.write('RIFF',0);b.writeUInt32LE(bytes-8,4);
 b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);
 b.writeUInt32LE(frames*2,40);
 return{b,frames,bytes};
}
export async function exercise({seconds, outputBudget=MAX_OUTPUT, abortInput=false, inspectOutput=null}){
 const {b:header,frames,bytes}=hdr(seconds);
 if(!Number.isSafeInteger(outputBudget)||outputBudget<1||outputBudget>MAX_OUTPUT)
  throw Error('OUTPUT_BUDGET_CONFIG_HOLD');
 const temp=await mkdtemp(join(tmpdir(),'libread-b2-streaming-'));
 const out=join(temp,'trial-fragmented.m4a');
 let child=null, interval=null, chunks=0,inputBytes=0,outputBytes=0;
 let maxInputChunk=0,maxOutputChunk=0,childHigh=null,parentHigh=rss();
 let childStopped=false;
 const parentRssStart=rss();
 const inputHash=createHash('sha256'),outputHash=createHash('sha256');
 const start=performance.now();
 try{
  child=spawn(command,['-hide_banner','-loglevel','error',
   '-f','wav','-i','pipe:0','-vn','-map_metadata','-1','-ac','1','-ar','44100',
   '-c:a','aac','-b:a','128k','-movflags',
   '+frag_keyframe+empty_moov+default_base_moof',
   '-f','mp4','pipe:1'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stderr.on('data',()=>{}); // no path/raw output/secret logs
  interval=setInterval(()=>{
   parentHigh=Math.max(parentHigh,rss());
   const value=childRss(child.pid);
   if(value!==null)childHigh=Math.max(childHigh??0,value);
  },10);
  function* parts(){
   yield header;inputBytes+=header.length;inputHash.update(header);chunks++;
   let frame=0;
   while(frame<frames){
    if(abortInput&&frame>=65536)throw Error('SYNTHETIC_SOURCE_ABORT_HOLD');
    const n=Math.min(chunkBytes/2,frames-frame);
    const b=Buffer.allocUnsafe(n*2);
    for(let j=0;j<n;j++){
     const i=frame+j,amplitude=i%(5*48000)<2*48000?0.72:0.12;
     b.writeInt16LE(Math.round(Math.sin((i%60)*Math.PI/30)*amplitude*24000),2*j);
    }
    frame+=n;maxInputChunk=Math.max(maxInputChunk,b.length);
    inputBytes+=b.length;inputHash.update(b);chunks++;yield b;
   }
  }
  const transform=new Transform({transform(chunk,enc,cb){
   maxOutputChunk=Math.max(maxOutputChunk,chunk.length);
   outputBytes+=chunk.length;
   if(outputBytes>outputBudget)return cb(Error('STREAM_OUTPUT_BUDGET_HOLD'));
   outputHash.update(chunk);cb(null,chunk);
  }});
  const closed=new Promise((resolve,reject)=>{
   child.once('error',reject);
   child.once('close',(code)=>{
    childStopped=true;
    code===0?resolve():reject(Error('FFMPEG_NOT_ZERO_HOLD'));
   });
  });
  const pumpIn=pipeline(Readable.from(parts(),{objectMode:false,highWaterMark:chunkBytes}),child.stdin);
  const pumpOut=pipeline(child.stdout,transform,createWriteStream(out,{mode:0o600,flags:'wx'}));
  try{await Promise.all([pumpIn,pumpOut,closed]);}
  catch(e){child.kill('SIGKILL');await Promise.allSettled([pumpIn,pumpOut,closed]);throw e;}
  assert.equal(inputBytes,bytes);assert.ok(outputBytes>200&&outputBytes<=outputBudget);
  assert.ok(maxInputChunk<=chunkBytes&&maxOutputChunk<=1024*1024);
  const actual=await stat(out);assert.equal(actual.size,outputBytes);
  // ftyp + moof markers are superficial checks, not Reader compatibility.
  const handle=await open(out,'r');
  let prefix;
  try{
   prefix=Buffer.alloc(Math.min(actual.size,4096));
   const {bytesRead}=await handle.read(prefix,0,prefix.length,0);
   prefix=prefix.subarray(0,bytesRead);
  }finally{await handle.close();}
  assert.equal(prefix.toString('ascii',4,8),'ftyp');
  assert.ok(prefix.includes(Buffer.from('moof')),'fragment marker');
  // Sanity check decoded by ffmpeg without allocating decoded media in JS.
  const check=spawn(command,['-v','error','-i',out,'-f','null','-'],
   {stdio:['ignore','ignore','ignore']});
  const valid=await new Promise(resolve=>check.once('close',code=>resolve(code===0)));
  assert.ok(valid,'ffmpeg must decode fragmented MP4');
  if(inspectOutput)await inspectOutput(out,{seconds,outputBytes});
  return {seconds,inputBytes,outputBytes,inputChunks:chunks,maxInputChunk,
   maxOutputChunk,wallMs:Math.round(performance.now()-start),parentRssStart,
   parentRssEnd:rss(),sampledParentHighMiB:parentHigh,
   sampledFfmpegChildHighMiB:childHigh,
   inputSha256:inputHash.digest('hex'),outputSha256:outputHash.digest('hex'),
   ffmpegOutputDecodable:true,fragmentedMp4:true,productionSafeCapSelected:false};
 }finally{
  if(interval)clearInterval(interval);
  if(child&&!childStopped)child.kill('SIGKILL');
  await rm(temp,{recursive:true,force:true});
  assert.ok(!existsSync(temp),'TEMP_CLEANUP_HOLD');
 }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const oldFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('NO_NETWORK_ALLOWED_HOLD');};
 try{
 for(const seconds of [8,44])
  console.log('LOCAL_STREAM_FFMPEG',JSON.stringify(await exercise({seconds})));
 await assert.rejects(exercise({seconds:120}),/INPUT_BUDGET_HOLD/);
 console.log('PASS: bounded input configuration refuses >8MiB before launch');
 await assert.rejects(exercise({seconds:8,outputBudget:1024}),/STREAM_OUTPUT_BUDGET_HOLD/);
 console.log('PASS: stream output hard-budget refusal with cleanup');
 await assert.rejects(exercise({seconds:8,abortInput:true}),/SYNTHETIC_SOURCE_ABORT_HOLD/);
 console.log('PASS: stream input interruption closes FFmpeg and cleans its tempfile');
 console.log('PASS: #137 bounded experimental FFmpeg stdin/stdout stream, fail-closed and cleanup');
 }finally{globalThis.fetch=oldFetch;}
}
