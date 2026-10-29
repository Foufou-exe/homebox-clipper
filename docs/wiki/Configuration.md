# Configuration

Avant le premier import, l'extension doit connaître l'adresse de votre instance HomeBox et une clé API.
Tout se fait dans la page d'options (clic sur l'icône de l'extension puis ⚙, ou clic droit puis *Options*).

## 1. Créer une clé API dans HomeBox

Dans HomeBox : **Profil** puis **Clés API**, créez une clé et copiez-la (elle commence par `hb_`).
Elle n'est affichée qu'une fois.

> [!TIP]
> Créez une clé **dédiée à l'extension, avec une date d'expiration** : HomeBox affiche sa dernière
> utilisation et permet de la révoquer sans toucher à vos autres clés.

## 2. Renseigner l'extension

1. **Adresse de l'instance HomeBox**, par exemple `https://homebox.example.com`. Inutile d'ajouter
   `/api` : l'extension normalise l'adresse (retrait du `/` final et d'un éventuel `/api` ou `/api/v1`).
2. **Clé API** : collez la clé `hb_…`.
3. **Phrase de passe** (au moins **10 caractères**, à saisir deux fois) : elle chiffre la clé API sur le
   disque. Retenez-la : elle ne peut pas être récupérée.
4. Cliquez sur **Tester et enregistrer**.
5. Chrome vous demande l'autorisation d'accéder à **cette adresse uniquement** : acceptez.

L'extension vérifie que l'adresse répond comme une instance HomeBox (`GET /api/v1/status`) et que la
clé est acceptée (`GET /api/v1/users/self`), puis affiche l'instance connectée et sa version.
Le résultat du dernier test est conservé avec la configuration.

## Adresses acceptées

| Adresse de l'instance | Accepté ? |
|-----------------------|-----------|
| `https://…` (toute adresse) | Oui |
| `http://` vers le **réseau local** : `localhost`, `127.0.0.1` (boucle locale), IP privées (`10.x.x.x`, `172.16.x.x` à `172.31.x.x`, `192.168.x.x`), IPv6 `::1` et `fc…`/`fd…`, noms en `.lan`, `.local`, `.home.arpa`, `.internal`, `.localhost`, ou nom court sans point (`http://homebox:7745`) | Oui, avec l'avertissement « HTTP non chiffré » |
| `http://` vers une adresse **publique** (nom de domaine public, IP publique) | Non : « Une adresse HTTPS est obligatoire. » |
| Adresse contenant un identifiant ou un mot de passe (`https://user:pass@…`) ou autre protocole que `http`/`https` | Non : « L'adresse HomeBox est invalide… » |

> [!WARNING]
> En HTTP, votre clé API circule **en clair** sur le réseau à chaque requête. C'est acceptable sur un
> réseau local de confiance (homelab), jamais sur Internet. Pour aller plus loin, placez HomeBox derrière
> un reverse proxy HTTPS (Caddy, Traefik, Nginx Proxy Manager…).

La règle est appliquée dans `src/background/config/url-policy.ts` et couverte par des tests unitaires.
Par exemple, une instance de test sur un autre poste du réseau local aura une adresse du type
`http://192.0.2.10:3100` (adresse de documentation) : voir [Local-HomeBox-instance](Local-HomeBox-instance.md).

## Verrouillage et déverrouillage

- Après un **redémarrage du navigateur**, le popup demande votre phrase de passe : c'est le
  déverrouillage de la session. La clé déchiffrée ne vit qu'en mémoire.
- Le bouton 🔒 du popup (ou **Verrouiller** dans les options) efface la clé de la mémoire. Les imports
  sont alors impossibles jusqu'au prochain déverrouillage.
- Une mauvaise phrase de passe affiche « Phrase de passe incorrecte. » sans rien modifier.

## Modifier ou supprimer la configuration

- **Changer l'adresse ou la clé** : dans les options. Pour **conserver la clé actuelle**, laissez le
  champ de la clé vide et saisissez votre phrase de passe actuelle : changer l'adresse d'une clé existante
  exige donc de connaître la phrase de passe (voir [Security-and-privacy](Security-and-privacy.md)).
- **Changer de phrase de passe** : ressaisissez la clé API avec la nouvelle phrase de passe.
- **Supprimer la configuration** : efface l'adresse, la clé chiffrée, les imports en cours conservés pour
  reprise et **retire l'autorisation d'accès** accordée à l'instance.
- **Phrase de passe oubliée** : elle ne peut pas être récupérée. Supprimez la configuration, puis
  reconfigurez l'extension avec votre clé API (ou une nouvelle clé).

## Apparence

Le thème (**Automatique** selon le système, **Clair** ou **Sombre**) se choisit dans la section
*Apparence* des options, ou d'un clic sur le bouton de la barre du popup.

## Mise à niveau depuis une version qui stockait la clé en clair

Une ancienne version enregistrait la clé API en clair. Au démarrage, l'extension la retire du disque et la
garde en mémoire jusqu'à ce que vous définissiez une phrase de passe dans les options ; sans cela, elle est
perdue à la fermeture du navigateur.

Une question ou une erreur ? Voir [Troubleshooting-and-FAQ](Troubleshooting-and-FAQ.md).
