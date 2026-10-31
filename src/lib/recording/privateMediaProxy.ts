import "server-only";
import { NextResponse } from "next/server";
import { PRIVATE_AI_AUDIO_BUCKET } from "@/lib/recording/protectedAiRecordingStorage";
import { getHumanRecordingAudioBucketName } from "@/lib/recording/humanRecordingStorage";
/**
 * Only invoke AFTER verifying the requesting viewer can access the recording.
 * Do not issue reusable signed URLs or cache bytes across user sessions.
 */
export async function streamAuthorizedPrivateRecording(
  request: Request,
  bucket: string,
  objectPath: string
): Promise<NextResponse> {
  if (![PRIVATE_AI_AUDIO_BUCKET,getHumanRecordingAudioBucketName()].includes(bucket) ||
      !objectPath || objectPath.includes("..") || /[?#]/u.test(objectPath)) {
    return new NextResponse(null,{status:404});
  }
  const range=request.headers.get("range");
  if(range && !/^bytes=(?:\d+-\d*|-\d+)$/u.test(range))
    return new NextResponse(null,{status:416});
  const endpoint=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!endpoint || !key) return new NextResponse(null,{status:503});
  const path=objectPath.split("/").map(encodeURIComponent).join("/");
  let upstream:Response;
  try{
    upstream=await fetch(`${endpoint}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${path}`,{
      headers:{apikey:key,Authorization:`Bearer ${key}`,...(range?{Range:range}:{})},
      cache:"no-store",
      signal:AbortSignal.timeout(15000),
    });
  }catch{return new NextResponse(null,{status:503});}
  if(!upstream.ok || !upstream.body)
    return new NextResponse(null,{status:upstream.status===416?416:404});
  const headers=new Headers({
    "Cache-Control":"private, no-store, max-age=0",
    "X-Content-Type-Options":"nosniff",
    "Vary":"Cookie",
    "Content-Type":upstream.headers.get("content-type")??"application/octet-stream",
  });
  for(const name of ["content-range","content-length","accept-ranges"]){
    const value=upstream.headers.get(name);if(value)headers.set(name,value);
  }
  return new NextResponse(upstream.body,{status:upstream.status===206?206:200,headers});
}
