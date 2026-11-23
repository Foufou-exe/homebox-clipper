[English](README.md) | **Français**

<div align="center">

<img src="public/icon/128.png" alt="" width="96" height="96">

# homebox-clipper

**Transformez un achat en ligne en objet d'inventaire [HomeBox](https://github.com/sysadminsmedia/homebox), facture comprise, en un clic.**

[![CI](https://github.com/Foufou-exe/homebox-clipper/actions/workflows/ci.yml/badge.svg)](https://github.com/Foufou-exe/homebox-clipper/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Foufou-exe/homebox-clipper)](https://github.com/Foufou-exe/homebox-clipper/releases)
[![Discussions](https://img.shields.io/github/discussions/Foufou-exe/homebox-clipper)](https://github.com/Foufou-exe/homebox-clipper/discussions)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Foufou-exe_homebox-clipper&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Foufou-exe_homebox-clipper)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Foufou-exe_homebox-clipper&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Foufou-exe_homebox-clipper)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)
![Chrome / Chromium](https://img.shields.io/badge/Chrome%20%2F%20Chromium-supporté-success)
![Firefox 140+](https://img.shields.io/badge/Firefox-140%2B-FF7139)
![Statut : bêta](https://img.shields.io/badge/statut-b%C3%AAta-orange)

</div>

---

**homebox-clipper** est un compagnon d'import pour les sites marchands en ligne : depuis la page
de commande, il détecte le produit, le prix, la date, le numéro de commande, le vendeur et la
facture PDF, puis crée l'objet dans votre instance HomeBox. Vous vérifiez, vous confirmez, c'est
rangé. **Boutiques :** Amazon.fr (prise en charge) et Amazon.de, Amazon.es, Amazon.it,
Amazon.com.be, Amazon.nl, Amazon.co.uk et Amazon.com (en test : vérifiées sur des pages de test
reconstituées, pas encore sur une vraie page de commande). D'autres marchands sont prévus et
l'architecture est faite pour en ajouter facilement : voir [MERCHANTS.fr.md](MERCHANTS.fr.md).

> [!NOTE]
> Rien n'est jamais envoyé sans votre confirmation, et rien n'est envoyé ailleurs qu'à **votre**
> instance HomeBox.

## Fonctionnalités

- **Détection automatique** d'une commande Amazon sur sa page de détail, dans la langue de la page ; un
  prix en livres ou en dollars est gardé tel quel, avec un avertissement avant confirmation (aucune
  conversion de devise).
- **Résumé modifiable** avant tout envoi, avec les champs non détectés signalés.
- **Import en 3 étapes** (objet, facture PDF, photo) ; commandes multi-articles, **ajout manuel** d'un PDF et **détection des doublons**, y compris les noms proches.
- **Reprise sur erreur** : si un document n'a pas pu être envoyé, réessayez sans créer de doublon.
- **Types de documents** : les PDF joints peuvent être typés manuel, garantie, bon de livraison, facture ou bon de commande, et rangés dans la bonne rubrique de HomeBox.
- **Garantie** : la garantie de l'objet (date d'expiration, à vie, détails) est proposée au récapitulatif et envoyée à HomeBox : la garantie légale quand sa durée est vérifiée et que l'objet est vendu par la boutique elle-même, ou la garantie indiquée sur la page de commande. Valeur indicative, sans valeur juridique.
- **Verrouillage automatique** : choisissez quand la phrase de passe est redemandée (à la fermeture du navigateur par défaut, après 15 minutes, 1 heure ou 4 heures d'inactivité, ou à chaque ouverture ; pas d'option « jamais »).
- **Annonce de mise à jour et version** : une courte annonce après chaque mise à jour, un bouton « Mettre à jour maintenant » quand le navigateur en a une prête, et le numéro de version affiché à côté du lien GitHub ; aucune requête n'est faite pour vérifier les mises à jour.
- **Historique des imports** : vos derniers imports avec leur résultat et un lien vers l'objet, conservés uniquement dans votre navigateur et chiffrés avec votre phrase de passe (200 entrées, 12 mois ; effaçable ou désactivable).
- **Photo du produit** jointe à l'objet comme image principale (décochable par produit).
- **Lien vers la page de commande** (facultatif, désactivé par défaut) : un lien externe vers la page de commande du marchand est ajouté à l'objet, à un clic dans HomeBox ; il pointe vers le site du marchand et est enregistré dans HomeBox.
- **Fabricant, modèle et numéro de série** : le fabricant et le numéro de modèle sont lus sur la page produit Amazon de chaque produit (une requête par produit vers la même boutique, sans cookie, sans clé API ni donnée HomeBox) et pré-remplis dans le récapitulatif ; le numéro de série est saisi par vous. Les champs vides ne sont pas envoyés, et une valeur déjà présente sur l'objet n'est jamais remplacée.
- **Plusieurs instances HomeBox** (jusqu'à 10, une seule phrase de passe) : choisissez la cible au récapitulatif ; chaque instance garde sa propre clé chiffrée et sa permission d'origine exacte.
- **Collection cible** : pour chaque instance, importez dans la collection HomeBox de votre choix (par défaut, celle de la clé) ; le test de connexion, le récapitulatif et le résultat la nomment.
- **Choix de l'emplacement** parmi vos emplacements HomeBox, avec recherche ; le dernier utilisé est proposé.
- **Tags proposés** : l'enseigne de la boutique et les tags de vos propres règles locales sont proposés pour chaque produit, modifiables au récapitulatif ; les tags absents sont créés dans HomeBox uniquement après votre confirmation, et les tags existants ne sont jamais retirés.
- **Interface aux couleurs de HomeBox**, en thème clair, sombre ou automatique, en **anglais ou en français** selon la langue du navigateur.
- **Confidentialité** : aucun serveur intermédiaire ; la clé API est toujours chiffrée par votre
  phrase de passe (obligatoire) et n'est utilisée que par le service worker. HTTP n'est accepté que
  sur le réseau local.
- **Aucune permission générale** : pas d'accès permanent à un site ; l'accès à votre instance est
  demandé pour son adresse exacte uniquement.
- Liens **Support** et **GitHub** dans la fenêtre de l'extension et la page des réglages.

## Démo

D'une page de commande Amazon à un objet dans HomeBox, avec sa photo, sa facture et son emplacement :

<p align="center"><img src="docs/demo/homebox-clipper-demo.gif" alt="Démo : import d'une commande Amazon dans HomeBox, avec sa photo et sa facture" width="800"></p>

## Marchands pris en charge

La liste à jour (pris en charge, partiels, prévus, demandés) est dans
**[MERCHANTS.fr.md](MERCHANTS.fr.md)**. Votre boutique n'y figure pas ? Ouvrez une
[demande de marchand](https://github.com/Foufou-exe/homebox-clipper/issues/new?template=merchant-request.yml).

## Installation

L'extension n'est pas encore publiée sur le Chrome Web Store : installez-la depuis une release, ou
compilez-la vous-même, puis chargez-la en mode développeur. Pour Firefox, voir [Firefox](#firefox) ci-dessous.

### Depuis une release (sans compilation)

1. Téléchargez `homebox-clipper-<version>-chrome.zip` depuis la
   [dernière release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (le fichier
   `.sha256` voisin permet de vérifier le téléchargement avec `sha256sum -c`).
2. Décompressez-le dans un dossier que vous conserverez (Chrome lit l'extension à cet endroit).
3. Dans `chrome://extensions` : activez le **Mode développeur**, cliquez sur **Charger l'extension non
   empaquetée** et sélectionnez ce dossier.

### Firefox

Nécessite **Firefox 140 ou ultérieur** sur ordinateur (Firefox pour Android n'est pas pris en charge).

- **Depuis Firefox Add-ons (addons.mozilla.org)** : bientôt ; le lien sera ajouté ici une fois l'extension
  publiée.
- **Chargement temporaire, depuis une release** : téléchargez `homebox-clipper-<version>-firefox.zip` depuis
  la [dernière release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (vérifiez-le avec le
  fichier `.sha256`), puis ouvrez `about:debugging#/runtime/this-firefox`, cliquez sur **Charger un module
  complémentaire temporaire…** (*Load Temporary Add-on…* en anglais) et sélectionnez le fichier `.zip` (ou le
  `manifest.json` du dossier décompressé). L'archive n'est **pas signée par Mozilla** : Firefox la retire au
  redémarrage ; une installation durable passe par Firefox Add-ons.
- **Depuis les sources** : `bun run build` produit `.output/firefox-mv3/` à côté de `.output/chrome-mv3/` ;
  chargez ce dossier de la même façon (`bun run dev:firefox` lance un Firefox de développement).

### Depuis les sources

Prérequis : Chrome ou Chromium (ou Firefox 140+), [Bun](https://bun.sh) et
[Node.js](https://nodejs.org) LTS, et une instance
[HomeBox](https://github.com/sysadminsmedia/homebox) (testé avec **v0.27.0**).

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
bun install
bun run build      # → .output/chrome-mv3/ et .output/firefox-mv3/
```

Puis dans `chrome://extensions` : activez le **Mode développeur**, cliquez sur **Charger
l'extension non empaquetée** et sélectionnez `.output/chrome-mv3/`. Guide complet :
[Installation](https://github.com/Foufou-exe/homebox-clipper/wiki/Installation).

## Configuration rapide

1. Dans HomeBox : **Profil** → **Clés API** → créez une clé (de préférence dédiée, avec une date
   d'expiration).
2. Dans l'extension (⚙ / *Options*) : saisissez l'adresse de votre instance, la clé API et une
   **phrase de passe** (10 caractères au moins, impossible à récupérer en cas d'oubli), puis
   **Tester et enregistrer**.
3. Ouvrez la page de détail d'une commande chez un marchand pris en charge, puis l'extension.

HTTPS est exigé, sauf pour une adresse du réseau local (HTTP accepté avec un avertissement), par
exemple `https://homebox.example.com` ou `http://localhost:3100`.
Détails : [Configuration](https://github.com/Foufou-exe/homebox-clipper/wiki/Configuration) et
[Utilisation](https://github.com/Foufou-exe/homebox-clipper/wiki/Usage).

## Documentation

Tout le détail est dans le **[wiki](https://github.com/Foufou-exe/homebox-clipper/wiki)** :
[Installation](https://github.com/Foufou-exe/homebox-clipper/wiki/Installation),
[Configuration](https://github.com/Foufou-exe/homebox-clipper/wiki/Configuration),
[Utilisation](https://github.com/Foufou-exe/homebox-clipper/wiki/Usage),
[Sécurité et confidentialité](https://github.com/Foufou-exe/homebox-clipper/wiki/Security-and-privacy),
[Dépannage et FAQ](https://github.com/Foufou-exe/homebox-clipper/wiki/Troubleshooting-and-FAQ),
[Architecture](https://github.com/Foufou-exe/homebox-clipper/wiki/Architecture).

## Contribuer

Les contributions sont bienvenues : pages mal détectées, nouveaux marchands, corrections.

```bash
bun run setup        # dépendances, .env de l'instance HomeBox locale, hook pre-push (au choix)
bun run homebox:up   # HomeBox sur http://localhost:3100
bun run dev
```

Avant chaque push, lancez `bun run ci` (la même vérification tourne sur GitHub pour les pull requests). Règles du projet,
conteneur de développement et façon de travailler : **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Communauté

Une question, une idée, ou simplement envie de dire bonjour ? Rejoignez les **[Discussions](https://github.com/Foufou-exe/homebox-clipper/discussions)** : demandez de l'aide dans Q&A, proposez des idées, montrez votre installation. Merci de lire le **[code de conduite](CODE_OF_CONDUCT.md)** (en anglais) et **[SUPPORT.md](SUPPORT.md)** (en anglais) pour savoir où poser quelle question.

## Changelog

Les évolutions notables sont dans **[CHANGELOG.md](CHANGELOG.md)**.

## Sécurité

Pour signaler une vulnérabilité, suivez **[SECURITY.md](SECURITY.md)** (pas d'issue publique).

Confidentialité : voir la **[politique de confidentialité](PRIVACY.fr.md)**.

## Crédits

- Le logo reprend la boîte de [HomeBox](https://github.com/sysadminsmedia/homebox)
  (© contributeurs HomeBox, licence AGPL-3.0), sans modification, à laquelle s'ajoute une pastille
  « + » propre à homebox-clipper (`src/assets/logo.svg`).
- Les couleurs de l'interface sont celles du thème par défaut de HomeBox.
- Icônes au trait inspirées de [Feather Icons](https://feathericons.com) (MIT).

## Licence

Code publié sous **[licence MIT](LICENSE)**. Le logo dérivé de HomeBox reste sous AGPL-3.0 (voir Crédits).

---

<sub>homebox-clipper est un projet indépendant, sans lien avec Amazon ni avec l'équipe HomeBox.</sub>

<sub>Dernière synchronisation avec README.md : 2026-11-09</sub>
