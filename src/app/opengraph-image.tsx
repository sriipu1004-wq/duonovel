import { ImageResponse } from "next/og";

export const alt = "LIB read | Time-fit AI stories to read and listen to";
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
          NOVEL / READ / LISTEN
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
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            TIME-FIT AI STORIES
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            READ & LISTEN
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
          <span style={{ color: "#666666" }}>5 / 10 / 15 MIN</span>
        </div>
      </div>
    ),
    size
  );
}
