# Installation

L'extension n'est pas encore publiée sur le Chrome Web Store : il faut la compiler, puis la charger
en mode développeur.

## Prérequis

| Élément | Version |
|---------|---------|
| Navigateur | Google Chrome ou Chromium récent (Brave, Edge, Vivaldi… devraient fonctionner, non testés) |
| HomeBox | Instance [sysadminsmedia/homebox](https://github.com/sysadminsmedia/homebox) exposant l'API `/api/v1/entities` (testé avec **v0.27.0**) |
| Compte | Un compte Amazon.fr, connecté dans le même navigateur |
| Pour compiler | [Bun](https://bun.sh) 1.4 (version indiquée dans `package.json`) et [Node.js](https://nodejs.org) LTS |

`mise install` installe Bun et Node aux bonnes versions grâce au fichier `mise.toml` du dépôt.

## Compiler

```bash
git clone https://github.com/Foufou-exe/homebox-clipper.git
cd homebox-clipper
bun install
bun run build      # produit .output/chrome-mv3/
```

Il n'y a qu'**un seul build**, quelle que soit votre instance HomeBox : la règle sur les adresses
acceptées (HTTPS, ou HTTP sur le réseau local) est appliquée à l'exécution, pas à la compilation.

## Charger l'extension dans Chrome

1. Ouvrez `chrome://extensions`.
2. Activez le **Mode développeur** (en haut à droite).
3. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `.output/chrome-mv3/`.
4. Épinglez l'icône de l'extension dans la barre d'outils pour y accéder facilement.

La page de configuration s'ouvre automatiquement à la première installation. Suite : [Configuration](Configuration.md).

## Mettre à jour

```bash
git pull
bun install
bun run build
```

Puis cliquez sur l'icône de rechargement (↻) de la carte de l'extension dans `chrome://extensions`.
Votre configuration est conservée.

## Désinstaller

Retirez l'extension depuis `chrome://extensions` : ses données locales (adresse de l'instance, clé API
chiffrée) sont supprimées avec elle. Vous pouvez aussi, avant, utiliser **Supprimer la configuration**
dans les options, qui retire également l'autorisation d'accès accordée à votre instance.

## Pour développer

Voir [Maintaining-the-dev-environment](Maintaining-the-dev-environment.md) et le
[guide de contribution](https://github.com/Foufou-exe/homebox-clipper/blob/main/CONTRIBUTING.md) : `bun run dev` lance un Chrome de développement avec
rechargement automatique.
