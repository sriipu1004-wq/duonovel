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
 // The disposable R0 candidate deliberately denies authenticated SELECT
 // on users.display_name (42501). The real Studio supports the independent
 // GoTrue user_metadata display_name fallback. Populate ONLY this synthetic
 // local account; do not loosen RLS or impersonate a production narrator.
 const updated=await args.service.auth.admin.updateUserById(args.owner.id,{
  user_metadata:{display_name:"H2 SYNTHETIC LOCAL NARRATOR"}
 });
 assert.equal(updated.error,null,"local GoTrue test narrator metadata");
 assert.equal(updated.data?.user?.user_metadata?.display_name,
  "H2 SYNTHETIC LOCAL NARRATOR");
 const audio=makeWav();
 const full=await makeWork(args.service,args.owner.id,"FULL");
 // Test fixture MUST be visible through the same signed-in owner RLS client
 // that the real Studio page uses. Never bypass a failed RLS condition.
 const episodeRows=await args.owner.db.from("episodes")
  .select("id,posting_status,is_published").eq("series_id",full.series);
 const author=await args.owner.db.from("users")
  .select("display_name").eq("id",args.owner.id).maybeSingle();
 console.log("EVIDENCE_H2_STUDIO_PREFLIGHT:"+JSON.stringify({
   ownerEpisodeError:episodeRows.error?.code??null,
   ownerEpisodeCount:episodeRows.data?.length??null,
   ownerEpisodePosted:episodeRows.data?.[0]?.posting_status??null,
   ownerReaderNamePresent:Boolean(author.data?.display_name?.trim()),
   ownerReaderNameError:author.error?.code??null,
   syntheticGoTrueDisplayNamePresent:Boolean(
    updated.data?.user?.user_metadata?.display_name?.trim())
 }));
 await browserSuccess({...args,audio,work:full});
 await browserInterrupt({...args,audio,
  work:await makeWork(args.service,args.owner.id,"CUT")});
 console.log("PASS: #137 REAL Chromium two workflows, >=4MiB and >8MiB,"+
  " two-part binary uploads and expected interruption");
}
