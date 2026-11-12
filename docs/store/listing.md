# Chrome Web Store: listing texts

Copy-paste material for the first manual submission. English is the default language; French follows
in the same sections. Source of truth for data handling: [PRIVACY.md](../../PRIVACY.md).

Developer Dashboard map: **Store listing** tab (name, descriptions, category, language, images, URLs),
**Privacy practices** tab (single purpose, permissions, remote code, data usage, privacy policy URL).

## 1. Basics

| Field | Value |
|-------|-------|
| Name (EN and FR) | `HomeBox Clipper` (same as the manifest `extName`) |
| Default language | English |
| Additional language | French (provide the French texts below) |
| Suggested category | Productivity (alternative: Shopping) |
| Homepage URL | `https://github.com/Foufou-exe/homebox-clipper` |
| Support URL | `https://github.com/Foufou-exe/homebox-clipper/issues` |
| Privacy policy URL | `https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.md` |

Note: the manifest `description` (`extDescription`) is a separate field with a 132-character limit.
Its current value is below; the store summary can reuse it or the shorter text in section 2.

- EN manifest: `Import your online purchases into your HomeBox inventory, with their invoices, after your confirmation.` (103 characters)
- FR manifest: `Importez vos achats en ligne dans votre inventaire HomeBox, avec leurs factures, après votre confirmation.` (106 caractères)

## 2. Short description (summary, 132 characters maximum)

EN (120 characters):

```
Import your Amazon purchases and invoices into your self-hosted HomeBox inventory in one click, after your confirmation.
```

FR (120 caractères) :

```
Importez vos achats Amazon et leurs factures dans votre inventaire HomeBox auto-hébergé, en un clic, après confirmation.
```

## 3. Detailed description

EN:

```
HomeBox Clipper turns an Amazon purchase (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) into an item of your self-hosted HomeBox inventory, invoice included, in one click.

HomeBox is an open-source home inventory application that you host yourself. You need your own HomeBox instance and an API key to use this extension.

HOW IT WORKS
1. Open the order details page on your Amazon store.
2. Click the extension icon: the product, price, date, order number, seller, quantity, PDF invoice and photo are detected.
3. Review and edit the summary, choose the HomeBox location.
4. Click "Add to HomeBox": the item, its invoice and its photo are created in your instance.

FEATURES
- Editable summary before anything is sent; undetected fields are flagged.
- Multi-item orders, manual PDF attachment, duplicate detection.
- Recovery after an error without creating a duplicate.
- Product photo attached as the item's main image (can be unticked).
- Location picker with search.
- Light, dark or automatic theme; English and French interface.

PRIVACY AND SECURITY
- No server, no account, no analytics, no telemetry. Your data goes only to your own HomeBox instance.
- Nothing is imported without your confirmation.
- Your API key is stored encrypted with your passphrase (AES-GCM, PBKDF2 with 600,000 iterations), is never sent to Amazon or to any intermediary server, and is never written to logs.
- A short import history (200 entries, 12 months) is kept only in your browser, encrypted with the same passphrase. You can clear it or turn it off at any time.
- No broad permission: the extension has no permanent access to any website. It reads the Amazon tab only when you open it, and asks access to the exact address of your HomeBox instance only.
- HTTPS is required, except for local network addresses (with a warning).
- Open source (MIT license): https://github.com/Foufou-exe/homebox-clipper

SUPPORTED STORES
Amazon.fr today; Amazon.de, Amazon.es, Amazon.it, Amazon.com.be, Amazon.nl, Amazon.co.uk and Amazon.com in testing (checked on test pages, report any wrong detection). Prices in pounds or dollars are kept as is, without currency conversion. More merchants are planned; request yours on GitHub.

HomeBox Clipper is an independent project, not affiliated with Amazon or the HomeBox team. Use of data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Privacy policy: https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.md
```

FR :

```
HomeBox Clipper transforme un achat Amazon (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com) en objet de votre inventaire HomeBox auto-hébergé, facture comprise, en un clic.

HomeBox est une application d'inventaire domestique open source que vous hébergez vous-même. Pour utiliser cette extension, il faut votre propre instance HomeBox et une clé API.

FONCTIONNEMENT
1. Ouvrez la page de détails d'une commande sur votre boutique Amazon.
2. Cliquez sur l'icône de l'extension : le produit, le prix, la date, le numéro de commande, le vendeur, la quantité, la facture PDF et la photo sont détectés.
3. Relisez et modifiez le récapitulatif, choisissez l'emplacement HomeBox.
4. Cliquez sur « Ajouter à HomeBox » : l'objet, sa facture et sa photo sont créés dans votre instance.

FONCTIONNALITÉS
- Récapitulatif modifiable avant tout envoi ; les champs non détectés sont signalés.
- Commandes de plusieurs produits, ajout manuel d'un PDF, détection des doublons.
- Reprise après une erreur sans créer de doublon.
- Photo du produit jointe comme image principale de l'objet (décochable).
- Choix de l'emplacement avec recherche.
- Thème clair, sombre ou automatique ; interface en français et en anglais.

CONFIDENTIALITÉ ET SÉCURITÉ
- Aucun serveur, aucun compte, aucune statistique, aucune télémétrie. Vos données vont uniquement vers votre propre instance HomeBox.
- Rien n'est importé sans votre confirmation.
- Votre clé API est stockée chiffrée avec votre phrase de passe (AES-GCM, PBKDF2 avec 600 000 itérations), n'est jamais envoyée à Amazon ni à un serveur intermédiaire, et n'est jamais écrite dans les journaux.
- Un court historique des imports (200 entrées, 12 mois) est conservé uniquement dans votre navigateur, chiffré avec la même phrase de passe. Vous pouvez l'effacer ou le désactiver à tout moment.
- Aucune permission large : l'extension n'a aucun accès permanent à un site. Elle lit l'onglet Amazon uniquement quand vous l'ouvrez, et ne demande l'accès qu'à l'adresse exacte de votre instance HomeBox.
- HTTPS obligatoire, sauf pour les adresses du réseau local (avec un avertissement).
- Open source (licence MIT) : https://github.com/Foufou-exe/homebox-clipper

MARCHANDS PRIS EN CHARGE
Amazon.fr aujourd'hui ; Amazon.de, Amazon.es, Amazon.it, Amazon.com.be, Amazon.nl, Amazon.co.uk et Amazon.com en test (vérifiées sur des pages de test, signalez toute détection erronée). Un prix en livres ou en dollars est gardé tel quel, sans conversion de devise. D'autres marchands sont prévus ; demandez le vôtre sur GitHub.

HomeBox Clipper est un projet indépendant, non affilié à Amazon ni à l'équipe HomeBox. L'utilisation des données respecte la Chrome Web Store User Data Policy, y compris les exigences de Limited Use. Politique de confidentialité : https://github.com/Foufou-exe/homebox-clipper/blob/main/PRIVACY.fr.md
```

## 4. Privacy practices tab

### Single purpose

EN:

```
Import an Amazon purchase from a supported store (name, price, date, order number, seller, quantity, invoice and photo) into the user's own self-hosted HomeBox inventory, after the user reviews and confirms it.
```

FR :

```
Importer un achat Amazon d'une boutique prise en charge (nom, prix, date, numéro de commande, vendeur, quantité, facture et photo) dans l'inventaire HomeBox auto-hébergé de l'utilisateur, après relecture et confirmation de sa part.
```

### Permission justifications

The manifest declares `storage`, `activeTab`, `scripting` and the optional host permissions
`https://*/*` and `http://*/*`. There is no static `host_permissions` and no static content script.

**storage**

EN:

```
Stores the user's HomeBox instance address, the API key encrypted with the user's passphrase, the theme, the last location used, a short local import history (product name, store, order number, dates, result and item link; at most 200 entries and 12 months, encrypted with the user's passphrase, can be cleared or turned off), and (in session memory only) the data of an import in progress so it can be resumed after an error. Nothing is synced or sent anywhere.
```

FR :

```
Conserve l'adresse de l'instance HomeBox de l'utilisateur, la clé API chiffrée avec sa phrase de passe, le thème, le dernier emplacement utilisé, un court historique des imports local (nom du produit, boutique, numéro de commande, dates, résultat et lien vers l'objet ; au plus 200 entrées et 12 mois, chiffré avec la phrase de passe de l'utilisateur, effaçable et désactivable) et (en mémoire de session uniquement) les données d'un import en cours pour le reprendre après une erreur. Rien n'est synchronisé ni envoyé ailleurs.
```

**activeTab**

EN:

```
Grants temporary access to the Amazon order tab only when the user clicks the extension icon, so the purchase can be read and the invoice downloaded from that page. It avoids any permanent host permission for Amazon.
```

FR :

```
Donne un accès temporaire à l'onglet de commande Amazon uniquement quand l'utilisateur clique sur l'icône de l'extension, pour lire l'achat et télécharger la facture depuis cette page. Cela évite toute permission d'hôte permanente pour Amazon.
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

**Host permissions (optional: `https://*/*` and `http://*/*`)**

There is no fixed host permission. The two patterns are declared as `optional_host_permissions` only
because the address of a self-hosted HomeBox instance is unknown in advance (any domain, IP or local
name). They are never granted wholesale: in the settings, when the user clicks "Test and save", the
extension calls `permissions.request` for the **exact origin** of the address typed by the user (for
example `https://homebox.example.com/*`); Chrome shows its own prompt. The permission is removed with
`permissions.remove` when the user deletes the settings. `http://` is accepted only for local-network
addresses (checked in code, `src/background/config/url-policy.ts`).

EN:

```
Optional host permissions are needed because the user's HomeBox instance is self-hosted at an address unknown in advance (any domain, IP or local name). They are not granted at install. When the user saves their settings, the extension requests access to the exact origin of that one HomeBox address only (via permissions.request, with Chrome's own prompt), and removes it when the user deletes the settings. The permission is used solely to send the user-confirmed import (item, invoice, photo) and read the location list from that instance. HTTP is accepted only for local-network addresses. No other website is ever accessed, and there is no fixed host permission.
```

FR :

```
Les permissions d'hôte optionnelles sont nécessaires car l'instance HomeBox de l'utilisateur est auto-hébergée à une adresse inconnue à l'avance (domaine, IP ou nom local quelconque). Elles ne sont pas accordées à l'installation. Quand l'utilisateur enregistre ses paramètres, l'extension demande l'accès à l'origine exacte de cette seule adresse HomeBox (via permissions.request, avec la fenêtre d'autorisation de Chrome) et la retire quand l'utilisateur supprime la configuration. La permission sert uniquement à envoyer l'import confirmé par l'utilisateur (objet, facture, photo) et à lire la liste des emplacements de cette instance. Le HTTP n'est accepté que pour les adresses du réseau local. Aucun autre site n'est jamais accédé, et il n'y a aucune permission d'hôte fixe.
```

### Remote code

Select: **No, I am not using remote code.**

EN justification (if a text box is shown):

```
All code is bundled in the extension package. No remotely hosted script, no eval, no dynamically fetched code. The content security policy forbids eval and remote code.
```

FR :

```
Tout le code est inclus dans le paquet de l'extension. Aucun script hébergé à distance, aucun eval, aucun code récupéré dynamiquement. La politique de sécurité du contenu interdit eval et le code distant.
```

### Data usage: what to tick

Tick only what the extension handles. It never sells or shares data, so every certification can be
ticked.

| Category | Tick? | Justification |
|----------|-------|---------------|
| Personally identifiable information | Yes | The invoice PDF, sent as is to the user's own HomeBox instance, may contain the name or address printed by Amazon. The extension does not read the delivery address from the page. |
| Health information | No | Not handled. |
| Financial and payment information | Yes | Purchase price, order number and invoice (purchase records) are read and sent to the user's own HomeBox instance, and the order number is kept locally, encrypted, in a short import history. No payment method or card data is read. |
| Authentication information | Yes | The user's HomeBox API key is stored encrypted locally and sent only to the user's HomeBox instance. |
| Personal communications | No | Not handled. |
| Location | No | No geographic location. The HomeBox "locations" are storage places in the user's inventory (identifiers only). |
| Web history | No | Only the Amazon order tab opened by the user is read, at the user's click. No browsing history is collected. |
| User activity | No | No clicks, keystrokes or usage tracking. |
| Website content | Yes | Text and image address of the Amazon order page (product, price, date, seller, photo) are read at the user's click and sent to the user's own HomeBox instance after confirmation; the product name is kept locally, encrypted, in a short import history. |

Certifications (tick all three):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Justification to give if asked (EN): `Data stays in the user's browser and goes only to the user's own self-hosted HomeBox instance, after explicit confirmation. No third-party server, no analytics, no telemetry.`
FR : `Les données restent dans le navigateur de l'utilisateur et ne vont que vers sa propre instance HomeBox auto-hébergée, après confirmation explicite. Aucun serveur tiers, aucune statistique, aucune télémétrie.`

Labels above follow the dashboard categories as documented; confirm the exact wording in the dashboard.

## 5. Screenshots (3 to 5, 1280x800 preferred, 640x400 accepted)

Full bleed, square corners, no padding. Use a throwaway Chrome profile and fictitious data only: no real
name, address, order number, API key, instance address, invoice or photo of the user. Use a test
HomeBox instance (see `docs/local-homebox.md`) at `http://localhost:3100`, an order page built from
a fixture or an Amazon test account with a harmless product, an invoice PDF made of dummy values, and a
neutral product photo (for example a generic hammer). Order number in the form `000-0000000-0000000`;
seller `Example Seller`; price `19,99 €`.

1. **Summary before import.** Popup open on an Amazon order page with the editable summary: name,
   price, date, fictitious order number, seller, detected invoice, photo checkbox, location field.
   Caption: "Review and edit everything before anything is sent." (FR: "Relisez et modifiez tout avant
   tout envoi.")
2. **Import result.** Success message with "Open in HomeBox", and the item shown in the test HomeBox
   instance with its invoice and photo attached. Caption: "The item, invoice and photo land in your own
   HomeBox." (FR: "L'objet, la facture et la photo arrivent dans votre propre HomeBox.")
3. **Settings page.** Instance address `https://homebox.example.com`, masked key `hb_••••abcd`,
   passphrase fields filled with dots, "Test and save" result. Caption: "Your API key is encrypted with
   your passphrase." (FR: "Votre clé API est chiffrée avec votre phrase de passe.")
4. **Location picker and multi-item order.** Popup with a two-product order and the location search
   open (fictitious locations such as "Home › Garage"). Caption: "Pick the location, import several
   products at once." (FR: "Choisissez l'emplacement, importez plusieurs produits d'un coup.")
5. **Dark theme (optional).** Same summary as screenshot 1 in dark theme, with the French interface to
   show localization. Caption: "Light, dark, English or French."

Provide the French variants of the screenshots (French interface) in the French listing if desired;
captions are optional and are not part of the store fields.

### Small promo tile (optional, 440x280, PNG or JPEG)

Useful because extensions with a tile are listed ahead of those without. Avoid text, keep it readable at
half size, saturated colors, full bleed. Suggestion: the project logo (HomeBox box with "+" badge,
`src/assets/logo.svg`) centered on the HomeBox blue, with a simple cart-to-box arrow. Marquee (1400x560)
is not needed.

## 6. Submission checklist

- [ ] Icon 128x128 (already in `public/icon/128.png`).
- [ ] Short description (at most 132 characters) and detailed description, EN and FR.
- [ ] 3 to 5 screenshots with fictitious data.
- [ ] Privacy tab: single purpose, one justification per permission, remote code "No", data usage and
      certifications.
- [ ] Privacy policy URL points to a public `PRIVACY.md` on `main` (merge the branch first).
- [ ] The Limited Use statement is on the privacy policy (done in `PRIVACY.md`).
