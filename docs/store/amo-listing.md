# Firefox Add-ons (addons.mozilla.org): listing texts

Copy-paste material for the manual submission to addons.mozilla.org (AMO). English is the default language;
French follows in the same sections. Source of truth for data handling: [PRIVACY.md](../../PRIVACY.md)
([PRIVACY.fr.md](../../PRIVACY.fr.md)). The Chrome Web Store texts are in [listing.md](./listing.md); the
permission texts below are taken from it, adapted to Firefox. The first version available for Firefox is 0.8.0.

Submission is manual (no automation, no AMO secret in the repository). Developer Hub map: **Submit a New
Add-on** (upload, source code), then **Edit Product Page** (name, summary, description, categories, support,
privacy policy), then the **Technical Details** (data collection, notes to the reviewer).

## 1. Basics

| Field | Value |
|-------|-------|
| Name (EN and FR) | `HomeBox Clipper` (same as the manifest `extName`) |
| Slug (add-on URL) | `homebox-clipper` |
| Add-on ID (manifest, definitive) | `homebox-clipper@foufou-exe.github.io` |
| Categories | Shopping; Productivity |
| Tags | `homebox`, `inventory`, `amazon`, `invoice`, `self-hosted` |
| License | MIT (see `LICENSE`) |
| Default language | English (add the French texts below) |
| Homepage / support site | `https://github.com/Foufou-exe/homebox-clipper` |
| Support URL (issues) | `https://github.com/Foufou-exe/homebox-clipper/issues` |
| Privacy policy | `https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.md` (French: `PRIVACY.fr.md`) |
| Platforms | **Firefox (desktop) only. Untick "Firefox for Android"** at every submission: Android is not supported. |
| Minimum version | Firefox 140 (`strict_min_version` of the manifest) |
| Upload | `homebox-clipper-X.Y.Z-firefox.zip` of the GitHub release (SHA-256 checked), listed on the public channel |

## 2. Summary (250 characters maximum)

EN (145 characters):

```
Import your Amazon purchases and invoices into your self-hosted HomeBox inventory in one click, after your confirmation. No server, no telemetry.
```

FR (154 caractères) :

```
Importez vos achats Amazon et leurs factures dans votre inventaire HomeBox auto-hébergé, en un clic, après confirmation. Aucun serveur, aucune télémétrie.
```

## 3. Description

EN:

```
HomeBox Clipper turns an Amazon purchase (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) into an item of your self-hosted HomeBox inventory, invoice included, in one click.

HomeBox is an open-source home inventory application that you host yourself. You need your own HomeBox instance and an API key to use this extension. Requires Firefox 140 or later on desktop (Firefox for Android is not supported).

HOW IT WORKS
1. Open the order details page on your Amazon store.
2. Click the extension icon: the product, price, date, order number, seller, quantity, PDF invoice and photo are detected.
3. Review and edit the summary, choose the HomeBox location.
4. Click "Add to HomeBox": the item, its invoice and its photo are created in your instance.

FEATURES
- Editable summary before anything is sent; undetected fields are flagged.
- Multi-item orders, manual PDF attachment, duplicate detection and completing the existing item instead.
- Recovery after an error without creating a duplicate.
- Product photo attached as the item's main image (can be unticked).
- Optional link to the order page (off by default): the link to the order page is added to the item as an external link and is stored in HomeBox; it points to the merchant's website.
- Manufacturer and model number read on the Amazon product page of each product (one request to the same store, without cookies, no API key or HomeBox data) and pre-filled; serial number typed by you; all editable, and a value already on the item is never replaced.
- Location picker with search.
- Suggested HomeBox tags (the store brand and your own local rules), editable in the summary before you confirm.
- Light, dark or automatic theme; English and French interface.

PRIVACY AND SECURITY
- No server, no account, no analytics, no telemetry. Your data goes only to your own HomeBox instance.
- Nothing is imported without your confirmation.
- Your API key is stored encrypted with your passphrase (AES-GCM, PBKDF2 with 600,000 iterations), is never sent to Amazon or to any intermediary server, and is never written to logs.
- A short import history (200 entries, 12 months) is kept only in your browser, encrypted with the same passphrase. You can clear it or turn it off at any time.
- You choose when the extension locks again: when the browser closes (default), after 15 minutes, 1 hour or 4 hours of inactivity, or every time it is opened. No network request is made to check for updates.
- No broad permission: the extension has no access to any website at install. It reads the Amazon tab only when you open it, and asks access to the exact address of each of your HomeBox instances only (1 to 10 instances, one passphrase, each key sent only to its own instance). You can remove that access in about:addons.
- Firefox does not run extensions in private windows unless you allow it in about:addons.
- HTTPS is required, except for local network addresses (with a warning).
- Open source (MIT license): https://github.com/Foufou-exe/homebox-clipper

SUPPORTED STORES
Amazon.fr today; Amazon.de, Amazon.es, Amazon.it, Amazon.com.be, Amazon.nl, Amazon.co.uk and Amazon.com in testing (checked on test pages, report any wrong detection). Prices in pounds or dollars are kept as is, without currency conversion. If an invoice cannot be downloaded, the extension warns you and you can attach the PDF by hand. More merchants are planned; request yours on GitHub.

HomeBox Clipper is an independent project, not affiliated with Amazon or the HomeBox team. Privacy policy: https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.md
```

FR :

```
HomeBox Clipper transforme un achat Amazon (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) en objet de votre inventaire HomeBox auto-hébergé, facture comprise, en un clic.

HomeBox est une application d'inventaire domestique open source que vous hébergez vous-même. Pour utiliser cette extension, il faut votre propre instance HomeBox et une clé API. Nécessite Firefox 140 ou ultérieur sur ordinateur (Firefox pour Android n'est pas pris en charge).

FONCTIONNEMENT
1. Ouvrez la page de détails d'une commande sur votre boutique Amazon.
2. Cliquez sur l'icône de l'extension : le produit, le prix, la date, le numéro de commande, le vendeur, la quantité, la facture PDF et la photo sont détectés.
3. Relisez et modifiez le récapitulatif, choisissez l'emplacement HomeBox.
4. Cliquez sur « Ajouter à HomeBox » : l'objet, sa facture et sa photo sont créés dans votre instance.

FONCTIONNALITÉS
- Récapitulatif modifiable avant tout envoi ; les champs non détectés sont signalés.
- Commandes de plusieurs produits, ajout manuel d'un PDF, détection des doublons et complément de l'objet existant.
- Reprise après une erreur sans créer de doublon.
- Photo du produit jointe comme image principale de l'objet (décochable).
- Lien facultatif vers la page de commande (désactivé par défaut) : le lien vers la page de commande est ajouté à l'objet comme lien externe et est enregistré dans HomeBox ; il pointe vers le site du marchand.
- Fabricant et numéro de modèle lus sur la page produit Amazon de chaque produit (une requête vers la même boutique, sans cookie, sans clé API ni donnée HomeBox) et pré-remplis ; numéro de série saisi par vous ; modifiables, jamais une valeur déjà présente remplacée.
- Choix de l'emplacement avec recherche.
- Tags HomeBox proposés (l'enseigne de la boutique et vos propres règles locales), modifiables dans le récapitulatif avant la confirmation.
- Thème clair, sombre ou automatique ; interface en français et en anglais.

CONFIDENTIALITÉ ET SÉCURITÉ
- Aucun serveur, aucun compte, aucune statistique, aucune télémétrie. Vos données vont uniquement vers votre propre instance HomeBox.
- Rien n'est importé sans votre confirmation.
- Votre clé API est stockée chiffrée avec votre phrase de passe (AES-GCM, PBKDF2 avec 600 000 itérations), n'est jamais envoyée à Amazon ni à un serveur intermédiaire, et n'est jamais écrite dans les journaux.
- Un court historique des imports (200 entrées, 12 mois) est conservé uniquement dans votre navigateur, chiffré avec la même phrase de passe. Vous pouvez l'effacer ou le désactiver à tout moment.
- Vous choisissez quand l'extension se verrouille : à la fermeture du navigateur (par défaut), après 15 minutes, 1 heure ou 4 heures d'inactivité, ou à chaque ouverture. Aucun appel réseau n'est fait pour vérifier les mises à jour.
- Aucune permission large : l'extension n'a accès à aucun site à l'installation. Elle lit l'onglet Amazon uniquement quand vous l'ouvrez, et ne demande l'accès qu'à l'adresse exacte de chacune de vos instances HomeBox (1 à 10 instances, une seule phrase de passe, chaque clé n'est envoyée qu'à sa propre instance). Vous pouvez retirer cet accès dans about:addons.
- Firefox n'exécute pas les extensions dans les fenêtres privées sauf si vous l'autorisez dans about:addons.
- HTTPS obligatoire, sauf pour les adresses du réseau local (avec un avertissement).
- Open source (licence MIT) : https://github.com/Foufou-exe/homebox-clipper

MARCHANDS PRIS EN CHARGE
Amazon.fr aujourd'hui ; Amazon.de, Amazon.es, Amazon.it, Amazon.com.be, Amazon.nl, Amazon.co.uk et Amazon.com en test (vérifiées sur des pages de test, signalez toute détection erronée). Un prix en livres ou en dollars est gardé tel quel, sans conversion de devise. Si une facture ne peut pas être téléchargée, l'extension vous prévient et vous pouvez joindre le PDF à la main. D'autres marchands sont prévus ; demandez le vôtre sur GitHub.

HomeBox Clipper est un projet indépendant, non affilié à Amazon ni à l'équipe HomeBox. Politique de confidentialité : https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.fr.md
```

## 4. Permissions

The manifest declares `storage`, `activeTab`, `scripting` and the optional host permissions `https://*/*` and
`http://*/*`. There is no static `host_permissions` and no static content script: **no host permission is
granted at install**. AMO shows these justifications to the reviewer; the extension ID is
`homebox-clipper@foufou-exe.github.io`.

**storage**

EN:

```
Stores the addresses of the user's HomeBox instances (1 to 10), each API key encrypted separately with the user's single passphrase, the theme, the last location used for each instance, a short local import history (product name, store, order number, dates, result and item link; at most 200 entries and 12 months, encrypted with the user's passphrase, can be cleared or turned off), the automatic lock setting, the automatic-tag setting (store-name option and the user's tag rules, plain text, no secret), the version number of the last update notice, and (in session memory only) the data of an import in progress so it can be resumed after an error, the time of the last use of the extension and the version ready to install. Updates are detected from the browser's own signal: no network request is made for them. Nothing is synced or sent anywhere.
```

FR :

```
Conserve les adresses des instances HomeBox de l'utilisateur (1 à 10), chaque clé API chiffrée séparément avec sa seule phrase de passe, le thème, le dernier emplacement utilisé pour chaque instance, un court historique des imports local (nom du produit, boutique, numéro de commande, dates, résultat et lien vers l'objet ; au plus 200 entrées et 12 mois, chiffré avec la phrase de passe de l'utilisateur, effaçable et désactivable), le réglage de verrouillage automatique, le réglage des tags automatiques (option du nom de la boutique et règles de tags de l'utilisateur, texte simple, sans secret), le numéro de version de la dernière annonce de mise à jour, et (en mémoire de session uniquement) les données d'un import en cours pour le reprendre après une erreur, l'heure de la dernière utilisation de l'extension et la version prête à être installée. Les mises à jour sont détectées par le signal du navigateur lui-même : aucun appel réseau n'est fait pour elles. Rien n'est synchronisé ni envoyé ailleurs.
```

**activeTab**

EN:

```
Grants temporary access to the Amazon order tab only when the user clicks the extension icon, so the purchase can be read and the invoice downloaded from that page, and the product page of each ordered product read on the same store (without cookies) to propose its manufacturer and model. It avoids any permanent host permission for Amazon.
```

FR :

```
Donne un accès temporaire à l'onglet de commande Amazon uniquement quand l'utilisateur clique sur l'icône de l'extension, pour lire l'achat et télécharger la facture depuis cette page, et lire sur la même boutique (sans cookie) la page produit de chaque produit commandé pour proposer son fabricant et son modèle. Cela évite toute permission d'hôte permanente pour Amazon.
```

**scripting**

EN:

```
Used with activeTab to inject the extension's own bundled detection script (scripting.executeScript with a packaged file) into the Amazon order tab at the moment the user opens the extension. No remote or dynamically built code is injected.
```

FR :

```
Utilisée avec activeTab pour injecter le script de détection fourni dans l'extension (scripting.executeScript avec un fichier packagé) dans l'onglet de commande Amazon au moment où l'utilisateur ouvre l'extension. Aucun code distant ni construit dynamiquement n'est injecté.
```

**Optional host permissions (`https://*/*` and `http://*/*`)**

They are declared as `optional_host_permissions` only because the address of a self-hosted HomeBox instance is
unknown in advance (any domain, IP or local name). They are never granted wholesale: when the user adds an
instance, the extension calls `permissions.request` for the **exact origin** of the address typed by the user
(for example `https://homebox.example.com/*`) and removes it with `permissions.remove` when no instance uses it
any more. `http://` is accepted only for local-network addresses.

EN:

```
Optional host permissions are needed because the user's HomeBox instances are self-hosted at addresses unknown in advance (any domain, IP or local name). They are not granted at install. When the user adds an instance or changes its address, the extension requests access to the exact origin of each HomeBox instance only (via permissions.request, with Firefox's own prompt), and removes it as soon as no instance uses that origin any more (instance deleted, address changed, all settings deleted). Each permission is used solely to send the user-confirmed import (item, invoice, photo) and read the location list from the instance chosen, and each API key is sent only to its own instance. HTTP is accepted only for local-network addresses. No other website is ever accessed, and there is no fixed host permission.
```

FR :

```
Les permissions d'hôte optionnelles sont nécessaires car les instances HomeBox de l'utilisateur sont auto-hébergées à des adresses inconnues à l'avance (domaine, IP ou nom local quelconque). Elles ne sont pas accordées à l'installation. Quand l'utilisateur ajoute une instance ou change son adresse, l'extension demande l'accès à l'origine exacte de chaque instance HomeBox (via permissions.request, avec la fenêtre d'autorisation de Firefox) et la retire dès qu'aucune instance n'utilise plus cette origine (instance supprimée, adresse changée, toute la configuration supprimée). Chaque permission sert uniquement à envoyer l'import confirmé par l'utilisateur (objet, facture, photo) et à lire la liste des emplacements de l'instance choisie, et chaque clé API n'est envoyée qu'à sa propre instance. Le HTTP n'est accepté que pour les adresses du réseau local. Aucun autre site n'est jamais accédé, et il n'y a aucune permission d'hôte fixe.
```

## 5. Data collection

Firefox requires a declaration in the manifest, which AMO shows to users at install and checks at upload. The
value is in `wxt.config.ts` (generated into `manifest.json`):

```json
"data_collection_permissions": { "required": ["websiteContent"] }
```

- **Required category: `websiteContent` (website content).** The text and the product photo of the
  Amazon order page, and the invoice PDF, are read at the user's click and sent **only to the user's own
  self-hosted HomeBox instance**, after the user confirms the import. Nothing is sent to the developer or to a
  third party; there is no telemetry and no analytics.
- Only `websiteContent` is declared because the other data the extension handles (API key, invoice, order details) also goes only to the user's own HomeBox instance, never to the developer or a third party; this is consistent with the privacy policy and with the Chrome Web Store form.
- No optional category. The AMO form (if it asks again) must say the same as the manifest: website content,
  required; nothing else, no "none".
- The privacy policy ([PRIVACY.md](../../PRIVACY.md), section "Firefox Add-ons (addons.mozilla.org)") explains
  the declaration. If the manifest value changes, change this section and the policy together.

## 6. Source code

The extension is minified by the bundler, so AMO asks for the source code.

- Answer: **Yes, minified** (a bundler minifies the code; no obfuscation, no remote code).
- Attach `homebox-clipper-X.Y.Z-sources.zip` of the same GitHub release as the uploaded Firefox archive.
- Build instructions are in [amo-build.md](./amo-build.md) (also inside the source archive): Bun 1.4.4,
  `bun install --frozen-lockfile --ignore-scripts`, `bunx wxt prepare`, `bunx wxt zip -b firefox`. The result is
  identical to the submitted file (same SHA-256).

## 7. Notes to reviewer

English only. Paste:

```
HomeBox Clipper only acts on an Amazon order page opened by the user and on the user's own self-hosted HomeBox instance. It has no server, no account and no telemetry. No host permission is granted at install: the extension asks for the exact origin of a HomeBox instance when the user adds it.

To test without any real data or account:
1. Start the demo HomeBox of the repository: `docker compose up -d` (fictitious data, see docs/local-homebox.md in the repository, also published in the wiki as "Local HomeBox instance"). It needs a local `.env` file with a random value for `HBOX_AUTH_API_KEY_PEPPER` (explained in that guide) and listens on http://localhost:3100.
2. In that instance, create an account (a fictitious address is enough), then an API key in Profile > API Keys (it looks like hb_xxxxxxxx).
3. In the extension settings, enter http://localhost:3100 and that key, choose a passphrase, accept the access request for that address only.
4. Open an Amazon order details page (or a locally served test page) and click the extension icon; nothing is sent before the user confirms.

No real data, key or account is provided: create your own in the demo instance. Build instructions: docs/store/amo-build.md in the source archive.
```

## 8. Screenshots

Reuse the ten files of [screenshots/](./screenshots) (1280x800, `-en` and `-fr`): they were taken from the
Chrome build, and the interface is identical in Firefox. Fictitious data only (see
[screenshots/README.md](./screenshots/README.md)). If Firefox screenshots are made, apply the same rules: a
throwaway profile, a test HomeBox at `http://localhost:3100`, order `000-0000000-0000000`, seller
`Example Seller`, no real name, address, key, instance, invoice or photo.

## 9. Submission checklist

- [ ] The archive comes from the GitHub release (`homebox-clipper-X.Y.Z-firefox.zip`), SHA-256 checked against the `.sha256` file.
- [ ] The AMO validator reports no blocking error (warnings read and noted).
- [ ] "Firefox for Android" is unticked (desktop Firefox only).
- [ ] The source archive of the same release and its build instructions are attached.
- [ ] The listing is filled in English and French (sections 2 and 3).
- [ ] The privacy policy is linked (`PRIVACY.md` and `PRIVACY.fr.md`).
- [ ] The data collection declaration matches the manifest (`websiteContent`, required) and the policy.
- [ ] The notes to the reviewer are pasted (section 7); no real data or account is provided.
- [ ] Categories, license (MIT) and support links are set (section 1).
