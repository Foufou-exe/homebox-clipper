# Tester en local avec HomeBox

Ce guide monte une instance HomeBox de développement avec Docker Compose. Ses données sont dans
le dossier `homebox/` du dépôt : c'est la configuration utilisée pour développer l'extension.

```
homebox-companion/
├── compose.yaml      instance HomeBox de dev
├── .env              votre pepper HomeBox (ignoré par git)
├── homebox/          données HomeBox : base SQLite + pièces jointes (ignoré par git)
│   ├── homebox.db
│   └── <uuid>/…      fichiers joints (factures)
└── …
```

## Prérequis

- Docker avec le plugin Compose (`docker compose version`).
- `openssl` pour générer le secret.
- Le dépôt installé (`bun install`), voir le [README](../README.md#installation).

## 1. Préparer le secret (pepper)

Depuis la version 0.27, HomeBox exige `HBOX_AUTH_API_KEY_PEPPER` : un secret d'au moins 32 octets
qui protège les clés API en base. **Il doit rester le même d'un démarrage à l'autre**. Le changer
invalide toutes les clés API déjà créées, et il faut alors les recréer et les ressaisir dans
l'extension.

**Nouvelle installation :**

```bash
cp .env.example .env
sed -i "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$(openssl rand -base64 48)|" .env
```

**Vous avez déjà un pepper** (par exemple dans un fichier `hbox.pepper` à la racine) : réutilisez-le
pour garder vos clés API valides.

```bash
cp .env.example .env
sed -i "s|^HBOX_AUTH_API_KEY_PEPPER=.*|HBOX_AUTH_API_KEY_PEPPER=$(cat hbox.pepper)|" .env
```

`.env` et `*.pepper` sont ignorés par git : ne les commitez jamais.

## 2. Démarrer HomeBox

```bash
docker compose up -d
docker compose logs -f homebox      # Ctrl+C pour quitter les logs
```

Vérifiez que l'API répond :

```bash
curl -s http://localhost:3100/api/v1/status
# {"health":true, … ,"build":{"version":"v0.27.0", …}}
```

> [!NOTE]
> **Vous lanciez déjà HomeBox avec `docker run`** (conteneur `homebox` monté sur `./homebox`) :
> supprimez l'ancien conteneur, vos données restent dans `homebox/`.
>
> ```bash
> docker rm -f homebox
> docker compose up -d
> ```

| Variable (`.env`) | Défaut | Rôle |
|-------------------|--------|------|
| `HBOX_AUTH_API_KEY_PEPPER` | — | **Obligatoire.** Secret des clés API |
| `HOMEBOX_VERSION` | `latest` | Version de l'image, ex. `v0.27.0` pour figer la version testée |
| `HOMEBOX_PORT` | `3100` | Port exposé sur le poste |
| `TZ` | `Europe/Paris` | Fuseau horaire |

## 3. Créer un compte et une clé API

1. Ouvrez <http://localhost:3100> et créez un compte (une adresse fictive suffit, par exemple
   `dev@example.com`).
2. **Profil → Clés API** → créez une clé nommée `homebox-companion-dev`, avec une date d'expiration.
3. Copiez la clé `hb_…` : elle ne sera plus affichée ensuite.

## 4. Brancher l'extension

Choisissez l'adresse et le build selon l'endroit où tourne le navigateur :

| Navigateur | Adresse à saisir | Build à charger |
|------------|------------------|-----------------|
| Sur le même poste que Docker | `http://localhost:3100` | n'importe lequel (`bun run build`, `bun run dev`) |
| Sur un autre poste du réseau, ou pour reproduire un homelab | `http://<IP-du-poste>:3100` (ex. `http://192.168.1.160:3100`) | `bun run build:homelab` → `.output/chrome-mv3-homelab/` |

Le build de production refuse toute adresse HTTP autre que `localhost` / `127.0.0.1`. C'est
voulu : seuls les builds `dev` et `homelab` acceptent le HTTP du réseau local.

Puis :

1. `chrome://extensions` → *Mode développeur* → *Charger l'extension non empaquetée* → le
   dossier du build. Si l'extension est déjà chargée, cliquez sur ↻ après chaque build.
2. Page d'options : adresse, clé API, phrase de passe (au moins 10 caractères) → **Tester et
   enregistrer** → acceptez l'accès demandé par Chrome.
3. Le badge doit afficher `● HomeBox : http://… v0.27.0`.

> [!TIP]
> `bun run dev` ouvre un Chrome dédié avec l'extension chargée et rechargée à chaque
> modification du code. C'est le plus pratique pendant le développement.

## 5. Scénarios à vérifier

Connectez-vous à Amazon.fr dans le même navigateur, puis :

| # | Scénario | Résultat attendu |
|---|----------|------------------|
| 1 | Page **Détails de la commande** → popup | Produit, prix, date, n° de commande, facture et instance affichés |
| 2 | *Ajouter à HomeBox* | Message de succès et lien ; dans HomeBox : prix, date, vendeur, notes `Commande Amazon.fr : …`, facture en pièce jointe |
| 3 | Rejouer le même import | Avertissement « doublon potentiel » avec un lien vers l'objet existant |
| 4 | Commande multi-articles, cocher 2 produits | 2 objets, chacun avec la facture |
| 5 | Page produit (pas une commande) → popup | « Aucun achat détecté » et formulaire vide ; joindre un PDF local → import OK |
| 6 | Joindre un `.png` renommé en `.pdf` | « Le fichier n'est pas un PDF » |
| 7 | `docker compose stop` puis import | « HomeBox est inaccessible » (redémarrer avec `docker compose start`) |
| 8 | Lancer un import puis `docker compose stop` juste après la création | « Objet créé mais l'envoi de la facture a échoué » ; `docker compose start` → *Réessayer* → un seul objet, avec sa facture |
| 9 | Popup → 🔒, puis rouvrir | Phrase de passe demandée ; une mauvaise phrase affiche « Phrase de passe incorrecte » |
| 10 | Révoquer la clé dans HomeBox, puis import | « Clé API invalide ou expirée » |
| 11 | DevTools de l'extension → *Application → Extension storage → Local* | `homeboxConfig` contient un bloc chiffré (`ct`) et aucune clé en clair |

Pour voir les factures reçues par HomeBox, ouvrez l'objet dans l'interface (onglet des pièces
jointes). Les fichiers sont stockés sous `homebox/<uuid>/`.

## 6. Remettre à zéro

Pour repartir d'une instance vide, ce qui supprime **tous** les objets et comptes de test :

```bash
docker compose down
# Les fichiers appartiennent à l'utilisateur du conteneur : suppression via Docker, sans sudo.
docker run --rm -v "$PWD/homebox:/data" alpine sh -c 'rm -rf /data/* /data/.[!.]*'
docker compose up -d
```

Gardez le même `.env` : le pepper peut rester identique pour une instance neuve.

## Dépannage

| Symptôme | Solution |
|----------|----------|
| `docker compose up` : *Définissez HBOX_AUTH_API_KEY_PEPPER…* | `.env` est absent ou vide : refaites l'étape 1 |
| Le conteneur redémarre en boucle (`docker compose logs homebox`) | Pepper trop court (< 32 octets) : régénérez-le avec `openssl rand -base64 48` |
| `Conflict. The container name "/homebox" is already in use` | Un ancien conteneur existe : `docker rm -f homebox` |
| Toutes les clés API sont refusées après un redémarrage | Le pepper a changé : remettez l'ancien dans `.env`, ou recréez les clés |
| L'extension affiche « Une adresse HTTPS est obligatoire » | Adresse en IP du réseau avec le build de production : utilisez `bun run build:homelab` |
| Inaccessible depuis un autre poste | Pare-feu du poste Docker : autorisez le port 3100 sur le réseau local |
