// H2 full Chromium multipart+failure flow, ephemeral only.
import assert from "node:assert/strict";
import {makeWav,makeWork} from "./r0-h2-browser-pcm-fixture.mjs";
import {browserSuccess} from "./r0-h2-browser-positive.mjs";
import {browserInterrupt} from "./r0-h2-browser-interrupt.mjs";
export async function runH2BrowserMultipart(args){
 assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
 assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
 assert.ok(args.base.startsWith("http://127.0.0.1:"));
 assert.equal(args.api,"http://127.0.0.1:54321");
 const accepted=await args.service.from("user_recording_consents").insert({
  user_id:args.owner.id,consent_key:"recording_studio_global",
  consent_version:"2026-04-16"
 });
 assert.equal(accepted.error,null,"local owner consent fixture");
 const audio=makeWav();
 await browserSuccess({...args,audio,
  work:await makeWork(args.service,args.owner.id,"FULL")});
 await browserInterrupt({...args,audio,
  work:await makeWork(args.service,args.owner.id,"CUT")});
 console.log("PASS: #137 REAL Chromium two workflows, >=4MiB and >8MiB,"+
  " two-part binary uploads and expected interruption");
}
