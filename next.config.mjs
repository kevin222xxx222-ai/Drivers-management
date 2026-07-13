import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const appVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ||
  process.env.APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.GIT_COMMIT_SHA?.slice(0, 12) ||
  `${packageJson.version}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" }
        ]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.womansgroup.link"
          }
        ],
        destination: "https://womansgroup.link/:path*",
        permanent: true
      }
    ];
  }
};

export default nextConfig;
