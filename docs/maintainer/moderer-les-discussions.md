# Modérer les Discussions

**Public visé** : le mainteneur (ou toute personne avec un accès de triage) qui s'occupe des
[Discussions](https://github.com/Foufou-exe/homebox-clipper/discussions) du dépôt.

Restez léger : le projet est maintenu sur le temps libre. Un espace convivial et rangé compte plus que des
réponses rapides.

## Prérequis

- Les Discussions activées sur le dépôt (**Settings** → **General** → **Features** → **Discussions**).
- Un accès de triage ou d'administration au dépôt.

## Catégories

Le dépôt utilise les catégories par défaut de GitHub. **Ne les renommez pas** : les formulaires et
l'annonce automatique de version dépendent de leurs slugs et de leurs noms.

| Catégorie (slug) | Usage |
|------------------|-------|
| Announcements (`announcements`) | Mainteneur seulement : versions et actualités. Chaque release y ouvre un message automatiquement (voir [Publier une version](publier-une-version.md)). |
| General (`general`) | Tout le reste |
| Ideas (`ideas`) | Suggestions, discutées avant de devenir un ticket |
| Polls (`polls`) | Sondages du mainteneur, par exemple la prochaine boutique à prendre en charge |
| Q&A (`q-a`) | Demandes d'aide ; une réponse peut être marquée |
| Show and tell (`show-and-tell`) | Installations, astuces, résultats |

## Marquer une réponse

1. Ouvrez la discussion Q&A.
2. Sous le commentaire qui résout la question, cliquez sur **Mark as answer** (icône de coche).
   - **Résultat attendu** : le commentaire apparaît en haut, encadré comme réponse.

## Convertir entre discussions et tickets

- **Discussion → ticket** (bug confirmé ou fonctionnalité claire) :
  1. Dans la barre latérale droite de la discussion, cliquez sur **Create issue from discussion**.
  2. Choisissez le formulaire de ticket adapté.
  3. Ajoutez les labels (`bug`, `enhancement`, `needs-triage`) et un lien vers la discussion.
- **Ticket → discussion** (question ou idée ouverte) :
  1. Dans la barre latérale droite du ticket, cliquez sur **Convert to discussion**.
  2. Choisissez la catégorie (le plus souvent Q&A ou Ideas).
  - **Résultat attendu** : le ticket est fermé, son historique est conservé dans la discussion.
- **Changer de catégorie** : icône de crayon à côté du nom de la catégorie de la discussion.

## Verrouiller, épingler, masquer

- **Verrouiller** une discussion résolue, hors sujet ou houleuse : *Lock conversation* dans la barre
  latérale droite. Donnez une raison courte et aimable.
- **Épingler** jusqu'à quatre discussions en haut de la liste : *Pin discussion*. Le message de bienvenue
  est le premier candidat.
- **Masquer** un commentaire indésirable ou hors sujet : *Hide*.
- **Supprimer** tout ce qui expose des données personnelles, une clé API ou une vraie adresse d'instance,
  puis demander à l'auteur de révoquer sa clé.
- Les signalements de comportement suivent le
  [Code de conduite](https://github.com/Foufou-exe/homebox-clipper/blob/main/CODE_OF_CONDUCT.md).

## Mettre à jour les formulaires de discussion

Les formulaires sont des fichiers YAML dans `.github/DISCUSSION_TEMPLATE/`, un par catégorie, nommés
d'après le slug (`q-a.yml`, `ideas.yml`, `show-and-tell.yml`, `general.yml`). Il n'y a pas de formulaire
pour Announcements (mainteneur seulement) ni pour Polls (non pris en charge par GitHub).

1. Modifiez le fichier dans une pull request. Syntaxe :
   [Syntax for discussion category forms](https://docs.github.com/en/discussions/managing-discussions-for-your-community/syntax-for-discussion-category-forms).
2. Gardez mot pour mot l'avertissement de confidentialité : *Never attach raw store pages, API keys, real
   instance addresses (public or local) or personal data.*
3. Lancez `bun run check:config`.
   - **Résultat attendu** : aucune erreur (schéma, identifiants, avertissement de confidentialité et labels
     sont vérifiés). Ces fichiers ne déclenchent pas la CI GitHub : cette commande locale est leur seule
     protection.
4. Fusionnez dans `main` : les formulaires s'appliquent à partir de là.

Fichiers liés : `SUPPORT.md` (où poser quelle question) et `.github/ISSUE_TEMPLATE/config.yml` (liens vers
les Discussions depuis la page de nouveau ticket).

## Si ça ne marche pas

| Symptôme | Que faire |
|----------|-----------|
| L'annonce de version n'apparaît pas | La catégorie `announcements` manque ou les Discussions sont désactivées : le job `publish` affiche alors un avertissement. Recréez la catégorie avec ce slug. |
| Un formulaire ne s'affiche pas | Vérifiez que le nom du fichier est exactement le slug de la catégorie et que la pull request est fusionnée dans `main`. |
