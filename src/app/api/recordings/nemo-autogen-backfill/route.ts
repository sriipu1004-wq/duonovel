import { NextResponse } from "next/server";
import { seedNemoAutogenBackfillQueue } from "@/lib/recording/nemoAutoGeneration";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = {
  limitEpisodes?: number;
};

export async function POST(request: Request) {
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

  let body: RequestBody = {};

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  const limitEpisodes =
    typeof body.limitEpisodes === "number" && Number.isFinite(body.limitEpisodes)
      ? Math.max(1, Math.trunc(body.limitEpisodes))
      : undefined;

  try {
    const result = await seedNemoAutogenBackfillQueue({
      limitEpisodes,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[nemo-autogen-backfill]", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Nemo backlog の queue seed に失敗した。",
        detail:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : String(error)
            : undefined,
      },
      { status: 500 }
    );
  }
}