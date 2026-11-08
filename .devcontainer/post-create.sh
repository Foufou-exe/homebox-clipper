#!/bin/sh
# Dev container setup (runs once, when the container is created).
set -e
# Pinned Bun version, and rsvg-convert to regenerate the icons.
npm install --global bun@1.4.4
sudo apt-get update -qq && sudo apt-get install -y -qq librsvg2-bin >/dev/null
# Project install, .env and WXT configuration without a browser (see scripts/setup.sh).
sh scripts/setup.sh --container
