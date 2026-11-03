import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
export const id=()=>randomUUID();
export const sha=b=>createHash("sha256").update(b).digest("hex");
export const pcmLength=8*1024*1024+16384;
export function makeWav(){
 const b=Buffer.alloc(pcmLength),n=b.length-44;
 b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WAVEfmt ",8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);
 b.writeUInt32LE(32000,24);b.writeUInt32LE(128000,28);
 b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);
 b.write("data",36);b.writeUInt32LE(n,40);
 const amp=[0,0,0,.45,.12,.40,.08,.35,.28,.44,0,0,0,.38,.11,.41,.09,.37,.21,.42];
 for(let i=0;i<n/4;i++){
  const v=Math.round(Math.sin(2*Math.PI*610*i/32000)*amp[Math.floor(i/3200)%amp.length]*32767);
  b.writeInt16LE(v,44+i*4);b.writeInt16LE(v,46+i*4);
 }
 assert.ok(b.length>8*1024*1024);
 return b;
}
export async function makeWork(service,actor,tag){
 const series=id(),episode=id();
 const put=async(table,row)=>{
  const {error}=await service.from(table).insert(row);
  assert.equal(error,null,table+":"+String(error?.message));
 };
 await put("series",{id:series,author_id:actor,publication_status:"public",
  recording_permission_mode:"open",content_rating:"general",
  title:"H2 LOCAL BROWSER "+tag,source_language:"ja"});
 await put("episodes",{id:episode,series_id:series,episode_number:1,
  posting_status:"posted",is_published:true,
  body:"SYNTHETIC AUDIO ONLY. NOT A REAL HUMAN NARRATION."});
 return {series,episode};
}
