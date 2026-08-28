# @axion/worker — Jobs asynchrones

BullMQ 5 sur Redis 7. Génération DOCX, appels LLM, exports, purges RGPD, webhooks console.

## Principe intangible

**Jamais dans le cycle requête** (02 §11.1). Une génération LLM ou DOCX qui bloquerait une réponse
HTTP ferait tomber une sync terrain par effet de bord.

---

## Files — et pourquoi aucun nom ne contient « : »

> ### ⛔ À LIRE AVANT D'AJOUTER UNE FILE (lots L10, L11, L13 en particulier)
>
> **BullMQ 5 refuse au constructeur tout nom de file contenant « : »** — il s'en sert lui-même
> comme séparateur de clé Redis (`classes/queue-base.js` :
> `if (name.includes(':')) throw new Error('Queue name cannot contain :')`).
>
> Ce README a listé jusqu'au **2026-08-28** des noms `axion:rapports`, `axion:llm`, `axion:exports`…
> Ces noms n'étaient pas seulement inexacts : **ils étaient la panne**. Le premier `new Queue()` du
> module levait, et **le worker n'a jamais démarré depuis le lot L0** — ni en développement, ni en
> staging. Le défaut a vécu treize heures derrière un `docker ps` affichant « Up 13 hours
> (healthy) », parce que la sonde d'alors regardait un voisin du worker et non le worker (voir
> « Sonde de santé » plus bas). `DECISIONS.md` / `docs/portes/PORTE_A_2026-08-27.md` §2ter le
> tracent comme l'un des trois défauts dormants du lot L0.
>
> **Ne recopiez donc jamais un nom préfixé depuis une documentation ancienne.** Le cloisonnement
> ne se fait pas dans le nom.

**Le cloisonnement se fait par l'option `prefix`.** `PREFIXE_REDIS = 'axion'` est passé à **chaque**
`Queue` et à **chaque** `Worker` (`apps/worker/src/worker.ts`, `optionsCommunes`). BullMQ construit
alors ses clés avec ce préfixe : les clés Redis effectives sont **exactement** celles que l'ancien
nommage visait — `axion:rapports:…` — sans deux-points dans le NOM. Le besoin (cloisonner nos clés
dans un Redis potentiellement partagé, 02 §11.1) est intact ; seul le moyen a changé.

**Source de vérité : `apps/worker/src/files.ts`** (`NOMS_DE_FILES`). Ce tableau se relit avec lui,
il ne le remplace pas.

| Nom de la file | Clés Redis effectives | Lot | Contenu                                                 |
| -------------- | --------------------- | --- | ------------------------------------------------------- |
| `rapports`     | `axion:rapports:…`    | L10 | Génération DOCX, jobs idempotents et rejouables         |
| `llm`          | `axion:llm:…`         | L11 | Appels par bloc, journal des coûts, plafond par mission |
| `exports`      | `axion:exports:…`     | L7  | Export de mission (format §36.3)                        |
| `purges`       | `axion:purges:…`      | —   | Rétentions RGPD (06 §10.4), planifiées et journalisées  |
| `webhooks`     | `axion:webhooks:…`    | L13 | Console axion-ia.com (HMAC + anti-rejeu)                |

**Cinq files, pas six.** Une file `axion:sauvegardes` a figuré dans ce README et dans le code
jusqu'au lot L0-b : elle n'existe plus. Le 02 §11.4, qu'elle citait, décrit pgBackRest, l'archivage
WAL, la copie chiffrée et le test de restauration nocturne — **du cron et des scripts
d'infrastructure, jamais un job applicatif** ; la sauvegarde MinIO est explicitement confiée à
`mc mirror` (`infra/scripts/backup-minio.sh`). C'était du code orphelin au sens du 09 §3.6, supprimé
par le gardien A02. La leçon est reprise en commentaire dans `worker.ts` : une annotation de
traçabilité qui **cite** une section n'est une preuve que si quelqu'un ouvre la section.

**Une file par nature de travail, jamais une file fourre-tout** : une purge RGPD qui attendrait
derrière une génération DOCX de dix minutes serait un défaut de conformité, pas de performance.

---

## État au lot L0

Le processus démarre, se connecte à Redis, déclare ses cinq files, publie son battement de cœur et
s'arrête proprement. **Aucun job n'est traité** : les traitements arrivent avec leurs lots (L10
DOCX, L11 LLM, L13 webhooks, purges RGPD). Recevoir un job aujourd'hui est donc un symptôme (file
mal nommée, reliquat d'un environnement partagé) — le processeur d'attente échoue explicitement
plutôt que d'acquitter un job en silence.

**Cette phrase n'est vraie que depuis le 2026-08-28.** Elle figurait déjà ici auparavant, et elle
était fausse : le worker mourait au premier `new Queue()`. C'est la raison pour laquelle ce fichier
décrit désormais aussi ce que la sonde **ne** prouve **pas**.

---

## Sonde de santé — ce qu'elle prouve, exactement

`apps/worker/src/sonde-sante.ts`, exécutée par le `HEALTHCHECK` du `Dockerfile` **toutes les 15 s**
(`node dist/sonde-sante.js` en cible `runtime`, `node apps/worker/dist/sonde-sante.js` en cible
`dev`). Code de sortie **0 = sain, 1 = malade**, rien d'autre. Sa sortie n'apparaît pas dans
`docker logs` mais dans `docker inspect --format '{{json .State.Health}}'` — elle est journalisée
au format pino, avec la même redaction que l'API.

**Elle remplace un `pgrep -f node`** qui vérifiait qu'UN processus node existait, pas que le worker
vivait : en développement, `tsc --watch` tourne à côté du worker et suffisait à la satisfaire. Une
sonde ne doit jamais observer un **voisin** du sujet.

### Ce qu'elle prouve

1. **Battement.** `worker.ts` écrit toutes les 5 s la clé `axion:sonde:battement:<hôte>` avec une
   expiration de 20 s (quatre périodes : une machine chargée peut sauter un battement, une boucle
   bloquée vingt secondes est une panne). La trouver prouve que la **boucle d'événements de ce
   processus** a tourné et a pu écrire dans Redis dans les vingt dernières secondes. La clé expire
   seule : un processus mort, tué ou figé ne peut pas produire ce signe, et aucun autre processus
   du conteneur ne l'écrit.
2. **Attachement aux cinq files.** Pour chaque file, `getWorkers()` rend les connexions Redis que
   BullMQ a lui-même nommées `axion:<file en base64>:w:<hôte>` (`CLIENT SETNAME`). En trouver au
   moins une **portant l'identité de ce conteneur** prouve qu'un `Worker` de **cette instance** est
   réellement branché sur **cette** file — et non sur quatre des cinq, ce qu'un test de vivacité du
   processus ne verrait jamais.
3. **Identité de conteneur.** Le nom d'hôte (`IDENTITE_INSTANCE`) est inscrit dans le nom de
   connexion et dans la clé de battement. Sans lui, un second conteneur en bonne santé sur le même
   Redis rendrait un conteneur mort « healthy » — le même mensonge, déplacé d'un cran.

### Ce qu'elle NE prouve PAS

- **Que les jobs sont traités correctement.** Au lot L0 aucun traitement n'existe (le processeur
  rejette par construction) ; un worker attaché dont chaque job échouerait resterait vert. Cette
  couverture-là exige de vrais jobs et viendra avec L10/L11, par une sonde qui regarde l'âge du plus
  vieux job en attente.
- **Que le worker AVANCE.** Une boucle qui bat et reste attachée mais ne dépile plus (verrou perdu,
  connexion bloquante muette) passerait. Le battement borne le blocage du **processus**, pas celui
  de la **consommation**.
- **L'état de PostgreSQL ou de MinIO** : la sonde ne parle qu'à Redis.

**Le dépôt préfère une garantie faible et énoncée à une garantie forte et fausse.** Cette section
n'est pas une précaution rédactionnelle : c'est le correctif du défaut qui a coûté le lot L0.

### Deux détails d'implémentation qui ont une raison

- **`files.ts` est purement déclaratif** — pas d'import de `bullmq`, pas de connexion, pas de
  minuterie. Le charger ne fait rien. Importer les noms depuis `worker.ts` ferait démarrer un worker
  complet à chaque sonde, soit un consommateur de plus toutes les quinze secondes, qui volerait des
  jobs et mourrait aussitôt.
- **Budget d'exécution de 4 s**, tenu sous le `timeout` de 5 s du `HEALTHCHECK` : un Redis qui ne
  répond pas produit un message explicite dans le journal de santé plutôt qu'un couperet muet du
  démon Docker.

---

## Sécurité

La clé `ANTHROPIC_API_KEY` n'existe **que** dans ce conteneur (moindre accès, 02 §30.4-7). Les
identités ne partent jamais au LLM : pseudonymisation en deux passes — table de correspondance
**puis** détection de noms (NER) sur les textes libres (06 §10.4). La politique de redaction des
journaux est **partagée** avec l'API (`packages/shared/src/redaction.ts`) et non recopiée : la copie
locale qui a existé ici était plus courte de dix champs, dont `password`, `token` et `phone`. C'est
ici que la fuite serait la plus fournie, puisque le worker manipule des réponses d'entretien.

## Arrêt propre

On ferme d'abord les travailleurs (ils terminent le job en cours), **puis** on efface le battement,
**puis** les files. L'inverse couperait un job en vol — or « crash du worker en pleine génération »
doit rester un scénario de PANNE testable par A45, pas un comportement ordinaire. Effacer le
battement avant de fermer les files (il emprunte leur connexion) fait virer la sonde au rouge
immédiatement, sans attendre les vingt secondes du TTL.

## Tests

`apps/worker/tests/` — écrits par un agent qui n'a pas écrit le code testé (09 §5.6), projet
`integration` (Redis éphémère par Testcontainers) :

| Fichier                               | Ce qu'il interdit de revenir                                                                                                                                                                                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `l0-files-bullmq.integration.test.ts` | Un nom de file que BullMQ refuse — l'arbitre est **la bibliothèque elle-même**, une `Queue` réelle est construite par nom déclaré. Inclut un test d'ancrage qui vérifie que BullMQ **lève toujours** sur un nom fautif : sans lui, les autres prouveraient que nos noms passent, pas que le garde-fou vit |
| `l0-sonde-sante.integration.test.ts`  | Une sonde qui redevient complaisante : battement absent ou expiré, file sans travailleur attaché, travailleur d'une **autre** instance                                                                                                                                                                    |
