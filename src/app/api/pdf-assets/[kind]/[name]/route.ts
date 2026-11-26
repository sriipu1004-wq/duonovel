import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isSafePdfAssetName, resolvePdfAssetFolder } from "@/lib/pdfAssets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ kind: string; name: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { kind, name } = await context.params;
  const folder = resolvePdfAssetFolder(kind);

  if (!folder || !isSafePdfAssetName(name)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const assetPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    folder,
    name
  );

  try {
    const data = await readFile(assetPath);
    return new NextResponse(data, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
}
