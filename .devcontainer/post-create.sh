#!/bin/sh
# Préparation du conteneur de développement (exécuté une fois à sa création).
set -e
# Bun, version épinglée, et rsvg-convert pour régénérer les icônes.
npm install --global bun@1.4.4
sudo apt-get update -qq && sudo apt-get install -y -qq librsvg2-bin >/dev/null
# Installation du projet, .env et configuration WXT sans navigateur (voir scripts/setup.sh).
sh scripts/setup.sh --container
