#!/bin/sh
# Publishes docs/wiki/ to the repository's GitHub wiki (contract: specs/002-project-documentation/contracts/wiki.md).
#
#   sh scripts/publish-wiki.sh --dry-run   checks + list + link rewriting, 100% local
#   sh scripts/publish-wiki.sh             wiki clone, sync, confirmation, commit, push
#   sh scripts/publish-wiki.sh --yes       same without confirmation (maintainer only)
#
# The script never modifies the main repository. Real mode requires SSH access to the repository
# and the wiki's first page to have already been created from the GitHub interface.
set -eu

REPO_URL="https://github.com/Foufou-exe/homebox-clipper"
WIKI_REMOTE="git@github.com:Foufou-exe/homebox-clipper.wiki.git"

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
      echo "Unknown option: $arg (options: --dry-run, --yes)" >&2
      exit 2
      ;;
  esac
done

die() { echo "Error: $1" >&2; exit 1; }

[ -d "$WIKI" ] || die "folder not found: docs/wiki/"
[ -f "$WIKI/Home.md" ] || die "docs/wiki/Home.md is required (wiki home page)"
[ -f "$WIKI/_Sidebar.md" ] || die "docs/wiki/_Sidebar.md is required (sidebar)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

ERRORS=0
report() { echo "  ✗ $1" >&2; ERRORS=$((ERRORS + 1)); }

echo "1. Local checks of docs/wiki/"

# Every page (except _*.md) must appear in the sidebar.
for file in "$WIKI"/*.md; do
  name=$(basename "$file" .md)
  case "$name" in _*) continue ;; esac
  grep -qF "]($name.md)" "$WIKI/_Sidebar.md" || report "$name.md is not listed in _Sidebar.md"
done

# Links: valid internal ones, no relative link leaving docs/wiki/.
for file in "$WIKI"/*.md; do
  base=$(basename "$file")
  # Code blocks and inline code are ignored (they may quote example links).
  awk '/^[ \t]*(```|~~~)/ { fence = !fence; next } !fence' "$file" | sed 's/`[^`]*`//g' \
    | grep -o '\]([^)]*)' | sed 's/^](//; s/)$//' | while IFS= read -r target; do
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;
      ../*|./../*|/*)
        report "$base: relative link leaving the wiki \"$target\" (use an absolute URL $REPO_URL/blob/main/<file>)" ;;
      *)
        page=${target%%#*}
        [ -f "$WIKI/$page" ] || report "$base: broken internal link \"$target\"" ;;
    esac
  done >>"$TMP/link-errors" 2>&1 || true
done
if [ -s "$TMP/link-errors" ]; then
  cat "$TMP/link-errors" >&2
  ERRORS=$((ERRORS + $(wc -l <"$TMP/link-errors")))
fi

if [ "$ERRORS" -gt 0 ]; then
  die "$ERRORS problem(s) detected: nothing is published."
fi
echo "  ✓ complete sidebar, valid internal links, no outgoing relative link"

# Copy to a temporary folder and rewrite the links ](Page.md) -> ](Page), ](Page.md#x) -> ](Page#x).
OUT="$TMP/out"
mkdir "$OUT"
REWRITE='s/\](\([A-Za-z0-9_-][A-Za-z0-9_-]*\)\.md\(#[^)]*\)\{0,1\})/](\1\2)/g'
for file in "$WIKI"/*.md; do
  sed "$REWRITE" "$file" >"$OUT/$(basename "$file")"
done

COUNT=$(find "$OUT" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')
echo "2. Files to publish ($COUNT)"
for file in "$OUT"/*.md; do echo "  - $(basename "$file")"; done

echo "3. Rewritten links (before -> after)"
CHANGED=0
for file in "$WIKI"/*.md; do
  base=$(basename "$file")
  diff "$file" "$OUT/$base" >/dev/null 2>&1 && continue
  CHANGED=$((CHANGED + 1))
  # One "before -> after" line per rewritten link.
  grep -o '\]([A-Za-z0-9_-]*\.md\(#[^)]*\)\{0,1\})' "$file" | sort -u | while IFS= read -r old; do
    new=$(printf '%s\n' "$old" | sed "$REWRITE")
    echo "  $base : $old -> $new"
  done
done
[ "$CHANGED" -gt 0 ] || echo "  (no internal link to rewrite)"

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Simulation finished (--dry-run): no network access, no clone, nothing is published."
  exit 0
fi

# --- Real mode -------------------------------------------------------------------------------
echo "4. Cloning the wiki ($WIKI_REMOTE)"
CLONE="$TMP/clone"
if ! git clone --quiet "$WIKI_REMOTE" "$CLONE" 2>"$TMP/clone-error"; then
  cat "$TMP/clone-error" >&2
  die "clone failed. Does the wiki exist? First create its first page from the repository's \"Wiki\" tab (the wiki must be enabled in Settings), then re-run. Also check your SSH access."
fi
if ! git -C "$CLONE" rev-parse --verify HEAD >/dev/null 2>&1; then
  die "the wiki is empty: create its first page from the repository's \"Wiki\" tab, then re-run."
fi

echo "5. Synchronization"
for file in "$CLONE"/*.md; do
  [ -e "$file" ] || continue
  [ -f "$OUT/$(basename "$file")" ] || git -C "$CLONE" rm --quiet -f "$(basename "$file")"
done
cp "$OUT"/*.md "$CLONE"/
git -C "$CLONE" add -A
if git -C "$CLONE" diff --cached --quiet; then
  echo "The wiki is already up to date: nothing to publish."
  exit 0
fi
git -C "$CLONE" diff --cached --stat

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Publish these changes to the wiki? [y/N] '
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Cancelled: nothing was published."; exit 1 ;;
  esac
fi

SHA=$(git -C "$ROOT" rev-parse --short HEAD)
git -C "$CLONE" commit --quiet -m "docs: sync wiki from $SHA"
git -C "$CLONE" push --quiet origin HEAD
echo "Wiki published (docs: sync wiki from $SHA)."
