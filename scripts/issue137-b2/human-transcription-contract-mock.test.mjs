// Issue #137: NO-NETWORK synthetic test of actual current Human STT
// input-size and timestamp contract, not paid API or model migration proof.
import assert from "node:assert/strict";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.OPENAI_API_KEY,undefined,
 "test must not receive any real API key");
const module=await import("../../src/lib/recording/humanRecordingTranscription.ts");
const transcribe=module.transcribeHumanPlaybackAudio??
 module.default?.transcribeHumanPlaybackAudio;
assert.equal(typeof transcribe,"function","real transcription function imported");
const existingFetch=globalThis.fetch;
let calls=0;
process.env.OPENAI_API_KEY="LOCAL_TEST_DUMMY_KEY_NOT_SENT";
globalThis.fetch=async(url,options)=>{
 calls++;
 assert.equal(url,"https://api.openai.com/v1/audio/transcriptions",
  "stubbed exact endpoint, no network");
 assert.equal(options.method,"POST");
 assert.equal(options.body.get("model"),"whisper-1");
 assert.equal(options.body.get("response_format"),"verbose_json");
 assert.equal(options.body.get("language"),"ja");
 assert.deepEqual(options.body.getAll("timestamp_granularities[]"),
  ["segment","word"]);
 const file=options.body.get("file");
 assert.equal(file.size,256);
 return new Response(JSON.stringify({
  text:"合成朗読",language:"ja",duration:3.2,
  segments:[{id:0,start:0,end:3.2,text:"合成朗読"}],
  words:[{word:"合成",start:0,end:1.5},
   {word:"朗読",start:1.5,end:3.2}]
 }),{status:200,headers:{"content-type":"application/json"}});
};
try{
 const overlimit=new Uint8Array(25*1024*1024+1);
 await assert.rejects(transcribe({audioBytes:overlimit,
  fileName:"synthetic.m4a",mimeType:"audio/mp4"}),
  /transcription_input_too_large/);
 assert.equal(calls,0,"25MiB+1B rejected before any API transport");
 const result=await transcribe({audioBytes:new Uint8Array(256),
  fileName:"synthetic.m4a",mimeType:"audio/mp4"});
 assert.equal(calls,1,"exactly one INTERCEPTED mock request");
 assert.equal(result.language,"ja");
 assert.equal(result.durationSeconds,3.2);
 assert.equal(result.segments.length,1);
 assert.equal(result.segments[0].startTimeSeconds,0);
 assert.equal(result.segments[0].endTimeSeconds,3.2);
 assert.deepEqual(result.words.map(w=>[w.word,w.startTimeSeconds,
  w.endTimeSeconds]),[["合成",0,1.5],["朗読",1.5,3.2]]);
 console.log("PASS: #137 existing Human 25MiB+1B STT input HOLD and "+
  "mock verbose_json segment+word timestamp contract; ZERO network/API fees");
}finally{
 globalThis.fetch=existingFetch;
 delete process.env.OPENAI_API_KEY;
}
