#!/bin/sh
# Creates or updates the repository labels from .github/labels.yml.
# Run by hand by the maintainer (requires an authenticated `gh` and `bun`).
set -eu

cd "$(dirname "$0")/.."

gh auth status >/dev/null

# Read separately from the loop: a bun failure stops the script (set -e).
LABELS=$(bun -e '
const labels = Bun.YAML.parse(await Bun.file(".github/labels.yml").text());
for (const l of labels) console.log([l.name, l.color, l.description].join("\t"));
')
printf '%s\n' "$LABELS" | while IFS="$(printf '\t')" read -r name color description; do
  gh label create "$name" --color "$color" --description "$description" --force
done
