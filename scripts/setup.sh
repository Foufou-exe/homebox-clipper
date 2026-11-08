#!/bin/sh
# Prepares a machine (or a container) to contribute to homebox-clipper.
#   sh scripts/setup.sh              local machine (interactive)
#   sh scripts/setup.sh --container  development container (no browser)
#   sh scripts/setup.sh --hook       also installs the pre-push hook without asking
set -e
cd "$(dirname "$0")/.."

CONTAINER=0
HOOK=ask
for arg in "$@"; do
  case "$arg" in
    --container) CONTAINER=1; HOOK=no ;;
    --hook) HOOK=yes ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

echo "1. Tools"
command -v bun >/dev/null || fail "Bun is required: https://bun.sh (or \"mise install\" with mise.toml)"
ok "Bun $(bun --version)"
if command -v node >/dev/null; then ok "Node $(node --version)"; else fail "Node.js LTS is required (used by Vite/WXT)"; fi
if command -v docker >/dev/null; then ok "Docker (local HomeBox instance)"; else warn "Docker not found: the local HomeBox instance (compose.yaml) cannot be started"; fi
if command -v rsvg-convert >/dev/null; then ok "rsvg-convert (bun run icons)"; else warn "rsvg-convert not found: only needed to regenerate the icons"; fi

echo "2. Dependencies"
bun install --frozen-lockfile
ok "bun install"

echo "3. Local HomeBox instance (.env)"
if [ -f .env ]; then
  ok ".env already exists (pepper kept)"
else
  cp .env.example .env
  if command -v openssl >/dev/null; then
    pepper=$(openssl rand -base64 48)
  else
    pepper=$(bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64"))')
  fi
  sed -i.bak "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$pepper|" .env && rm -f .env.bak
  ok ".env created with a random pepper (do not commit it, do not change it afterwards)"
fi

echo "4. Dev mode"
if [ "$CONTAINER" = 1 ] && [ ! -f web-ext.config.ts ]; then
  cp web-ext.config.example.ts web-ext.config.ts
  sed -i.bak 's|// disabled: true,|disabled: true,|' web-ext.config.ts && rm -f web-ext.config.ts.bak
  ok "web-ext.config.ts: no browser opened in the container"
else
  ok "bun run dev will open a development Chrome (customizable: web-ext.config.example.ts)"
fi

echo "5. pre-push hook (bun run ci before every push, as the GitHub CI quota is limited)"
if [ "$HOOK" = ask ] && [ -t 0 ]; then
  printf "  Install the hook? [y/N] "
  read -r answer
  case "$answer" in y|Y|yes|o|O|oui) HOOK=yes ;; *) HOOK=no ;; esac
fi
if [ "$HOOK" = yes ]; then
  printf '#!/bin/sh\nexec bun run ci\n' > .git/hooks/pre-push && chmod +x .git/hooks/pre-push
  ok "hook installed in .git/hooks/pre-push"
else
  ok "hook not installed (re-run with --hook to install it)"
fi

cat <<'MSG'

Ready. Next:
  bun run homebox:up     start HomeBox on http://localhost:3100 (guide: docs/local-homebox.md)
  bun run dev            develop with automatic reload
  bun run build          build → .output/chrome-mv3/ (to load in chrome://extensions)
  bun run check:config   validate the settings files (JSON, YAML, Bun versions, issue templates)
  bun run ci             all checks (including check:config), before every push
Environment maintenance: https://github.com/Foufou-exe/homebox-clipper/wiki/Maintaining-the-dev-environment
Contribution guide: CONTRIBUTING.md
MSG
