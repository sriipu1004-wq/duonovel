// Browser-driven real multipart upload: 8MiB+ decodable synthetic PCM,
// NOT a real human narration, likeness, or ownership evidence.
import assert from "node:assert/strict";
import {sha} from "./r0-h2-browser-pcm-fixture.mjs";
export async function readyWav(page,audio){
 const file=page.locator("[data-recording-studio] input[type=file]");
 await file.waitFor({state:"attached",timeout:45000});
 await file.setInputFiles({name:"h2-synthetic-8mib.wav",
  mimeType:"audio/wav",buffer:audio});
 await page.waitForFunction(()=>
  [...document.querySelectorAll("button")].some(b=>
   b.textContent?.includes("保存して作品へ接続")&&!b.disabled),
  null,{timeout:110000});
 const button=page.getByRole("button",{name:"保存して作品へ接続"});
 assert.ok(await button.isEnabled(),"real browser decoded/accepted PCM");
 return button;
}
export async function browserSuccess({context,base,service,audio,work}){
 const page=await context.newPage();let session=null;
 try{
  page.on("response",async r=>{
   if(r.url()===base+"/api/recordings/human-upload-session"&&r.ok())
    try{session=await r.json()}catch{}
  });
  const response=await page.goto(base+"/record/create/"+work.series,{
   waitUntil:"domcontentloaded",timeout:45000});
  assert.ok([200,304].includes(response?.status()),"signed-in Studio SSR");
  const button=await readyWav(page,audio);
  const finalized=page.waitForResponse(r=>
   r.url()===base+"/api/recordings/human-upload-finalize"&&
   r.request().method()==="POST",{timeout:170000});
  await button.click();
  const reply=await finalized,body=await reply.json();
  assert.equal(reply.status(),200,"actual finalize error:"+String(body?.error));
  assert.equal(body.ok,true);
  assert.equal(session?.parts?.length,2,">8MiB must create two parts");
  assert.equal(session.parts[0].expectedSizeBytes,8*1024*1024);
  for(const part of session.parts){
   const d=await service.storage.from("human-recording-audio")
    .download(part.objectPath);
   assert.equal(d.error,null,"part physical download");
   const bytes=Buffer.from(await d.data.arrayBuffer());
   assert.equal(bytes.length,part.expectedSizeBytes);
   assert.equal(sha(bytes),sha(audio.subarray(
    part.byteOffsetStart,part.byteOffsetEndExclusive)));
  }
  const linked=await service.from("recordings").select("id,episode_id")
   .eq("id",body.recordingId).maybeSingle();
  assert.equal(linked.error,null);
  assert.equal(linked.data?.episode_id,work.episode);
  console.log("PASS: H2 real browser UI >8MiB two-part synthetic PCM,"+
   " actual Next finalize, 2/2 PRIVATE Storage byte SHA256, recording row");
 }finally{await page.close();}
}
