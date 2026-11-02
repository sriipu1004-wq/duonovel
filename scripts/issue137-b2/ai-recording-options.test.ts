import assert from "node:assert/strict";
import { listProtectedAiRecordings } from "../../src/lib/recording/protectedAiRecordingOptions";
import { isPublishedHumanRecording } from "../../src/lib/recording/humanRecordingState";
import { buildHumanRecordingPlaybackHref } from "../../src/lib/recording/humanRecordingStorage";
import { projectReaderEpisodeRecordings } from "../../src/lib/recording/readerEpisodeRecordingProjection";
import { readFileSync } from "node:fs";
const seriesEpisode = "00000000-0000-4000-8000-000000000011";
const idA = "00000000-0000-4000-8000-000000000012";
const idB = "00000000-0000-4000-8000-000000000013";
const idHuman = "00000000-0000-4000-8000-000000000014";
const ai = {id:idA,episode_id:seriesEpisode,is_public:true,reader_name:"Nemo",audio_storage_path:"r18-private:nemo/s/e.wav"};
const human = {id:idHuman,episode_id:seriesEpisode,is_public:true,reader_name:"Human",reader_id:idHuman,audio_storage_path:"human/series/episode/reader/playback.m4a"};
async function main(){
 const rows=[
  ai,
  {...ai,id:idB,reader_name:"Aivis",voice_model_id:"voice"},
  human,
  {...ai,id:"not-a-uuid"},
  {...ai,episode_id:"bad-episode"},
  {...ai,id:"00000000-0000-4000-8000-000000000099",is_public:false},
  {...ai,id:"00000000-0000-4000-8000-000000000098",audio_storage_path:"https://example.invalid/public.wav"},
 ];
 const aiOptions=listProtectedAiRecordings(rows,new Set([seriesEpisode]));
 assert.equal(aiOptions.length,2,"AI private rows must not be discarded by Human-only provenance filter");
 assert.deepEqual(aiOptions.map(x=>x.recordingId),[idA,idB]);
 assert.equal(aiOptions[0].audioUrl,"/api/recordings/ai-audio/"+idA);
 assert.equal(aiOptions[1].name,"Aivis");
 assert.equal(listProtectedAiRecordings(rows,new Set(["00000000-0000-4000-8000-000000000099"])).length,0);
 assert.equal(listProtectedAiRecordings(rows.filter(isPublishedHumanRecording)).length,0,"Human-only filter loses AI rows");
 assert.ok(!isPublishedHumanRecording(ai),"AI must not enter Human pipeline");
 assert.ok(isPublishedHumanRecording({...human,audio_storage_path:"https://example.invalid/storage/v1/object/public/recording-audio/human/s/e.wav"}));
 assert.notEqual(buildHumanRecordingPlaybackHref(idHuman),aiOptions[0].audioUrl,"Human and AI routes differ");
 assert.equal(listProtectedAiRecordings([{...ai,audio_storage_path:"r18-private:"}]).length,0);
 // Actual Reader producer projection must preserve only an eligible
 // private AI row and a Human row with the separate Human proxy.
 const projected = projectReaderEpisodeRecordings(rows, seriesEpisode);
 assert.equal(projected.length,3,"Reader must receive 2 AI plus 1 Human recording");
 assert.deepEqual(projected.map(x=>x.id),[idA,idB,idHuman]);
 assert.equal(projected[0].audio_storage_path,ai.audio_storage_path,
   "server-only AI marker preserved for authorized ID projection");
 assert.equal(projected[2].audio_storage_path,
   buildHumanRecordingPlaybackHref(idHuman),"Human still uses Human proxy");
 assert.deepEqual(listProtectedAiRecordings(projected,new Set([seriesEpisode]))
   .map(x=>x.recordingId),[idA,idB],"Reader can now build AI options from producer result");
 const producer = readFileSync("src/lib/publicRead.ts","utf8");
 const readerFetch = producer.split("async function fetchPublicRecordings(")[1]
   ?.split("type ReaderViewerState")[0] ?? "";
 assert.ok(readerFetch.includes("return projectReaderEpisodeRecordings("),
   "Reader producer MUST delegate to the tested projector");
 assert.ok(!readerFetch.includes(".filter(isPublishedHumanRecording)"),
   "Human-only upstream filter would silently drop AI before Reader UI");
 assert.ok(producer.includes("allEpisodeRecordings: r18Blocked") &&
           producer.includes("? []"),
   "Blocked R18 viewer must receive no recording payload");
 console.log("PASS: 7 F3 Reader producer-to-UI contract assertions");
 console.log("PASS: 9 F3 AI/Human provenance, Work/Reader option and private playback URL assertions");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
