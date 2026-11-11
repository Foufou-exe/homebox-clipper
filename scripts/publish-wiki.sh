#!/bin/sh
# Publishes docs/wiki/ to the repository's GitHub wiki (contract: specs/002-project-documentation/contracts/wiki.md).
#
#   sh scripts/publish-wiki.sh --dry-run   checks + list + link rewriting, 100% local
#   sh scripts/publish-wiki.sh             wiki clone, sync, confirmation, commit, push
#   sh scripts/publish-wiki.sh --yes       same without confirmation (maintainer only)
#
# The script never modifies the main repository. Real mode requires the wiki's first page to have
# already been created from the GitHub interface, and one of these authentications:
#   - default: SSH access to the repository (git@github.com:...);
#   - CI: a token in the WIKI_TOKEN environment variable (fine-grained personal access token with
#     "Contents: Read and write"); the wiki is then reached over HTTPS and the token is passed to git
#     through the environment (never in the URL, never in the arguments, never printed).
set -eu

REPO_URL="https://github.com/Foufou-exe/homebox-clipper"
WIKI_REMOTE="git@github.com:Foufou-exe/homebox-clipper.wiki.git"
WIKI_REMOTE_HTTPS="https://github.com/Foufou-exe/homebox-clipper.wiki.git"

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
  case "$name" in _*) continue ;; *) ;; esac
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
if [ -n "${WIKI_TOKEN:-}" ]; then
  # Token authentication (CI). The Authorization header goes through git's environment-based config
  # (GIT_CONFIG_*), scoped to github.com: it appears neither in the URL nor in any command line.
  WIKI_REMOTE="$WIKI_REMOTE_HTTPS"
  AUTH=$(printf 'x-access-token:%s' "$WIKI_TOKEN" | base64 | tr -d '\n')
  # In GitHub Actions, also mask the encoded form (only the raw token is masked by the workflow).
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$AUTH"; fi
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
  export GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $AUTH"
  unset AUTH
  export GIT_TERMINAL_PROMPT=0
  # No configured identity on a CI runner.
  export GIT_AUTHOR_NAME="github-actions[bot]" GIT_COMMITTER_NAME="github-actions[bot]"
  export GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
  export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
  AUTH_MODE="token"
else
  AUTH_MODE="SSH"
fi

echo "4. Cloning the wiki ($WIKI_REMOTE, $AUTH_MODE authentication)"
CLONE="$TMP/clone"
if ! git clone --quiet "$WIKI_REMOTE" "$CLONE" 2>"$TMP/clone-error"; then
  cat "$TMP/clone-error" >&2
  die "clone failed. Does the wiki exist? First create its first page from the repository's \"Wiki\" tab (the wiki must be enabled in Settings), then re-run. Also check your credentials (SSH access, or the WIKI_TOKEN token and its permissions)."
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
