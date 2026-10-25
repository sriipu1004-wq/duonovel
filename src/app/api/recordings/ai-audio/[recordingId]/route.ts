import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isR18Series } from "@/lib/contentRating";
import { parsePrivateAiAudioReference, PRIVATE_AI_AUDIO_BUCKET } from "@/lib/recording/protectedAiRecordingStorage";
import { isUuid } from "@/lib/uuid";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Proxy private audio, including Range requests. Never hand out bearer URLs.
 * Every request rechecks publication and preferences; no shared response cache. */
export async function GET(request: Request, context: { params: Promise<{ recordingId: string }> }) {
  const { recordingId } = await context.params;
  if (!isUuid(recordingId)) return new NextResponse(null, { status: 404 });
  const range = request.headers.get("range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/u.test(range)) return new NextResponse(null,{status:416});
  const admin = createAdminClient();
  const {data: recording, error} = await admin.from("recordings").select("*").eq("id",recordingId).maybeSingle();
  if (error || !recording || recording.is_public !== true) return new NextResponse(null,{status:404});
  const objectPath = parsePrivateAiAudioReference(recording.audio_storage_path);
  if (!objectPath || !recording.series_id || !recording.episode_id) return new NextResponse(null,{status:404});
  const [sq,eq]=await Promise.all([
    admin.from("series").select("id,publication_status,content_rating,content_warnings").eq("id",recording.series_id).maybeSingle(),
    admin.from("episodes").select("id,series_id,posting_status,is_published").eq("id",recording.episode_id).maybeSingle(),
  ]);
  const s=sq.data,e=eq.data;
  if(sq.error || eq.error || !s || !e || s.publication_status!=="public" ||
     e.series_id!==s.id || e.posting_status!=="posted" || e.is_published!==true)
    return new NextResponse(null,{status:404});
  if(isR18Series(s) && !(await getCurrentR18ViewerPreference()).showR18Content)
    return new NextResponse(null,{status:404});
  const endpoint=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!endpoint || !key) return new NextResponse(null,{status:503});
  const escaped=objectPath.split("/").map(encodeURIComponent).join("/");
  let upstream: Response;
  try{
    upstream=await fetch(`${endpoint}/storage/v1/object/authenticated/${PRIVATE_AI_AUDIO_BUCKET}/${escaped}`,{
      headers:{apikey:key,Authorization:`Bearer ${key}`,...(range?{Range:range}:{})},
      cache:"no-store",signal:AbortSignal.timeout(15000)
    });
  } catch {return new NextResponse(null,{status:503});}
  if(!upstream.ok || !upstream.body) return new NextResponse(null,{status:upstream.status===416?416:404});
  const headers=new Headers({
    "Cache-Control":"private, no-store, max-age=0",
    "X-Content-Type-Options":"nosniff",
    "Vary":"Cookie",
    "Content-Type":upstream.headers.get("content-type")??"audio/wav"
  });
  for(const name of ["content-range","content-length","accept-ranges"]){
    const value=upstream.headers.get(name);
    if(value) headers.set(name,value);
  }
  return new NextResponse(upstream.body,{status:upstream.status===206?206:200,headers});
}
