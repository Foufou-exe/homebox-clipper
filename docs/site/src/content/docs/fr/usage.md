---
title: "Utilisation"
description: "Importer un achat dans HomeBox : confirmation, doublons, compléter un objet, modèles, tags, champs de commande et plus encore."
---

**Public visé** : les utilisateurs qui veulent importer un achat dans HomeBox. La première section est la
procédure de tous les jours ; les autres sections expliquent chaque option de l'écran de confirmation.

Prérequis : l'extension est [installée](/homebox-clipper/fr/getting-started/installation/) et [configurée](/homebox-clipper/fr/configuration/), et
déverrouillée (elle reste déverrouillée jusqu'au prochain verrouillage, voir [Verrouillage automatique](#verrouillage-automatique)).

## Importer un achat Amazon

1. Sur votre boutique Amazon (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk ou .com), ouvrez vos commandes,
   puis la page de détails de la commande (« Détails de la commande »). La page peut être dans la langue principale de la boutique ou
   en anglais (français ou néerlandais sur Amazon.com.be).
2. Cliquez sur l'icône de l'extension. C'est seulement à ce moment que l'extension injecte son code de détection dans cet
   onglet (permission `activeTab`) et affiche le récapitulatif de l'achat.
3. Vérifiez et corrigez les champs : nom du produit (obligatoire), description, prix d'achat, quantité, date d'achat,
   numéro de commande, vendeur. Les champs qui n'ont pas été détectés sont marqués « non détecté ».
4. Passez en revue les documents à joindre (facture détectée ou fichier local). Chaque document a un type
   (*Facture*, *Manuel*, *Garantie*, *Bon de livraison* ou *Bon de commande*) que vous pouvez modifier sur sa ligne
   avant de confirmer.
5. Chaque produit a une section **Garantie** (voir [Garantie](#garantie)) : vérifiez-la, modifiez-la ou retirez-la.
6. Pour chaque produit, la photo détectée est affichée (64 px) avec la case **Envoyer cette photo avec l'objet**,
   cochée par défaut : décochez-la pour ne rien envoyer. Sans photo, le récapitulatif l'indique.
7. Cliquez sur **Ajouter à HomeBox**. Un message confirme l'ajout, avec le lien **Ouvrir dans HomeBox**.

Rien n'est écrit dans HomeBox avant ce clic. La popup indique toujours l'instance visée
(« HomeBox : <adresse> »), avec la mention « HTTP non chiffré » si elle utilise HTTP.

**Résultat attendu** : l'objet existe dans HomeBox, avec sa facture jointe si une facture a été détectée.
Cliquez sur **Ouvrir dans HomeBox** pour le voir.

**Si ça ne marche pas** : « Aucun achat détecté sur cette page. » signifie que vous n'êtes pas sur une page
de détails de commande (vous pouvez quand même remplir le formulaire à la main, voir
[Saisie manuelle](#saisie-manuelle)). Pour tout autre message, voir
[Dépannage et FAQ](/homebox-clipper/fr/troubleshooting-and-faq/) : la page liste chaque message avec sa solution.

## Ce qui est créé dans HomeBox

| Information du récapitulatif | Champ HomeBox |
|------------------------------|---------------|
| Nom du produit | Nom |
| Description (par défaut « Acheté sur <boutique> le 22 octobre 2026 », par exemple « Acheté sur Amazon.de le 9 novembre 2026 », date dans la langue de l'interface) | Description |
| Quantité | Quantité |
| Prix unitaire | Prix d'achat |
| Date d'achat | Date d'achat |
| Vendeur (par défaut : la boutique, par exemple « Amazon.de ») | Acheté auprès de |
| Date d'expiration de la garantie | Expiration de la garantie |
| Case **Garantie à vie** | Garantie à vie |
| Détails de la garantie | Détails de la garantie |
| Numéro de commande et lien de la page de commande | Notes (« Commande <boutique> : <numéro> », par exemple « Commande Amazon.de : ... », puis l'adresse de la page ; « Commande : <numéro> » en saisie manuelle) |
| Fabricant, numéro de modèle, numéro de série (seulement quand ils sont renseignés dans la section **Identification du produit**) | Fabricant, Numéro de modèle, Numéro de série (sans jamais remplacer une valeur déjà présente sur l'objet) |
| Facture PDF | Pièce jointe de type **Reçu** |
| Manuel ajouté à la main | Pièce jointe de type **Manuel** |
| Garantie ajoutée à la main | Pièce jointe de type **Garantie** |
| Bon de livraison | Pièce jointe de type **Pièce jointe**, avec un nom commençant par `bon-de-livraison-` (`delivery-note-` en anglais), sauf s'il l'indique déjà |
| Bon de commande ajouté à la main | Pièce jointe de type **Pièce jointe** |
| Photo du produit (case cochée) | Pièce jointe de type **Photo**, l'image principale de l'objet |

L'objet est créé avec le type par défaut de HomeBox, sans étiquette. L'emplacement est celui que vous avez choisi (voir
[Choisir l'emplacement](#choisir-lemplacement)) ; sans choix, l'objet est créé sans emplacement.

## Garantie

**Valeur indicative, sans valeur juridique.** La garantie proposée par l'extension est une aide, calculée depuis la
**date d'achat** (la loi fait courir la garantie légale à partir de la livraison, la date proposée est donc un peu plus courte).
Elle ne garantit aucun droit : vérifiez-la selon le produit (neuf ou d'occasion), le vendeur et le pays.

Chaque produit du récapitulatif a une section **Garantie**, affichée avant la confirmation et envoyée avec l'objet :

- **Expire le** (une date), la case **Garantie à vie** (elle désactive la date) et **Détail**. Tout ce que vous saisissez
  est conservé tel quel : la date n'est recalculée quand vous changez la date d'achat que tant que vous n'avez pas modifié
  la garantie. **Retirer la garantie** n'envoie rien ; **Ajouter une garantie** en démarre une nouvelle.
- **L'origine** est toujours indiquée : *la garantie légale du pays de la boutique*, *la garantie indiquée sur
  la page de commande*, ou *saisie par vous*.
- **Garantie légale, seulement quand l'article est vendu par la boutique elle-même** et que son pays est l'un de **la France,
  l'Allemagne, l'Italie, la Belgique (2 ans) et l'Espagne (3 ans)**. Les durées proviennent des textes officiels de
  chaque pays, listés dans le dépôt du projet.
- **Aucune garantie par défaut** pour Amazon.nl, Amazon.co.uk, Amazon.com, pour un article vendu par un tiers (vendeur de
  place de marché), pour une boutique dont la durée n'est pas vérifiée, ou en saisie manuelle : la section est vide, en donne la raison, et
  **Ajouter une garantie** vous permet d'en saisir une (elle propose la durée de votre réglage, ou 2 ans).
- **Garantie indiquée sur la page de commande** : quand un marchand en affiche une (une durée, une garantie à vie ou une
  extension), elle est proposée à la place de la garantie légale, sauf si elle est plus courte : la plus longue l'emporte et le
  détail mentionne les deux. Aucune page Amazon n'affiche de garantie aujourd'hui.
- **Réglages** : la carte **Garantie** de la page de configuration désactive la garantie par défaut et permet de fixer une autre
  durée (de 1 à 10 ans). Une durée remplace la durée légale dans les pays ci-dessus et sert à **Ajouter une
  garantie** ; elle ne crée jamais de garantie par défaut ailleurs. Une garantie indiquée sur la page de commande est toujours proposée.
- L'extension ne modifie que les objets qu'elle a créés et n'écrase jamais une garantie déjà renseignée dans HomeBox.

## Fabricant, modèle et numéro de série

Chaque produit du récapitulatif a une section **Identification du produit** :

- **Fabricant** et **Numéro de modèle** sont pré-remplis depuis la **page produit** Amazon du produit. À l'ouverture de la
  popup, l'extension lit cette page (une requête par produit, 10 au plus, sur la même boutique Amazon que la
  commande, sans cookies ni référent, sans clé API et sans donnée HomeBox) et cherche les lignes « Fabricant » et
  « Numéro du modèle » de ses tableaux de détails, dans toutes les langues des boutiques prises en charge. La marque n'est pas
  utilisée comme fabricant.
- **Numéro de série** est toujours vide : saisissez-le d'après l'étiquette de votre appareil ; il n'est jamais lu sur une page.
- Chaque valeur peut être modifiée ou vidée avant la confirmation. Un champ vide n'est pas envoyé ; une valeur déjà définie sur
  l'objet n'est jamais remplacée (par exemple lors d'un nouvel essai, si vous l'avez renseignée dans HomeBox entre-temps). Une valeur fait au plus
  255 octets.
- Si la page produit ne peut pas être lue (réseau, vérification anti-robot, autre mise en page, délai dépassé), les champs restent vides et
  une note discrète indique « Fabricant et modèle non trouvés sur la page produit » : l'import n'est jamais bloqué.
- Avec un modèle d'objet, le fabricant et le modèle sont ceux de la section du modèle (remplie avec les valeurs de la page
  produit quand le modèle n'en a pas) ; la section **Identification du produit** n'affiche alors que le numéro de série.
- Compléter un objet existant n'ajoute jamais ces valeurs.

## La photo du produit

La photo est récupérée sur le serveur du marchand au moment de l'import (seulement si la case est cochée), vérifiée
(JPEG, PNG ou WebP, 5 Mo au maximum, d'après le contenu réel du fichier) puis envoyée à HomeBox. Elle n'est
jamais conservée par l'extension. Le résultat indique, par produit : *Photo ajoutée.*, *Photo non demandée.*, *Aucune
photo disponible.* ou *Échec de l'envoi de la photo.* Si la photo échoue, l'objet et sa facture sont conservés :
**Réessayer l'envoi de la photo** relance uniquement la photo, sans recréer l'objet.

## Choisir l'instance HomeBox

Avec deux instances ou plus (voir [Configuration](/homebox-clipper/fr/configuration/#plusieurs-instances-homebox)), le récapitulatif affiche
un **sélecteur d'instance HomeBox** au-dessus des champs, avec le nom et l'hôte de chaque instance ; avec une seule
instance, rien ne change. L'instance proposée est celle de votre **dernier import réussi** (sinon la
première de la liste) ; vous pouvez la changer avant de confirmer. Changer d'instance recharge ses emplacements et
ses tags (le dernier emplacement de cette instance est présélectionné, les tags qui n'y existent pas sont marqués **nouveau**) ;
les champs que vous avez modifiés, la sélection, les documents, la photo et la garantie sont conservés. Le sélecteur est
désactivé pendant l'import, et la confirmation indique l'instance choisie. Tout l'import (vérification des doublons, objet,
documents, photo, tags) va **vers cette instance uniquement**. L'extension ne bascule jamais d'elle-même vers
une autre instance, même quand celle choisie est inaccessible. Le résultat et l'historique des imports indiquent
le nom de l'instance et y ouvrent l'objet.

## Choisir l'emplacement

Le récapitulatif propose un champ d'emplacement facultatif : commencez à saisir (la casse et les accents sont ignorés : « etagere »
trouve « Étagère »), puis choisissez dans la liste à la souris ou au clavier (flèches, Entrée, Échap). Chaque
suggestion affiche son **chemin complet** (« Maison › Garage »), ce qui distingue des emplacements portant le même nom. Un
objet HomeBox n'a qu'un seul emplacement.

- **Un seul produit** (saisie manuelle ou commande d'un seul article) : un seul champ, **Emplacement (facultatif)**.
- **Plusieurs produits** : le champ **Emplacement des produits**, placé avant la liste des produits, s'applique
  à tous les produits cochés. Chaque produit affiche *Même emplacement que les autres produits*.
- **Un emplacement différent pour un produit** : **Modifier**, sous ce produit, ouvre son propre sélecteur ; ce
  choix remplace celui de la commande pour ce produit uniquement. **Utiliser celui de la commande** revient au choix
  partagé.
- **Dernier emplacement** : celui du dernier import ayant créé au moins un objet sur cette instance est
  présélectionné ; **Retirer** vide le champ (l'objet sera créé sans emplacement).
- **Liste vide ou indisponible** : si HomeBox n'a aucun emplacement, ou si la liste n'a pas pu être lue, un message
  l'indique et l'import reste possible sans emplacement. Créez les emplacements dans HomeBox :
  l'extension n'en crée, n'en renomme et n'en supprime jamais.
- **Emplacement disparu** : s'il a été supprimé dans HomeBox entre le choix et l'envoi, aucun objet n'est
  créé pour ce produit. Choisissez un autre emplacement et réessayez, ou **Importer sans emplacement**.

## Tags

Chaque produit du récapitulatif a une section **Tags**, après la garantie. L'extension propose, déjà
cochés : la marque de la boutique (par exemple « Amazon », la même pour toutes les boutiques Amazon) et les tags de vos propres
règles dont le texte apparaît dans le nom du produit détecté (les règles et l'option du nom de la boutique se règlent dans la
carte **Tags automatiques** de la page de configuration, voir [Configuration](/homebox-clipper/fr/configuration/#tags-automatiques)).
Les règles sont évaluées une seule fois, à l'ouverture du récapitulatif : modifier le nom du produit ne change pas les suggestions.

- **Décochez** un tag pour l'écarter ; seuls les tags cochés sont envoyés, et seulement à la confirmation. Fermer la
  popup n'envoie rien et ne crée aucun tag.
- **Ajouter un tag** : saisissez dans le champ (la casse et les accents sont ignorés : « ecran » trouve « Écran »), puis choisissez un
  tag HomeBox existant à la souris ou au clavier (flèches, Entrée, Échap), ou choisissez *Ajouter « … » (nouveau)*.
  Ajouter un tag déjà présent dans la liste le coche à nouveau au lieu de le dupliquer.
- **nouveau** : le tag n'existe pas encore dans HomeBox ; il est créé une fois à la confirmation, puis rattaché.
- **non vérifié** : la liste des tags HomeBox n'a pas pu être lue (un avertissement est affiché une fois) ; vous pouvez quand même importer,
  les tags sont rapprochés ou créés à la confirmation.
- Les tags déjà présents sur un objet ne sont jamais retirés. Un nom fait au plus 255 octets, et un produit a au plus 50 tags.

Si un tag ne peut pas être créé ou rattaché, l'objet et ses données sont conservés : le résultat affiche
*Tags non ajoutés : …* et **Réessayer** n'applique que les tags manquants, sans recréer l'objet ni les tags
déjà créés. Les tags choisis ne sont jamais enregistrés dans l'historique des imports.

## Type d'objet

Si votre instance HomeBox a au moins deux types d'objet (HomeBox v0.26.0 ou ultérieure), une liste **Type d'objet** apparaît sous
chaque produit du récapitulatif. Elle liste les types d'objet de l'instance (jamais les types d'emplacement), réglée sur le dernier
type que vous avez utilisé sur cette instance, ou à défaut sur le **type par défaut du serveur** (le type que HomeBox donne à un objet quand aucun
n'est envoyé). Avec le type par défaut, aucun type n'est envoyé et l'import est exactement le même que sans ce choix.

- Le type se choisit **par produit** ; changer l'instance cible réinitialise les choix, car un type appartient à une seule
  instance.
- Avec un seul type d'objet, ou sur une instance qui ne propose pas de types, aucune liste n'est affichée et rien ne change.
- Si le type choisi a été supprimé dans HomeBox entre-temps, rien n'est créé et le message l'indique : abandonnez
  l'import et recommencez avec un autre type.
- L'extension ne fait que lire les types (`GET /api/v1/entity-types`) ; elle n'en crée, n'en modifie ni n'en supprime jamais.

## Modèles d'objet HomeBox

Si votre instance HomeBox a des modèles d'objet (HomeBox v0.22.1 ou ultérieure), un sélecteur **Modèle** apparaît sous chaque
produit du récapitulatif. Il est réglé sur **Aucun** par défaut (ou sur le modèle par défaut de l'instance, voir
[Configuration](/homebox-clipper/fr/configuration/#modèle-dobjet-par-défaut)) ; avec **Aucun**, l'import est exactement le même que sans
modèles.

Quand vous choisissez un modèle :

- ses valeurs sont affichées et modifiables avant la confirmation : fabricant, numéro de modèle, assuré, et ses champs
  personnalisés (texte, nombre, oui/non et date), dans l'ordre du modèle : tous les champs personnalisés sont modifiables. Un champ de type inconnu est affiché en lecture seule
  et recopié tel quel. Au plus 100 champs par modèle et 50 modèles distincts par import ;
- le nom du produit n'est jamais modifié, et la description du produit passe en premier : la description par défaut
  du modèle n'est utilisée que si le produit n'en a pas. La quantité par défaut du modèle n'est utilisée que pour une
  saisie manuelle. Une garantie trouvée pour le produit est conservée ; sinon la garantie du modèle est affichée ;
- ses tags par défaut sont ajoutés (seulement ceux qui existent encore dans HomeBox ; un tag de modèle n'est jamais créé) et son
  emplacement par défaut est proposé quand le produit n'en a pas ;
- **un emplacement est obligatoire** : HomeBox en exige un pour créer un objet à partir d'un modèle. **Ajouter** reste désactivé, avec un
  message, tant qu'un emplacement n'est pas choisi ;
- les nombres, les oui/non et les dates sont **enregistrés sous forme de texte** dans les champs personnalisés (HomeBox n'affiche que le texte) : un
  nombre entier en chiffres, `true` ou `false`, une date au format `YYYY-MM-DD` ; les nombres et les oui/non sont aussi envoyés avec leur type. Après
  l'import, l'extension relit l'objet et vérifie chaque valeur ; un écart s'affiche comme une étape « Champs du modèle » en échec
  que vous pouvez réessayer sans recréer l'objet.

Changer de modèle, ou revenir à **Aucun**, retire ce que le modèle avait défini et conserve ce que vous avez modifié
vous-même. Changer l'instance cible retire les modèles : les modèles appartiennent à une seule instance.

Juste avant l'import, les modèles sont revérifiés. Un modèle **modifié ou supprimé** dans HomeBox depuis que vous l'avez
choisi interrompt l'import : rien n'est créé, vos saisies sont conservées, et les changements (ou le modèle supprimé et
les produits concernés) sont listés ; confirmez de nouveau, ou choisissez un autre modèle ou **Aucun**. Comme toujours, rien n'est
créé avant votre confirmation.

## Champs de commande (champs personnalisés HomeBox)

Quand l'option **Enregistrer la commande en champs personnalisés** est activée pour l'instance cible (voir
[Configuration](/homebox-clipper/fr/configuration/#champs-de-commande-en-champs-personnalisés)), une section **Champs de commande** apparaît sous chaque
produit du récapitulatif. Elle affiche, avant la confirmation, le nom et la valeur de chaque champ personnalisé qui sera
créé sur l'objet :

- le **numéro de commande** : son unique saisie est le champ existant « N° de commande » du produit (la même valeur
  alimente les notes, la vérification des doublons et le champ personnalisé) ; la section l'affiche en lecture seule ;
- le **marchand** (la boutique d'origine, par exemple `Amazon.fr`) et l'**URL de la commande** (l'adresse de la page
  de commande) : vous pouvez modifier le marchand et l'URL de la commande dans la section sans changer les notes ;
- une valeur vide signifie que le champ n'est pas créé pour ce produit (« Non renseigné ») ; une URL de commande doit être une adresse web `http` ou
  `https`. HomeBox limite le nom d'un champ à 255 octets et une valeur à 500 octets (octets UTF-8, donc une
  lettre accentuée compte double) : une valeur plus longue bloque **Ajouter** jusqu'à ce que vous la raccourcissiez ou la vidiez ; rien n'est coupé
  silencieusement.

Avec un modèle dont un champ texte porte le même nom qu'un champ de commande, les deux sont fusionnés : un seul champ est affiché
(dans **Champs de commande**) et créé. Un champ de modèle de même nom mais d'un autre type (nombre, oui/non, date) est
conservé : le champ de commande n'est pas créé pour ce produit et un message l'indique ; l'information reste dans les notes.
Changer de modèle conserve les valeurs que vous avez saisies.

Les notes de l'objet restent exactement les mêmes que sans l'option. Après l'import, l'extension relit l'objet
et vérifie chaque champ de commande ; un écart ou un refus de HomeBox s'affiche comme une étape « Champs de commande » en échec,
avec un lien vers l'objet et un nouvel essai de cette seule étape (l'objet n'est jamais recréé, les données d'achat sont
conservées). Changer l'instance cible affiche, renomme ou retire la section selon les réglages de la nouvelle
instance. Avec l'option désactivée, le récapitulatif et l'import sont exactement les mêmes qu'avant.

## Lien vers la page de commande

Quand l'option **Ajouter un lien vers la page de commande** est activée pour l'instance cible (voir
[Configuration](/homebox-clipper/fr/configuration/#lien-vers-la-page-de-commande)), une case **Ajouter un lien vers la page de commande** apparaît sous chaque
produit du récapitulatif. Elle est cochée par défaut et affiche l'adresse web qui sera **enregistrée dans HomeBox** : c'est
l'adresse de la page de commande, la même que dans les notes, et elle pointe vers le site du marchand. Décochez la case pour
n'ajouter aucun lien pour ce produit. Une page sans adresse `http` ou `https` n'a pas de case.

Une fois l'objet créé, le lien est ajouté comme lien externe de l'objet. Les notes de l'objet restent les mêmes
que sans l'option. Si le lien ne peut pas être ajouté, l'import est présenté comme partiel avec le message, l'étape du lien
est marquée en échec et **Réessayer le lien de commande** ajoute uniquement le lien (l'objet n'est jamais recréé, et un
lien déjà présent sur l'objet n'est jamais ajouté deux fois). Une instance qui n'accepte pas les liens externes affiche un message
qui invite à mettre à jour HomeBox ou à désactiver l'option. Avec l'option désactivée, le récapitulatif et l'import sont exactement
les mêmes qu'avant.

## Commandes de plusieurs articles

La popup liste les « Produits détectés » : cochez ceux à importer. Chacun devient un objet HomeBox, avec les
documents sélectionnés joints.

## Saisie manuelle

Sur une page qui n'est pas une commande Amazon (page produit, autre site), l'extension affiche « Aucun achat
détecté sur cette page. », la liste des boutiques Amazon prises en charge (avec « (en test) » après les boutiques encore
en test) et une invitation à signaler une page mal détectée avec le lien Support, puis propose un formulaire vide. Remplissez-le et, si besoin, joignez un PDF depuis votre
ordinateur avec **Choisir un PDF…** (type : *Facture*, *Manuel*, *Garantie*, *Bon de livraison* ou *Bon de commande*).
Le type de chaque document peut encore être modifié sur sa ligne avant de confirmer.

Si votre instance HomeBox refuse le type *Manuel* ou *Garantie*, le document est renvoyé comme pièce jointe simple
et la popup vous le dit (« ... : votre instance HomeBox n'a pas pris en charge le type ..., le document a été joint comme pièce jointe simple. »). L'extension ne détecte elle-même un bon de livraison que sur les pages qui en proposent un en PDF
(aucune page Amazon aujourd'hui) ; sinon, ajoutez-le à la main.

La saisie manuelle est aussi utile quand la détection se trompe : vous pouvez corriger chaque champ, ou **remplacer la
facture détectée** par un fichier local au lieu d'en ajouter un. Ce choix n'est proposé que pour une *Facture* ou un
*Bon de commande* : ajouter un manuel, une garantie ou un bon de livraison laisse la facture détectée cochée.

## Fichiers acceptés

Seuls de vrais PDF sont envoyés : signature `%PDF-` vérifiée, **15 Mo au maximum**. Les fichiers locaux sont revérifiés par
le service worker avant tout appel à HomeBox, même si l'interface les a déjà vérifiés.

## Doublons

Après votre confirmation et avant tout envoi, l'extension vérifie dans HomeBox chaque produit sélectionné pour détecter :

- un **doublon sûr** : un objet dont les notes contiennent le même numéro de commande et qui porte le même nom
  (la comparaison ignore la casse et les espaces), comme auparavant. Quand l'option **Enregistrer la commande en champs
  personnalisés** est activée pour l'instance cible, HomeBox est aussi interrogé sur les objets dont le **champ personnalisé de numéro de commande**
  contient exactement ce numéro (recherche exacte côté serveur), en plus de la recherche dans le texte, toujours
  utilisée pour les objets importés auparavant. La fenêtre ne change pas. Si cette recherche supplémentaire échoue, la vérification est
  signalée comme incomplète ;
- des **objets ressemblants** : des objets de **tout votre inventaire**, quelle que soit leur origine (autre commande, autre boutique,
  ajoutés à la main sans aucune note), dont le nom est proche du nom du produit. La casse, les accents, la ponctuation, l'ordre des
  mots et quelques mots en plus ou en moins sont ignorés : deux noms sont proches quand au moins 80 % des mots
  significatifs du plus court sont partagés, avec au moins 2 mots partagés. Un nom à un seul mot significatif
  n'est signalé que s'il est identique.

Un produit **sans numéro de commande** (saisie manuelle, ou numéro non détecté) est aussi vérifié, par nom proche.

Si quelque chose est trouvé, la fenêtre « Un objet semblable existe déjà dans HomeBox. » liste, sous le nom de chaque
produit concerné, d'abord une section **Doublon sûr**, puis une section **Ressemblances** (5 au plus par
produit, avec une mention quand il y en a d'autres). Chaque objet est affiché avec son nom dans HomeBox et un lien qui l'ouvre.
Vous choisissez **Créer quand même** ou **Annuler** : rien n'est créé, ignoré ni fusionné tant que vous n'avez pas choisi, et
Annuler vous ramène au récapitulatif avec vos choix intacts. Des variantes d'un produit (par exemple « 1 To » et
« 2 To ») peuvent être signalées : ouvrez l'objet pour comparer.

### Compléter l'objet existant

Pour chaque produit listé dans la fenêtre, vous pouvez aussi choisir, à la place de **Créer un nouvel objet** (coché par
défaut), de **Compléter** l'un des objets trouvés, doublon sûr ou objet ressemblant. Le choix se fait par
produit : les autres produits de la commande sont créés comme d'habitude, dans le même import. Dès qu'un produit est réglé
sur **Compléter**, le bouton principal devient **Voir les changements** : l'extension relit chaque objet choisi dans
HomeBox et affiche ce que le compléter ajouterait, en quatre catégories que vous pouvez décocher :

- **Pièces jointes** : la facture et les autres documents sélectionnés, et la photo. Un document dont le nom figure déjà
  parmi les pièces jointes de l'objet n'est pas renvoyé (« Déjà présent »). La photo devient la photo principale
  seulement quand l'objet n'en a pas ;
- **Tags manquants** : les tags cochés que l'objet n'a pas encore. Aucun tag n'est jamais retiré ;
- **Achat et garantie, seulement si vides** : prix, date d'achat, vendeur et garantie, chacun seulement quand il est
  vide dans HomeBox ;
- **Détails de la commande, seulement si absents** : les champs personnalisés de commande (quand l'option est activée pour l'instance) qui
  n'existent pas encore sur l'objet, et une ligne avec la commande à la fin des notes, sauf si les notes contiennent déjà le
  numéro de commande.

L'extension n'écrase jamais une valeur déjà définie dans HomeBox : ce qui est déjà renseigné est listé comme « Déjà renseigné
dans HomeBox, inchangé », sans sa valeur. Le nom, la description et l'emplacement de l'objet ne changent jamais ;
le modèle et l'emplacement choisis dans le récapitulatif ne s'appliquent pas à un objet existant. La quantité n'est
augmentée que si vous cochez **Augmenter la quantité de N**, décoché par défaut. **Retour** revient à la fenêtre avec
vos choix intacts ; rien n'est envoyé avant **Confirmer**. Juste avant l'écriture, l'objet est relu une dernière fois : une valeur
renseignée dans HomeBox entre-temps n'est pas modifiée, et le résultat l'indique (« Rempli entre-temps dans HomeBox, non
modifié »). L'historique présente un tel import comme « Objet existant complété ».

La détection est une aide, **pas une garantie** : elle ne voit que ce que votre instance HomeBox renvoie pour les mots
recherchés, et un doublon sous un nom très différent n'est pas trouvé.

Si la vérification échoue, pour tous les produits ou seulement certains (« La vérification des doublons n'a pas pu être effectuée. »),
l'import reste possible : la fenêtre liste les produits qui n'ont pas pu être vérifiés, et le message reste
visible sur l'écran de résultat, pendant l'import et avec son résultat.

## Aucune facture

Si aucun document n'est joint, l'extension demande « Aucune facture ne sera jointe. Créer l'objet quand même ? »
avant de créer l'objet.

## Historique des imports

Chaque import que vous confirmez est enregistré dans un court historique local, **chiffré avec votre phrase de passe** et
conservé uniquement dans ce navigateur. Ouvrez-le avec le bouton **horloge** de l'en-tête de la popup, ou dans la
carte **Historique des imports** de la page de configuration.

- Les imports sont listés du plus récent au plus ancien : nom du produit, boutique, date d'import, date d'achat et résultat :
  **Complet**, **Partiel** (ce qui manque est nommé, par exemple « facture non envoyée », « manuel non envoyé », « garantie non envoyée » ou « bon de livraison non envoyé »), **Échoué** (avec
  la raison) ou **En cours**. Les produits d'une même commande sont regroupés sous le numéro de commande.
- **Ouvrir dans HomeBox** ouvre l'objet dans un nouvel onglet ; il n'est proposé que pour l'instance actuellement
  configurée.
- Une entrée **Partiel** ou **Échoué** indique « Peut être repris » tant que la reprise est encore possible : ouvrez la
  page de la commande, puis l'extension (voir [Reprise après une erreur](#reprise-après-une-erreur)). Une reprise réussie
  met à jour la même entrée.
- **Supprimer** retire une entrée ; **Tout effacer** efface tout après une confirmation. Dans la configuration, la
  case **Garder un historique local de mes imports** le désactive (après une confirmation, elle efface tout).
- Extension **verrouillée** : l'historique affiche « Historique verrouillé » et rien d'autre ; déverrouillez pour le lire. Tout effacer
  et la désactivation fonctionnent toujours.
- Au plus 200 entrées et 12 mois sont conservés. Reconfigurer l'extension avec une **nouvelle phrase de passe
  alors qu'elle est verrouillée** efface l'historique (un avertissement est affiché avant l'envoi).

## Reprise après une erreur

Un import se compose de plusieurs appels (voir [Architecture](/homebox-clipper/fr/contributing/architecture/)). Si l'objet est créé mais que
le reste échoue (informations d'achat ou documents), la popup l'indique, liste chaque document avec son type et son état
(« Le manuel n'a pas pu être envoyé. ») et propose **Réessayer l'envoi des documents**,
**Réessayer l'envoi de la photo** ou **Réessayer l'import**, **sans recréer l'objet**. Si vous fermez la
popup, la reprise est proposée de nouveau à sa prochaine ouverture sur le même onglet. Pour un fichier ajouté à la main,
vous devez le sélectionner à nouveau (les octets du fichier ne sont jamais conservés). **Abandonner** efface l'import en cours
sans contacter HomeBox, même quand l'extension est verrouillée (l'objet déjà créé est conservé).

Avec plusieurs instances, un import interrompu est toujours repris sur l'instance où il a commencé, quelle que soit
l'instance proposée dans le récapitulatif ; la reprise affiche son nom (« Import interrompu vers … »). Supprimer cette
instance efface aussi ses imports interrompus.

Si le service worker de l'extension s'est arrêté pendant un import, la popup l'indique (« L'import a été
interrompu avant la fin. ») et propose de le reprendre. Cette reprise ne couvre que cet arrêt :
les imports en cours sont conservés dans la mémoire de session, qui est effacée à la fermeture du navigateur et à la mise à jour de
l'extension. Dans ces deux cas, rien n'est repris : vérifiez dans HomeBox si l'objet a été
créé.

Quand la création d'un objet est incertaine (réponse perdue, délai dépassé, arrêt pendant l'envoi), la reprise
cherche d'abord dans HomeBox un objet portant le **même nom**. S'il en existe un, elle refuse de réessayer (un faux
positif est possible : le même produit acheté une autre fois). Si cette recherche échoue, elle refuse aussi. Dans
les deux cas, vérifiez dans HomeBox, puis abandonnez et relancez l'import depuis le récapitulatif, qui demande
une confirmation en cas de doublon. Cette vérification réduit le risque sans l'éliminer : un doublon
reste possible si l'objet a été renommé ou si la recherche ne le voit pas.

## Verrouillage automatique

Dans la configuration, **Verrouillage automatique** fixe quand la phrase de passe est redemandée : à la fermeture du navigateur
(par défaut), après 15 minutes, 1 heure ou 4 heures d'inactivité, ou à chaque ouverture de l'extension. Il n'existe
pas d'option « jamais ». Le bouton 🔒 verrouille toujours immédiatement. Un import en cours n'est jamais interrompu.

## Mises à jour et version

- Après une mise à jour, une annonce « Mise à jour vers vX » apparaît une fois en haut de la popup et de la configuration, avec
  un lien vers les notes de version (ouvert seulement si vous cliquez dessus). Fermez-la avec ✕ : elle ne revient pas pour
  cette version. Rien n'est affiché après la première installation.
- Quand le navigateur a une mise à jour prête, un bouton **Mettre à jour maintenant** redémarre l'extension avec la nouvelle version
  (la phrase de passe est alors redemandée). Il est désactivé pendant un import ou tant qu'un import peut encore être repris.
  Sans le bouton, le navigateur installe la mise à jour de lui-même (dans Firefox, seule une installation depuis Firefox
  Add-ons est mise à jour ; un module chargé temporairement n'affiche jamais le bouton). Aucune requête n'est faite pour vérifier les mises à jour.
- Le numéro de version installée est affiché en bas de la popup et dans « Aide et projet », à côté du lien
  GitHub.

## Thèmes

La popup suit le thème du système par défaut. Le bouton de la barre d'outils fait défiler *Automatique (système)*,
*Clair* et *Sombre* ; le choix est mémorisé.

## Aide et projet

Deux liens, « Support » et « GitHub », sont toujours affichés en bas de la popup (configurée ou non, verrouillée
ou non) et dans la section « Aide et projet » de la page de configuration.

- « Support » ouvre les issues du projet (`https://github.com/Foufou-exe/homebox-clipper/issues`), où vous
  pouvez signaler un bug ou demander un nouveau marchand.
- « GitHub » ouvre le dépôt du projet (`https://github.com/Foufou-exe/homebox-clipper`).

Chaque lien s'ouvre dans un nouvel onglet. La popup se ferme alors : c'est le comportement du navigateur quand le focus passe à
un autre onglet. Aucune donnée n'est envoyée : l'extension ne fait aucune requête, les adresses ne portent aucun paramètre, et la
seule requête est celle que votre navigateur fait quand vous cliquez.

## Limites

- Boutiques Amazon uniquement (Amazon.fr, .de, .es, .it, .com.be, .nl, .co.uk, .com), et seulement la page « Détails de la commande » :
  voir [Marchands pris en charge](/homebox-clipper/fr/supported-merchants/). Toutes sauf Amazon.fr sont encore en test.
- HomeBox enregistre un montant sans devise : pour un achat dans une devise autre que l'euro (livres sur
  Amazon.co.uk, dollars sur Amazon.com), l'extension vous avertit avant la confirmation (« Devise détectée :
  GBP. HomeBox enregistrera le montant tel quel, sans conversion. ») et ne le convertit jamais.
- La détection dépend du HTML d'Amazon, qui change régulièrement : si un champ n'est pas détecté, utilisez la saisie
  manuelle et [signalez la page mal détectée](https://github.com/Foufou-exe/homebox-clipper/issues).
