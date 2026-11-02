# Changelog

Toutes les évolutions notables de ce projet sont documentées dans ce fichier.

Le format suit [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) et le projet respecte
la numérotation [SemVer](https://semver.org). Les types de changement (`Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security`) gardent leurs noms standard en anglais.

## [Unreleased]

### Fixed

- Amazon.fr : l'image du produit et le bouton « Facture » sont de nouveau détectés sur la page de détail de commande actuelle (image dans la colonne de gauche, menu « Facture » chargé via `data-a-popover`).
- Amazon.fr : la quantité affichée dans le badge de la colonne image (articles commandés en plusieurs exemplaires) est lue au lieu de retomber sur 1.

### Changed

- **Action requise :** le projet est renommé **homebox-clipper** (nom affiché « HomeBox Clipper »), pour éviter la confusion avec un autre projet du même nom ; mettez à jour l'adresse du dépôt (`git remote set-url origin …/homebox-clipper.git`).

## [0.1.0] - 2026-10-29

### Added

- MVP Amazon.fr : détection d'une page de détail de commande, confirmation avant tout import.
- Import en 3 étapes vers HomeBox, avec reprise après interruption.
- Téléchargement et rattachement de la facture PDF.
- Détection des doublons.
- Chiffrement de la clé API par phrase de passe, avec verrouillage de l'extension (PR #1).
- Interface aux couleurs de HomeBox : thèmes clair, sombre et automatique, nouveau logo (PR #6).
- Environnement HomeBox local via Docker Compose et guide de test local (PR #3).
- Environnement de contribution (devcontainer, configuration de développement) et guide de contribution (PR #7, #8).
- Commande `bun run ci` : vérification locale équivalente à la CI (PR #4).
- Interface traduisible : tous les textes passent par des clés `t()` et un catalogue français unique `src/locales/fr.yml` (PR #9).
- `MERCHANTS.md` : liste des marchands pris en charge, prévus et demandés, vérifiée par un test contre le registre `src/content/merchants/registry.ts`.
- Wiki du projet dans `docs/wiki/` (installation, configuration, architecture, ajout d'un marchand, dépannage…), publiable avec `bun run wiki:publish`.
- Modèles d'issue en français (bug, suggestion, détection de marchand, demande de marchand), étiquettes dans `.github/labels.yml` et `SECURITY.md`.
- `bun run check:config` : validation des fichiers de réglage et des modèles d'issue, lancée en tête de `bun run ci`.
- `bun run release:notes` : extraction des notes d'une version depuis `CHANGELOG.md`.

### Changed

- **Action requise :** définir une phrase de passe au premier lancement ; la clé API existante est migrée vers le stockage chiffré (PR #1).
- **Action requise :** build unique ; retirer l'ancienne extension « homelab » du navigateur puis reconfigurer l'extension (PR #5).
- HTTP n'est accepté que pour les adresses du réseau local ; HTTPS est exigé ailleurs (PR #5).
- La note HomeBox d'un objet importé (« Commande Amazon.fr : <n°> ») est construite à partir du catalogue de traduction (PR #9).
- `README.md` réécrit en version courte et multi-marchands ; le détail est dans le wiki.
- Modèles d'issue généralisés à tous les marchands (l'ancien modèle « page mal détectée » est remplacé).

### Fixed

- Le client HomeBox manquait dans les commits à cause d'une règle `.gitignore` trop large (PR #2).

### Security

- Clé API chiffrée au repos (AES-GCM, dérivation PBKDF2 à 600 000 itérations, liée à l'URL de l'instance) (PR #1).

[Unreleased]: https://github.com/Foufou-exe/homebox-clipper/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Foufou-exe/homebox-clipper/releases/tag/v0.1.0
