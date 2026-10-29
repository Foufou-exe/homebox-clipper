#!/bin/sh
# Prépare un poste (ou un conteneur) pour contribuer à homebox-companion.
#   sh scripts/setup.sh              poste local (interactif)
#   sh scripts/setup.sh --container  conteneur de développement (pas de navigateur)
#   sh scripts/setup.sh --hook       installe aussi le hook pre-push sans le demander
set -e
cd "$(dirname "$0")/.."

CONTAINER=0
HOOK=ask
for arg in "$@"; do
  case "$arg" in
    --container) CONTAINER=1; HOOK=no ;;
    --hook) HOOK=yes ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

echo "1. Outils"
command -v bun >/dev/null || fail "Bun est requis : https://bun.sh (ou « mise install » avec mise.toml)"
ok "Bun $(bun --version)"
if command -v node >/dev/null; then ok "Node $(node --version)"; else fail "Node.js LTS est requis (utilisé par Vite/WXT)"; fi
if command -v docker >/dev/null; then ok "Docker (instance HomeBox locale)"; else warn "Docker absent : l'instance HomeBox locale (compose.yaml) ne pourra pas être lancée"; fi
if command -v rsvg-convert >/dev/null; then ok "rsvg-convert (bun run icons)"; else warn "rsvg-convert absent : seulement nécessaire pour régénérer les icônes"; fi

echo "2. Dépendances"
bun install --frozen-lockfile
ok "bun install"

echo "3. Instance HomeBox locale (.env)"
if [ -f .env ]; then
  ok ".env existe déjà (pepper conservé)"
else
  cp .env.example .env
  if command -v openssl >/dev/null; then
    pepper=$(openssl rand -base64 48)
  else
    pepper=$(bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64"))')
  fi
  sed -i.bak "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$pepper|" .env && rm -f .env.bak
  ok ".env créé avec un pepper aléatoire (ne pas le commiter, ne pas le changer ensuite)"
fi

echo "4. Mode dev"
if [ "$CONTAINER" = 1 ] && [ ! -f web-ext.config.ts ]; then
  cp web-ext.config.example.ts web-ext.config.ts
  sed -i.bak 's|// disabled: true,|disabled: true,|' web-ext.config.ts && rm -f web-ext.config.ts.bak
  ok "web-ext.config.ts : pas d'ouverture de navigateur dans le conteneur"
else
  ok "bun run dev ouvrira un Chrome de développement (personnalisable : web-ext.config.example.ts)"
fi

echo "5. Hook pre-push (bun run ci avant chaque push, le quota de CI GitHub étant limité)"
if [ "$HOOK" = ask ] && [ -t 0 ]; then
  printf "  Installer le hook ? [o/N] "
  read -r answer
  case "$answer" in o|O|oui|y|Y|yes) HOOK=yes ;; *) HOOK=no ;; esac
fi
if [ "$HOOK" = yes ]; then
  printf '#!/bin/sh\nexec bun run ci\n' > .git/hooks/pre-push && chmod +x .git/hooks/pre-push
  ok "hook installé dans .git/hooks/pre-push"
else
  ok "hook non installé (relancer avec --hook pour l'installer)"
fi

cat <<'MSG'

Prêt. Ensuite :
  bun run homebox:up     démarrer HomeBox sur http://localhost:3100 (guide : docs/local-homebox.md)
  bun run dev            développer avec rechargement automatique
  bun run build          build → .output/chrome-mv3/ (à charger dans chrome://extensions)
  bun run check:config   valide les fichiers de réglage (JSON, YAML, versions de Bun, modèles d'issue)
  bun run ci             toutes les vérifications (dont check:config), avant chaque push
Maintenance de l'environnement : https://github.com/Foufou-exe/homebox-companion/wiki/Maintaining-the-dev-environment
Guide de contribution : CONTRIBUTING.md
MSG
