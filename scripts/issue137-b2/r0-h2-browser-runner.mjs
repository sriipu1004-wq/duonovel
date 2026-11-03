// H2 full Chromium multipart+failure flow, ephemeral only.
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
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
 // Real signed JWT with hosted-shaped SELECT grant + owner-only RLS:
 // do not rescue the fixture with synthetic GoTrue user_metadata.
 const own=await args.owner.db.from("users")
  .select("id,display_name").eq("id",args.owner.id).single();
 assert.equal(own.error,null,"owner JWT can SELECT their own profile");
 assert.equal(own.data?.id,args.owner.id);
 assert.ok(own.data?.display_name?.trim(),"owner name must come from RLS row");
 const foreign=await args.other.db.from("users")
  .select("id,display_name").eq("id",args.owner.id);
 assert.equal(foreign.error,null,"other JWT query succeeds with zero owner rows");
 assert.equal(foreign.data?.length,0,"other JWT cannot read owner's profile");
 const anonymous=createClient(args.api,args.anonKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const denied=await anonymous.from("users").select("id").eq("id",args.owner.id);
 assert.ok(denied.error||denied.data?.length===0,
  "anonymous must never read signed-in owner's profile");
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
   otherCannotSelectOwner:true,anonymousCannotSelectOwner:true
 }));
 assert.ok([undefined,"preview-hold"].includes(process.env.R0_H1_BROWSER_PHASE));
 await browserSuccess({...args,audio,work:full});
 await browserInterrupt({...args,audio,
  work:await makeWork(args.service,args.owner.id,"CUT")});
 console.log("PASS: #137 REAL Chromium two workflows, >=4MiB and >8MiB,"+
  " two-part binary uploads and expected interruption");
}
