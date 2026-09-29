#!/bin/sh
# Build public/ and publish the Worker (static site + room relay, one deploy).
# Needs a one-time `npx wrangler login`. Only run when asked to deploy.
# usage: tools/release.sh
set -e
cd "$(dirname "$0")/.."
python3 tools/build-dist.py
npx wrangler deploy
