#!/bin/sh
# Generates the extension's PNG icons from src/assets/logo.svg.
# Prerequisite: rsvg-convert (package librsvg2-bin / librsvg).
set -e
cd "$(dirname "$0")/.."
command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found (install librsvg)" >&2; exit 1; }
for size in 16 32 48 128; do
  rsvg-convert -w "$size" -h "$size" src/assets/logo.svg -o "public/icon/$size.png"
done
echo "Icons generated in public/icon/"
