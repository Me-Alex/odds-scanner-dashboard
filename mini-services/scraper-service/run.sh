#!/bin/bash
# Scraper service with auto-restart
cd "$(dirname "$0")"
export CF_API_TOKEN="${CF_API_TOKEN:-cfut_HAwwZizgMrZ0QF7Dv1Y6fF4L5GtmnlObcuuwOwq144f068b3}"
while true; do
  echo "[$(date -u)] Starting scraper service..."
  bun index.ts 2>&1
  echo "[$(date -u)] Scraper crashed, restarting in 2s..."
  sleep 2
done