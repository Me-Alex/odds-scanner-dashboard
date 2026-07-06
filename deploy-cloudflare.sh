#!/bin/bash
# Deploy Arb Desk to Cloudflare Pages (static build)
# Usage: ./deploy-cloudflare.sh

set -e

TOKEN="${CLOUDFLARE_API_TOKEN:-cfut_HAwwZizgMrZ0QF7Dv1Y6fF4L5GtmnlObcuuwOwq144f068b3}"

echo "🔨 Building static site..."
# Temporarily move API routes for static export
mv src/app/api /tmp/api-routes-backup

# Use static export config
cat > next.config.ts << 'CONFIG'
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};
export default nextConfig;
CONFIG

# Build
NODE_ENV=production bun run build

# Restore
mv /tmp/api-routes-backup src/app/api
git checkout next.config.ts 2>/dev/null || true

echo "🚀 Deploying to Cloudflare Pages..."
CLOUDFLARE_API_TOKEN="$TOKEN" npx wrangler pages deploy out --project-name=arb-desk --commit-dirty=true

echo "✅ Done!"