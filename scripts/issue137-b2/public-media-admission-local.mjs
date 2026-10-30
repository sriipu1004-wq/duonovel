// ISSUE #137 F2-P isolated DESIGN CONTRACT, not an application authorization function.
// All evidence is synthetic. This function is NOT wired into runtime or migrations.
// A real publisher must independently authenticate and cryptographically bind evidence.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";

const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function magic(bytes){
 const b=Buffer.from(bytes);
 if(b.length>=12&&b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WAVE")return "wav";
 if(b.length>=4&&b.toString("ascii",0,4)==="fLaC")return "flac";
 if(b.length>=4&&b.toString("ascii",0,4)==="OggS")return "ogg";
 if(b.length>=3&&b.toString("ascii",0,3)==="ID3")return "mp3-id3";
 if(b.length>=2&&b[0]===255&&(b[1]&224)===224)return "mpeg-frame";
 if(b.length>=8&&b.toString("ascii",4,8)==="ftyp")return "iso-media";
 if(b.length>=4&&b.subarray(0,4).equals(Buffer.from([26,69,223,163])))return "ebml-media";
 return null;
}
function decide({publicDestination,origin,bytes,claimMime,claimPath,attestation}){
 if(!Buffer.isBuffer(bytes))throw Error("synthetic bytes required");
 const detected=magic(bytes);
 if(!publicDestination)return {status:"STAGE_PRIVATE",detected};
 if(origin!=="trusted-server-release")return {status:"HOLD_DIRECT_PUBLIC",detected};
 // NOTE: attestation fields here are fixture booleans, NOT proof of signature.
 // Runtime must verify issuer, expiry, replay, digest, rights and byte decoding.
 if(!attestation||attestation.serverVerified!==true||
    attestation.sha256!==hash(bytes)||attestation.licenseApproved!==true||
    attestation.privacyReviewed!==true||attestation.reachableReferencesChecked!==true)
   return {status:"HOLD_UNVERIFIED",detected};
 if(attestation.r18===true||attestation.humanConsentMissing===true||
    attestation.rightsWithdrawn===true)return {status:"HOLD_ENTITLEMENT",detected};
 if(detected&&!attestation.decoderVerified)return {status:"HOLD_MEDIA_CONTENT",detected};
 if(!detected&&!attestation.decoderVerified)return {status:"HOLD_UNKNOWN_BYTES",detected};
 // The test-only positive branch means a complete trusted, independently
 // verified release token IN THE MODEL, never permission to public-upload.
 return {status:"MODEL_RELEASE_ELIGIBLE_NOT_AUTHORIZED",detected};
}
const wav=Buffer.alloc(48);wav.write("RIFF",0);wav.write("WAVE",8);
const flac=Buffer.from("fLaC"+ "SYNTHETIC");const ogg=Buffer.from("OggS"+ "SYNTHETIC");
const mp3=Buffer.from("ID3"+ "SYNTHETIC");const mp4=Buffer.from("....ftypisom");
const webm=Buffer.concat([Buffer.from([26,69,223,163]),Buffer.from("SYNTHETIC")]);
const unknown=Buffer.from("SYNTHETIC TEXT");
const full={
 serverVerified:true,sha256:hash(wav),licenseApproved:true,
 privacyReviewed:true,reachableReferencesChecked:true,
 r18:false,humanConsentMissing:false,rightsWithdrawn:false,decoderVerified:true
};
let checks=0;
function expect(value,status,detected){
 const result=decide(value);
 assert.equal(result.status,status);
 if(detected!==undefined)assert.equal(result.detected,detected);
 checks++;
}
for(const [label,bytes,seen] of [
 ["wav",wav,"wav"],["flac",flac,"flac"],["ogg",ogg,"ogg"],
 ["mp3",mp3,"mp3-id3"],["mp4",mp4,"iso-media"],["webm",webm,"ebml-media"]
]){
 expect({publicDestination:true,origin:"s3-direct",bytes,claimMime:"text/plain",claimPath:"misc/"+label+".txt"},
  "HOLD_DIRECT_PUBLIC",seen);
}
expect({publicDestination:true,origin:"s3-direct",bytes:unknown,claimMime:"image/png",claimPath:"misc/opaque.bin"},
 "HOLD_DIRECT_PUBLIC",null);
expect({publicDestination:false,origin:"s3-direct",bytes:wav,claimMime:"text/plain",claimPath:"unknown.txt"},
 "STAGE_PRIVATE","wav");
expect({publicDestination:true,origin:"trusted-server-release",bytes:wav,attestation:{...full,sha256:hash(unknown)}},
 "HOLD_UNVERIFIED","wav");
expect({publicDestination:true,origin:"trusted-server-release",bytes:wav,attestation:{...full,r18:true}},
 "HOLD_ENTITLEMENT","wav");
expect({publicDestination:true,origin:"trusted-server-release",bytes:wav,attestation:{...full,humanConsentMissing:true}},
 "HOLD_ENTITLEMENT","wav");
expect({publicDestination:true,origin:"trusted-server-release",bytes:wav,attestation:{...full,rightsWithdrawn:true}},
 "HOLD_ENTITLEMENT","wav");
expect({publicDestination:true,origin:"trusted-server-release",bytes:wav,attestation:{...full,decoderVerified:false}},
 "HOLD_MEDIA_CONTENT","wav");
expect({publicDestination:true,origin:"trusted-server-release",bytes:unknown,attestation:{...full,sha256:hash(unknown),decoderVerified:false}},
 "HOLD_UNKNOWN_BYTES",null);
expect({publicDestination:true,origin:"trusted-server-release",bytes:wav,attestation:full},
 "MODEL_RELEASE_ELIGIBLE_NOT_AUTHORIZED","wav");
console.log("PASS: F2-P "+checks+" synthetic fail-closed prepublication design contract cases (MODEL ONLY; no runtime/publication)");
