---
title: "Instance HomeBox locale"
description: "Lancer une instance HomeBox locale avec Docker pour tester l'extension."
---

**Public visé** : les contributeurs qui ont besoin d'une instance HomeBox de test sur leur machine, avec des
données fictives, pour essayer l'extension de bout en bout. N'utilisez jamais votre vrai inventaire pour
les tests.

Ce guide met en place une instance HomeBox de développement avec Docker Compose. Ses données vivent dans le
dossier `homebox/` du dépôt : c'est la configuration utilisée pour développer l'extension.

```
homebox-clipper/
├── compose.yaml      dev HomeBox instance
├── .env              your HomeBox pepper (ignored by git)
├── homebox/          HomeBox data: SQLite database + attachments (ignored by git)
│   ├── homebox.db
│   └── <uuid>/…      attached files (invoices)
└── …
```

## Prérequis

- Docker avec le plugin Compose (`docker compose version`).
- `openssl` pour générer le secret.
- Le projet [installé](/homebox-clipper/fr/contributing/development-setup/).

## 1. Préparer le secret (pepper)

:::tip
`bun run setup` a déjà fait cette étape pour vous : si le fichier `.env` existe à la racine du projet,
passez à l'étape 2.
:::

Depuis la version 0.27, HomeBox exige `HBOX_AUTH_API_KEY_PEPPER` : un secret d'au moins 32 octets qui
protège les clés API dans la base de données. **Il doit rester identique d'un démarrage à l'autre**. Le
changer invalide toutes les clés API déjà créées : il faut alors les recréer et les saisir de nouveau dans
l'extension.

**Nouvelle installation :**

```bash
cp .env.example .env
sed -i "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$(openssl rand -base64 48)|" .env
```

**Vous avez déjà un pepper** (par exemple dans un fichier `hbox.pepper` à la racine) : réutilisez-le pour
que vos clés API restent valides.

```bash
cp .env.example .env
sed -i "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$(cat hbox.pepper)|" .env
```

`.env` et `*.pepper` sont ignorés par git : ne les commitez jamais.

## 2. Démarrer HomeBox

```bash
docker compose up -d
docker compose logs -f homebox      # Ctrl+C to leave the logs
```

Vérifiez que l'API répond :

```bash
curl -s http://localhost:3100/api/v1/status
# {"health":true, … ,"build":{"version":"v0.27.0", …}}
```

:::note
**Vous lancez déjà HomeBox avec `docker run`** (conteneur `homebox` monté sur `./homebox`) : supprimez
l'ancien conteneur, vos données restent dans `homebox/`.

```bash
docker rm -f homebox
docker compose up -d
```
:::

| Variable (`.env`) | Par défaut | Rôle |
|-------------------|------------|------|
| `HBOX_AUTH_API_KEY_PEPPER` | — | **Obligatoire.** Secret des clés API |
| `HOMEBOX_VERSION` | `latest` | Version de l'image, par ex. `v0.27.0` pour figer la version testée |
| `HOMEBOX_PORT` | `3100` | Port exposé sur la machine |
| `TZ` | `Europe/Paris` | Fuseau horaire |

## 3. Créer un compte et une clé API

1. Ouvrez <http://localhost:3100> et créez un compte (une adresse fictive suffit, par exemple
   `dev@example.com`).
2. **Profil → Clés API** → créez une clé nommée `homebox-clipper-dev`, avec une date d'expiration.
3. Copiez la clé `hb_…` : elle ne sera plus affichée.

**Résultat attendu** : vous avez une clé qui commence par `hb_` (par exemple `hb_xxxxxxxx`), gardée pour
l'étape 4.

## 4. Connecter l'extension

Choisissez l'adresse selon l'endroit où tourne le navigateur :

| Navigateur | Adresse à saisir |
|------------|------------------|
| Sur la même machine que Docker | `http://localhost:3100` |
| Sur une autre machine du réseau (homelab) | `http://<IP-de-la-machine>:3100` (par ex. `http://192.0.2.10:3100`) |

Les deux fonctionnent avec le build unique (`bun run build` → `.output/chrome-mv3/` ou `.output/firefox-mv3/`, ou `bun run dev` / `bun run dev:firefox`). Le HTTP est
accepté pour les adresses du réseau local et refusé pour les adresses publiques (voir la page
[Configuration](/homebox-clipper/fr/configuration/)).

Ensuite :

1. `chrome://extensions` → *Mode développeur* → *Charger l'extension non empaquetée* → le dossier du build.
   Si l'extension est déjà chargée, cliquez sur ↻ après chaque build.
2. Page des paramètres : adresse, clé API, phrase de passe (au moins 10 caractères) → **Tester et enregistrer** → acceptez
   l'accès demandé par le navigateur.
   Dans Firefox : `about:debugging#/runtime/this-firefox` → *Charger un module complémentaire temporaire…* → le `.zip` ou le
   `manifest.json` de `.output/firefox-mv3/` (voir [Installation](/homebox-clipper/fr/getting-started/installation/)).
3. Le badge doit afficher `● HomeBox : http://… v0.27.0`.

:::tip
`bun run dev` ouvre un Chrome dédié avec l'extension chargée et rechargée à chaque modification du code.
C'est le plus pratique pendant le développement.
:::

## 5. Scénarios à vérifier

Connectez-vous à Amazon.fr dans le même navigateur, puis :

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 1 | Page **Détails de la commande** → popup | Produit, prix, date, numéro de commande, facture et instance affichés |
| 2 | *Ajouter à HomeBox* | Message de réussite et lien ; dans HomeBox : prix, date, vendeur, notes `Commande Amazon.fr : …`, facture en pièce jointe |
| 3 | Rejouer le même import | Avertissement « Un objet semblable existe déjà dans HomeBox. » avec un lien vers l'objet existant |
| 4 | Commande à plusieurs articles, cocher 2 produits | 2 objets, chacun avec la facture |
| 5 | Page produit (pas une commande) → popup | « Aucun achat détecté sur cette page. » et un formulaire vide ; joindre un PDF local → import OK |
| 6 | Joindre un `.png` renommé en `.pdf` | « Le fichier n'est pas un PDF. » |
| 7 | `docker compose stop` puis import | « HomeBox est inaccessible. Vérifiez l’adresse et votre connexion. » (relancer avec `docker compose start`) |
| 8 | Lancer un import puis `docker compose stop` juste après la création | « L'objet a été créé mais l'envoi d'un document a échoué. » ; `docker compose start` → *Réessayer l'envoi des documents* → un seul objet, avec ses documents |
| 9 | Popup → 🔒, puis rouvrir | Phrase de passe demandée ; une mauvaise phrase de passe affiche « Phrase de passe incorrecte. » |
| 10 | Révoquer la clé dans HomeBox, puis importer | « Clé API invalide ou expirée. » |
| 11 | DevTools de l'extension → *Application → Extension storage → Local* | `homeboxConfig` contient un bloc chiffré (`ct`) et aucune clé en clair |

Pour voir les factures reçues par HomeBox, ouvrez l'objet dans l'interface (onglet des pièces jointes). Les
fichiers sont stockés sous `homebox/<uuid>/`.

## 6. Réinitialiser

Pour repartir d'une instance vide, ce qui supprime **tous** les objets et comptes de test :

```bash
docker compose down
# The files belong to the container's user: delete through Docker, without sudo.
docker run --rm -v "$PWD/homebox:/data" alpine sh -c 'rm -rf /data/* /data/.[!.]*'
docker compose up -d
```

Gardez le même `.env` : le pepper peut rester le même pour une nouvelle instance.

## Dépannage

| Symptôme | Solution |
|----------|----------|
| `docker compose up` : *Set HBOX_AUTH_API_KEY_PEPPER…* | `.env` est absent ou vide : refaites l'étape 1 |
| Le conteneur redémarre en boucle (`docker compose logs homebox`) | Pepper trop court (< 32 octets) : régénérez-le avec `openssl rand -base64 48` |
| `Conflict. The container name "/homebox" is already in use` | Un ancien conteneur existe : `docker rm -f homebox` |
| Toutes les clés API sont refusées après un redémarrage | Le pepper a changé : remettez l'ancien dans `.env`, ou recréez les clés |
| L'extension affiche « Une adresse HTTPS est obligatoire. » | L'adresse saisie est publique : utilisez l'IP locale de la machine (`192.168.x.x`…) ou `localhost` |
| Inaccessible depuis une autre machine | Pare-feu de la machine Docker : autorisez le port 3100 sur le réseau local |
