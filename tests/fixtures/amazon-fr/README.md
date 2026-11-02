# Fixtures Amazon.fr

Pages HTML de commande Amazon.fr utilisées par les tests des extracteurs (constitution, principe VII).

## État actuel : fixtures anonymisées issues de vraies pages (2026-11-02)

Les fichiers `real-*.html` conservent la **structure** de vraies pages « Détails de la commande »
capturées le 2026-11-02 (balises, imbrication, classes, `data-component`, nombre de lignes). Leur
**contenu est entièrement fictif** : aucune valeur ne provient des pages d'origine. Les autres
fichiers restent synthétiques, écrits à la main le 2026-10-22, pour couvrir des cas absents des
captures (vendeur tiers, ancienne mise en page, page non-commande…).

## Méthode d'anonymisation des fixtures `real-*`

Les captures brutes restent dans `raw/` (ignoré par git). Un script génère les fixtures par
**liste blanche** ; personne n'a besoin de lire les pages brutes :

1. seul le sous-arbre `#orderDetails` est gardé, dans un squelette `<html lang="fr-fr"><body>` ;
2. scripts, styles, commentaires et composants sensibles sont retirés entièrement (adresse,
   paiement, récapitulatif de commande, acheteur, cadeaux, personnalisation, publicité, actions) ;
3. seuls `class`, `id` sans chiffres et `data-component` sont conservés ; `href`, `src` et
   `data-a-popover` sont reconstruits avec des valeurs fictives, tout autre attribut est supprimé ;
4. tout nœud texte est remplacé par une valeur générée (`Produit fictif N`, `11,11 €`,
   `15 mars 2024`, `999-0000000-00000NN`, `Vendeur Fictif`, `Texte fictif`), sauf correspondance
   exacte avec une liste de libellés d'interface génériques (« Facture », « Vendu par : »…) ;
5. un contrôle de fuite compare chaque fixture à toutes les valeurs extraites du brut (textes,
   attributs, ASIN, numéros, suites de chiffres, e-mails, téléphones, codes postaux) : 0 attendu.
   Ce contrôle est lui-même testé en contaminant des copies jetables.

| Fixture | Type de commande d'origine | Contenu attendu |
|---------|----------------------------|-----------------|
| `real-order-single.html` | 1 article, avec facture | 1 produit, 1 facture via le menu |
| `real-order-multi.html` | 2 articles, 2 expéditions, 2 factures | 2 produits, 2 factures via le menu |
| `real-order-qty.html` | 2 articles en quantité > 1 | 2 produits, badge de quantité (2 et 3) |
| `real-order-no-invoice.html` | 3 articles, sans facture | 3 produits, aucun menu « Facture » |
| `real-invoice-popover-single.html` | menu « Facture » de la commande à 1 article | 1 facture + récapitulatif imprimable |
| `real-invoice-popover-multi.html` | menu « Facture » de la commande à 2 factures | 2 factures + récapitulatif imprimable |

## Procédure de capture et d'anonymisation manuelle (fixtures synthétiques)

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

Fixtures écrites à la main :

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
