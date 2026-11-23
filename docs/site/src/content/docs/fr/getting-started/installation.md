---
title: "Installation"
description: "Installez HomeBox Clipper dans Chrome ou Firefox, depuis une release ou depuis les sources."
---

L'extension n'est pas encore publiée sur le Chrome Web Store : il faut la compiler, puis la charger en mode
développeur. Elle fonctionne aussi sur Firefox 140 ou plus récent (ordinateur) : voir [Charger l'extension dans Firefox](#charger-lextension-dans-firefox).

## Prérequis

| Élément | Version |
|---------|---------|
| Navigateur | Google Chrome ou Chromium récent (Brave, Edge, Vivaldi... devraient fonctionner, non testés), ou **Firefox 140 ou plus récent** sur ordinateur (Firefox pour Android n'est pas pris en charge) |
| HomeBox | Instance [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) exposant l'API `/api/v1/entities` (testée avec **v0.27.0**) |
| Compte | Un compte sur une boutique Amazon prise en charge (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), connecté dans le même navigateur |
| Pour compiler | [Bun](https://bun.sh) 1.4 (version fixée dans `package.json`) et [Node.js](https://nodejs.org) LTS |

`mise install` installe Bun et Node aux bonnes versions grâce au fichier `mise.toml` du dépôt.

## Compilation

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
bun install
bun run build      # produces .output/chrome-mv3/ and .output/firefox-mv3/
```

Il y a **une compilation par navigateur** (Chrome et Firefox, mêmes permissions), et la même compilation quelle que soit votre instance HomeBox : la règle sur les adresses acceptées (HTTPS, ou
HTTP sur le réseau local) est appliquée à l'exécution, pas à la compilation.

## Sans compiler : installer depuis une release

Téléchargez `homebox-clipper-<version>-chrome.zip` (Chrome) ou `homebox-clipper-<version>-firefox.zip` (Firefox)
depuis la [dernière release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (le fichier `.sha256`
placé à côté de chacune permet de la vérifier). Pour Chrome, décompressez-la dans un dossier que vous conserverez, puis chargez ce dossier comme
décrit ci-dessous. Pour Firefox, chargez le `.zip` comme décrit dans la section Firefox ; une troisième archive,
`-sources.zip`, ne sert qu'aux relecteurs de addons.mozilla.org.

## Charger l'extension dans Chrome

1. Ouvrez `chrome://extensions`.
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `.output/chrome-mv3/`.
4. Épinglez l'icône de l'extension dans la barre d'outils pour y accéder facilement.

La page de configuration s'ouvre automatiquement à la première installation. Étape suivante : [Configuration](/homebox-clipper/fr/configuration/).

## Charger l'extension dans Firefox

Prérequis : **Firefox 140 ou plus récent** sur ordinateur. L'archive provenant de GitHub n'est **pas signée par Mozilla** : elle ne
peut être chargée que temporairement, et Firefox la retire à son redémarrage. Une installation durable passe par
Firefox Add-ons (addons.mozilla.org), une fois le module publié à cet endroit.

1. Compilez (`bun run build`, qui produit aussi `.output/firefox-mv3/`) ou téléchargez
   `homebox-clipper-<version>-firefox.zip` depuis une release.
2. Ouvrez `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…** et sélectionnez le fichier `.zip`, ou le `manifest.json` situé dans
   `.output/firefox-mv3/`.
4. Ouvrez la page de configuration de l'extension (`about:addons` › l'extension › **Préférences**, ou le menu de la
   barre d'outils) et poursuivez avec [Configuration](/homebox-clipper/fr/configuration/). Firefox demande l'accès à l'adresse de votre
   instance HomeBox uniquement.

Le module a un identifiant fixe (`homebox-clipper@foufou-exe.github.io`) : les réglages enregistrés devraient donc être conservés
d'un chargement à l'autre. Pour le développement, `bun run dev:firefox` lance un Firefox qui recharge l'extension
à chaque modification du code (Firefox doit être installé). Fenêtres privées : Firefox n'y exécute pas l'extension
sauf si vous l'autorisez dans `about:addons` › l'extension › **Exécuter dans les fenêtres privées**.

## Mise à jour

```bash
git pull
bun install
bun run build
```

Cliquez ensuite sur l'icône de rechargement (↻) de la carte de l'extension dans `chrome://extensions`. Vos réglages sont conservés.
Dans Firefox, cliquez sur **Recharger** pour l'extension dans `about:debugging#/runtime/this-firefox` (ou chargez à nouveau le nouveau
`.zip`). Une installation depuis Firefox Add-ons est mise à jour par Firefox lui-même.

## Désinstallation

Retirez l'extension depuis `chrome://extensions` (dans Firefox : `about:addons` › l'extension › **Supprimer** ; un
module chargé temporairement se retire avec **Supprimer** dans `about:debugging`) : ses données locales (adresse de l'instance, clé API chiffrée) sont
supprimées avec elle. Vous pouvez aussi, au préalable, utiliser **Supprimer la configuration** dans la page de configuration, qui
retire également l'autorisation d'accès accordée pour votre instance.

## Pour le développement

Voir [Entretenir l'environnement de développement](/homebox-clipper/fr/maintaining/dev-environment/) et le
[guide de contribution](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md) : `bun run dev`
lance un Chrome de développement avec rechargement automatique (`bun run dev:firefox` fait de même pour Firefox).
