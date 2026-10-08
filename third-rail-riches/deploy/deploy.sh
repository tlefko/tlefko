#!/usr/bin/env bash
# Build, stage the exact dist as a Vercel prebuilt output, deploy to production, verify the live bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf .vercel/output && mkdir -p .vercel/output/static
cp -R dist/. .vercel/output/static/
cp deploy/vercel-output-config.json .vercel/output/config.json
npx vercel deploy --prebuilt --prod --yes --scope tlefkos-projects
LIVE=https://third-rail-riches.vercel.app
want=$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)
for i in 1 2 3 4 5 6; do
  got=$(curl -s "$LIVE/?cb=$RANDOM" | grep -o 'assets/index-[^"]*\.js' | head -1)
  [ "$got" = "$want" ] && { echo "live bundle matches ($got)"; exit 0; }
  sleep 10
done
echo "live bundle $got does not match $want" >&2
exit 1
