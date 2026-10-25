import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isR18Series } from "@/lib/contentRating";
import { parsePrivateAiAudioReference, PRIVATE_AI_AUDIO_BUCKET } from "@/lib/recording/protectedAiRecordingStorage";
import { isUuid } from "@/lib/uuid";
import { streamAuthorizedPrivateRecording } from "@/lib/recording/privateMediaProxy";
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
  return streamAuthorizedPrivateRecording(request,PRIVATE_AI_AUDIO_BUCKET,objectPath);
}
