import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Browsers only honor HSTS over HTTPS. Avoid includeSubDomains until every
  // possible LIB read subdomain is explicitly known to be HTTPS-only.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Recording needs microphone access, so keep microphone available while
  // disabling capabilities the application does not use.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), usb=()" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
] as const;

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/pdf-assets/**/*": [
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
};

export default nextConfig;
