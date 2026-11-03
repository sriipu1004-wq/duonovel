// Browser-driven real multipart upload: 8MiB+ decodable synthetic PCM,
// NOT a real human narration, likeness, or ownership evidence.
import assert from "node:assert/strict";
import {sha} from "./r0-h2-browser-pcm-fixture.mjs";
export async function readyWav(page,audio){
 const file=page.locator("[data-recording-studio] input[type=file]");
 await file.waitFor({state:"attached",timeout:45000});
 await file.setInputFiles({name:"h2-synthetic-8mib.wav",
  mimeType:"audio/wav",buffer:audio});
 try {
  await page.waitForFunction(()=>
   [...document.querySelectorAll("button")].some(b=>
    b.textContent?.includes("保存して作品へ接続")&&!b.disabled),
   null,{timeout:24000});
 } catch {
  const snapshot=await page.locator("[data-recording-studio]").innerText();
  const visible=snapshot.split("\n").filter(x=>
   /判定|保存|検査|朗読|音|声|無音|停止|失敗|エラー|ファイル|MB/u.test(x))
   .slice(0,42).map(x=>x.slice(0,110));
  const b=page.getByRole("button",{name:"保存して作品へ接続"});
  const pageText=await page.locator("[data-recording-studio]").innerText();
  const meta={path:new URL(page.url()).pathname,
   disabled:await b.isDisabled(),
   episodeCount:await page.locator("[data-recording-studio] section:first-child button").count(),
   selectedEpisodeLabel:pageText.match(/接続先:[^\n]*/u)?.[0]??null,
   titleOrMissing:pageText.includes("制作対象の話を選ぶと、ここにプレビューが表示される。"),
   visible};
  throw Error("H2_REAL_BROWSER_NOT_READY_DIAGNOSTIC:"+JSON.stringify(meta));
 }
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
  // The FIRST disposable local stack deliberately installs B2 + H2 but
  // NOT H1; the runner tests the B2/H1/H2 forward migration in its SECOND
  // isolated stack. Thus a real 2-part upload can reach finalize, but H1
  // recording revision MUST fail closed without publishing any row. This
  // does NOT validate final normalization, paid ASR or publication.
  assert.equal(reply.status(),500,
   "finalize must fail closed without approved ASR, HTTP "+reply.status());
  assert.equal(body.ok,false);
  const h1Enabled=process.env.R0_H1_BROWSER_PHASE==="preview-hold";
  if(h1Enabled){
   assert.equal(body.error,"F2P_PREVIEW_PUBLIC_MEDIA_HOLD",
    "installed H1 must advance to explicit pre-ASR media-write HOLD");
  }else{
   assert.ok(typeof body.error==="string" &&
     body.error.startsWith("human_atomic_revision_unavailable:") &&
     body.error.includes("issue137_h1_human_revision"),
     "without H1, the exact missing-RPC safety gate must block publication");
  }
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
  const linked=await service.from("recordings").select("id")
   .eq("series_id",work.series).eq("episode_id",work.episode);
  assert.equal(linked.error,null);
  assert.equal(linked.data?.length,0,"no transcription means no Human publication");
  console.log("PASS: H2 real Chromium >8MiB 2-part signed PUT, 2/2 PRIVATE SHA256; "+
   (h1Enabled?"H1 installed, explicit F2P pre-ASR hold":"missing H1 RPC fail-closed")+
   "; zero Human recording rows");
  console.log("HOLD: no paid ASR, transcription, alignment or publication;"+
   " local fixtures cannot prove hosted rights/old Public URL revocation");
 }finally{await page.close();}
}
