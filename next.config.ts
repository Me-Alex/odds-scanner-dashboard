import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  allowedDevOrigins: [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://21.0.8.31:3000",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
