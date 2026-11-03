// #137 H2: owner-scope cancellation of a PRIVATE multipart staging lease.
// This invalidates the server-side Storage write guard, not an already issued
// bearer JWT cryptographically. Never delete objects while tokens are live.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeHumanStagingLease } from "@/lib/recording/humanStagingLease";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { buildHumanMultipartUploadSession, HUMAN_MULTIPART_MIN_TRIGGER_BYTES,
  HUMAN_MULTIPART_MAX_TOTAL_BYTES } from "@/lib/recording/humanMultipartUploadShared";
import { getAudioFileExtension, isSupportedAudioFile } from "@/lib/recording/audioUploadPolicy";

export const runtime = "nodejs";
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {data:{user},error} = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ok:false,error:"ログインが必要。"}, {status:401});
  }
  if (isOfficialAccountEmail(user.email)) {
    return NextResponse.json({ok:false,error:"Human録音の一時アップロード操作は許可されていない。"}, {status:403});
  }
  let raw: Record<string, unknown>;
  try { raw=(await request.json()) as Record<string,unknown>; } catch {
    return NextResponse.json({ok:false,error:"不正なJSON。"}, {status:400});
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ok:false,error:"セッション情報が不正。"}, {status:400});
  }
  const text=(v:unknown)=>typeof v==="string"?v.trim():"";
  const seriesId=text(raw.seriesId),episodeId=text(raw.episodeId),
    uploadSessionId=text(raw.uploadSessionId),fileName=text(raw.fileName),
    mimeType=text(raw.mimeType),totalSizeBytes=Number(raw.totalSizeBytes);
  if (![seriesId,episodeId,uploadSessionId].every(x=>uuidPattern.test(x)) ||
     !fileName || !Number.isSafeInteger(totalSizeBytes) ||
     totalSizeBytes<HUMAN_MULTIPART_MIN_TRIGGER_BYTES ||
     totalSizeBytes>HUMAN_MULTIPART_MAX_TOTAL_BYTES ||
     !isSupportedAudioFile({name:fileName,size:totalSizeBytes,type:mimeType})) {
    return NextResponse.json({ok:false,error:"一時セッション情報が不正。"}, {status:400});
  }
  const session=buildHumanMultipartUploadSession({
    seriesId,episodeId,userId:user.id,uploadSessionId,
    sourceExtension:getAudioFileExtension(fileName)||"bin",totalSizeBytes,
  });
  try {
    await closeHumanStagingLease(createAdminClient(), {
      sessionId:session.uploadSessionId,seriesId,episodeId,actorId:user.id,
      sourceExtension:session.sourceExtension,totalSizeBytes,
    },"abort");
  } catch {
    // Never leak whether an arbitrary session ID exists under another owner.
    return NextResponse.json({ok:false,
      error:"セッションを停止できなかった。期限切れ・処理済み・所有権を確認して。"}, {status:409});
  }
  return NextResponse.json({ok:true,
    stagingStatus:"quarantined_private",
    cleanupStatus:"eligible_after_token_expiry_and_inventory",
  },{status:200});
}
