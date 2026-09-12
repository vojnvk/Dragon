import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in C:\dev would otherwise be picked as the root.
  turbopack: { root: __dirname },
  // yt-dlp and ffmpeg are spawned by path, not imported, so Next's tracer cannot
  // see them. Without this they are missing from the deployed function bundle.
  outputFileTracingIncludes: {
    "/api/**": [
      "./bin/**",
      "./node_modules/ffmpeg-static/ffmpeg*",
    ],
  },
};

export default nextConfig;
