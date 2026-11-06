// Real Chromium partial upload cancellation: first Storage part stays
// PRIVATE, second request is actually cut by browser network routing.
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {sha} from "./r0-h2-browser-pcm-fixture.mjs";
import {readyWav} from "./r0-h2-browser-positive.mjs";
export async function browserInterrupt({context,base,api,anonKey,
 service,audio,work}){
 const page=await context.newPage();let session=null,blocked=0;
 try {
  page.on("response",async r=>{
   if(r.url()===base+"/api/recordings/human-upload-session"&&r.ok())
    try{session=await r.json()}catch{}
  });
  await page.route("**/storage/v1/object/upload/sign/**",async route=>{
   if(route.request().url().includes("part-0002.")){
    blocked++;await route.abort("failed");
   }else await route.continue();
  });
  const open=await page.goto(base+"/record/create/"+work.series,{
   waitUntil:"domcontentloaded",timeout:45000});
  assert.ok([200,304].includes(open?.status()));
  const button=await readyWav(page,audio);
  const aborted=page.waitForResponse(r=>
   r.url()===base+"/api/recordings/human-upload-abort"&&
   r.request().method()==="POST",{timeout:120000});
  await button.click();
  const response=await aborted;
  assert.equal(response.status(),200,"Studio abort after interrupted part");
  assert.equal(blocked,1,"actual browser aborted only second multipart PUT");
  assert.equal(session?.parts?.length,2);
  const first=await service.storage.from("human-recording-audio")
   .download(session.parts[0].objectPath);
  assert.equal(first.error,null,"first part private retained after cut");
  const bytes=Buffer.from(await first.data.arrayBuffer());
  assert.equal(bytes.length,8*1024*1024);
  assert.equal(sha(bytes),sha(audio.subarray(0,8*1024*1024)));
  const anon=createClient(api,anonKey,{auth:{persistSession:false,
   autoRefreshToken:false,detectSessionInUrl:false}});
  const token=session.parts[1];
  const retry=await anon.storage.from("human-recording-audio")
   .uploadToSignedUrl(token.objectPath,token.token,
    Buffer.from("post-abort retry"),{contentType:"audio/wav"});
  assert.ok(retry.error,"aborted signed bearer must not stage late bytes");
  const leak=await anon.storage.from("human-recording-audio")
   .download(session.parts[0].objectPath);
  assert.ok(leak.error,"first part must stay PRIVATE");
  const recording=await service.from("recordings").select("id")
   .eq("episode_id",work.episode).eq("series_id",work.series);
  assert.equal(recording.error,null);
  assert.equal(recording.data?.length,0,"partial upload never published");
  console.log("PASS: H2 real browser network cut at second signed PUT,"+
   " owned abort, 8MiB original checksum, old token denied, no public recording");
 } finally {await page.close();}
}
