#!/bin/sh
# Publie docs/wiki/ dans le wiki GitHub du dépôt (contrat : specs/002-project-documentation/contracts/wiki.md).
#
#   sh scripts/publish-wiki.sh --dry-run   contrôles + liste + réécriture des liens, 100 % local
#   sh scripts/publish-wiki.sh             clone du wiki, synchronisation, confirmation, commit, push
#   sh scripts/publish-wiki.sh --yes       idem sans confirmation (réservé au mainteneur)
#
# Le script ne modifie jamais le dépôt principal. Le mode réel nécessite un accès SSH au dépôt
# et que la première page du wiki ait déjà été créée depuis l'interface GitHub.
set -eu

REPO_URL="https://github.com/Foufou-exe/homebox-companion"
WIKI_REMOTE="git@github.com:Foufou-exe/homebox-companion.wiki.git"

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WIKI="$ROOT/docs/wiki"

DRY_RUN=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Option inconnue : $arg (options : --dry-run, --yes)" >&2
      exit 2
      ;;
  esac
done

die() { echo "Erreur : $1" >&2; exit 1; }

[ -d "$WIKI" ] || die "dossier introuvable : docs/wiki/"
[ -f "$WIKI/Home.md" ] || die "docs/wiki/Home.md est obligatoire (page d'accueil du wiki)"
[ -f "$WIKI/_Sidebar.md" ] || die "docs/wiki/_Sidebar.md est obligatoire (barre latérale)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

ERRORS=0
report() { echo "  ✗ $1" >&2; ERRORS=$((ERRORS + 1)); }

echo "1. Contrôles locaux de docs/wiki/"

# Chaque page (hors _*.md) doit figurer dans la barre latérale.
for file in "$WIKI"/*.md; do
  name=$(basename "$file" .md)
  case "$name" in _*) continue ;; esac
  grep -qF "]($name.md)" "$WIKI/_Sidebar.md" || report "$name.md n'est pas listée dans _Sidebar.md"
done

# Liens : internes valides, aucun lien relatif qui sorte de docs/wiki/.
for file in "$WIKI"/*.md; do
  base=$(basename "$file")
  # Les blocs de code et le code en ligne sont ignorés (ils peuvent citer des exemples de liens).
  awk '/^[ \t]*(```|~~~)/ { fence = !fence; next } !fence' "$file" | sed 's/`[^`]*`//g' \
    | grep -o '\]([^)]*)' | sed 's/^](//; s/)$//' | while IFS= read -r target; do
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;
      ../*|./../*|/*)
        report "$base : lien relatif sortant « $target » (utiliser une URL absolue $REPO_URL/blob/main/<fichier>)" ;;
      *)
        page=${target%%#*}
        [ -f "$WIKI/$page" ] || report "$base : lien interne cassé « $target »" ;;
    esac
  done >>"$TMP/link-errors" 2>&1 || true
done
if [ -s "$TMP/link-errors" ]; then
  cat "$TMP/link-errors" >&2
  ERRORS=$((ERRORS + $(wc -l <"$TMP/link-errors")))
fi

if [ "$ERRORS" -gt 0 ]; then
  die "$ERRORS problème(s) détecté(s) : rien n'est publié."
fi
echo "  ✓ barre latérale complète, liens internes valides, aucun lien relatif sortant"

# Copie dans un dossier temporaire et réécriture des liens ](Page.md) -> ](Page), ](Page.md#x) -> ](Page#x).
OUT="$TMP/out"
mkdir "$OUT"
REWRITE='s/\](\([A-Za-z0-9_-][A-Za-z0-9_-]*\)\.md\(#[^)]*\)\{0,1\})/](\1\2)/g'
for file in "$WIKI"/*.md; do
  sed "$REWRITE" "$file" >"$OUT/$(basename "$file")"
done

COUNT=$(find "$OUT" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
echo "2. Fichiers à publier ($COUNT)"
for file in "$OUT"/*.md; do echo "  - $(basename "$file")"; done

echo "3. Liens réécrits (avant -> après)"
CHANGED=0
for file in "$WIKI"/*.md; do
  base=$(basename "$file")
  diff "$file" "$OUT/$base" >/dev/null 2>&1 && continue
  CHANGED=$((CHANGED + 1))
  # Une ligne « avant -> après » par lien réécrit.
  grep -o '\]([A-Za-z0-9_-]*\.md\(#[^)]*\)\{0,1\})' "$file" | sort -u | while IFS= read -r old; do
    new=$(printf '%s\n' "$old" | sed "$REWRITE")
    echo "  $base : $old -> $new"
  done
done
[ "$CHANGED" -gt 0 ] || echo "  (aucun lien interne à réécrire)"

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Simulation terminée (--dry-run) : aucun accès réseau, aucun clone, rien n'est publié."
  exit 0
fi

# --- Mode réel -------------------------------------------------------------------------------
echo "4. Clonage du wiki ($WIKI_REMOTE)"
CLONE="$TMP/clone"
if ! git clone --quiet "$WIKI_REMOTE" "$CLONE" 2>"$TMP/clone-error"; then
  cat "$TMP/clone-error" >&2
  die "clonage impossible. Le wiki existe-t-il ? Créez d'abord sa première page depuis l'onglet « Wiki » du dépôt (le wiki doit être activé dans Settings), puis relancez. Vérifiez aussi votre accès SSH."
fi
if ! git -C "$CLONE" rev-parse --verify HEAD >/dev/null 2>&1; then
  die "le wiki est vide : créez sa première page depuis l'onglet « Wiki » du dépôt, puis relancez."
fi

echo "5. Synchronisation"
for file in "$CLONE"/*.md; do
  [ -e "$file" ] || continue
  [ -f "$OUT/$(basename "$file")" ] || git -C "$CLONE" rm --quiet -f "$(basename "$file")"
done
cp "$OUT"/*.md "$CLONE"/
git -C "$CLONE" add -A
if git -C "$CLONE" diff --cached --quiet; then
  echo "Le wiki est déjà à jour : rien à publier."
  exit 0
fi
git -C "$CLONE" diff --cached --stat

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Publier ces changements dans le wiki ? [y/N] '
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Annulé : rien n'a été publié."; exit 1 ;;
  esac
fi

SHA=$(git -C "$ROOT" rev-parse --short HEAD)
git -C "$CLONE" commit --quiet -m "docs: sync wiki from $SHA"
git -C "$CLONE" push --quiet origin HEAD
echo "Wiki publié (docs: sync wiki from $SHA)."
