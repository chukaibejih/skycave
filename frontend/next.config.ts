import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next build` and `next dev` share this directory, so a verification build
  // run while the dev server is up overwrites the chunks and CSS it is serving
  // and the app loads unstyled. Point builds elsewhere with NEXT_DIST_DIR
  // (see the `build:check` script) to leave a running dev server alone.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // globe.gl / three pull in some browser-only globals; keep them client-side.
  transpilePackages: ["react-globe.gl", "globe.gl", "three"],
  async headers() {
    // Bundled game assets never change once shipped - cache them hard.
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
