# Changelog

Toutes les évolutions notables de ce projet sont documentées dans ce fichier.

Le format suit [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) et le projet respecte
la numérotation [SemVer](https://semver.org). Les types de changement (`Added`, `Changed`,
`Deprecated`, `Removed`, `Fixed`, `Security`) gardent leurs noms standard en anglais.

## [Unreleased]

### Added

- La photo du produit (Amazon.fr) est jointe à l'objet HomeBox comme image principale. Une case, cochée par défaut, permet de ne pas l'envoyer ; le résultat indique le sort de la photo pour chaque produit.
- Reprise d'un import interrompu par l'arrêt du service worker de l'extension : l'import redevient réessayable, sans recréer l'objet ni renvoyer deux fois la photo. Les imports en cours sont conservés en mémoire de session : ils sont perdus à la fermeture du navigateur et à la mise à jour de l'extension (vérifiez alors dans HomeBox). Si la création d'un objet est incertaine (réponse perdue, arrêt pendant l'envoi), la reprise cherche d'abord un objet de même nom dans HomeBox et refuse de réessayer s'il en trouve un ; ce contrôle réduit le risque de doublon sans l'éliminer.
- Choix de l'emplacement : un seul champ « Emplacement » pour un produit, ou « Emplacement des produits » avant la liste quand la commande en compte plusieurs, avec une mention « Même emplacement que les autres produits » par produit (liste des emplacements existants de l'instance, avec recherche insensible à la casse et aux accents, chemin complet affiché pour distinguer les homonymes) et une modification possible produit par produit, avec retour au choix de la commande. L'emplacement est lu sur l'instance configurée ; l'extension n'en crée, n'en renomme et n'en supprime aucun. Sans choix, l'objet est créé comme avant.
- Dernier emplacement mémorisé par instance : il est présélectionné à l'import suivant (« Retirer » le vide). Seul un identifiant est conservé dans `storage.local` (aucun nom d'emplacement) ; il est effacé avec « Supprimer la configuration ».
- Si l'emplacement choisi a disparu de HomeBox au moment de l'envoi, aucun objet n'est créé : un nouveau choix ou l'import sans emplacement est proposé.

### Fixed

- Sélecteur d'emplacement : sur un champ prérempli, taper lance une recherche au lieu de s'ajouter au chemin affiché ; la liste s'ouvre au clic et au focus ; « oeuvres » trouve « Œuvres » ; le nom du produit figure dans le libellé accessible des sélecteurs par produit ; le bouton « Modifier » respecte le contraste 4,5:1 dans les deux thèmes.
- Un message interne mal formé reçoit désormais la réponse `BAD_MESSAGE` au lieu de rester sans réponse.
- Si HomeBox répond avec succès à la création mais que la réponse est illisible ou sans identifiant, la création est traitée comme incertaine : la reprise cherche d'abord un objet de même nom au lieu de recréer l'objet.
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
