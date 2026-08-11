import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// `output: 'export'` and `rewrites()` are mutually exclusive, so the dev-only
// API proxy and the production static export are kept on separate branches.
const nextConfig: NextConfig = isDev
  ? {
      // The dev server gzips proxied responses, which buffers the SSE price
      // stream so no events ever reach the browser. Production is unaffected:
      // the static export is served same-origin by FastAPI with no proxy.
      compress: false,
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: "http://localhost:8000/api/:path*",
          },
        ];
      },
    }
  : {
      output: "export",
      images: { unoptimized: true },
    };

export default nextConfig;
