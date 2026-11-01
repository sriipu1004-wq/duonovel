// Bounded, synthetic, local-only size/memory checkpoints.
// NOT WebAudio decoding, server ffmpeg, concurrent loads, 1GiB, or paid STT.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
const mib=1024*1024;
const reading=()=>{const m=process.memoryUsage();return {
 rssMiB:Math.round(m.rss/mib),heapMiB:Math.round(m.heapUsed/mib),
 externalMiB:Math.round(m.external/mib),arrayBuffersMiB:Math.round(m.arrayBuffers/mib)
}};
for(const sizeMiB of [4,8,16]){
 const before=reading(),start=performance.now();
 const source=Buffer.alloc(sizeMiB*mib,0x34);
 const file=new File([source],"synthetic.wav",{type:"audio/wav"});
 const afterFile=reading();
 const whole=new Uint8Array(await file.arrayBuffer());
 assert.equal(whole.byteLength,sizeMiB*mib);
 const afterWhole=reading();
 const sha=createHash("sha256");
 for(let i=0;i<file.size;i+=8*mib)
  sha.update(new Uint8Array(await file.slice(i,i+8*mib).arrayBuffer()));
 assert.equal(sha.digest("hex"),createHash("sha256").update(source).digest("hex"));
 console.log(JSON.stringify({sample:"SYNTHETIC_FILE_MEMORY_CHECKPOINTS",
  sourceMiB:sizeMiB,elapsedMs:Math.round(performance.now()-start),
  before,afterFile,afterWhole,afterSlices:reading(),
  notPeakRss:true,decodedAudio:false,ffmpeg:false,sttCalls:0,safeCap:null}));
}
console.log("PASS: #137 synthetic 4/8/16MiB File, full-array and 8MiB-sliced SHA checks");
