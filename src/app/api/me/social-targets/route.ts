import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readViewerSocialTargets } from "@/lib/social/viewerSocialRows.server";
import { isViewerSocialKind } from "@/lib/social/viewerSocialRows";

// KD-2: the signed-in viewer's own followed authors / liked authors / liked
// narration cards, for browser code. The user is taken from the session
// cookie on the server; any user id in the request is ignored.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const filter = new URL(request.url).searchParams.get("filter");
  if (!isViewerSocialKind(filter)) {
    return NextResponse.json({ error: "invalid_filter" }, { status: 400, headers: NO_STORE });
  }

  try {
    const supabase = await createClient();
    const result = await readViewerSocialTargets({ supabase, kind: filter });
    if (!result.signedIn) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
    }
    return NextResponse.json({ targets: result.targets }, { headers: NO_STORE });
  } catch (error) {
    console.warn(
      "[api/me/social-targets] read failed",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json({ error: "unavailable" }, { status: 500, headers: NO_STORE });
  }
}
