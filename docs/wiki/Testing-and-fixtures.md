# Tests et fixtures

## Lancer les vérifications

| Commande | Rôle |
|----------|------|
| `bun run test` | Tests unitaires et de contrat (Vitest, environnement happy-dom). **Pas** `bun test`. |
| `bun run test:watch` | Mode continu. |
| `bun run test:build` | Vérifie le manifeste de production (permissions, CSP) ; à lancer **après** `bun run build`. |
| `bun run typecheck` | Types (`vue-tsc --noEmit`). |
| `bun run lint` | ESLint. |
| `bun run check:config` | Réglages du dépôt : JSON(C), YAML, version de Bun, modèles d'issue et étiquettes. |
| `bun run ci` | Tout, dans l'ordre : check:config, typecheck, lint, test, build, test:build. |

Le quota de GitHub Actions est limité : la référence est **`bun run ci` en local, avant chaque push**. Un
hook `pre-push` facultatif peut le lancer automatiquement (`bun run setup` le propose).

## Organisation de `tests/`

| Dossier | Contenu |
|---------|---------|
| `tests/unit/` | Parseurs, extracteur Amazon.fr, téléchargement, PDF, règle d'URL, chiffrement de la clé, stockage de la configuration, routeur, doublons, thème, catalogue de traduction, confidentialité, rendu des textes. |
| `tests/contract/` | Client HomeBox et orchestrateur d'import contre une API **simulée** (succès, 401, erreur réseau, réponse non JSON, échec de la pièce jointe après création, reprise). |
| `tests/build/` | Contrôle du manifeste produit (permissions exactes, absence de `host_permissions` statiques, permissions d'hôte optionnelles, CSP). |
| `tests/fixtures/` | Pages de commande anonymisées (voir ci-dessous). |

## Fixtures anonymisées

Chaque extracteur est testé sur des pages HTML enregistrées. Pour Amazon.fr, elles sont dans
`tests/fixtures/amazon-fr/` : page à un article avec facture, plusieurs articles, plusieurs expéditions,
sans facture, vendeur tiers, ancienne mise en page, page qui n'est pas une commande, contenu du menu
« Facture ». Les fichiers actuels sont **synthétiques** (écrits à la main d'après la structure connue des
pages) : ils n'ont pas encore été confrontés à de vraies pages anonymisées.

### Ajouter ou remplacer une fixture

1. Sur une page de détail de commande : clic droit, « Enregistrer sous », *Page web, HTML uniquement*, dans
   `tests/fixtures/amazon-fr/raw/` (dossier **ignoré par git**, ne jamais le commiter).
2. Copiez le fichier hors de `raw/`, puis :
   - supprimez les balises `<script>`, `<style>`, `<link>`, `<iframe>` et les commentaires ;
   - remplacez le nom, l'adresse de livraison et le moyen de paiement par des valeurs fictives
     (`Jean Exemple`, `1 rue Fictive`, `Carte se terminant par 0000`) ;
   - remplacez le numéro de commande par `999-0000000-00000NN` et les identifiants de documents
     (`/documents/download/<uuid>/`) par des UUID fictifs ;
   - conservez la structure DOM (balises, classes, attributs `data-*`).
3. Vérifiez qu'il ne reste rien de personnel :
   `grep -iE "@|\b0[67][0-9 ]{8}\b|<script" fichier.html` ne doit rien renvoyer.
4. Notez la date de capture et le type de page dans le README du dossier (jamais l'adresse réelle).

### Quand Amazon change sa mise en page

1. Capturez et anonymisez la nouvelle page comme ci-dessus.
2. Ajoutez un test qui **échoue** sur cette fixture (`tests/unit/amazon-fr-extractor.test.ts`).
3. Corrigez **uniquement** `src/content/merchants/amazon-fr/selectors.ts`, en ajoutant des sélecteurs de
   secours plutôt qu'en remplaçant les anciens quand c'est possible.

Une correction de sélecteur sans fixture qui reproduit la nouvelle structure n'est pas acceptée.

## Contrôles automatiques notables

- Les clés de traduction littérales utilisées dans `src/` existent dans `fr.yml`, chaque code d'erreur a son
  message, aucune valeur du catalogue n'est vide.
- Le rendu de l'avertissement « HTTP non chiffré » reprend exactement le catalogue.
- La recherche de doublons cherche le numéro de commande entre guillemets et compare les noms normalisés.
- La règle d'URL est testée y compris contre les noms publics qui imitent une IP privée.
- Le manifeste de production est comparé à la liste exacte des permissions autorisées.

Pour monter une instance HomeBox de test et dérouler les scénarios à la main :
[Local-HomeBox-instance](Local-HomeBox-instance.md). Pour ajouter un marchand : [Adding-a-merchant](Adding-a-merchant.md).
