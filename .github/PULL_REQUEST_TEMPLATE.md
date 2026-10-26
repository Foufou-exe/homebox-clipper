## Objet

<!-- Quoi et pourquoi, en quelques lignes. Lier l'issue si elle existe : « Closes #… » -->

## Vérifications

- [ ] `bun run ci` passe en local (typecheck, lint, tests, build, manifeste)
- [ ] Testé dans Chrome contre une instance HomeBox locale (`bun run homebox:up`), si l'interface ou l'import sont touchés
- [ ] Interface vérifiée en thème clair **et** sombre, si l'UI est touchée
- [ ] Aucune page Amazon brute, clé API, pepper ni adresse d'instance réelle dans les fichiers

## Points d'attention

- [ ] Ce changement modifie le manifeste (permissions, `host_permissions`, CSP) : justification ci-dessous
- [ ] Ce changement touche la clé API, le stockage ou la messagerie interne

<!-- Justification / remarques pour la relecture -->
