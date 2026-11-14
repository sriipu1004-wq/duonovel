/**
 * JSX for Open Graph images (next/og). No server or data imports, so the
 * regression test can render these with the real ImageResponse.
 * Text here must stay inside isOgBundledFontText (see workOgContent.ts).
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_CONTENT_TYPE = "image/png";

/** The common LIB read image (site default; R18 / private / fallback). */
export function DefaultOgImageElement() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background: "#ffffff",
        color: "#111111",
        border: "24px solid #111111",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 34,
          letterSpacing: 8,
          color: "#666666",
        }}
      >
        ORIGINAL / BILINGUAL / TRANSLATION
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          LONG-FORM & WEB NOVELS
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          READ ACROSS LANGUAGES
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 38,
        }}
      >
        <span>LIB read</span>
        <span style={{ color: "#666666" }}>ORIGINAL FIRST</span>
      </div>
    </div>
  );
}

/** A work's image: title and author (original author for Public Domain). */
export function WorkOgImageElement({
  title,
  authorName,
}: {
  title: string;
  authorName: string | null;
}) {
  const titleFontSize = title.length > 60 ? 54 : title.length > 32 ? 64 : 78;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        background: "#ffffff",
        color: "#111111",
        border: "24px solid #111111",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 30,
          letterSpacing: 8,
          color: "#666666",
        }}
      >
        READ ON LIB READ
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: titleFontSize,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {title}
        </div>
        {authorName ? (
          <div style={{ display: "flex", fontSize: 40, color: "#444444" }}>
            {`by ${authorName}`}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 34,
        }}
      >
        <span>LIB read</span>
        <span style={{ color: "#666666" }}>ORIGINAL / BILINGUAL / TRANSLATION</span>
      </div>
    </div>
  );
}
