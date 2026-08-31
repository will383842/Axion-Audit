# Alignement du pack d'implémentation et du code livré

> **Commande de Williams, 2026-08-28** : *« vérifie que le plan d'implémentation complet et ce qui a
> déjà été codé soient alignés et en parfaite harmonie ; si nécessaire, améliore le plan
> d'implémentation pour qu'il soit en harmonie avec ce qui a été implémenté. »*
>
> **Méthode** : trois audits indépendants, en lecture seule, sur des périmètres disjoints — 02 et 06
> contre l'infrastructure réelle · 04 et 05 contre le code et une base reconstruite · 11, 07, 09 et
> 00_INDEX contre le dépôt entier. Chaque divergence est adossée à une commande et sa sortie.
>
> **Le pack est SCELLÉ** (`pnpm check:pack`, 12/12 conformes). **Rien n'y a été modifié** — c'est une
> escalade (CLAUDE.md §3-2). Ce document **propose** ; Williams ratifie.

---

## Verdict en trois lignes

**L'alignement est remarquablement élevé sur la lettre du contrat** : zéro violation des huit
interdictions, zéro `any`, zéro dépendance non épinglée, et — résultat le plus fort de cet audit —
**le schéma livré est une transcription EXACTE du fichier 04, vérifiée colonne par colonne contre le
document lui-même et non contre sa transcription**. Les divergences réelles sont de trois natures :
**onze clauses que le code contredit avec de meilleures raisons que le pack** (→ amendements) ·
**une famille de clauses de gouvernance que rien ne vérifie et que le dépôt n'a pas tenues** ·
**quatre manques de schéma qui ne coûtent rien aujourd'hui et coûteraient une migration en production
demain**.

---

## 1. CE QUI DOIT ÊTRE DÉCIDÉ EN PREMIER — quatre colonnes et un archivage

**C'est le point le plus urgent de ce document, et il n'est urgent que parce qu'il est bon marché
aujourd'hui.**

Le fichier 05 (API et synchronisation) sera écrit *contre* le schéma livré. Quatre choses lui
manquent, et **chacune bloque un incrément du lot L6** :

| # | Manque | Ce que le pack promet et qui devient inexécutable | Bloque |
| --- | --- | --- | --- |
| **S-1** | `attachments` n'a **pas d'`updated_at`** | Le 04 déclare pourtant la ligne **modifiable** (une note volante se rattache après coup) et le §9.5 définit le curseur de pull comme « `updated_at` serveur max reçu ». **Une pièce jointe modifiée ne redescendra jamais.** Le 04 se contredit lui-même : son en-tête pose « `created_at`/`updated_at` **partout** » | L6c |
| **S-3** | Une note volante **n'a pas de propriétaire** | §9.9 : toute écriture de sync n'est acceptée que du **propriétaire de la session**. Or une note volante a `interview_id` ET `answer_id` à NULL : **sa propriété n'est dérivable d'aucune colonne**. La règle n'est pas exécutable sur le cas hors ligne — c'est **l'invariant 3** | L6a |
| **S-4** | L'écrasement d'un **entretien** ou d'une **pièce jointe** n'est archivé nulle part | §9.4 promet que « toute valeur écrasée est archivée ». La table qui le fait a une clé étrangère **obligatoire vers `answers`** : elle ne peut structurellement pas accueillir autre chose. Sur le scénario « deux appareils », qui est un **critère d'acceptation `@critique`**, la valeur perdante disparaît sans trace — c'est **l'invariant 7** | L6a |
| **S-6** | Rien ne porte **l'état d'un envoi par morceaux** ni son empreinte | §9.6 exige un point d'état et une vérification de somme de contrôle. Le critère « reprise d'un envoi interrompu à 80 % » n'a **aucun support de persistance** | L6b |

> **Ajoutées maintenant, ces colonnes coûtent une migration sur une base vide. Découvertes au lot de
> synchronisation, elles coûtent une migration sur des données de collecte réelles.**

**Trois points à décider dans le même geste**, sans quoi le L6 tranchera dans le vide : la nullabilité
de l'horodatage client (aujourd'hui `NULL`-able sur les trois entités, ce qui fait qu'une comparaison
SQL rend `NULL` et **choisit silencieusement le perdant**) · le pull qui contredit « keyset partout,
jamais d'offset » (le §8.4 écrit `?since=` sans `limit` : un pull grand compte renverrait ~8 000
réponses en une fois) · et ce que « révocation famille » veut dire pour les jetons, décision d'API
qui ne vit aujourd'hui que dans **un commentaire de migration**.

---

## 2. LES AMENDEMENTS À RATIFIER

Onze clauses où **le code a raison contre le pack**. Sept étaient déjà tracées et attendent
ratification ; quatre sont nouvelles.

### Déjà tracés — **RATIFIÉS par Williams le 2026-08-31** (`DECISIONS.md`, entrée « Williams ratifie les onze amendements »)

| Clause | Ce que le pack dit | Ce que la machine fait — et pourquoi c'est mieux |
| --- | --- | --- |
| 02 §30.1 | « **pas de Coolify en V1** » | Coolify était l'ordonnanceur **préexistant** de la machine d'accueil ; poser un second maître sur les mêmes conteneurs était le vrai risque. Le pack l'admettait en V2 : **l'écart porte sur la date, pas sur la nature** |
| 02 §11.4 | Hetzner Storage Box + Scaleway | **Cloudflare R2**, déjà en service et payé. *Proposer de bâtir ce qui existe déjà est une faute d'inventaire* |
| 02 §11.1 | CX32, 15-25 €/mois | CPX32, 35,49 € |
| 02 §30.5 | dépôt **privé** | dépôt **public**, pseudonymisé |
| 02 §30.6 | `docker compose pull` depuis un registre | le staging **construit sur le serveur** |
| 11 §7 | « `docker compose up` suffit » | `pnpm infra:up` — les fichiers vivent dans `infra/` |
| 09 §4bis | fil rouge = test **Playwright** | test d'**intégration** tant qu'aucune interface n'existe, bascule datée au L3 |

### Nouveaux, découverts par cet audit — **RATIFIÉS par Williams le 2026-08-31**

**A-1 · 11 §1 — `drizzle-kit` est délibérément EXCLU.** Le contrat le nomme ; il n'est ni installé ni
dans le verrou de dépendances. **Et la raison est meilleure que la clause** : `drizzle-kit generate`
dérive le SQL du modèle TypeScript, ce qui ferait de ce fichier **une seconde source de vérité face
au fichier 04** — l'interdit même du §2. *Une décision structurante qui ne vit aujourd'hui que dans
un commentaire de code, alors que le contrat dit qu'une décision non tracée n'existe pas.*

**A-2 · 11 §1 — le pilote `pg` manque à la liste.** Drizzle est une couche de requêtes, pas un
pilote. À ajouter, avec la mention que l'outillage de chaîne est l'implicite nécessaire du §7 et ne
relève pas de l'escalade.

**A-3 · 06 §10.3 — UFW ne protège pas un hôte Docker, et c'est mesuré.** Le trafic des conteneurs est
traduit puis routé : **il ne traverse jamais la chaîne que UFW filtre**. Un `ufw deny` y aurait donné
*l'apparence* de la protection sans rien fermer. Le filtrage exigible est celui du pare-feu de
l'hébergeur, en amont — c'est ce qui a été posé. **Le pack prescrivait ici un garde-fou qui appartient
lui-même à la famille de défauts que ce dépôt traque.**

**A-4 · 02 §11.4 — pgBackRest remplace `pg_dump` toutes les 6 h**, et couvre strictement mieux (point
de restauration continu). **Mais le RPO doit être scindé en deux** : le RPO *local* est excellent ;
le **RPO hors serveur est de 24 h**, alors que le pack en promet 6 — et c'est le RPO hors serveur qui
compte le jour où la machine disparaît.


---

### Ratifiés le 2026-08-31 à la porte P-B — deux amendements de plus

> **Pourquoi cette section existe séparément.** L'entrée « Williams ratifie les onze amendements »
> avertissait elle-même du risque : *« le document d'alignement doit porter les onze comme ratifiés,
> et être tenu à jour — il ne l'a pas été depuis le 2026-08-28, ce qui est précisément le défaut que
> cette procédure risque de reproduire. »* Les deux ci-dessous y entrent **le jour où ils sont
> décidés**, et les onze au-dessus reçoivent enfin leur marque de ratification.

**A-5 · 03 §19.1 — l'habilitation devient un PRÉREQUIS explicite du mode expert.**
Le pack décrivait le mode expert comme celui d'un « auditeur habilité » **sans dire si c'était une
condition ou une description**. Le code, lui, laissait poser `usageProfile: 'expert'` sur un compte
non habilité. **Le doute a été porté à Williams plutôt que deviné**, et aucun test NOUVEAU n'a été écrit pour figer le
comportement observé — **rectification du 2026-08-31 : un test l'épinglait déjà**
(`l2-users:1924`, « COMPORTEMENT CONSTATÉ »), et c'est lui qui est passé au rouge à l'arbitrage — *un test qui fige un comportement non tranché transforme un doute en
décision par la porte de service*. Arbitrage : **c'est un prérequis.** Motif : un profil expert posé
sur un compte non habilité est **un état que rien ne rattrape ensuite** — ni l'habilitation, qui ne
regarde pas le profil, ni l'affectation §34.4, qui regarde l'habilitation et pas le mode d'usage.
Refus rendu en `NOT_HABILITATED` (403), code **déjà minté** pour la même forme au §34.4.

**A-6 · 05 §22 — le verbe `GET /v1/users/:id` est nommé.**
Le pack écrit « CRUD /v1/users » sans détailler les verbes. Le dépôt portait `lireUtilisateur`
**sans aucun appelant** — du code orphelin au sens du contrat §6, relevé par l'agent croisé qui
écrivait les tests, **jamais par l'auteur ni par une relecture**. Deux issues : supprimer la fonction
ou câbler la route. Arbitrage : **câbler**, un CRUD sans lecture unitaire étant un manque et non un
choix. La route est déclarée ici au titre du `CLAUDE.md` §3 point 6 (route non listée aux §8/§24.2).

---

## 3. LA FAMILLE QU'ON TRAQUE, APPLIQUÉE AU PACK LUI-MÊME

*Un garde-fou qui annonce plus qu'il ne fait.* Quinze membres en deux jours. En voici la forme
documentaire : **une section du pack qui décrit une propriété que rien ne tient.**

**🔴 L'observabilité entière (02 §11.3) n'existe pas, et aucun registre ne le dit.** Aucun outil de
supervision parmi les vingt-quatre conteneurs de la machine ; **zéro occurrence des quatre seuils
d'alerte dans une seule ligne de code**, alors que trois d'entre eux sont injectés dans deux services ;
aucun point de métriques ; aucune page d'état ; journaux non centralisés.

> **Pourquoi personne ne l'a vu : parce que les variables existent.** Elles portent le bon numéro de
> section en commentaire et sont câblées dans les deux fichiers de composition. Toute revue qui
> cherche « le §11.3 est-il traité ? » trouve quatre lignes conformes et passe.

**🔴 Le test de restauration nocturne ne peut partir d'aucune machine** — trois verrous
indépendants, dont le plus simple n'est écrit nulle part : **GitHub ne connaît pas ce workflow**, la
branche par défaut ne le contenant pas. *Le fichier existe, il est correct, il est mieux commenté que
la moyenne. Personne n'a demandé à GitHub s'il le connaissait.*

**🔴 Aucun secret n'est porté par un environnement GitHub**, alors que le pack l'exige et que **deux
décisions s'appuient sur cette règle comme si elle était tenue**. Les trois environnements existent
et sont **vides**. *L'existence du contenant a été prise pour la preuve de son contenu.*

**🟠 Le contrôle de format des décisions ne tourne pas en CI.** C'est le seul des dix garde-fous à
n'exister que dans un crochet local — contournable par un drapeau, un clone sans installation, ou une
édition depuis l'interface web. Son propre en-tête proclame que « la gouvernance cesse de reposer sur
la discipline ». **Elle y repose encore.**

**🟠 Le format du fichier d'état n'est vérifié par rien** : huit blocs sur trente-deux sont hors
format, et **un horodatage recule** dans un fichier censé être chronologique. Personne ne l'a vu.

**🟠 Deux contradictions dans le registre lui-même.** Une entrée amende le pack vers R2 « la
troisième copie différée hors Phase 1 » ; une autre, **du même jour**, pose la Storage Box en seconde
destination et déclare le pack « appliqué, **pas amendé** ». **Aucune ne révise l'autre : le pack ne
peut pas être amendé depuis ce registre en l'état.** Il faut dire laquelle fait foi.

**🟠 Et une fiche dont la condition impérative n'a jamais été vérifiée** : la juridiction du stockage
distant doit être **forcée sur l'UE**, « à vérifier à la souscription, pas après ». Le stockage est en
service. **Risque nul aujourd'hui — le staging ne porte aucune donnée personnelle — bloquant avant la
première mission réelle.**

---

## 4. LE FICHIER DE RÈGLES CHARGÉ DANS CHAQUE SESSION

**Verdict : fidèle, mais sous-dimensionné.** Ses dix sections ont été confrontées une par une aux
fichiers sources : **aucune affirmation fausse, aucune dérive de contenu.**

**Mais il est le seul véhicule du plan d'exécution pour une session de lot** — le fichier 09 n'est
dans l'ordre de lecture d'aucun lot. **Tout ce qu'il ne reprend pas n'atteint plus une session.** Or
il ne reprend pas :

1. **les portes elles-mêmes** — il parle de « porte franchie » sans jamais les nommer ni dire quand
   elles tombent ;
2. **le jalon de descope du 15/09** — une échéance datée et dure, **totalement absente** ;
3. **l'interdiction de « simplifier temporairement » la sécurité ou la synchronisation pour faire
   passer un test.** *Dans un dépôt dont l'histoire de ces deux jours est précisément celle des
   garde-fous qui mentaient, c'est la règle qu'on voudrait relire à chaque session.*

**Recommandation : y ajouter une section « Portes et jalons » de six lignes.** C'est une amélioration
d'étage 1 — **mais elle modifie le fichier qui gouverne le comportement de toutes les sessions
futures, et je ne la fais pas sans votre accord explicite.**

---

## 5. CE QUI EST PARFAITEMENT ALIGNÉ

Une revue qui ne trouve que des écarts n'est pas une revue.

- **Le fichier 04 → migrations : transcription exacte.** 43 tables, 472 colonnes, 193 contraintes, 31
  index critiques. **Zéro écart** par confrontation manuelle au document, indépendamment de la
  transcription. Deux recoupements croisés parfaits : 79 valeurs par défaut déclarées = 79 en base ;
  40 clés étrangères nues documentées = 40 mesurées.
- **Les huit interdictions : 8 sur 8 respectées.** Quatre seules occurrences d'un identifiant v4, **toutes
  sur des tables purement serveur** ; aucune table métier n'a de défaut sur sa clé.
- **« Aucun `any` » — la clause la mieux tenue du contrat** : zéro occurrence, zéro dérogation, zéro
  suppression de règle, **pas même dans les tests**.
- **70 colonnes de date sur 70** en fuseau explicite ; **402 colonnes**, zéro mélange de convention de
  nommage.
- **Protection de la branche principale** : onze contrôles obligatoires, historique linéaire,
  force-push interdit, y compris pour l'administrateur.
- **Les en-têtes de sécurité tenus de bout en bout**, y compris à travers le proxy du voisin.
- **La restauration a été jouée, pas décrite** — et prouvée par identité d'empreinte métier, très
  au-dessus d'un comptage de lignes.
- **La culture du dépôt** : le défaut « un garde-fou qui annonce plus qu'il ne fait » est **nommé,
  mesuré et corrigé à six endroits**, chaque fois avec la mesure qui l'a révélé. Trois contrôles
  **échouent quand ils n'ont rien pu vérifier**. C'est le contraire du défaut recherché.

---

## 6. CE QUE CE DOCUMENT NE PEUT PAS TRANCHER

La juridiction du stockage distant · le contenu des secrets · l'attribution réelle des agents (108
commits, **un seul auteur git** : le croisement producteur/vérificateur est **invérifiable de
l'extérieur**, et le gardien le dit lui-même) · le fond métier du fichier 05, qui n'est codé nulle
part · et la phrase du §30.6 — *« plus aucune décision d'infrastructure ouverte »* — **qui n'est plus
vraie et devrait être datée ou retirée**.
