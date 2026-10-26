#!/bin/sh
# Génère les icônes PNG de l'extension à partir de src/assets/logo.svg.
# Prérequis : rsvg-convert (paquet librsvg2-bin / librsvg).
set -e
cd "$(dirname "$0")/.."
command -v rsvg-convert >/dev/null || { echo "rsvg-convert introuvable (installez librsvg)" >&2; exit 1; }
for size in 16 32 48 128; do
  rsvg-convert -w "$size" -h "$size" src/assets/logo.svg -o "public/icon/$size.png"
done
echo "Icônes générées dans public/icon/"
