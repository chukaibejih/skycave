import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // globe.gl / three pull in some browser-only globals; keep them client-side.
  transpilePackages: ["react-globe.gl", "globe.gl", "three"],
  async headers() {
    return [
      {
        // Flag SVGs are immutable once bundled.
        source: "/flags/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
