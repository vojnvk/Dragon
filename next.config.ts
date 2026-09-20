import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The UI is a static export served by Electron over app://; there is no
  // Next.js server at runtime.
  output: "export",
  images: { unoptimized: true },
  // A stray package-lock.json in C:\dev would otherwise be picked as the root.
  turbopack: { root: __dirname },
};

export default nextConfig;
