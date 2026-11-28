# Documentation du mainteneur

**Public visé** : le mainteneur du projet (droits d'administration sur le dépôt). Ces pages ne sont pas
publiées sur le site de documentation : elles décrivent des opérations que les utilisateurs et les
contributeurs n'ont pas à faire.

- Utilisateurs : <https://foufou-exe.github.io/homebox-clipper/fr/>
- Contributeurs : `CONTRIBUTING.md` et la section « Contribuer » du site.

## Sommaire

| Je veux… | Page |
|----------|------|
| Publier une version, l'envoyer au Chrome Web Store et sur addons.mozilla.org | [Publier une version](publier-une-version.md) |
| Configurer GitHub Pages ou publier les pages de redirection du wiki | [Publier le site de documentation et le wiki](publier-la-documentation.md) |
| Savoir quels secrets et réglages GitHub le projet utilise | [Réglages et secrets du dépôt](reglages-du-depot.md) |
| Changer la version de Bun, Node, HomeBox, WXT, une extension VS Code, un label ou SonarQube Cloud | [Mettre à jour l'outillage du projet](environnement-de-developpement.md) |
| Modérer les Discussions et leurs formulaires | [Modérer les Discussions](moderer-les-discussions.md) |

Les textes des fiches des boutiques restent dans [`docs/store/`](../store/) :
[`listing.md`](../store/listing.md) (Chrome Web Store), [`amo-listing.md`](../store/amo-listing.md) et
[`amo-build.md`](../store/amo-build.md) (addons.mozilla.org), [`screenshots/`](../store/screenshots/).

## Règles pour ces pages

- En français uniquement, au format Markdown du dépôt (pas de syntaxe propre au site).
- Jamais liées depuis le site, le wiki, `README.md` ou `CONTRIBUTING.md`.
- Chaque page suit le même plan : public visé, prérequis, étapes numérotées avec la commande ou le clic
  exact, résultat attendu, « Si ça ne marche pas ».
- Jamais de valeur de secret, de vraie adresse d'instance ni de vraie clé : exemples fictifs seulement.
