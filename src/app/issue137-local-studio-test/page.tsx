// Issue #137: synthetic, local-only browser mount of the ACTUAL Human Studio.
// NEVER exposed in Preview/Production; no admin client, real works or real users.
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {RecordingStudioPage} from "@/components/recording/RecordingStudioPage";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export default async function LocalStudioTestPage(){
  const host=(await headers()).get("host")??"";
  const seriesId=process.env.B2_LOCAL_BROWSER_SERIES_ID??"";
  const episodeId=process.env.B2_LOCAL_BROWSER_EPISODE_ID??"";
  if(process.env.NODE_ENV!=="development"||
     process.env.DO_NOT_CONTACT_PRODUCTION!=="true"||
     process.env.B2_EPHEMERAL_CONFIRM!=="local-only"||
     process.env.B2_LOCAL_HUMAN_MULTIPART_MODE!=="enabled"||
     !/^127\.0\.0\.1:396\d\d$/u.test(host)||
     !UUID.test(seriesId)||!UUID.test(episodeId))notFound();
  return <RecordingStudioPage
   seriesId={seriesId} seriesTitle="LOCAL SYNTHETIC SERIES"
   permissionMode="open" worksHref="/issue137-local-studio-test"
   episodes={[{id:episodeId,episodeNumber:1,title:"合成テスト",body:"LOCAL ONLY",
     preview:"LOCAL ONLY",readHref:"/issue137-local-studio-test"}]}
   existingRecordings={[]}
   fixedReaderName=""
  />;
}
