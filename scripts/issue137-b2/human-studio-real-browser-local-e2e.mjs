// Actual headless Chromium browser exercises the ACTUAL Human Studio
// component through localhost Next and isolated GoTrue/worker/PRIVATE Storage.
// This is NOT a hosted browser, Production test, or 1GiB payload benchmark.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
const sha=b=>createHash("sha256").update(b).digest("hex");
const yes=(x,label)=>assert.ok(x,label);
// Valid >4MiB synthetic PCM WAV with alternating voiced/quiet windows.
// Required to exercise the ACTUAL enabled Studio submit button, not a
// programmatic disabled-button click or an intercepted/mocked upload check.
function syntheticSpeechLikeWav(){
 const rate=48000,frames=2110000,header=44;
 const buf=Buffer.alloc(header+frames*2);
 buf.write("RIFF",0);buf.writeUInt32LE(buf.length-8,4);
 buf.write("WAVEfmt ",8);buf.writeUInt32LE(16,16);
 buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
 buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);
 buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.write("data",36);buf.writeUInt32LE(frames*2,40);
 const amps=[0,.90,.15,.80,.22,0,.85,.17,.92,.27,.70,0];
 for(let i=0;i<frames;i++){
  const amp=amps[Math.floor(i/9600)%amps.length];
  const sample=Math.round(Math.sin(2*Math.PI*(i%50)/50)*amp*25000);
  buf.writeInt16LE(sample,header+i*2);
 }
 return buf;
}
export async function runLocalStudioChromium(args){
 const {nextBase,owner,other,seriesId,episodeId,bytes,tail,
  admin,bucket,post,put}=args;
 let browser;
 const ephemeralFileDir=await mkdtemp("/tmp/libread-b2-browser-file-");
 let checks=0;
 const check=(value,label)=>{yes(value,label);checks++;};
 const issue={action:"open",seriesId,episodeId,totalBytes:bytes.length+tail.length};
 const control=await post(issue,other.session.cookie());
 check(control.status===201,"other user allowed independent local staging");
 const otherPart=await post({action:"part",sessionId:control.body.sessionId,
  index:0,expectedSha256:sha(bytes)},other.session.cookie());
 check(otherPart.status===201,"other actor allocated own part");
 const initial=await put(otherPart.body.partId,bytes,other.session.cookie());
 check(initial.status===201,"other actor persists independent PRIVATE reference");
 const otherPath="owner/"+other.uid+"/"+control.body.sessionId+"/part-0001.bin";
 const first=await admin.storage.from(bucket).download(otherPath);
 check(!first.error,"other actor physical reference exists");
 const browserConsole=[];
 try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({acceptDownloads:false,
   viewport:{width:1280,height:900}});
  const cookies=owner.session.cookie().split(/;\s*/u).filter(Boolean).map(pair=>{
   const eq=pair.indexOf("=");if(eq<1)throw Error("BAD_SSR_COOKIE");
   return {name:pair.slice(0,eq),value:pair.slice(eq+1),
    url:nextBase,httpOnly:false,secure:false,sameSite:"Lax"};
  });
  await context.addCookies(cookies);
  const page=await context.newPage();
  page.setDefaultTimeout(65000);
  page.on("pageerror",e=>browserConsole.push("pageerror:"+String(e).slice(0,120)));
  const firstPage=await page.goto(nextBase+"/issue137-local-studio-test",
   {waitUntil:"domcontentloaded",timeout:70000});
  check(firstPage?.status()===200,"ACTUAL Human Studio mounted in real browser localhost");
  const card=page.getByRole("region",{name:"ローカル分割アップロード検証"});
  await card.waitFor({state:"visible"});
  await page.locator('section[aria-label="ローカル分割アップロード検証"][data-hydrated="true"]')
   .waitFor({state:"visible",timeout:30000});
  check(await card.isVisible(),"actual Studio dev-only PRIVATE stage card rendered");
  // Real Chromium, not Node fetch: normal Human JSON route must use the
  // browser's SSR Cookie to open LOCAL PRIVATE stage without signed tokens.
  const browserNormal=await page.evaluate(async ({seriesId,episodeId,totalBytes})=>{
   const response=await fetch("/api/recordings/human-upload-session",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({seriesId,episodeId,fileName:"local-human-chromium.wav",
     mimeType:"audio/wav",totalSizeBytes:totalBytes})
   });
   return {status:response.status,body:await response.json()};
  },{seriesId,episodeId,totalBytes:bytes.length+tail.length});
  check(browserNormal.status===201&&
   browserNormal.body.uploadMode==="local-private-staging-only"&&
   !!browserNormal.body.uploadSessionId&&
   !("parts" in browserNormal.body)&&!("token" in browserNormal.body),
   "Chromium SSR Cookie reached normal Human session without bearer or public output");
  const browserEarlyFinish=await page.evaluate(async ({seriesId,episodeId,totalBytes,uploadSessionId})=>{
   const response=await fetch("/api/recordings/human-upload-finalize",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({seriesId,episodeId,episodeNumber:1,isPublic:true,
     fileName:"local-human-chromium.wav",mimeType:"audio/wav",
     totalSizeBytes:totalBytes,uploadSessionId})
   });
   return {status:response.status,body:await response.json()};
  },{seriesId,episodeId,totalBytes:bytes.length+tail.length,
    uploadSessionId:browserNormal.body.uploadSessionId});
  check(browserEarlyFinish.status===409&&
   !("recordingId" in browserEarlyFinish.body),
   "Chromium normal Human finalize cannot publish an incomplete PRIVATE session");
  const discardedNormal=await post({
   action:"abort",sessionId:browserNormal.body.uploadSessionId},
   owner.session.cookie());
  check(discardedNormal.status===200&&discardedNormal.body.deletedParts===0,
   "browser-origin normal Human empty PRIVATE session is owner-disposable");
  const noBrowserRecord=await admin.from("recordings")
   .select("id").eq("episode_id",episodeId);
  check(!noBrowserRecord.error&&noBrowserRecord.data?.length===0,
   "browser-origin normal Human API created no recording or public metadata");
  const action=card.getByRole("button",{name:"開発用PRIVATE転送を試す"});
  check(await action.isDisabled(),"cannot stage without selected file");
  const payload=Buffer.concat([bytes,tail]);
  const file=join(ephemeralFileDir,"local-human-chromium.wav");
  await writeFile(file,payload,{mode:0o600});
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await action.waitFor({state:"visible"});
  for(let i=0;i<120&&await action.isDisabled();i++)
   await page.waitForTimeout(150);
  check(await action.isEnabled(),"Studio card accepts synthetic selected file");
  let interrupted=0,uploads=0;
  await page.route("**/api/recordings/human-local-multipart",async route=>{
   if(route.request().method()==="PUT"){
    uploads++;
    if(interrupted++===0)return route.abort("failed");
   }
   await route.continue();
  });
  await action.click();
  await card.getByText(/検証停止:/u).waitFor({state:"visible",timeout:90000});
  check(uploads===1,"Chromium network abort interrupted first real PUT before storage");
  const stored=await page.evaluate(
   ({seriesId,episodeId})=>sessionStorage.getItem(
    "issue137-b2-local:"+seriesId+":"+episodeId),{seriesId,episodeId});
  const lease=JSON.parse(stored??"null");
  check(!!lease?.sessionId,"opaque lease persisted in sessionStorage across reload");
  const firstPath="owner/"+owner.uid+"/"+lease.sessionId+"/part-0001.bin";
  const firstAbort=await admin.storage.from(bucket).download(firstPath);
  check(!!firstAbort.error,"network abort before upload leaves zero PRIVATE bytes");
  await page.unrouteAll({behavior:"wait"});
  await page.reload({waitUntil:"domcontentloaded",timeout:70000});
  const againCard=page.getByRole("region",{name:"ローカル分割アップロード検証"});
  await page.locator('section[aria-label="ローカル分割アップロード検証"][data-hydrated="true"]')
   .waitFor({state:"visible",timeout:30000});
  await page.locator('input[type="file"]').first().setInputFiles(file);
  const retry=againCard.getByRole("button",{name:"開発用PRIVATE転送を試す"});
  for(let i=0;i<120&&await retry.isDisabled();i++)await page.waitForTimeout(150);
  check(await retry.isEnabled(),
   "hydrated Studio accepted same file selection after reload");
  await retry.click();
  await againCard.getByText("検証用PRIVATE分割保存完了。朗読は未投稿・未公開。")
   .waitFor({state:"visible",timeout:90000});
  check(true,"real Chromium reload + same file retries persisted session");
  const afterStored=await page.evaluate(
   ({seriesId,episodeId})=>sessionStorage.getItem(
    "issue137-b2-local:"+seriesId+":"+episodeId),{seriesId,episodeId});
  check(JSON.parse(afterStored??"null")?.sessionId===lease.sessionId,
   "browser reload must reuse same authenticated durable session");
  const p0=await admin.storage.from(bucket).download(firstPath);
  const p1=await admin.storage.from(bucket).download(
   "owner/"+owner.uid+"/"+lease.sessionId+"/part-0002.bin");
  check(!p0.error&&!p1.error&&
   sha(Buffer.from(await p0.data.arrayBuffer()))===sha(bytes)&&
   sha(Buffer.from(await p1.data.arrayBuffer()))===sha(tail),
   "real browser staged both PRIVATE parts with correct physical SHA");
  const row=await admin.from("recordings").select("id").eq("episode_id",episodeId);
  check(!row.error&&row.data?.length===0,
   "real Studio browser action never inserted/publicized a recording");
  const cross=await post({action:"abort",sessionId:lease.sessionId},
   other.session.cookie());
  check(cross.status===403,"other valid user cannot abort owner PRIVATE parts");
  const ownerBefore=await admin.storage.from(bucket).download(firstPath);
  check(!ownerBefore.error,"cross-owner abort did not affect owner bytes");
  const discard=againCard.getByRole("button",{name:"PRIVATE検証パートを破棄"});
  await discard.click();
  await againCard.getByText(/物理確認して破棄した/u)
   .waitFor({state:"visible",timeout:40000});
  check(true,"actual Chromium clicked explicit PRIVATE cleanup");
  const removed=await admin.storage.from(bucket).download(firstPath);
  check(!!removed.error,"owner abort physically removed first PRIVATE part");
  const second=await admin.storage.from(bucket).download(
   "owner/"+owner.uid+"/"+lease.sessionId+"/part-0002.bin");
  check(!!second.error,"owner abort physically removed second PRIVATE part");
  const otherStill=await admin.storage.from(bucket).download(otherPath);
  check(!otherStill.error&&sha(Buffer.from(await otherStill.data.arrayBuffer()))===sha(bytes),
   "owner abort preserved another user's PRIVATE 8MiB bytes");
  const forbidden=await post({action:"part",sessionId:lease.sessionId,index:0,
   expectedSha256:sha(bytes)},owner.session.cookie());
  check(forbidden.status===409,"aborted session cannot allocate or restore media");
  const noPublic=await fetch(nextBase+"/api/recordings/human-local-multipart",
   {method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify(issue),redirect:"error"});
  check(noPublic.status===401,"no SSR cookie cannot open stage through browser route");
  // A genuine enabled Studio publish button must use the NORMAL
  // signer -> bounded LOCAL PRIVATE staging -> NORMAL finalize 409 refusal
  // -> owner-only cleanup. It must never use signed Storage bearer,
  // one-shot human-publish, or public/recording mutation.
  // Unlike the older probe, this uses valid PCM with a client-side
  // "passed" result, not direct page.evaluate/faked precheck state.
  const speechWav=syntheticSpeechLikeWav();
  check(speechWav.length>4*1024*1024&&speechWav.length<8*1024*1024,
   "actual Studio safety test uses a valid >4MiB local synthetic WAV");
  const speechPath=join(ephemeralFileDir,"local-human-publish-guard.wav");
  await writeFile(speechPath,speechWav,{mode:0o600});
  // This measures the ACTUAL Studio client upload precheck, including
  // file.arrayBuffer(), WebAudio decodeAudioData() and mono/RMS analysis.
  // JS heap snapshots do NOT include all native AudioBuffer allocations.
  const preflightBefore=await page.evaluate(()=>({
   at:performance.now(),
   usedJsHeapBytes:typeof performance.memory?.usedJSHeapSize==="number"?
    performance.memory.usedJSHeapSize:null,
  }));
  await page.locator('input[type="file"]').first().setInputFiles(speechPath);
  const realSubmit=page.getByRole("button",{name:"保存して作品へ接続"});
  let enabled=false;
  for(let i=0;i<120;i++){
   if(await realSubmit.isEnabled()){enabled=true;break;}
   await page.waitForTimeout(250);
  }
  check(enabled,"actual Studio client audio preflight enabled normal publish button");
  const preflightAfter=await page.evaluate(()=>({
   at:performance.now(),
   usedJsHeapBytes:typeof performance.memory?.usedJSHeapSize==="number"?
    performance.memory.usedJSHeapSize:null,
  }));
  const preflightWallMs=preflightAfter.at-preflightBefore.at;
  check(preflightWallMs>=0&&Number.isFinite(preflightWallMs),
   "real Chromium Studio WebAudio preflight wall timing is finite");
  console.log("LOCAL_REAL_CHROMIUM_WEBAUDIO_PREFLIGHT "+
   JSON.stringify({
    actualStudioCode:true,validSyntheticMonoPcmWav:true,
    sourceBytes:speechWav.length,sourceDurationSeconds:2110000/48000,
    wallMs:Math.round(preflightWallMs),
    usedJsHeapBeforeMiB:preflightBefore.usedJsHeapBytes===null?null:
     Math.round(preflightBefore.usedJsHeapBytes/(1024*1024)),
    usedJsHeapAfterMiB:preflightAfter.usedJsHeapBytes===null?null:
     Math.round(preflightAfter.usedJsHeapBytes/(1024*1024)),
    notPeakRss:true,nativeAudioBufferMemoryUnmeasured:true,
    benchmarkSafeCapSelected:false,
   }));
  const paths=[],localActions=[];
  const track=request=>{
   const u=new URL(request.url());
   if(u.pathname.startsWith("/api/recordings/")){
    paths.push(request.method()+" "+u.pathname);
    if(u.pathname==="/api/recordings/human-local-multipart"&&
     request.method()==="POST"){
     const action=request.postDataJSON()?.action;
     if(typeof action==="string")localActions.push(action);
    }
   }
  };
  page.on("request",track);
  const responsePromise=page.waitForResponse(response=>
   new URL(response.url()).pathname==="/api/recordings/human-upload-session"&&
   response.request().method()==="POST",{timeout:30000});
  const finalizePromise=page.waitForResponse(response=>
   new URL(response.url()).pathname==="/api/recordings/human-upload-finalize"&&
   response.request().method()==="POST",{timeout:90000});
  await realSubmit.click();
  const guardedResponse=await responsePromise;
  const sessionReply=await guardedResponse.json();
  check(guardedResponse.status()===201&&sessionReply.ok===true&&
   sessionReply.uploadMode==="local-private-staging-only"&&
   sessionReply.partCount===1&&
   sessionReply.reason==="NO_SIGNED_URL_NO_PUBLICATION"&&
   typeof sessionReply.uploadSessionId==="string"&&
   !("parts" in sessionReply)&&!("token" in sessionReply)&&
   !("bucketName" in sessionReply),
   "enabled Studio button received local-only signer receipt, no signed bearer");
  const refusedFinalize=await finalizePromise;
  const finalizeBody=await refusedFinalize.json();
  check(refusedFinalize.status()===409&&finalizeBody.ok===false&&
   finalizeBody.reason==="PRIVATE_PARTS_SEALED_NOT_PUBLISHED"&&
   !("recordingId" in finalizeBody),
   "normal Human finalize rejects publishing fully staged PRIVATE bytes");
  await page.getByText(
   "開発用PRIVATE分割転送とfinalize公開拒否を確認し、検証パートを破棄した。朗読は未投稿・未公開。"
  ).waitFor({state:"visible",timeout:60000});
  check(!paths.some(x=>/\/human-publish(?:$|\/)/u.test(x)),
   "actual Studio never falls back to one-shot PUBLIC Human publisher");
  check(paths.filter(x=>x==="POST /api/recordings/human-upload-session").length===1&&
   paths.filter(x=>x==="POST /api/recordings/human-upload-finalize").length===1&&
   paths.some(x=>x==="PUT /api/recordings/human-local-multipart")&&
   localActions.filter(x=>x==="part").length===1&&
   localActions.includes("status")&&localActions.includes("abort")&&
   !localActions.includes("open")&&!localActions.includes("finish"),
   "normal Studio reuses signer ticket, verifies raw PRIVATE PUT, does not pre-finish; normal finalize seals once");
  page.off("request",track);
  const normalPath="owner/"+owner.uid+"/"+sessionReply.uploadSessionId+
   "/part-0001.bin";
  const afterNormalCleanup=await admin.storage.from(bucket).download(normalPath);
  check(!!afterNormalCleanup.error,
   "actual normal Studio staged full >4MiB and owner abort left no PRIVATE object");
  const deadTicket=await admin.from("issue137_http_local_multipart_sessions")
   .select("state").eq("id",sessionReply.uploadSessionId).single();
  check(!deadTicket.error&&deadTicket.data.state==="HOLD",
   "normal session cannot resume after studio trial cleanup");
  // NEGATIVE 1 (LOCAL interception only): an unexpected HTTP 200 with a
  // forged recordingId is NOT authority to publish. The studio must issue
  // an owner-scoped cleanup after receiving this false positive.
  let forgedSuccessReplies=0;
  await page.route("**/api/recordings/human-upload-finalize",async route=>{
   forgedSuccessReplies++;
   await route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({ok:true,
     recordingId:"00000000-0000-4000-8000-000000000001"})});
  });
  const forgedTicketPromise=page.waitForResponse(response=>
   new URL(response.url()).pathname==="/api/recordings/human-upload-session"&&
   response.request().method()==="POST",{timeout:45000});
  check(await realSubmit.isEnabled(),"same Studio upload file remains actionable");
  await realSubmit.click();
  const forgedTicketReply=await (await forgedTicketPromise).json();
  check(forgedTicketReply.uploadMode==="local-private-staging-only"&&
   typeof forgedTicketReply.uploadSessionId==="string",
   "forged-finalize negative created an original LOCAL-only ticket");
  await page.getByRole("heading",{name:"LOCAL_FINALIZE_PUBLICATION_UNPROVEN_HOLD"})
   .waitFor({state:"visible",timeout:90000});
  check(forgedSuccessReplies===1,
   "forged HTTP 200 was rejected without a second finalize or PUBLIC fallback");
  const fakeSuccessPath="owner/"+owner.uid+"/"+
   forgedTicketReply.uploadSessionId+"/part-0001.bin";
  const fakeSuccessAbsent=await admin.storage.from(bucket).download(fakeSuccessPath);
  check(!!fakeSuccessAbsent.error,
   "unexpected 200 still triggers owner-only PRIVATE byte cleanup");
  const fakeSuccessRow=await admin.from("issue137_http_local_multipart_sessions")
   .select("state").eq("id",forgedTicketReply.uploadSessionId).single();
  check(!fakeSuccessRow.error&&fakeSuccessRow.data.state==="HOLD",
   "forged success cannot leave a LIVE staging ticket");
  await page.unroute("**/api/recordings/human-upload-finalize");
  // The expected LOCAL failure calls console.error, which triggers Next's
  // development error overlay. Dismiss that dev-only overlay to exercise
  // the next genuine Studio click; production/error code remains unchanged.
  await page.keyboard.press("Escape");

  // NEGATIVE 2: report cleanup as UNPROVEN when owner abort is unavailable.
  // This test will explicitly delete its OWN fixture via a live owner request
  // afterwards. No privileged fallback or other user's bytes are touched.
  let blockedOwnerAbort=0;
  await page.route("**/api/recordings/human-local-multipart",async route=>{
   if(route.request().method()==="POST"&&
      route.request().postDataJSON()?.action==="abort"){
    blockedOwnerAbort++;
    return route.fulfill({status:503,contentType:"application/json",
     body:JSON.stringify({ok:false,error:"SYNTHETIC_ABORT_UNAVAILABLE"})});
   }
   await route.continue();
  });
  const blockedTicketPromise=page.waitForResponse(response=>
   new URL(response.url()).pathname==="/api/recordings/human-upload-session"&&
   response.request().method()==="POST",{timeout:45000});
  check(await realSubmit.isEnabled(),"normal Studio can run isolated cleanup failure negative");
  await realSubmit.click();
  const blockedReply=await (await blockedTicketPromise).json();
  check(blockedReply.uploadMode==="local-private-staging-only"&&
   typeof blockedReply.uploadSessionId==="string",
   "cleanup-failure negative had a distinct original LOCAL ticket");
  await page.getByRole("heading",{name:"LOCAL_PRIVATE_CLEANUP_UNPROVEN_HOLD"})
   .waitFor({state:"visible",timeout:90000});
  check(blockedOwnerAbort===1,
   "studio attempted exactly one owner abort and refused to claim cleanup");
  const heldPath="owner/"+owner.uid+"/"+blockedReply.uploadSessionId+
   "/part-0001.bin";
  const heldBytes=await admin.storage.from(bucket).download(heldPath);
  check(!heldBytes.error&&
   sha(Buffer.from(await heldBytes.data.arrayBuffer()))===sha(speechWav),
   "blocked cleanup preserves exact PRIVATE bytes and reports HOLD, not success");
  const heldBeforeManual=await admin.from("issue137_http_local_multipart_sessions")
   .select("state").eq("id",blockedReply.uploadSessionId).single();
  check(!heldBeforeManual.error&&heldBeforeManual.data.state==="SEALED_PARTS",
   "abort injection left durable LOCAL receipt awaiting explicit cleanup");
  await page.unroute("**/api/recordings/human-local-multipart");
  const manualOwnerAbort=await post({
   action:"abort",sessionId:blockedReply.uploadSessionId},owner.session.cookie());
  check(manualOwnerAbort.status===200,
   "real original owner may explicitly dispose its test-only held ticket");
  const afterManual=await admin.storage.from(bucket).download(heldPath);
  check(!!afterManual.error,"owner manual recovery physically removes held PRIVATE bytes");
  const otherProtected=await admin.storage.from(bucket).download(otherPath);
  check(!otherProtected.error&&
   sha(Buffer.from(await otherProtected.data.arrayBuffer()))===sha(bytes),
   "cleanup failure tests never delete foreign owner's PRIVATE media");
  const noSubmitRecording=await admin.from("recordings")
   .select("id").eq("episode_id",episodeId);
  check(!noSubmitRecording.error&&noSubmitRecording.data?.length===0,
   "real Studio positive and two negative trials create zero Human recording metadata");

  // A file exactly 1B above the LOCAL experimental threshold is rejected
  // BEFORE the browser's eager arrayBuffer()+decodeAudioData preflight.
  // Do not issue any signer/finalize/PRIVATE request for this file.
  const oversizedPath=join(ephemeralFileDir,"local-human-oversized.wav");
  const oversizedBytes=Buffer.alloc(bytes.length+tail.length+1);
  speechWav.copy(oversizedBytes);
  oversizedBytes.writeUInt32LE(oversizedBytes.length-8,4);
  oversizedBytes.writeUInt32LE(oversizedBytes.length-44,40);
  await writeFile(oversizedPath,oversizedBytes,{mode:0o600});
  let unexpectedNormalPosts=0;
  const preventNetwork=request=>{
   if(["/api/recordings/human-upload-session",
       "/api/recordings/human-upload-finalize",
       "/api/recordings/human-publish"].includes(
        new URL(request.url()).pathname)&&request.method()==="POST")
    unexpectedNormalPosts++;
  };
  page.on("request",preventNetwork);
  await page.locator('input[type="file"]').first().setInputFiles(oversizedPath);
  await page.getByText("LOCAL_DRAFT_PROCESSING_CAP_HOLD").first()
   .waitFor({state:"visible",timeout:30000});
  check(await realSubmit.isDisabled()&&unexpectedNormalPosts===0,
   "normal Studio rejects +1B trial before decoding or any Human POST");
  page.off("request",preventNetwork);
  const afterOversizedRows=await admin.from("recordings")
   .select("id").eq("episode_id",episodeId);
  check(!afterOversizedRows.error&&afterOversizedRows.data?.length===0,
   "over-budget Human trial creates no recording row or publication");

  check(browserConsole.length===0,
   "no uncaught page errors during actual Chromium Studio flow");
  console.log("PASS: F2-P REAL CHROMIUM Human Studio "+checks+
   " browser controls; interrupt/reload/reselect/resume, owner-only verified "+
   "PRIVATE cleanup, foreign bytes preserved, no recordings/publish");
 }finally{
  await browser?.close();
  await rm(ephemeralFileDir,{recursive:true,force:true});
}
}
