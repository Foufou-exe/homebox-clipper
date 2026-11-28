---
title: "Installation"
description: "Installez HomeBox Clipper dans Chrome ou Firefox, depuis une release ou depuis les sources."
---

**Public visé** : toute personne qui veut utiliser HomeBox Clipper dans Chrome (ou un navigateur Chromium) ou
dans Firefox. À la fin, l'icône de l'extension est dans votre barre d'outils et sa page de configuration est
ouverte.

L'extension n'est pas encore publiée sur le Chrome Web Store : vous la chargez en mode développeur. Le plus
simple est de télécharger une archive prête à l'emploi depuis une release ; vous n'avez rien à compiler.

## Avant de commencer

| Il vous faut | Version |
|--------------|---------|
| Un navigateur | Google Chrome ou Chromium récent (Brave, Edge, Vivaldi... devraient fonctionner, non testés), ou **Firefox 140 ou plus récent** sur ordinateur (Firefox pour Android n'est pas pris en charge) |
| Une instance HomeBox | [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) exposant l'API `/api/v1/entities` (testée avec **v0.27.0**) |
| Un compte marchand | Un compte sur une boutique Amazon prise en charge (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), connecté dans le même navigateur |

## Installer dans Chrome (depuis une release)

1. Ouvrez la [dernière release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) et téléchargez
   `homebox-clipper-<version>-chrome.zip`.
2. Facultatif, pour vérifier le téléchargement : téléchargez aussi `homebox-clipper-<version>-chrome.zip.sha256`,
   mettez les deux fichiers dans le même dossier et lancez `sha256sum -c homebox-clipper-<version>-chrome.zip.sha256`.
   **Résultat attendu** : `homebox-clipper-<version>-chrome.zip: OK`.
3. Décompressez l'archive dans un dossier **que vous conserverez** (Chrome lit l'extension à cet endroit ; ne
   le supprimez pas).
4. Ouvrez `chrome://extensions`.
5. Activez le **Mode développeur** (en haut à droite).
6. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier décompressé.
   **Résultat attendu** : une carte « HomeBox Clipper » apparaît, et la page de configuration s'ouvre
   d'elle-même.
7. Cliquez sur l'icône puzzle de la barre d'outils, puis sur l'épingle à côté de HomeBox Clipper, pour garder
   son icône visible.

Étape suivante : [Configuration](/homebox-clipper/fr/configuration/).

## Charger l'extension dans Firefox

Prérequis : **Firefox 140 ou plus récent** sur ordinateur. L'archive provenant de GitHub n'est **pas signée par
Mozilla** : elle ne peut être chargée que temporairement, et Firefox la retire à son redémarrage. Une
installation durable passe par Firefox Add-ons (addons.mozilla.org), une fois le module publié à cet endroit.

1. Téléchargez `homebox-clipper-<version>-firefox.zip` depuis la
   [dernière release](https://github.com/Foufou-exe/homebox-clipper/releases/latest) (ou compilez-le, voir
   [Compiler depuis les sources](#compiler-depuis-les-sources) : la compilation produit aussi
   `.output/firefox-mv3/`).
2. Ouvrez `about:debugging#/runtime/this-firefox`.
3. Cliquez sur **Charger un module complémentaire temporaire…** et sélectionnez le fichier `.zip`, ou le
   `manifest.json` situé dans `.output/firefox-mv3/`.
   **Résultat attendu** : HomeBox Clipper apparaît dans la liste des extensions temporaires.
4. Ouvrez la page de configuration de l'extension (`about:addons` › l'extension › **Préférences**, ou le menu
   de la barre d'outils) et poursuivez avec [Configuration](/homebox-clipper/fr/configuration/). Firefox
   demande l'accès à l'adresse de votre instance HomeBox uniquement.

Le module a un identifiant fixe (`homebox-clipper@foufou-exe.github.io`) : les réglages enregistrés devraient
donc être conservés d'un chargement à l'autre. Fenêtres privées : Firefox n'y exécute pas l'extension sauf si
vous l'autorisez dans `about:addons` › l'extension › **Exécuter dans les fenêtres privées**.

La release contient aussi une troisième archive, `-sources.zip` : vous n'en avez pas besoin, elle ne sert
qu'aux relecteurs de addons.mozilla.org.

## Compiler depuis les sources

Seulement si vous préférez compiler l'extension vous-même. Il vous faut aussi [Bun](https://bun.sh) 1.4
(version fixée dans `package.json`) et [Node.js](https://nodejs.org) LTS ; `mise install` installe les deux aux
bonnes versions grâce au fichier `mise.toml` du dépôt.

1. Récupérez le code et compilez-le :

   ```bash
   git clone https://github.com/Foufou-exe/homebox-clipper.git
   cd homebox-clipper
   bun install
   bun run build      # produces .output/chrome-mv3/ and .output/firefox-mv3/
   ```

   **Résultat attendu** : les deux dossiers `.output/chrome-mv3/` et `.output/firefox-mv3/` existent.
2. Chargez `.output/chrome-mv3/` dans Chrome (étapes 4 à 7 de
   [Installer dans Chrome](#installer-dans-chrome-depuis-une-release)), ou `.output/firefox-mv3/` dans Firefox
   (étapes 2 à 4 de [la section Firefox](#charger-lextension-dans-firefox)).

Il y a **une compilation par navigateur** (Chrome et Firefox, mêmes permissions), et la même compilation quelle
que soit votre instance HomeBox : la règle sur les adresses acceptées (HTTPS, ou HTTP sur le réseau local) est
appliquée à l'exécution, pas à la compilation.

Pour modifier le code, `bun run dev` (Chrome) et `bun run dev:firefox` (Firefox) lancent un navigateur qui
recharge l'extension à chaque modification : voir [Installer le projet](/homebox-clipper/fr/contributing/development-setup/).

## Mise à jour

- **Depuis une release, dans Chrome** : téléchargez le nouveau `-chrome.zip`, décompressez-le **dans le même
  dossier** (remplacez les anciens fichiers), puis cliquez sur l'icône de rechargement (↻) de la carte de
  l'extension dans `chrome://extensions`. Vos réglages sont conservés.
- **Depuis les sources** : lancez `git pull`, `bun install`, `bun run build`, puis cliquez sur ↻ sur la carte
  dans `chrome://extensions`.
- **Dans Firefox** : cliquez sur **Recharger** pour l'extension dans `about:debugging#/runtime/this-firefox`
  (ou chargez à nouveau le nouveau `.zip`). Une installation depuis Firefox Add-ons est mise à jour par Firefox
  lui-même.

## Désinstallation

1. Facultatif : dans la page de configuration, cliquez sur **Supprimer la configuration**. Cela retire aussi
   l'autorisation d'accès accordée pour votre instance.
2. Retirez l'extension depuis `chrome://extensions` (dans Firefox : `about:addons` › l'extension ›
   **Supprimer** ; un module chargé temporairement se retire avec **Supprimer** dans `about:debugging`).

Ses données locales (adresse de l'instance, clé API chiffrée) sont supprimées avec elle.

## Si ça ne marche pas

| Symptôme | Solution |
|----------|----------|
| **Charger l'extension non empaquetée** est absent de `chrome://extensions` | Activez le **Mode développeur** (en haut à droite). |
| Chrome dit que le manifeste est absent | Vous avez sélectionné le mauvais dossier : choisissez le dossier qui contient directement `manifest.json`. |
| L'extension a disparu après un redémarrage de Firefox | Normal pour une archive chargée temporairement : chargez-la de nouveau dans `about:debugging`. |
| L'extension a disparu de Chrome | Le dossier décompressé a été déplacé ou supprimé : décompressez de nouveau l'archive et rechargez-la. |

Autres problèmes : [Dépannage et FAQ](/homebox-clipper/fr/troubleshooting-and-faq/). Vous voulez modifier le
code ? Voir [Installer le projet](/homebox-clipper/fr/contributing/development-setup/).
