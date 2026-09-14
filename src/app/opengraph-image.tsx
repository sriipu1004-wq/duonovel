import { ImageResponse } from "next/og";

export const alt = "LIB read | Long-form and web novels for multilingual reading";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
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
    ),
    size
  );
}
