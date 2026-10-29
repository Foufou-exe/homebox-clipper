#!/bin/sh
# Crée ou met à jour les étiquettes du dépôt depuis .github/labels.yml.
# Lancé à la main par le mainteneur (nécessite `gh` authentifié et `bun`).
set -eu

cd "$(dirname "$0")/.."

gh auth status >/dev/null

# Lecture séparée de la boucle : un échec de bun arrête le script (set -e).
LABELS=$(bun -e '
const labels = Bun.YAML.parse(await Bun.file(".github/labels.yml").text());
for (const l of labels) console.log([l.name, l.color, l.description].join("\t"));
')
printf '%s\n' "$LABELS" | while IFS="$(printf '\t')" read -r name color description; do
  gh label create "$name" --color "$color" --description "$description" --force
done
