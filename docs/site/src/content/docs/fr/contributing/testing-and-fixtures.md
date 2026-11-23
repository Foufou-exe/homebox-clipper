---
title: "Tests et fixtures"
description: "Lancer les vérifications, écrire des tests et ajouter des fixtures anonymisées."
---

## Lancer les vérifications

| Commande | Rôle |
|----------|------|
| `bun run test` | Tests unitaires et de contrat (Vitest, environnement happy-dom). **Pas** `bun test`. |
| `bun run test:watch` | Mode surveillance. |
| `bun run test:coverage` | Tests avec couverture V8 : résumé dans le terminal, `coverage/lcov.info` pour SonarQube Cloud. Ne fait pas partie de `bun run ci` ; le pourcentage est informatif, aucun seuil n'est imposé. |
| `bun run test:build` | Vérifie le manifeste de production (permissions, CSP) ; à lancer **après** `bun run build`. |
| `bun run typecheck` | Types (`vue-tsc --noEmit`). |
| `bun run lint` | ESLint. |
| `bun run check:config` | Réglages du dépôt : JSON(C), YAML, version de Bun, modèles de tickets et labels, parité des catalogues `en`/`fr`. |
| `bun run ci` | Tout, dans l'ordre : check:config, typecheck, lint, test, build, test:build. |

La CI GitHub lance les mêmes vérifications sur les pull requests et sur `main` ; lancez **`bun run ci` en local avant chaque push** pour détecter les erreurs tôt. Un
hook `pre-push` facultatif peut le lancer automatiquement (`bun run setup` le propose).

## Organisation de `tests/`

| Dossier | Contenu |
|---------|---------|
| `tests/unit/` | Analyseurs par langue de page, extracteur Amazon par boutique, téléchargement, PDF, règle d'URL, chiffrement de la clé, stockage des paramètres, routeur, doublons, thème, catalogues de traduction (dont la parité `en`/`fr`), confidentialité, rendu des textes. |
| `tests/contract/` | Client HomeBox et orchestrateur d'import face à une API **simulée** (succès, 401, erreur réseau, réponse non JSON, échec d'une pièce jointe après la création, reprise). |
| `tests/build/` | Vérification du manifeste produit (permissions exactes, aucune `host_permissions` statique, permissions d'hôte optionnelles, CSP). |
| `tests/fixtures/` | Pages de commande anonymisées (voir ci-dessous). |

## Fixtures anonymisées

Chaque extracteur est testé sur des pages HTML enregistrées, un dossier par boutique Amazon :
`tests/fixtures/amazon-<store>/` (`amazon-fr`, `amazon-de`, `amazon-es`, `amazon-it`, `amazon-com-be`,
`amazon-nl`, `amazon-co-uk`, `amazon-com`), chacun avec un README (date, méthode, tableau des fixtures).

- **`real-*.html`** : structure d'une vraie page de commande, contenu 100 % fictif, produit par
  `scripts/fixtures/anonymize-amazon.ts` (liste d'autorisation, contrôle de fuite). Amazon.fr en possède.
- **`reconstructed-*.html`** : pages générées par `scripts/fixtures/reconstruct-amazon.ts` à partir des
  seules pages Amazon.fr anonymisées (langue, libellés, dates et prix de la boutique) ; le script ne
  lit jamais un dossier `raw/`. Elles couvrent les boutiques encore « en test » : une commande simple, une commande à plusieurs produits et une
  commande avec facture, ainsi que des variantes de langue (Amazon.de en anglais et en turc, Amazon.com.be en français
  et en néerlandais).
- Des pages synthétiques écrites à la main couvrent les autres cas d'Amazon.fr (ancienne mise en page, page qui n'est pas une
  commande...).

Une boutique passe de `testing` à `supported` seulement lorsqu'une fixture `real-*.html` existe dans son dossier : le
statut change dans `src/content/merchants/amazon/stores.ts`, `MERCHANTS.md` et `MERCHANTS.fr.md` dans la
même pull request (les tests vérifient les trois).

### Ajouter ou remplacer une fixture

1. Sur une page de détails de commande : clic droit, « Enregistrer sous », *Page web, HTML uniquement*, dans
   `tests/fixtures/amazon-<store>/raw/` (dossier **ignoré par git**, ne le commitez jamais, ne le joignez jamais à un
   ticket).
2. Lancez l'outil local : `bun scripts/fixtures/anonymize-amazon.ts amazon-<store> <raw file> real-order-single.html <language>`.
   Il ne conserve que le sous-arbre `#orderDetails` grâce à une liste d'autorisation, remplace chaque texte par une valeur
   générée, puis lance le **contrôle de fuite** (chaque valeur de la page brute est recherchée dans la fixture) : la fixture
   n'est écrite que s'il trouve 0 fuite. L'outil n'affiche que des compteurs, jamais une valeur de la page.

Pour une fixture synthétique écrite à la main :

1. Enregistrez la page dans `raw/` comme ci-dessus.
2. Copiez le fichier hors de `raw/`, puis :
   - supprimez les balises `<script>`, `<style>`, `<link>`, `<iframe>` et les commentaires ;
   - remplacez le nom, l'adresse de livraison et le moyen de paiement par des valeurs fictives
     (`Jean Exemple`, `1 rue Fictive`, `Carte se terminant par 0000`, les valeurs de remplacement déjà utilisées par les
     fixtures existantes, puisque les pages Amazon.fr sont en français) ;
   - remplacez le numéro de commande par `999-0000000-00000NN` et les identifiants de document
     (`/documents/download/<uuid>/`) par des UUID fictifs ;
   - conservez la structure du DOM (balises, classes, attributs `data-*`).
3. Vérifiez qu'il ne reste rien de personnel :
   `grep -iE "@|\+[0-9]{2}|\+1[ (]|\b0[67][0-9 ]{8}\b|<script" file.html` ne doit rien renvoyer (formats de
   téléphone `+49`, `+44`, `+1`... inclus).
4. Notez la date de capture et le type de page dans le README du dossier (jamais l'adresse réelle).

### Quand Amazon change sa mise en page

1. Capturez et anonymisez la nouvelle page comme ci-dessus.
2. Ajoutez un test qui **échoue** sur cette fixture (`tests/unit/amazon-stores-extractor.test.ts`, ou
   `tests/unit/amazon-fr-extractor.test.ts` pour Amazon.fr).
3. Corrigez **uniquement** `src/content/merchants/amazon/selectors.ts` (sélecteurs) ou
   `src/content/merchants/amazon/page-locales.ts` (libellés et noms de mois d'une langue de page), en ajoutant des
   replis plutôt qu'en remplaçant les anciens quand c'est possible.

Une correction de sélecteur sans fixture reproduisant la nouvelle structure n'est pas acceptée.

## Vérifications automatiques notables

- Les catalogues `en` et `fr` ont les mêmes clés et les mêmes substitutions ; les clés de traduction littérales
  utilisées dans `src/` existent dans le catalogue, chaque code d'erreur a son message, aucune valeur du catalogue n'est vide.
- Le rendu de l'avertissement « HTTP non chiffré » correspond exactement au catalogue.
- La recherche de doublons cherche le numéro de commande entre guillemets et compare les noms normalisés.
- La recherche de doublons peut aussi utiliser le filtre de champs personnalisés de HomeBox (`fields`) lorsque l'option des champs de commande est activée :
  un candidat trouvé uniquement par le filtre est confirmé en le lisant (5 lectures au maximum). Couvert par
  `tests/contract/homebox-client-field-search.test.ts`, `tests/unit/duplicates-field-filter.test.ts` et
  `tests/contract/duplicate-check-field-filter.test.ts`.
- La règle d'URL est testée, y compris face à des noms publics qui imitent une IP privée.
- Le manifeste de production est comparé à la liste exacte des permissions autorisées.

Pour mettre en place une instance HomeBox de test et dérouler les scénarios à la main :
[Instance HomeBox locale](/homebox-clipper/fr/contributing/local-homebox-instance/). Pour ajouter un marchand : [Ajouter un marchand](/homebox-clipper/fr/contributing/adding-a-merchant/).
