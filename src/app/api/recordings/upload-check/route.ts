import { NextResponse } from "next/server";
import { analyzeAudioUploadServer } from "@/lib/recording/audioUploadServerValidation";

export const runtime = "nodejs";

export async function POST(request: Request) {
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