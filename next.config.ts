import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "sharp",
    "@napi-rs/canvas",
    "pdfjs-dist",
    "tesseract.js",
    "@tesseract.js-data/kor",
    "@tesseract.js-data/eng",
    "yauzl",
    "fast-xml-parser",
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
