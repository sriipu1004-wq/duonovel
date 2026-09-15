import { NextResponse } from "next/server";
import { analyzeAudioUploadServer } from "@/lib/recording/audioUploadServerValidation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Authenticate before parsing a potentially large multipart body. The audio
  // policy permits long-form files, so accepting anonymous request bodies here
  // creates avoidable bandwidth/memory pressure even though validation itself
  // only sniffs a small header slice.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "ログイン状態を確認できなかった。",
      },
      { status: 401 }
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "multipart/form-data を読めなかったので、server 側保存前チェックを始められない。",
      },
      { status: 400 }
    );
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        error: "audio フィールドにファイルが無いので、server 側保存前チェックを始められない。",
      },
      { status: 400 }
    );
  }

  const result = await analyzeAudioUploadServer(audio);
  const ok = result.decision === "passed";

  return NextResponse.json(
    {
      ok,
      result,
    },
    { status: ok ? 200 : 400 }
  );
}
