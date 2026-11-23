---
title: "Modérer les Discussions"
description: "Comment les Discussions GitHub sont organisées et modérées."
---

Comment prendre soin des [Discussions](https://github.com/Foufou-exe/homebox-clipper/discussions) du dépôt. Restez léger : le projet est maintenu sur le temps libre, et un espace convivial et bien rangé compte plus que des réponses rapides.

## Catégories

Le dépôt utilise les catégories par défaut de GitHub. Les noms doivent rester tels quels : les formulaires et l'annonce de version dépendent de leurs slugs et de leurs noms.

| Catégorie (slug) | Usage |
|------------------|-------|
| Announcements (`announcements`) | Réservé aux mainteneurs : versions et actualités. Chaque version y ouvre automatiquement un message (voir [Publier une version](/homebox-clipper/fr/maintaining/releasing/)) |
| General (`general`) | Tout le reste |
| Ideas (`ideas`) | Suggestions, discutées avant de devenir un ticket |
| Polls (`polls`) | Sondages des mainteneurs, par exemple la prochaine boutique à prendre en charge |
| Q&A (`q-a`) | Demandes d'aide ; les réponses peuvent être marquées |
| Show and tell (`show-and-tell`) | Configurations, astuces, résultats |

## Marquer une réponse

Dans une discussion Q&A, ouvrez le commentaire qui résout la question et utilisez **Mark as answer** (l'icône de coche sous le commentaire). L'auteur de la question ou toute personne ayant un accès de triage peut le faire. Marquer les réponses rend le Q&A consultable.

## Convertir entre discussions et tickets

- **Discussion vers ticket** : quand un message Ideas ou Q&A se révèle être un bug confirmé ou une fonctionnalité claire, utilisez **Create issue from discussion** dans la barre latérale droite. Choisissez le formulaire de ticket adapté, ajoutez les labels (`bug`, `enhancement`, `needs-triage`) et faites un lien vers la discussion.
- **Ticket vers discussion** : quand un ticket est en réalité une question ou une idée ouverte, utilisez **Convert to discussion** dans la barre latérale droite du ticket, puis choisissez la catégorie (généralement Q&A ou Ideas). Le ticket est fermé et son historique est conservé.
- **Déplacer entre catégories** : utilisez l'icône de crayon à côté du nom de catégorie d'une discussion.

## Verrouiller et épingler

- **Verrouillez** une discussion résolue, hors sujet ou houleuse (*Lock conversation* dans la barre latérale droite). Donnez une raison courte et aimable.
- **Épinglez** jusqu'à quatre discussions en haut de la liste (*Pin discussion*). Le message de bienvenue est le premier candidat naturel.
- Masquez les commentaires indésirables ou hors sujet avec *Hide*, et supprimez tout ce qui expose des données personnelles, une clé API ou une vraie adresse d'instance (puis dites à l'auteur de révoquer la clé).
- Les signalements de comportement inapproprié suivent le [Code de conduite](https://github.com/Foufou-exe/homebox-clipper/blob/main/CODE_OF_CONDUCT.md).

## Mettre à jour les formulaires

Les formulaires de discussion sont des fichiers YAML dans `.github/DISCUSSION_TEMPLATE/`, un par catégorie, nommés d'après le slug de la catégorie (`q-a.yml`, `ideas.yml`, `show-and-tell.yml`, `general.yml`). Il n'y a pas de formulaire pour Announcements (réservé aux mainteneurs) ni pour Polls (non pris en charge par GitHub).

1. Modifiez le fichier dans une pull request, comme n'importe quel autre fichier. Syntaxe : [Syntax for discussion category forms](https://docs.github.com/en/discussions/managing-discussions-for-your-community/syntax-for-discussion-category-forms).
2. Conservez mot pour mot l'avertissement de confidentialité : *Never attach raw store pages, API keys, real instance addresses (public or local) or personal data.*
3. Lancez `bun run check:config` : il valide le schéma, les identifiants, l'avertissement de confidentialité et les labels. Ces fichiers ne déclenchent pas la CI GitHub, donc `bun run ci` en local est leur seule protection.
4. Les formulaires s'appliquent une fois fusionnés dans `main` (la branche par défaut).

Fichiers liés : `SUPPORT.md` (où poser quelle question) et `.github/ISSUE_TEMPLATE/config.yml` (liens vers les Discussions depuis la page de nouveau ticket).
