<div align="center">

<img src="public/icon/128.png" alt="" width="96" height="96">

# homebox-companion

**Transformez un achat Amazon.fr en objet d'inventaire [HomeBox](https://github.com/sysadminsmedia/homebox), facture comprise, en un clic.**

[![CI](https://github.com/Foufou-exe/homebox-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/Foufou-exe/homebox-companion/actions/workflows/ci.yml)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)
![Chrome / Chromium](https://img.shields.io/badge/Chrome%20%2F%20Chromium-supporté-success)
![Statut](https://img.shields.io/badge/statut-MVP-orange)

</div>

---

Vous venez d'acheter un clavier, une perceuse ou un disque dur sur Amazon ? Pour le recenser dans
HomeBox, il faut télécharger la facture, ouvrir HomeBox, créer l'objet, recopier le prix, la date,
le vendeur, puis joindre le PDF.

**homebox-companion** fait tout cela depuis la page de commande Amazon. Vous vérifiez, vous
confirmez, c'est rangé.

```
Page « Détails de la commande » Amazon.fr
        │  vous ouvrez l'extension
        ▼
Détection : produit, prix, date, n° de commande, vendeur, facture PDF
        │  vous vérifiez / corrigez, puis « Ajouter à HomeBox »
        ▼
Objet créé dans HomeBox ─▶ informations d'achat ─▶ facture jointe ─▶ lien vers l'objet
```

> [!NOTE]
> Rien n'est jamais envoyé sans votre confirmation, et rien n'est envoyé ailleurs qu'à **votre**
> instance HomeBox.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Ce qui est créé dans HomeBox](#ce-qui-est-créé-dans-homebox)
- [Confidentialité et sécurité](#confidentialité-et-sécurité)
- [Dépannage](#dépannage)
- [Limites connues](#limites-connues)
- [Développement](#développement)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)

## Fonctionnalités

- **Détection automatique** sur la page « Détails de la commande » d'Amazon.fr : nom du produit,
  prix et devise, date d'achat, numéro de commande, vendeur, quantité, photo et facture(s) PDF.
- **Résumé modifiable** avant tout envoi : chaque champ peut être corrigé, et les champs non
  détectés sont signalés.
- **Commandes multi-articles** : vous cochez les produits à importer, et chacun devient un objet
  HomeBox avec la facture jointe.
- **Ajout manuel** d'une facture ou d'un bon de commande (PDF de votre ordinateur) quand la
  détection échoue ou se trompe.
- **Vérification des fichiers** : seuls de vrais PDF (signature `%PDF-`) de 15 Mo maximum sont
  envoyés.
- **Détection des doublons** : un avertissement s'affiche si un objet portant le même numéro de
  commande et le même nom existe déjà.
- **Reprise sur erreur** : si l'objet est créé mais que la facture n'a pas pu être envoyée, vous
  pouvez réessayer sans créer de doublon, même après avoir fermé le popup.
- **Messages d'erreur clairs** pour chaque situation : instance injoignable, clé API refusée,
  facture indisponible, fichier non PDF, etc.

## Prérequis

| Élément | Version |
|---------|---------|
| Navigateur | Google Chrome ou Chromium récent (Brave, Edge, Vivaldi… devraient fonctionner) |
| HomeBox | Instance [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) avec l'API `/api/v1/entities` (testé avec **v0.27.0**) |
| Compte | Un compte Amazon.fr, connecté dans le même navigateur |
| Pour compiler | [Bun](https://bun.sh) ≥ 1.1 et [Node.js](https://nodejs.org) LTS |

## Installation

L'extension n'est pas encore publiée sur le Chrome Web Store. Il faut la compiler, puis la charger
en mode développeur.

```bash
git clone https://github.com/Foufou-exe/homebox-companion.git
cd homebox-companion
bun install
```

Choisissez ensuite le build adapté à votre instance HomeBox :

| Votre instance HomeBox | Commande | Dossier à charger |
|------------------------|----------|-------------------|
| En **HTTPS** (`https://homebox.mondomaine.fr`) ou sur `localhost` | `bun run build` | `.output/chrome-mv3/` |
| En **HTTP sur le réseau local** (`http://192.168.1.20:3100`, `http://homebox.lan`) | `bun run build:homelab` | `.output/chrome-mv3-homelab/` |

Puis, dans le navigateur :

1. Ouvrez `chrome://extensions`.
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier indiqué ci-dessus.
4. Épinglez l'icône 📦 dans la barre d'outils pour y accéder facilement.

La page de configuration s'ouvre automatiquement au premier lancement.

> [!WARNING]
> Le build **homelab** accepte les connexions HTTP non chiffrées : votre clé API circule alors en
> clair sur le réseau. Réservez-le à un réseau de confiance. Le build standard exige HTTPS.

**Mettre à jour :** `git pull && bun install`, relancez la commande de build, puis cliquez sur ↻
sur la carte de l'extension dans `chrome://extensions`.

## Configuration

### 1. Créer une clé API dans HomeBox

Dans HomeBox : **Profil** → **Clés API** → créez une clé et copiez-la (elle commence par `hb_`).

### 2. Renseigner l'extension

Clic sur l'icône de l'extension → ⚙ (ou clic droit → *Options*) :

1. **Adresse de l'instance HomeBox**, par exemple `https://homebox.mondomaine.fr`. Inutile
   d'ajouter `/api` : l'extension normalise l'adresse.
2. **Clé API** : collez la clé `hb_…`.
3. **Phrase de passe** (au moins 10 caractères) : elle chiffre la clé API sur le disque. Retenez-la :
   elle ne peut pas être récupérée.
4. Cliquez sur **Tester et enregistrer**.
5. Chrome vous demande l'autorisation d'accéder à **cette adresse uniquement** : acceptez.

L'extension vérifie que l'adresse est bien une instance HomeBox et que la clé est acceptée. Elle
affiche ensuite l'instance connectée et sa version.

**Déverrouiller / verrouiller :** après un redémarrage du navigateur, le popup demande votre
phrase de passe. Le bouton 🔒 du popup (ou *Verrouiller* dans les options) efface la clé de la
mémoire.

**Modifier ou supprimer :** sur la même page, changez l'adresse ou la clé. Pour conserver la clé
actuelle, laissez le champ vide et saisissez votre phrase de passe actuelle. Pour changer de phrase
de passe, ressaisissez la clé API. **Supprimer la configuration** efface aussi l'autorisation
d'accès accordée à l'instance.

**Phrase de passe oubliée :** elle ne peut pas être récupérée. Supprimez la configuration, puis
reconfigurez l'extension avec votre clé API (ou une nouvelle clé).

## Utilisation

1. Sur Amazon.fr, ouvrez **Vos commandes** → **Afficher les détails de la commande**.
2. Cliquez sur l'icône de l'extension. Le résumé de l'achat s'affiche :

   ```
   ┌─────────────────────────────────────────────┐
   │ ● HomeBox : https://homebox.mondomaine.fr   │
   │                                             │
   │ Nom du produit *                            │
   │ [Clavier sans fil Exemple Pro            ]  │
   │ Prix d'achat (EUR)   Quantité               │
   │ [99.99           ]   [1  ]                  │
   │ Date d'achat         N° de commande         │
   │ [22/10/2026      ]   [123-4567890-1234567]  │
   │ Vendeur  [Amazon EU S.à r.l.             ]  │
   │                                             │
   │ Documents à joindre                         │
   │ ☑ facture-amazon-123-4567890-1234567.pdf    │
   │ [Facture ▾] [Choisir un PDF…]               │
   │                                             │
   │ [ Ajouter à HomeBox ]  [ Annuler ]          │
   └─────────────────────────────────────────────┘
   ```

3. Vérifiez et corrigez si besoin. Pour joindre un autre document, choisissez un PDF sur votre
   ordinateur : il peut remplacer la facture détectée ou s'y ajouter.
4. Cliquez sur **Ajouter à HomeBox**. Un message confirme l'ajout, avec un lien **Ouvrir dans
   HomeBox**.

**Sur une autre page** (page produit, autre site), l'extension indique qu'aucun achat n'est
détecté et propose un formulaire vide pour une saisie manuelle.

**En cas d'échec partiel** (objet créé, facture non envoyée), le popup affiche **Réessayer l'envoi
de la facture**. Si vous fermez le popup, la reprise vous est reproposée à sa prochaine ouverture
sur la même page.

## Ce qui est créé dans HomeBox

| Information détectée | Champ HomeBox |
|----------------------|---------------|
| Nom du produit | Nom |
| « Acheté sur Amazon.fr le JJ/MM/AAAA » (modifiable) | Description |
| Quantité | Quantité |
| Prix unitaire | Prix d'achat |
| Date de commande | Date d'achat |
| Vendeur (par défaut « Amazon.fr ») | Acheté chez |
| N° de commande et lien vers la commande | Notes (`Commande Amazon.fr : 123-…`) |
| Facture PDF | Pièce jointe de type **Reçu** |
| Bon de commande ajouté manuellement | Pièce jointe de type **Pièce jointe** |

L'objet est créé avec le type par défaut de HomeBox (« Item »), sans emplacement ni étiquette. La
photo du produit n'est affichée que dans le résumé, elle n'est pas envoyée.

## Confidentialité et sécurité

- **Aucun serveur intermédiaire, aucune statistique d'usage.** L'extension ne parle qu'à Amazon.fr
  (pour lire la page et télécharger la facture, avec votre session) et à votre instance HomeBox.
- **La clé API est chiffrée par votre phrase de passe.** Sur le disque, seule une version chiffrée
  est conservée (AES-GCM 256, clé dérivée par PBKDF2-SHA256 avec 600 000 itérations). L'adresse
  de l'instance est liée au chiffrement : la modifier sans la phrase de passe rend la clé
  inutilisable, ce qui empêche de la détourner vers un autre serveur.
- **Déverrouillage par session.** La phrase de passe est demandée à la première utilisation après
  le démarrage du navigateur. La clé déchiffrée ne vit qu'en mémoire (`chrome.storage.session`) :
  elle disparaît à la fermeture du navigateur ou quand vous cliquez sur 🔒. La phrase de passe
  n'est jamais enregistrée.
- **La clé reste dans votre navigateur.** Seul le service worker de l'extension l'utilise. Elle
  n'est jamais transmise à la page Amazon, jamais affichée en clair (`hb_••••abcd`) et jamais
  écrite dans les journaux.
- **Pas d'import sans confirmation** : aucun objet n'est créé sans un clic sur « Ajouter à HomeBox ».
- **Données minimales** : seuls les champs listés ci-dessus sont lus sur la page, jamais votre
  adresse ni votre moyen de paiement. Les données d'un import ne sont gardées qu'en mémoire de
  session, le temps de permettre une reprise, puis sont effacées.
- **Journaux sans données personnelles** : uniquement des codes d'erreur et des statuts HTTP.

> [!TIP]
> Pour limiter les conséquences d'une fuite, créez dans HomeBox une clé **dédiée à l'extension,
> avec une date d'expiration** : HomeBox affiche sa dernière utilisation et permet de la révoquer.

> [!IMPORTANT]
> Quand l'extension est déverrouillée, la clé est en mémoire : un programme malveillant qui
> contrôle votre session peut la lire, comme pour toute extension ou tout gestionnaire de mots de
> passe déverrouillé. Le chiffrement protège les fichiers du profil Chrome et l'extension verrouillée.

### Permissions demandées

| Permission | Pourquoi |
|------------|----------|
| `storage` | Mémoriser l'adresse de l'instance et la clé API chiffrée. |
| `activeTab` | Lire l'onglet Amazon **uniquement au moment où vous ouvrez l'extension**. Aucun accès permanent à Amazon. |
| `scripting` | Injecter le code de détection dans cet onglet, à ce moment-là. |
| Accès à votre instance (facultatif) | Demandé pour **l'adresse exacte** que vous configurez, retiré quand vous supprimez la configuration. |

## Dépannage

| Message | Cause probable et solution |
|---------|----------------------------|
| *Erreur interne de l'extension* | Rechargez l'extension (↻ dans `chrome://extensions`) puis rouvrez la page. Si le message persiste, [ouvrez une issue](https://github.com/Foufou-exe/homebox-companion/issues). |
| *Phrase de passe incorrecte.* | Ressaisissez-la (attention au verrouillage majuscules). En cas d'oubli : *Supprimer la configuration* puis reconfigurez. |
| *Extension verrouillée…* | Saisissez votre phrase de passe dans le popup. |
| *Une adresse HTTPS est obligatoire.* | Votre instance est en HTTP : utilisez le build `bun run build:homelab`. |
| *L'adresse HomeBox est invalide…* | L'adresse ne répond pas comme une instance HomeBox. Vérifiez-la dans un onglet : `<adresse>/api/v1/status` doit renvoyer du JSON. |
| *HomeBox est inaccessible.* | Instance arrêtée, mauvais port, ou réseau (VPN, pare-feu). |
| *Clé API invalide ou expirée.* | Recréez une clé dans HomeBox et enregistrez-la de nouveau. |
| *L'autorisation d'accès… a été refusée.* | Vous avez refusé la demande de Chrome : cliquez à nouveau sur « Tester et enregistrer » et acceptez. |
| *Aucun achat détecté sur cette page.* | Ouvrez la page **Détails de la commande** (pas la liste des commandes), ou saisissez les informations à la main. |
| *Le téléchargement de la facture a été refusé.* | Votre session Amazon a expiré : reconnectez-vous, rechargez la page, puis réessayez. |
| *La facture n'est pas encore disponible…* | Fréquent juste après la commande ou avec certains vendeurs tiers. Joignez le PDF à la main ou réessayez plus tard. |
| *Le fichier n'est pas un PDF.* | Le lien mène à une page HTML (ex. « Récapitulatif de commande »). Téléchargez la facture et joignez-la à la main. |

## Limites connues

- **Amazon.fr uniquement**, et seulement la page « Détails de la commande ».
- **Chrome et Chromium uniquement** pour l'instant ; Firefox est prévu.
- **La détection dépend du HTML d'Amazon**, qui change régulièrement. Les tests actuels utilisent
  des pages d'exemple écrites à la main, pas encore des captures réelles anonymisées. Si un champ
  n'est plus détecté, la saisie manuelle reste possible : merci de
  [signaler le problème](https://github.com/Foufou-exe/homebox-companion/issues).
- **Devise** : HomeBox enregistre un montant sans devise. Pour un achat dans une autre devise que
  l'euro, l'extension vous prévient mais ne convertit pas.

## Développement

### Stack

[WXT](https://wxt.dev) (Manifest V3, base Vite) · [Vue 3](https://vuejs.org) ·
TypeScript strict · [Vitest](https://vitest.dev) + happy-dom · Bun comme gestionnaire de paquets.

### Commandes

| Commande | Rôle |
|----------|------|
| `bun run dev` | Lance un Chrome de développement avec rechargement automatique (HTTP autorisé) |
| `bun run build` | Build de production → `.output/chrome-mv3/` |
| `bun run build:homelab` | Build acceptant une instance en HTTP → `.output/chrome-mv3-homelab/` |
| `bun run zip` | Archive prête à publier |
| `bun run test` | Tests unitaires et de contrat (passez par Vitest : **pas** `bun test`) |
| `bun run test:build` | Vérifie le manifeste de production (permissions, CSP), après `bun run build` |
| `bun run typecheck` | Vérification des types (`vue-tsc`) |
| `bun run lint` | ESLint |

La CI (`.github/workflows/ci.yml`) exécute `typecheck`, `lint`, `test`, `build` et `test:build`
à chaque push et pull request.

### Architecture

```
src/
├── entrypoints/          Points d'entrée WXT (fins, ils délèguent aux couches ci-dessous)
│   ├── background.ts     Service worker
│   ├── popup/            Popup (résumé, résultat, reprise)
│   ├── options/          Page de configuration
│   └── amazon-fr.content.ts  Script injecté à la demande dans l'onglet Amazon
├── background/           Service worker : seul détenteur de la clé API
│   ├── homebox/          Client de l'API HomeBox
│   ├── config/           Stockage de la configuration, règles d'URL (HTTPS)
│   ├── import/           Orchestration create → update → attachments, reprise, doublons
│   ├── detect.ts         Injection du script et détection
│   └── router.ts         Validation et routage des messages internes
├── content/merchants/    Extracteurs par marchand
│   └── amazon-fr/
│       ├── selectors.ts  ⚠ SEUL fichier contenant les sélecteurs Amazon
│       ├── parse.ts      Analyse des prix, dates, n° de commande (fonctions pures)
│       ├── extractor.ts  Extraction avec sélecteurs de secours
│       └── download.ts   Téléchargement et vérification du PDF
├── ui/                   Composants Vue
├── shared/               Types, messages, codes d'erreur, utilitaires PDF, logger
└── platform/             Abstraction de l'API navigateur (portage Firefox)
tests/
├── fixtures/amazon-fr/   Pages Amazon anonymisées
├── unit/                 Parseurs, extracteur, PDF, URL, configuration, confidentialité…
├── contract/             Client HomeBox et orchestrateur (API simulée)
└── build/                Vérification du manifeste produit
```

**Un import se déroule en trois appels.** L'API HomeBox n'accepte pas le prix, la date ni le
vendeur à la création, d'où :

1. `POST /api/v1/entities` : création (nom, description, quantité) ;
2. `PUT /api/v1/entities/{id}` : informations d'achat et notes ;
3. `POST /api/v1/entities/{id}/attachments` : facture (`multipart/form-data`, `type=receipt`).

L'état de chaque étape est conservé dans `chrome.storage.session`. Une étape réussie n'est jamais
rejouée, et l'objet n'est jamais recréé.

### Quand Amazon change sa mise en page

1. Enregistrez la page de commande dans `tests/fixtures/amazon-fr/raw/` (ignoré par git).
2. Anonymisez-la en suivant [`tests/fixtures/amazon-fr/README.md`](tests/fixtures/amazon-fr/README.md),
   puis copiez-la dans `tests/fixtures/amazon-fr/`.
3. Ajoutez un test dans `tests/unit/amazon-fr-extractor.test.ts`.
4. Corrigez **uniquement** `src/content/merchants/amazon-fr/selectors.ts`. Chaque champ accepte
   une liste de sélecteurs, du plus précis au plus général.

> [!CAUTION]
> Ne commitez jamais de page Amazon brute, de clé API ni d'adresse d'instance réelle.

### Ajouter un marchand

Créez `src/content/merchants/<marchand>/` en implémentant l'interface `MerchantExtractor`
(`src/content/merchants/types.ts`), avec son propre `selectors.ts` et ses fixtures, puis un point
d'entrée injectable dans `src/entrypoints/`. L'orchestrateur d'import, le client HomeBox et
l'interface n'ont pas à changer.

### Tester contre une instance locale

```bash
docker run -d --name homebox-dev -p 3100:7745 ghcr.io/sysadminsmedia/homebox:latest
```

Créez un compte sur `http://localhost:3100`, générez une clé API, puis configurez l'extension avec
`http://localhost:3100` (accepté par tous les builds).

## Feuille de route

Prévu après validation du MVP :

- [ ] Amazon Allemagne, Espagne, Italie, États-Unis
- [ ] eBay, Fnac, Darty, Boulanger, Leroy Merlin
- [ ] Support de Firefox
- [ ] Choix de l'emplacement de stockage et étiquettes automatiques
- [ ] Envoi de la photo du produit
- [ ] Extraction de la garantie, import des manuels et bons de livraison
- [ ] Historique des imports
- [ ] Plusieurs instances HomeBox
- [ ] Détection avancée des doublons

## Contribuer

Les contributions sont les bienvenues : signalements de pages Amazon mal détectées, nouveaux
marchands, corrections.

1. Forkez le dépôt et créez une branche (`git checkout -b feat/ma-fonctionnalite`).
2. Vérifiez que `bun run typecheck && bun run lint && bun run test` passent.
3. Utilisez des messages de commit [Conventional Commits](https://www.conventionalcommits.org/fr/)
   (`feat:`, `fix:`, `docs:`…).
4. Signalez explicitement dans la pull request toute modification des permissions du manifeste.

Pour une page mal détectée, indiquez dans l'issue le type de commande (vendeur Amazon ou tiers,
plusieurs articles, numérique…) et le champ concerné, **sans** joindre la page brute.

---

<sub>homebox-companion est un projet indépendant, sans lien avec Amazon ni avec l'équipe HomeBox.</sub>
