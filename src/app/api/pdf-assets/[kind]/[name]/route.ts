import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ kind: string; name: string }>;
};

const ASSET_FOLDERS = {
  cmaps: "cmaps",
  standard_fonts: "standard_fonts",
} as const;

const SAFE_FILE_NAME = /^[A-Za-z0-9._-]+$/u;

export async function GET(_request: Request, context: RouteContext) {
  const { kind, name } = await context.params;
  const folder = ASSET_FOLDERS[kind as keyof typeof ASSET_FOLDERS];

  if (!folder || !SAFE_FILE_NAME.test(name)) {
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
