// #137: ACTUAL application FFmpeg normalization on bounded synthetic PCM.
// Ephemeral runner only. No hosted data, network, STT, 1GiB, or Production cap.
// Caller sets FFMPEG_PATH to the runner's pre-existing local ffmpeg executable.
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {createHash} from "node:crypto";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.FFMPEG_PATH?.startsWith("/"),true,
 "missing explicit local ffmpeg executable");
const mod=await import("../../src/lib/recording/audioPlaybackNormalization.ts");
const normalize=mod.normalizeAudioForPlayback??
 mod.default?.normalizeAudioForPlayback;
assert.equal(typeof normalize,"function","real app normalization function imported");
const origFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error("NO_NETWORK_OR_PAID_STT_ALLOWED_HOLD");};
const mib=1024*1024;
const read=()=>{const m=process.memoryUsage();return {
 rssMiB:Math.round(m.rss/mib*10)/10,
 heapMiB:Math.round(m.heapUsed/mib*10)/10,
 externalMiB:Math.round(m.external/mib*10)/10,
 arrayBuffersMiB:Math.round(m.arrayBuffers/mib*10)/10,
}};
function syntheticWav(seconds){
 const rate=48000,frames=seconds*rate,bytes=44+frames*2;
 assert.ok(Number.isSafeInteger(frames)&&bytes<=5*mib);
 const data=Buffer.alloc(bytes);
 data.write("RIFF",0);data.writeUInt32LE(bytes-8,4);
 data.write("WAVEfmt ",8);data.writeUInt32LE(16,16);
 data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
 data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);
 data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
 data.write("data",36);data.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++){
  const amp=i%(rate*5)<rate*2?0.72:0.12;
  data.writeInt16LE(Math.round(
   Math.sin(2*Math.PI*(i%60)/60)*amp*24000),44+i*2);
 }
 return data;
}
try{
 for(const seconds of [8,44]){
  const pcm=syntheticWav(seconds);
  const before=read();let observedParentRssPeakMiB=before.rssMiB;
  const start=performance.now();
  const sampler=setInterval(()=>{
   observedParentRssPeakMiB=Math.max(observedParentRssPeakMiB,read().rssMiB);
  },10);
  let normalized;
  try{
   normalized=await normalize({
    sourceBytes:new Uint8Array(pcm),
    sourceFileName:"synthetic-nonproduction.wav",
    sourceMimeType:"audio/wav",
   });
  }finally{clearInterval(sampler);}
  const elapsedMs=performance.now()-start;
  assert.ok(Number.isFinite(elapsedMs)&&elapsedMs>0);
  assert.equal(normalized.extension,"m4a");
  assert.equal(normalized.contentType,"audio/mp4");
  assert.ok(normalized.bytes.length>500&&normalized.bytes.length<5*mib);
  const fingerprint=createHash("sha256").update(normalized.bytes).digest("hex");
  assert.match(fingerprint,/^[0-9a-f]{64}$/);
  console.log("LOCAL_REAL_APP_FFMPEG_NORMALIZATION "+
   JSON.stringify({
    inputDurationSeconds:seconds,
    inputBytes:pcm.length,
    normalizedBytes:normalized.bytes.length,
    elapsedMs:Math.round(elapsedMs),
    processBefore:before,processAfter:read(),
    sampledParentRssHighMiB:observedParentRssPeakMiB,
    childFfmpegPeakUnobserved:true,
    noNetwork:true,sttCalls:0,
    noRealSpeechAndNoProductionCapacityInference:true,
   }));
 }
 console.log("PASS: #137 actual app FFmpeg AAC/M4A 8s/44s "+
  "bounded synthetic PCM; no paid STT, hosted data or selected Production cap");
}finally{globalThis.fetch=origFetch;}
