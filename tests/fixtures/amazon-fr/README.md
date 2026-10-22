# Fixtures Amazon.fr

Pages HTML de commande Amazon.fr utilisées par les tests des extracteurs (constitution, principe VII).

## État actuel : fixtures SYNTHÉTIQUES

Les fichiers de ce dossier ont été **écrits à la main** (2026-10-22), d'après la structure connue des
pages « Détails de la commande » d'Amazon.fr (attributs `data-component`, mise en page
historique `.yohtmlc-item`). Ils n'ont pas encore été confrontés à de vraies pages.
**La tâche T029 n'est donc pas terminée** : elle le sera quand des pages réelles anonymisées auront
remplacé ou complété ces fichiers, et que `selectors.ts` aura été ajusté si nécessaire.

## Procédure de capture et d'anonymisation

1. Sur une page de détail de commande Amazon.fr : clic droit → « Enregistrer sous » → *Page web, HTML
   uniquement*, dans `tests/fixtures/amazon-fr/raw/` (ignoré par git — ne JAMAIS commiter ce dossier).
2. Copier le fichier hors de `raw/`, puis :
   - supprimer toutes les balises `<script>`, `<style>`, `<link>`, `<iframe>` et commentaires ;
   - remplacer le nom, l'adresse de livraison, le moyen de paiement par des valeurs fictives
     (`Jean Exemple`, `1 rue Fictive`, `Carte se terminant par 0000`) ;
   - remplacer le numéro de commande par `999-0000000-00000NN` et les identifiants de documents
     (`/documents/download/<uuid>/`) par des UUID fictifs ;
   - conserver la structure DOM (balises, classes, attributs `data-*`) intacte.
3. Vérifier : `grep -iE "@|\b0[67][0-9 ]{8}\b|<script" fichier.html` ne doit rien renvoyer.
4. Noter ci-dessous la date de capture et la page d'origine (type de commande, pas l'URL réelle).

| Fixture | Contenu attendu | Origine |
|---------|-----------------|---------|
| `order-single-item-invoice.html` | 1 produit, tous champs, 1 facture PDF | synthétique |
| `order-multi-item.html` | 2 produits (dont quantité 3), 1 facture | synthétique |
| `order-multi-shipment-invoices.html` | 2 factures | synthétique |
| `order-no-invoice.html` | aucune facture | synthétique |
| `order-marketplace-seller.html` | vendeur tiers, sans facture | synthétique |
| `order-alt-layout.html` | ancienne mise en page, facture via menu | synthétique |
| `not-an-order.html` | page produit (pas une commande) | synthétique |
| `invoice-popover.html` | contenu du menu « Facture » | synthétique |
