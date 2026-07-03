import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // globe.gl / three pull in some browser-only globals; keep them client-side.
  transpilePackages: ["react-globe.gl", "globe.gl", "three"],
  async headers() {
    // Bundled game assets never change once shipped — cache them hard.
    const immutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    return [
      { source: "/flags/:path*", headers: immutable },
      { source: "/outlines/:path*", headers: immutable },
      { source: "/textures/:path*", headers: immutable },
    ];
  },
};

export default nextConfig;
