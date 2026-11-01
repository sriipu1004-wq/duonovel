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
