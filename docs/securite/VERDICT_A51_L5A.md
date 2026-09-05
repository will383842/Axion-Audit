# VERDICT DE SÉCURITÉ — A51, incrément L5a (PWA terrain, socle offline)

> **Auditeur** : A51 (sécurité offensive) · **Rend compte à** : A50 → A01 → Williams
> **Date** : 2026-09-04 (UTC) · **Objet audité** : `lot/l5a` à **`8901109`** (PR **#30**)
> **Origine du mandat** : réserve **BLOQUANTE B2** du contrôle d'acceptation A02 du 2026-09-03
> (`docs/portes/CONTROLE_A02_L5a_2026-09-03.md` §8.1) — « aucun verdict A51 sur l'incrément qui
> livre TOUTE la crypto locale du produit ».
> **Mode** : **LECTURE SEULE sur le code.** Aucun fichier de production, de test ou de configuration
> n'a été modifié ; ce verdict est le seul écrit de la passe (09 §5.6 — je démontre, je ne corrige
> pas). Preuve : `git status` propre avant, et ne portant que ce fichier après.
> **Ordre de lecture appliqué** : `11` (§1, §2, §3, §4, §6, §7, §8) → `05` §9 (dont §9.6, §9.7,
> §9.9) et §31 → `06` §10 → `docs/conception/LOT_L5.md` → `docs/portes/CONTROLE_A02_L5a_2026-09-03.md`
> → `DECISIONS.md` (entrées L5a du 2026-09-02 : l. 6706, 6735, 6759, 6780, 6801, 6848, 7365, 7388,
> 7408, 7427, 7446, 7467) → `docs/portes/VERDICT_A51_L3_2026-09-02.md` (gabarit).
> **Le pack entier n'a pas été chargé** (09 §5.8).
>
> **Emplacement du fichier.** B2 nomme `docs/portes/VERDICT_A51_L5a_<date>.md` ; la commande de
> mission d'A50 impose `docs/securite/VERDICT_A51_L5A.md`. J'écris à l'emplacement commandé et je
> signale l'écart plutôt que de le trancher seul (§13, doute n° 1) : le fichier qui lève B2 est
> **celui-ci**, où qu'il soit rangé.

---

## 0. RÉPONSE NOMMÉE À LA RÉSERVE BLOQUANTE B2

B2 nomme quatre points « qu'une revue A51 doit voir plutôt que de découvrir à P-C ». Ils sont
traités ci-dessous **un par un, dans l'ordre de la réserve**, avec leur verdict propre. Le
cinquième — celui que la réserve ne pouvait pas nommer, puisque personne ne l'avait vu — est
l'objet du constat **F-22**, et c'est lui qui commande la conclusion.

| # | Point de B2 | Verdict A51 | Renvoi |
| --- | --- | --- | --- |
| **1** | **Paramètres Argon2id choisis par l'implémenteur** (`m = 47 104 Kio, t = 1, p = 1`), confirmés par Williams mais jamais examinés par A51 | **PROFIL CORRECT, TRANSCRIPTION CORRECTE, EXÉCUTION CORRECTE.** C'est bien le profil OWASP *Password Storage Cheat Sheet* pour Argon2id (46 MiB / t=1 / p=1) ; sel de **16 octets** tiré du CSPRNG (`coffre.ts:85,125-127`), sortie 32 octets, clé importée **non extractable** (`coffre.ts:159`), paramètres **stockés avec le coffre** et non lus d'une constante (`coffre-appareil.ts:87,117`) — c'est-à-dire le seul choix qui ne ferme aucune porte. **Coût mesuré par moi : médiane 61 ms** (5 tirages, machine de développement, **PAS un iPad**) contre un budget A28 de 1 s : la marge est de plus d'un ordre de grandeur. **Une seule chose manque, et elle est sérieuse : aucune borne HAUTE sur ces paramètres à la relecture** → **F-25** | §2, F-25 |
| **2** | **AES-GCM sans AAD** — « une enveloppe déchiffrable l'est quelle que soit la ligne où on la colle » (fiche A-008, non arbitrée) | **EXPLOITABLE, ET MESURÉ.** Substitution inter-enregistrements, rejeu d'une valeur périmée, falsification de l'en-tête d'index en clair : les trois réussissent, sans clé et sans mot de passe. **Et la prémisse de l'arbitrage du 2026-09-02 est fausse** : il dit que la menace « suppose un attaquant qui a déjà passé le verrou et le coffre » — écrire dans IndexedDB n'exige **ni l'un ni l'autre**. Deux garde-fous du pack sont neutralisables par une seule ligne écrite. **Ce n'est pas un veto sur #30** (le contrat §2 est publié, la fiche existe, l'arbitrage existe) : c'est une demande de **ré-arbitrage sur une prémisse corrigée**, à P-C | §2, **F-24** |
| **3** | **Refresh token 30 j chiffré dans Dexie** (`local/jetons.ts`) | **AU REPOS : correct** — enveloppe sous la DEK, jamais en clair, jamais journalisé ; une valeur présente mais non chiffrée **lève** au lieu de se lire « absente » (`jetons.ts:164-169`), et c'est le bon comportement. **EN MÉMOIRE : correct** — le jeton déchiffré ne survit pas à l'appel : seul un **énuméré** (`'valide' \| 'expire' \| 'illisible' \| 'absent'`) entre dans l'état React (`contexte.tsx:241`). **À LA ROTATION : aucun chemin vivant dans L5a** — `memoriserJetonSiege` / `oublierJetonSiege` sont publiés et **appelés par aucun écran** (vérifié par `grep` sur `apps/field/src` : seul `contexte.tsx` les cite). **DÉTECTION DE RÉUTILISATION : serveur, hors incrément** (L2). Deux risques indirects : le jeton n'est protégé que par un mot de passe **sans politique** (**F-23**) et son enveloppe est **rejouable** comme toute autre (**F-24**, conséquence *e*) | §2, F-23, F-24 |
| **4** | **La « liste fermée » élargie deux fois en une journée** — « une liste qui s'élargit deux fois mérite un regard qui n'est pas celui de ceux qui l'ont élargie » | **ELLE EST ENCORE FERMÉE, et je l'ai vérifiée colonne par colonne.** Les sept en-têtes de `formes.ts:127-208` ne contiennent **aucune** colonne hors de la liste amendée de `LOT_L5.md` §3.2 ; aucune n'est une donnée personnelle ni un contenu de réponse ; la fermeture est portée par le **typage** et non par la vigilance, et le balayage `etancheite.test.ts` (13 sentinelles, 7 tables, `meta` et `outbox` comprises) la vérifie — **exécuté par moi : 91 tests de crypto et d'étanchéité verts**. **Deux fissures, hors des sept tables** : la table `meta` n'est bornée par aucune liste (elle porte des `unknown`), et `outbox.derniereErreur` est un **texte libre en clair** qu'un message serveur alimentera à L6a → **F-29**. Et la fermeture ne dit rien de l'**intégrité** : ce qui est en clair est aussi **modifiable** → **F-24** | §2, F-24, F-29 |
| **5** | *(ajouté par A51 — ce que la réserve ne pouvait pas nommer)* | **Le chemin de RÉ-INITIALISATION du coffre confond « absent » et « illisible ».** Une seule ligne `meta` altérée fait afficher « Préparer cet appareil », et le mot de passe de l'auditeur **détruit alors sa propre DEK**. Mesuré de bout en bout | **F-22** |

---

## 1. VERDICT GLOBAL

**FUSIONNABLE SOUS RÉSERVE — 1 CRITIQUE, 3 MAJEURS, 4 MINEURS, 4 OBSERVATIONS.**

**Zéro fuite de confidentialité.** Je n'ai trouvé aucun chemin par lequel une donnée d'audit sorte
en clair de cet incrément : pas un `console.*`, pas un `fetch`, pas une URL externe, pas un CDN
(`grep` sur `apps/field/src` et `apps/field/sw` : **sortie vide** pour les trois), pas une donnée
personnelle dans un index local (balayage exécuté, vert), pas un secret versionné, pas de CORS, pas
de MinIO exposé. Le verrou n'est pas un rideau : `retirerContexteLocal()` **ferme le coffre**
(`local/contexte.ts:173-176`) et toute lecture ultérieure lève. Le service worker ne met **rien** de
`/api` en cache. Sur son axe déclaré — « un portable volé ne livre pas les données d'un client
grand compte en clair » (05 §9.7) — **ce socle tient**.

Ce que je remonte tient en une phrase, et ce n'est pas l'axe attendu :

> **Le coffre protège très bien la CONFIDENTIALITÉ et ne protège RIEN d'autre. L'INTÉGRITÉ et la
> DISPONIBILITÉ des données locales sont, elles, à la portée de qui sait écrire une ligne dans
> IndexedDB — sans clé, sans mot de passe, sans verrou à franchir. Et le chemin le plus destructeur
> n'a même pas besoin d'attaquant : il suffit qu'une ligne devienne illisible pour que
> l'application invite l'auditeur à effacer sa propre journée.**

| Sévérité | Nombre | Objets |
| --- | --- | --- |
| **CRITIQUE** | **1** | F-22 — coffre altéré ⇒ ré-initialisation proposée ⇒ DEK écrasée, données non synchronisées **irrécupérables** |
| **MAJEUR** | **3** | F-23 (aucune politique de mot de passe côté terrain) · F-24 (AES-GCM sans AAD **et** en-tête d'index non authentifié) · F-25 (paramètres KDF relus du stockage sans borne haute) |
| **MINEUR** | **4** | F-26 (échéance de verrou sur l'horloge murale) · F-27 (le garde de mise à jour du SW est du mauvais côté de la frontière) · F-28 (KEK à quatre usages, sans séparation de domaine) · F-29 (`derniereErreur` en clair, hors liste fermée) |
| **OBSERVATION** | **4** | F-30 (matériel de clé non effacé) · F-31 (**ZAP baseline non bloquant et non exécuté** — gouvernance) · F-32 (réexamen CSP épinglé à L5c alors que le SW est livré par L5a) · F-33 (effet de bord dans un `setState` updater) |

**Ce qui doit être fait AVANT le merge de #30 : F-22, F-23, F-25.** Les trois vivent dans
`coffre-appareil.ts` et `contexte.tsx`, se ferment en une quarantaine de lignes, et se testent
**sans navigateur**. F-24 n'est pas un veto : c'est un ré-arbitrage à porter à P-C sur une prémisse
corrigée. Le détail ordonné est au §12.

---

## 2. LES CONSTATS

### F-22 — CRITIQUE — un coffre ILLISIBLE se lit « ABSENT », et l'application invite alors l'auditeur à détruire sa DEK

**Où.** `apps/field/src/local/coffre-appareil.ts:59-64` (`lireCoffreAuRepos`), `:74-97`
(`initialiserCoffre`), `apps/field/src/app/contexte.tsx:160,165`,
`apps/field/src/app/EcranDeverrouillage.tsx:67,70-75,112`.

**Ce qui est écrit.**

```ts
// coffre-appareil.ts:59-64
export async function lireCoffreAuRepos(base: BaseLocale): Promise<CoffreAuRepos | null> {
  const brut = await lireMeta(base, CLES_META.coffre);
  if (brut === undefined || brut === null) return null;
  const verdict = coffreAuReposSchema.safeParse(brut);
  return verdict.success ? verdict.data : null;   // ← ILLISIBLE ⇒ « null » ⇒ « absent »
}
```

`initialiserCoffre` (`:79-88`) appelle la même fonction : elle rend `null`, la garde
`if (existant !== null)` ne se déclenche pas, un **sel neuf** et une **DEK neuve** sont tirés, et
`ecrireMeta(base, CLES_META.coffre, auRepos)` **écrase** l'enveloppe de l'ancienne DEK. Côté
coquille, `setPremierUsage(coffre === null)` (`contexte.tsx:165`) fait afficher le titre
« **Préparer cet appareil** », le message « Première utilisation de cet appareil » et le bouton
« **Créer la protection de cet appareil** » (`EcranDeverrouillage.tsx:67,71,112`).

**La mesure** (sonde exécutée hors dépôt, `fake-indexeddb` + WebCrypto de Node, modules RÉELS de
`apps/field/src/local/**`, aucun code réécrit) :

```
1) coffre créé (premier usage)
2) lignes answers = 1, outbox = 1        ← une réponse d'audit NON synchronisée
3) une seule propriété de meta.coffre est rendue invalide (aucun mot de passe requis)
4) lireCoffreAuRepos() rend : null  →  premierUsage = TRUE  →  écran « Préparer cet appareil »
5) initialiserCoffre a RÉUSSI sans avertissement
7) l'enveloppe de DEK a-t-elle changé ? OUI — l'ancienne DEK est DÉTRUITE
8) lignes answers encore présentes = 1, outbox = 1
9) DÉCHIFFREMENT IMPOSSIBLE : DonneeLocaleCorrompueError — « le chiffré ne s'authentifie pas »
```

**Ce que cela veut dire.** Les lignes sont **toutes là** — l'invariant 7 est tenu à la lettre, rien
n'est supprimé — et **plus rien n'est lisible, définitivement**, y compris avec le bon mot de passe :
la clé qui les ouvrait a été remplacée. C'est la perte silencieuse dans sa forme la plus complète :
la base reste pleine et l'application dit « c'est fait ».

**L'exploitation, dans le modèle de menace du produit.**

① *Sabotage local* — sur un poste partagé, un portable Windows/Android avec les outils de
développement, ou via toute exécution de script sur l'origine : **une écriture**, aucun secret
requis, et la journée de collecte d'un auditeur devient illisible. L'auditeur, lui, croit préparer
un appareil neuf.

② *Et surtout, SANS attaquant* — le déclencheur est **n'importe quel échec de `safeParse`** :
écriture partielle sur une tablette qui s'éteint, quota IndexedDB atteint en pleine écriture de
`meta`, ou — le plus probable de tous — **une version future qui ajoute un champ requis à
`coffreAuReposSchema`**. Ce jour-là, tous les appareils déjà en mission liront leur coffre comme
« absent » et proposeront de le recréer. Ce défaut n'attend pas un attaquant : il attend une
migration.

**Pourquoi CRITIQUE alors que ce n'est pas une fuite.** Le pack range la perte de collecte au même
rang que la fuite : invariant 7 (« rien n'est jamais silencieusement écrasé »), invariant 8
(« aucune donnée ne vit sur un seul appareil > 24 h ouvrées »), E38. L'impact est **irréversible**,
le coût d'entrée est **nul**, et **l'application coopère activement** avec l'attaque en présentant
l'écran de création. Aucun des trois critères ne se rattrape en aval.

**Ce qui est déjà bon, et qui rend le défaut d'autant plus net.** ① Le garde-fou existe et il est
testé : `coffre-appareil.test.ts` porte « initialiser avec un AUTRE mot de passe alors qu'un coffre
existe est refusé (ce n'est pas une réinitialisation) » — exécuté par moi, vert. Il ne protège
simplement **que le cas où la lecture réussit**. ② Le module voisin a **déjà** corrigé exactement ce
défaut sur son propre chemin, et l'a écrit noir sur blanc : `jetons.ts:147-169` — « **`null` veut
dire ABSENT, et rien d'autre** […] Le code rendait `null` dans le premier cas, à rebours de ce
paragraphe : le testeur l'a relevé ». La doctrine est écrite, prouvée, et **non appliquée au coffre
lui-même** — c'est-à-dire au seul endroit où elle coûte une journée d'audit.

**Le remède** (à A24/A20, pas à moi — 09 §5.6) : distinguer les deux cas. `lireCoffreAuRepos` doit
**lever** sur une ligne présente-mais-illisible (comme `jetons.ts`) ; `initialiserCoffre` doit
**refuser** dès qu'une ligne `meta.coffre` existe, quelle que soit sa lisibilité ; la coquille doit
router ce cas vers `phase: 'erreur'` avec cause et action, jamais vers `premierUsage`. Une seconde
ceinture, indépendante et peu coûteuse : refuser la création d'un coffre tant qu'une table miroir ou
l'outbox n'est pas vide — **on ne « prépare » pas un appareil qui porte déjà des données**.
Exigences touchées : **E33**, **E38** ; invariants **7** et **8** ; 05 §9.7 ; 06 §10.5.

---

### F-23 — MAJEUR — la seule protection au repos de toutes les données d'audit peut être un mot de passe d'UN caractère

**Où.** `apps/field/src/local/coffre.ts:144-146` (seul refus : la chaîne vide),
`coffre-appareil.ts:74-97` et `:156-183`, `apps/field/src/app/EcranDeverrouillage.tsx:85-99`
(`required`, `noValidate`, aucun `minLength`).

**Ce qui est écrit.** `deriverKek` refuse `''`. **C'est tout.** Aucun autre contrôle de longueur ni
de forme n'existe entre la frappe de l'auditeur et la KEK, ni à l'écran, ni au coffre.

**La mesure.** `initialiserCoffre(base, '1')` → **coffre créé, aucune erreur**.

**Ce qui est disponible et non utilisé.** `packages/shared/src/users.ts:99` publie
`MOT_DE_PASSE_LONGUEUR_MIN = 12`, en citant 06 §10.1 mot pour mot (« Politique de mot de passe :
12+ caractères »). L'API l'importe. **`apps/field` ne l'importe pas** — alors que `packages/shared`
est déjà une dépendance de l'app terrain (`formes.ts:37`).

**Pourquoi c'est MAJEUR, et pas un détail d'ergonomie.** Sur cet appareil, ce mot de passe est la
racine de **tout** : ① les réponses, notes, noms et courriels d'interviewés ; ② le **refresh token de
30 jours**, c'est-à-dire un accès au **serveur**, à toutes les missions de l'auditeur. Un iPad perdu
ou volé livre `sel`, `parametres` et `dekEnveloppee` à qui sait ouvrir IndexedDB : l'attaque se
poursuit **hors ligne**, au rythme de l'attaquant, et aucun compteur d'essais côté écran n'y change
quoi que ce soit — je le dis explicitement pour qu'on ne perde pas de temps à en ajouter un. Le seul
rempart est le **coût par essai** (mesuré : 61 ms sur une machine de bureau, mono-thread)
**multiplié par l'entropie du mot de passe**. Avec 12 caractères choisis par un humain, l'ordre de
grandeur reste défendable ; avec un caractère, il n'y a plus de rempart du tout, et le profil
Argon2id confirmé par Williams ne protège plus rien.

**Aggravant, propre à L5a.** Le mot de passe du coffre est créé **maintenant**, au premier
déverrouillage, et il est durable : `changerMotDePasse` existe (`coffre-appareil.ts:156`) mais
**aucun écran ne l'appelle** dans cet incrément. Un mot de passe faible posé à L5a survit à L5b, L5c
et L6.

**Le remède** : importer `MOT_DE_PASSE_LONGUEUR_MIN` de `@axion/shared` et refuser en dessous —
dans `initialiserCoffre` (la garantie) **et** à l'écran (le message). Exigences : **E33** ; 06 §10.1.

---

### F-24 — MAJEUR — AES-GCM sans AAD **et** en-tête d'index non authentifié : substitution, rejeu, et deux garde-fous neutralisés

**Où.** `apps/field/src/local/coffre.ts:284-294` (`chiffrer`, aucune AAD), `:296-328` (`dechiffrer`,
aucune AAD), `apps/field/src/local/ecriture.ts:155-193` (l'en-tête d'index est écrit **à côté** de
l'enveloppe, jamais **dans**), `apps/field/src/local/enveloppe.ts:44-48` (la forme `{v,n,c}` ne
porte aucun lien vers sa ligne).

**Ce qui est décidé.** `DECISIONS.md` l. 6759 (2026-09-02, décideur A01) : option 1, « ne rien
changer en L5a ; fiche `AMELIORATIONS.md` (A-008), durcissement arbitré à P-C ». **Je ne conteste
pas la décision de séquence.** Je conteste **le motif écrit**, et je le corrige parce que c'est lui
qui sera relu à P-C :

> « La menace suppose un attaquant qui écrit déjà dans le stockage local de l'appareil —
> **c'est-à-dire qui a déjà passé le verrou et le coffre.** »

**C'est faux.** Écrire dans IndexedDB ne demande **ni** le mot de passe, **ni** la DEK, **ni** de
franchir le verrou de la PWA : le verrou protège l'**application**, pas le **stockage**. La KEK n'est
en mémoire que le temps d'une session ; les octets, eux, sont sur le disque en permanence. La
condition réelle est « **avoir accès au stockage de l'origine** » — un poste partagé, un portable
volé avec les outils de développement, une extension, ou toute exécution de script sur l'origine.
Sur un iPad verrouillé par un code, l'attaque exige un Mac et des outils ; sur un portable Windows
ou Android, elle exige **trois clics**. Ce n'est pas la même population de menaces.

**Les mesures** (sondes exécutées sur les modules réels) :

| Attaque | Résultat |
| --- | --- |
| **a — substitution** : l'enveloppe de la réponse B est collée sur la ligne de la réponse A | **RÉUSSIE.** La ligne A, rattachée à la question A, restitue la valeur de B. Déchiffrement **accepté**, aucune alerte |
| **b — rejeu** : une enveloppe **antérieure** de la même ligne est remise en place après correction | **RÉUSSIE.** Le constat corrigé redevient le constat initial, sans trace |
| **c — falsification de l'en-tête** : `flagReview`, `horsParcours`, `clientUpdatedAt` réécrits en clair | **RÉUSSIE.** La charge continue de se déchiffrer : l'en-tête n'est lié à rien |
| **d — croisement de contexte** : l'enveloppe du **jeton de rafraîchissement** collée dans une réponse | **BLOQUÉE** par le schéma Zod (`forme inattendue sur : value, note, notApplicable, withheld`) |
| **e — unicité des nonces** : 3 000 chiffrements sous la même DEK | **3 000 nonces distincts** — 96 bits de CSPRNG, aucune réutilisation, aucune dérive |

**Le point d'architecture que ces mesures établissent, et qui vaut d'être écrit :** la **validation
Zod au déchiffrement** (`coffre.ts:319-326`) joue déjà le rôle d'une **AAD partielle**. Le croisement
**entre natures** de données est fermé (mesure *d*). Ce qui reste ouvert, c'est le croisement
**à l'intérieur d'une même nature** — réponse contre réponse, entretien contre entretien —
c'est-à-dire exactement le cas qui compte pour un dossier d'audit.

**Deux conséquences qui dépassent la ligne modifiée, et que la fiche A-008 ne mentionne pas** :

1. **Une ligne devient IMMUNISÉE contre la correction du siège.** `appliquerDescente`
   (`ecriture.ts:281-287`) arbitre au dernier-écrit-gagne sur `clientUpdatedAt`, lu **dans l'en-tête
   en clair**. **Mesuré** : `clientUpdatedAt` réécrit à `2099-01-01`, puis descente d'une correction
   du siège → la ligne locale **n'est pas écrasée**, la valeur du terrain demeure. Or 05 §9.9 fait
   de `PATCH /v1/answers/:id` (motif obligatoire, révision `correction_siege`) **le seul** chemin de
   correction d'une réponse : le neutraliser localement retire au lead et à l'admin leur unique
   recours. *À la décharge du code, et c'est important : le refus est **compté et écrit**
   (`meta['sync:conservees:<mission>']` = 1). L'attaque n'est pas totalement silencieuse — elle
   l'est seulement pour qui ne lit pas ce compteur, et aucun écran de L5a ne l'affiche encore.*
2. **La PWA peut être épinglée sur sa version courante, indéfiniment.** Le garde 05 §31-1 refuse
   d'activer une mise à jour tant qu'une session est `en_cours`, et ce prédicat est **une lecture
   d'index en clair** (`depots/sessions.ts:129-137`). **Mesuré** : `activationPermise()` = `true`,
   puis **une ligne `interviews` forgée** avec `status: 'en_cours'` → `activationPermise()` =
   **`false`**. Une écriture, et l'appareil ne reçoit plus jamais de correctif — y compris un
   correctif de sécurité. Aucun contournement n'existe côté auditeur dans L5a.
3. **Rejeu du jeton de rafraîchissement — déduit, non mesuré** (L6 n'existe pas) :
   `meta['auth:refresh']` est une enveloppe comme une autre. Restituer une enveloppe **antérieure à
   une rotation** fait présenter au serveur un jeton **déjà consommé** → la détection de réutilisation
   (11 §3, 06 §10.1) révoque **toute la famille**. Résultat : déconnexion de la sync en pleine mission
   (contre l'invariant 8) **et** une alarme de vol de jeton qui est fausse — l'attaque empoisonne le
   signal même qui doit signaler l'attaque.

**Pourquoi MAJEUR et non CRITIQUE.** Aucune de ces attaques ne livre une donnée en clair : le
chiffrement tient, l'attaquant **déplace** des ciphertexts, il n'en fabrique aucun. C'est de
l'intégrité et de la disponibilité, et il faut déjà tenir le stockage de l'appareil.

**Le remède, quand il sera arbitré** (P-C, à A24/A20) : lier l'enveloppe à sa ligne par l'AAD
d'AES-GCM — `additionalData = f(table, id, missionQuestionId, opId)` — et y inclure de quoi ordonner
(un compteur monotone ou `clientUpdatedAt`) pour fermer le rejeu. La rupture de la signature publiée
`dechiffrer(e, s)` peut être évitée par un contexte porté à l'**ouverture** du coffre plutôt que par
un troisième paramètre. **Traiter l'en-tête d'index dans le même geste** : le chiffrer n'est pas
possible (c'est ce qui le rend interrogeable), mais l'**authentifier** l'est — c'est le seul moyen
de rendre les conséquences 1 et 2 impossibles plutôt qu'improbables. Exigences : **E33**, **E7**,
**E9** ; 05 §9.4, §9.9, §31-1 ; invariant 7.

---

### F-25 — MAJEUR — les paramètres Argon2id viennent du STOCKAGE et ne sont bornés que par leur TYPE

**Où.** `apps/field/src/local/coffre-appareil.ts:41-47` (`parametresKdfSchema`) et `:114-119`
(`deverrouiller` les passe tels quels à `deriverKek`, donc à `argon2id`).

**Ce qui est écrit.** `memoireKio: z.number().int().positive()`,
`iterations: z.number().int().positive()`. **Aucun plafond.** Le commentaire d'en-tête explique très
bien *pourquoi* les paramètres voyagent avec le coffre — « le jour où `PARAMETRES_KDF_DEFAUT`
change, un coffre créé hier doit continuer à s'ouvrir » : c'est juste, et c'est même la bonne
décision. Mais une valeur qui vient du stockage est une **entrée non fiable**, et celle-ci commande
une allocation mémoire.

**La mesure.**

```
meta.coffre remplacé par { …, parametres: { memoireKio: 4 000 000, iterations: 1 000 000, … } }
coffre relu accepté par Zod ?  true
paramètres relus : {"algo":"argon2id","memoireKio":4000000,"iterations":1000000,…}
→ deverrouiller() passerait ces valeurs telles quelles à argon2id (coffre-appareil.ts:117)

Coût réel, mesuré à des valeurs volontairement modérées :
  m =  47 104 Kio → 139 ms      (le profil confirmé)
  m = 250 000 Kio → 498 ms
  m = 500 000 Kio → 861 ms      (déjà au budget A28 de 1 s)
```

**L'exploitation.** Une écriture — sans mot de passe — et **chaque tentative de déverrouillage**
demande 4 Gio et un million de passes : l'onglet meurt, ou la tablette. Les données sont intactes et
l'auditeur n'y accède plus, à chaque essai, indéfiniment. C'est le pendant de F-22 : là où F-22
**détruit** la clé, F-25 **rend son usage impraticable**. Le couple est méchant — l'un des deux
chemins aboutit toujours.

**Le remède** : borner les deux valeurs dans le schéma (`.max()`), à un plafond dérivé du budget A28
plutôt qu'inventé, et refuser un coffre hors bornes par une **erreur explicite** — jamais par un
`null` (voir F-22). Exigences : **E33** ; 11 §4 (budgets A28) ; 11 §7.

---

### F-26 — MINEUR — l'échéance du verrou est calculée sur l'horloge MURALE, et se re-arme au retour au premier plan

**Où.** `apps/field/src/app/verrou.ts:101,115,120,148,205,211,215` — toutes via `instantLocalMs()`,
qui est `Date.now()` (`local/horloge.ts:103-105`).

**Le raisonnement** (déduit par lecture, **non mesuré** — voir §7). L'échéance est une **date
absolue**. Le contrôle de retour au premier plan (`:145-155`) est une bonne idée et il est
correctement motivé (un onglet en arrière-plan voit ses minuteries ralenties) — mais il **re-arme**
sur la même horloge : `if (instantLocalMs() >= echeanceRef.current) verrouiller(); else armer();`.
Reculer l'horloge système pendant que l'onglet est caché repousse donc le verrouillage **d'autant**.

**L'exploitation.** Une tablette laissée déverrouillée sur une table : les 15 minutes du 05 §9.7 sont
la seule protection. Régler la date de l'appareil en arrière — ce qui n'exige aucun code sur un
appareil déverrouillé — les transforme en heures. Le scénario est étroit (il faut déjà tenir
l'appareil déverrouillé), et c'est pourquoi c'est un MINEUR : mais le verrou d'inactivité existe
précisément pour l'appareil qu'on ne tient plus.

**Ce qui est bon par ailleurs, et que je ne veux pas laisser croire fragile** : les deux seuils
15/60 sont exacts, le Wake Lock est demandé **uniquement** pendant une session, le bouton d'un geste
existe et ferme réellement le coffre, et les cas limites (14 min 59 s 999 / 60 min pile / session qui
démarre à la 14ᵉ minute) sont couverts par `verrou.test.tsx`, qui **avance** l'horloge. Aucun test ne
la **recule** : c'est la moitié manquante.

**Le remède** : mesurer les durées sur une horloge **monotone** (`performance.now()`), en gardant
`Date.now()` pour ce qui doit être une date. Le module `horloge.ts` est déjà le passage obligé — il
suffit d'y ajouter une seconde fonction. Exigences : **E33** ; 05 §9.7.

---

### F-27 — MINEUR — le garde de mise à jour du service worker est du mauvais côté de la frontière de confiance

**Où.** `apps/field/sw/service-worker.ts:267-279` (le SW `skipWaiting()` sur simple message) contre
`apps/field/src/app/service-worker-client.ts:63-65,75-91` (le garde, côté page).

**Ce qui se passe.** Le service worker n'inspecte **ni** l'émetteur, **ni** l'état de collecte : il
obéit à tout message `AXION_APPLIQUER_MISE_A_JOUR` venu d'un client de la même origine. La règle
05 §31-1 (« ne les active JAMAIS pendant un entretien en cours ») est appliquée **par la page**, qui
est précisément ce qu'un attaquant contrôle en premier, et ce que l'auditeur multiplie sans y penser.

**Le cas réaliste, qui n'a rien d'un scénario d'attaque** : **deux onglets**. L'onglet A est en
entretien ; l'onglet B, ouvert par erreur ou laissé de la veille, n'a pas de session en cours — son
`activationPermise()` rend `true`, il envoie le message, et l'onglet A est rechargé **sous les doigts
de l'auditeur, devant le client**. C'est exactement ce que le garde-fou existe pour empêcher.

**À décharge**, et c'est à mettre au crédit de la revue A29 (bloquant B5) : le défaut **par défaut**
a été corrigé dans le bon sens — `sessionEnCours = null` **refuse** (`service-worker-client.ts:56`).
Le garde ne s'ouvre plus tout seul. Il reste seulement contournable par en dessous.

**Le remède** : que le service worker **redemande** l'autorisation à ses clients (ou consulte
lui-même le prédicat) avant `skipWaiting()`, plutôt que de faire confiance à l'appelant. Exigences :
**E6** ; 05 §31-1.

---

### F-28 — MINEUR — la KEK porte quatre usages sans séparation de domaine, et l'un d'eux est réservé d'avance au fichier de secours

**Où.** `apps/field/src/local/coffre.ts:159-164` —
`importKey(…, ['encrypt','decrypt','wrapKey','unwrapKey'])`, et le commentaire `:132-135` qui annonce
l'usage : « les deux premiers servent la DEK, les deux suivants servent le fichier de secours
`.axionbackup` (11 §4) ».

**Le raisonnement.** Une même clé dérivée servira à **envelopper la DEK** et à **chiffrer un fichier
exporté**. Aujourd'hui c'est sans conséquence mesurable (nonces aléatoires de 96 bits, aucune
collision observée sur 3 000 tirages). Demain, à L5c, cela devient une question de conception : si le
`.axionbackup` réutilise le **sel de l'appareil**, deux contextes très différents partagent une clé
et un espace de nonces, et une enveloppe de l'un devient un candidat à la substitution dans l'autre
(F-24). 11 §4 dit d'ailleurs « le sel est dans le header », ce qui laisse la porte ouverte à un sel
**propre au fichier** — la bonne réponse, à condition qu'elle soit écrite.

**Le remède, à L5c** : dériver deux sous-clés par HKDF-SHA256 à partir de la sortie Argon2id
(`info: "dek-wrap"` / `info: "backup"`), **sel neuf à chaque export**, et l'en-tête `.axionbackup`
inclus dans l'AAD du payload — ce qui ferme d'un même geste le rejeu d'un export ancien sur un
appareil neuf. **Non mesurable aujourd'hui** : `.axionbackup` n'existe que dans des commentaires
(vérifié : aucune implémentation dans `apps`, `packages`, `e2e`). Exigences : **E38**, **E33** ;
11 §4 ; 05 §9.7.

---

### F-29 — MINEUR — `derniereErreur` est un texte libre EN CLAIR, hors de la liste fermée, et c'est le serveur qui le remplira

**Où.** `apps/field/src/local/base.ts:70-71` — `readonly derniereErreur: string | null;`, commenté
« Message en français, sans donnée personnelle (11 §2) ».

**Le raisonnement.** Ce champ est un membre de `LigneOutbox`, donc **en clair** dans IndexedDB, et il
n'appartient à **aucune** des sept tables miroirs couvertes par la liste fermée §3.2 — le balayage
d'étanchéité ne peut donc pas le protéger par construction, il ne peut que constater. Il est vide
aujourd'hui (`ecriture.ts:186` l'initialise à `null`, et rien ne l'écrit dans L5a). À L6a, il portera
des messages d'échec de push. Or le verdict A51 sur L3 a déjà démontré, sur ce dépôt, qu'un message
d'erreur serveur republie ses paramètres quand personne ne l'en empêche (F-12).

**Ce qui est bon, et qui montre que la doctrine est comprise** : `coffre.ts:321-325` construit
délibérément son message d'erreur Zod avec les **chemins** et jamais les **valeurs**, en citant
11 §2. Il suffit que L6a fasse la même chose.

**Le remède, à L6a** : n'écrire dans `derniereErreur` qu'un **code** du vocabulaire fermé de
`packages/shared` (`ERROR_CODES`), jamais un message reçu du réseau. Exigences : **E33** ; 11 §2,
11 §3 ; 05 §9.3.

---

### F-30 — OBSERVATION — le matériel de clé brut n'est pas effacé après usage

`coffre.ts:147-159` : la sortie d'`argon2id` (`brut`, 32 octets) et sa copie
(`Uint8Array.from(brut)`) restent dans le tas JS jusqu'au passage du ramasse-miettes. Deux `fill(0)`
après `importKey` suffiraient. **Ce qui ne peut PAS être corrigé, et qu'il faut dire plutôt que de le
laisser croire** : le mot de passe lui-même est une **chaîne JavaScript**, donc immuable et non
effaçable — `EcranDeverrouillage.tsx:57` remet l'état à `''`, ce qui est le maximum faisable, mais
l'ancienne chaîne survit dans le tas. Un vidage mémoire d'un onglet **déverrouillé** reste donc une
menace résiduelle, structurelle au navigateur. La bonne nouvelle est que la DEK, elle, est **non
extractable** (`coffre.ts:271`) et vit hors du tas JS : un vidage mémoire du tas ne la contient pas.

### F-31 — OBSERVATION (gouvernance) — je ne peux verser AUCUNE ligne « ZAP baseline » pour cet incrément

`.github/workflows/zap-baseline.yml:70` porte toujours `ZAP_BLOQUANT: 'false'`, alors que **le
fichier lui-même** (l. 21-38) et `DECISIONS.md` l. 708-748 fixent la bascule à `'true'` **au lot L2**
— porte P-B signée le **2026-08-31**, il y a quatre jours et deux lots. Et le job est `skipped`
depuis le 2026-09-02 parce que `8 · deploy-staging` est rouge (`DECISIONS.md` l. 7295). Conséquence
directe sur mon mandat (09 §1, « ZAP baseline à chaque build ») : **aucun scan n'a tourné, je n'en ai
lancé aucun, et je n'en rapporte aucun résultat.**

**Ce n'est PAS imputable à L5a et cela ne bloque pas #30** : cet incrément n'ajoute aucune ligne de
serveur (`git diff 508ae15 8901109 -- apps/api apps/hq apps/worker` : sortie vide) et un scan de
staging n'aurait rien dit de sa crypto locale. Mais c'est exactement la « échéance qui reste à
`false` par simple inertie » que l'auteur du fichier avait redoutée par écrit, et cela appartient à
A01 et à Williams, pas à moi.

### F-32 — OBSERVATION — le réexamen de la CSP est épinglé à L5c, alors que le service worker est livré par L5a

`infra/caddy/Caddyfile:203-215` : « **RÉEXAMEN IMPOSÉ AU LOT L5c (livraison du service worker)** […]
compter les styles inline subsistants et basculer sur des HACHAGES STATIQUES ». Le service worker est
livré **ici**, par L5a. La condition de déclenchement est donc arrivée un incrément plus tôt que
prévu, et le comptage peut se faire maintenant. **Par ailleurs la posture est bonne et je le dis :**
`default-src 'self'`, `script-src` **sans** `'unsafe-inline'` ni `'unsafe-eval'`, `'wasm-unsafe-eval'`
présent — c'est-à-dire que la CSP avait été écrite **en prévision d'Argon2id en WebAssembly**, et le
socle de L5a s'y installe sans qu'aucune ligne n'ait dû être relâchée. Aucun CDN nulle part, police
auto-hébergée, `frame-ancestors 'none'`, HSTS, `nosniff`.

### F-33 — OBSERVATION — un effet de bord dans un `setState` updater

`verrou.ts:106-111` : `surVerrouillageRef.current?.()` — donc `fermer()`, donc la fermeture du
coffre — est appelé **à l'intérieur** de l'updater passé à `setVerrouille`. Un updater React doit
être pur. Sous `StrictMode` (actif, `main.tsx:31`) l'updater est double-invoqué en développement ;
`fermer()` est idempotent, donc rien ne casse aujourd'hui. **Le sens de la défaillance est le bon** :
si un rendu concurrent était abandonné, le coffre serait fermé sans que l'état soit validé — donc
plus verrouillé que prévu, jamais moins. Je le signale comme dette, pas comme faille.

---

## 3. CE QUI TIENT — attaqué avant d'être dit

Un verdict qui ne liste que des défauts ne dit pas où en est le produit. Les points ci-dessous ont
été **cherchés** comme des failles et n'en sont pas :

| Ce que j'ai cherché | Résultat |
| --- | --- |
| Une donnée personnelle en clair dans un index local | **Aucune.** 13 sentinelles, 7 tables, `meta` et `outbox` comprises, balayage `etancheite.test.ts` **exécuté par moi : vert** (91 tests de crypto/étanchéité verts ; suite `unit` complète : **923 tests verts**) |
| Un `console.*` dans le code terrain | **Aucun** (`grep` sur `apps/field/src` et `apps/field/sw`, hors tests : sortie vide) |
| Un appel réseau, un `fetch`, une URL externe, un CDN | **Aucun.** L5a ne parle à personne — la police est auto-hébergée, le manifeste et les icônes sont générés à la construction |
| Un secret versionné | **Aucun.** Seul `.env.example` est suivi ; `gitleaks` est bloquant en CI (`ci.yml:139`) |
| Un CORS ouvert, un MinIO joignable | **Aucun.** Le diff L5a de `infra/` n'ajoute qu'un `Content-Type` de manifeste ; MinIO reste sur `127.0.0.1` en dev et `!reset []` ailleurs |
| Un cache de `/api` par le service worker | **Aucun.** `NavigationRoute` avec `denylist: [/^\/api\//]` (`service-worker.ts:261-265`) ; le précache ne prend que shell, polices, icônes, et exclut `**/*.map` |
| Des cartes de source en production | **Aucune** (`vite.config.ts:105` et `build-sw.mjs:49` : `sourcemap: false`) |
| Un verrou qui ne serait qu'un rideau | **Non.** `retirerContexteLocal()` ferme le coffre et **toute** lecture ultérieure lève (`local/contexte.ts:161-176`) — le verrou est structurel |
| Une réutilisation de nonce sous la même DEK | **Aucune** sur 3 000 chiffrements ; 96 bits de CSPRNG à chaque appel |
| Une clé extractible | **Aucune.** KEK et DEK sont importées/déballées en `extractable: false` (`coffre.ts:159,271`) ; la DEK n'est jamais exposée par l'interface `Coffre` |
| Un oracle « mauvais mot de passe » vs « données corrompues » | **Aucun.** `deballer` rend la **même** `MotDePasseInvalideError` dans les deux cas, délibérément (`coffre.ts:228-232`) |
| Une suppression de base au retour de version | **Aucune.** `base.ts` n'appelle `delete()` sur aucun chemin ; une base trop récente **lève** (`BaseTropRecenteError`) |
| Un changement de mot de passe qui re-chiffrerait les données | **Non** : ré-enveloppement seul, **et sel neuf** (`coffre-appareil.ts:170-174`) — le commentaire donne la bonne raison |
| Une « simplification temporaire » de la sécurité (09 §5.7) | **Aucune dans le code L5a.** Un seul `eslint-disable` dans tout le diff, sur `require-await` d'un port inerte, motivé en ligne. Aucun `@ts-ignore`, aucun test skippé. *(Le seul relâchement du dépôt est hors L5a et daté : F-31.)* |

---

## 4. REVUE OWASP ASVS L2 — par lecture et par sonde, contrôle par contrôle

**Périmètre honnête** : les chapitres qu'un socle **client, hors ligne, sans surface réseau** met en
jeu. Les chapitres V4 (contrôle d'accès), V13 (API) et V12 (fichiers) sont **sans objet dans cet
incrément** — ils ont été traités sur L3 et le seront sur L6. Ce n'est donc **pas** une passe ASVS L2
complète, et je ne la présente pas comme telle.

| ASVS 4.0.3 (L2) | Objet | Verdict |
| --- | --- | --- |
| V2.1.1 Longueur minimale de 12 caractères | mot de passe du coffre | **NON TENU → F-23** (mesuré : `'1'` accepté) |
| V2.1.7 Pas de composition imposée arbitraire | aucune règle de composition | **tenu** |
| V2.4.1 Fonction de dérivation à coût mémoire | Argon2id, `hash-wasm` | **tenu** — profil OWASP, mesuré 61 ms |
| V2.4.4 Paramètres Argon2id conformes | m=46 MiB, t=1, p=1, 32 o | **tenu** ; **borne haute absente → F-25** |
| V2.4.5 Sel unique par utilisateur/appareil | 16 o de CSPRNG, un par appareil, neuf à chaque changement | **tenu** |
| V2.5.4 Pas de secret partagé par défaut | aucun mot de passe par défaut, aucun PIN | **tenu** (05 §9.7 « décision gravée » respectée) |
| V2.8.x Mécanisme de déverrouillage affaibli | aucun : la KEK dérive du mot de passe **et de rien d'autre** | **tenu** |
| V3.x Sessions serveur | aucune session serveur dans L5a | **sans objet** |
| V6.2.1 Cryptographie à jour, pas de maison | WebCrypto + `hash-wasm`, aucune primitive écrite à la main | **tenu** |
| V6.2.2 Modules cryptographiques éprouvés | AES-256-GCM natif du navigateur | **tenu** |
| V6.2.3 IV/nonce jamais réutilisé | 96 bits de CSPRNG par opération — **3 000/3 000 distincts** | **tenu** |
| V6.2.5 Pas de mode non authentifié | GCM partout ; échec d'authentification = exception, jamais une valeur vide | **tenu** |
| V6.2.7 **Chiffrement authentifié lié à son contexte** | **aucune AAD ; l'en-tête d'index n'est pas authentifié** | **NON TENU → F-24** |
| V6.2.8 Comparaisons en temps constant | aucune comparaison de secret en JS : GCM tranche | **tenu** |
| V6.3.1 Générateur cryptographique | `crypto.getRandomValues` partout ; `uuidv7` pour les identifiants | **tenu** |
| V6.4.1 Gestion des clés : pas de clé en clair au repos | DEK enveloppée sous la KEK ; KEK jamais persistée | **tenu** |
| V6.4.2 Séparation des clés par usage | **une seule KEK, quatre usages, réservée d'avance au `.axionbackup`** | **partiellement tenu → F-28** |
| V7.1.1 / V7.1.2 Pas de donnée sensible au journal | aucun journal côté client ; messages d'erreur construits sur les **chemins**, jamais les valeurs | **tenu** ; **→ F-29** pour L6a |
| V7.4.1 Message d'erreur utile sans fuite | cause + action en français, aucune trace technique à l'écran | **tenu** |
| V8.1.1 Données sensibles protégées contre l'accès non autorisé | chiffrement par enregistrement sous la DEK | **tenu** |
| V8.1.6 **Sauvegardes protégées contre l'altération** | **aucune protection d'intégrité au repos : substitution et rejeu réussissent** | **NON TENU → F-24** |
| V8.2.2 Pas de stockage client de données sensibles non protégées | liste fermée vérifiée colonne par colonne ; `meta` hors liste | **tenu** ; **→ F-29** |
| V8.3.4 Données sensibles hors des journaux | voir V7.1.1 | **tenu** |
| V10.2.1 Aucun code malveillant / appel non déclaré | aucun `fetch`, aucune URL externe, aucun CDN | **tenu** |
| V14.2.1 Dépendances à jour et épinglées | `save-exact`, Renovate gelé (11 §1) ; aucune dépendance nouvelle pour le SW | **tenu** |
| V14.4.x En-têtes de sécurité | CSP stricte, HSTS, `nosniff`, `frame-ancestors 'none'` | **tenu** ; `style-src 'unsafe-inline'` tracé et daté → **F-32** |
| V14.5.1 Origines non fiables refusées | pas de CORS du tout | **tenu** ; **le service worker, lui, ne vérifie pas son émetteur → F-27** |

**Total : 21 tenus · 3 non tenus (F-23, F-24 ×2) · 1 partiellement tenu (F-28) · 2 sans objet.**

---

## 5. LES DEUX ATTAQUES NOMMÉES AU MANDAT PERMANENT D'A51

Elles sont **sans objet sur L5a**, et il faut le dire au lieu de cocher des cases vides.

- **Accès financier avec un jeton consultant** : `scoping_financials` est une table **serveur**, et
  L5a n'ouvre aucune route (`git diff 508ae15 8901109 -- apps/api` : sortie vide). Aucune table
  miroir locale ne porte de donnée financière : je l'ai vérifié sur les **neuf** tables de
  `SCHEMA_LOCAL` (`base.ts:169-186`) et sur les sept charges chiffrées de `formes.ts` — **aucun
  champ financier**, ni en clair, ni chiffré. **Zéro fuite, par absence de surface.**
- **Push sur la session d'autrui (05 §9.9)** : la règle est **serveur** et L5a **ne pousse rien** (le
  port de sync est inerte, `port-sync.ts`, et rend `indisponible` plutôt qu'une pastille verte — ce
  qui est le comportement honnête). Ce que L5a livre et qui compte pour §9.9 : `conductedBy` est bien
  porté dans la **charge chiffrée** de l'entretien (`formes.ts`, `chargeInterviewSchema`), donc
  transmis au serveur qui arbitrera. **Le test `@critique` correspondant appartient à L6a.**

---

## 6. LE MODÈLE DE MENACE, RELU DEPUIS CE QUE J'AI MESURÉ

| Scénario | Ce qui tient | Ce qui cède |
| --- | --- | --- |
| **iPad perdu ou volé, application verrouillée** | **Tout l'essentiel.** Les données sont chiffrées, la KEK n'est nulle part, la DEK non extractable a disparu avec la session. L'attaque se réduit à une **attaque hors ligne sur le mot de passe** | **F-23** : si ce mot de passe fait un caractère, il n'y a plus rien. Le refresh token 30 j tombe avec lui |
| **Appareil partagé, ou portable de l'auditeur avec les outils de développement** | La confidentialité tient : lire IndexedDB ne donne que des ciphertexts | **F-22** (destruction irréversible), **F-25** (verrouillage définitif), **F-24** (substitution, rejeu, correction du siège neutralisée, PWA épinglée) — **tous sans le mot de passe** |
| **Poste compromis, application déverrouillée** | Rien à défendre : le coffre est ouvert. Seule bonne nouvelle, la DEK est hors du tas JS | **F-30** : le mot de passe, lui, est dans le tas |
| **Réseau hostile** | **Sans objet dans L5a** : aucune requête. À L6, la CSP `connect-src 'self'`, l'absence de CORS et HSTS forment déjà le cadre | **F-24** conséquence *e* : un rejeu d'enveloppe de jeton empoisonne la détection de réutilisation du serveur |
| **Tablette laissée déverrouillée quelques minutes** | Verrou 15/60 min correct, bouton d'un geste, Wake Lock borné à la session | **F-26** : reculer l'horloge repousse le verrouillage d'autant |
| **Aucun attaquant du tout** | — | **F-22** se déclenche seul sur toute corruption de `meta.coffre`, et se déclenchera sur **tous** les appareils le jour où `coffreAuReposSchema` gagnera un champ requis |

---

## 7. CE QUE JE N'AI PAS PU MESURER, ET POURQUOI

Dit franchement, pour que personne ne prenne ce verdict pour plus qu'il n'est.

1. **Aucun scan ZAP.** Le job est non bloquant et `skipped` depuis le 2026-09-02 (F-31) ; je n'en ai
   lancé aucun moi-même. **Aucune ligne « n alertes / n nouvelles » n'est versée ici** — un chiffre
   inventé vaudrait moins que ce vide.
2. **Aucune mesure sur un iPad, ni sous iOS Safari.** Les 61 ms de dérivation sont **une machine de
   développement**. La limite est déjà nommée au 11 §7 (Playwright ne couvre pas les service workers
   sous iOS) ; le mode avion réel et le relevé de dérivation sur tablette restent dus à A27 à P-C.
   **Je n'ai donc pas vérifié le budget A28 sur la cible que 03 §22.1 désigne comme la plus dure.**
3. **Mes exécutions tournent sur Node v24.19.0**, alors que `package.json` épingle `>=22.11.0 <23`.
   Le même avertissement que le contrôle A02 s'applique : mes mesures **corroborent**, elles ne
   remplacent pas la CI. Ce qu'elles établissent — un `safeParse` qui échoue, une enveloppe qui se
   déchiffre là où elle ne devrait pas — ne dépend d'aucune particularité de moteur.
4. **F-26 est DÉDUIT par lecture, non mesuré.** Le mesurer demande un hôte React et une horloge qui
   **recule** ; le harnais existant ne sait qu'avancer, et je n'écris pas de test (09 §5.6). Je le
   déclare comme déduit plutôt que de l'affirmer.
5. **F-24 conséquence *e* (rejeu du jeton) est DÉDUITE** : elle exige le serveur de rotation, qui est
   L6. Les conséquences *a* à *d*, elles, sont mesurées.
6. **L'export de secours `.axionbackup` n'existe pas** dans cet incrément (vérifié : il n'apparaît que
   dans des commentaires). Chiffrement, fuite de métadonnées d'en-tête et rejeu du fichier **n'ont pas
   pu être audités** ; F-28 est ce que je peux dire aujourd'hui, et c'est une recommandation pour
   L5c, pas un constat.
7. **Aucune analyse mémoire d'un onglet réel** (vidage de tas d'un navigateur déverrouillé) : pas
   d'outillage, et cela demanderait une session de navigateur pilotée que je n'ai pas montée. F-30 est
   donc un raisonnement sur le code, pas une extraction de clé.
8. **Aucune revue du chemin serveur** (RBAC, `scoping_financials`, §9.9, rate limiting, helmet,
   détection de réutilisation) : hors périmètre de l'incrément — voir le verdict A51 du L3 pour l'état
   de cette surface au 2026-09-02.

---

## 8. CE QU'AUCUN CONTRÔLE EXISTANT N'AURAIT VU

Cette section existe parce que trois défauts sur douze sont passés **à travers une revue croisée
sérieuse (A29, 5 bloquants), un contrôle d'acceptation exhaustif (A02) et 923 tests verts**.

- **F-22** est invisible à la couverture : `coffre-appareil.ts` est **dans** le glob seuillé à 90 % et
  le chemin fautif **est exécuté** par les tests — simplement toujours avec une ligne `meta`
  **valide**. Une couverture de ligne ne distingue pas « ce cas est traité » de « ce cas est traité
  **correctement** ». Et `contexte.tsx`, où le `null` devient l'écran « Préparer cet appareil », est
  explicitement **hors seuil** (`coverage-critical-paths.json`, note du glob `verrou.ts` : « ce qui
  n'est délibérément pas inscrit : `apps/field/src/app/**` »).
- **F-24** ne peut pas être vu par un test : aucun test n'a de raison d'écrire dans IndexedDB **par la
  porte de derrière**. Tous les tests du socle écrivent par `ecrireLocal`, qui est correct. Il faut
  décider d'être l'attaquant pour le voir — c'est précisément ce que B2 demandait.
- **F-25** est un défaut de **schéma de validation**, pas de code : Zod dit « oui » et personne ne
  relit un `z.number().int().positive()` en se demandant ce que vaut 4 000 000.
- **F-31** est un défaut de **gouvernance de l'outillage**, et l'auteur du fichier l'avait prévu par
  écrit : « sans cette entrée datée, la ligne resterait à `false` par simple inertie ». Elle y est
  restée. Un contrôle qui prévoit son propre pourrissement ne s'en protège pas pour autant.

---

## 9. LA RÉSERVE B2 EST-ELLE LEVÉE ?

**Oui, en tant que réserve de PROCÉDURE** : le verdict A51 demandé existe, il porte sur les quatre
points nommés, il est mesuré, et il est signé. B2 ne demandait pas un verdict favorable — elle
demandait **un regard qui ne soit pas celui de ceux qui ont écrit le code**. Il a eu lieu.

**Et il a trouvé quelque chose.** B2 est donc levée **et remplacée** par une exigence plus étroite :
**la fermeture de F-22, F-23 et F-25 avant le merge de #30** (§12). Si A01 juge que F-22 doit être
traitée comme un correctif de porte plutôt que comme un préalable au merge, c'est un arbitrage qui
lui appartient — mais il devra être écrit, parce que je ne peux pas signer « aucun défaut connu ne
détruit de donnée d'audit » sur cet arbre.

---

## 10. LES DEUX GARDE-FOUS DU 05 §9.7 CÔTÉ TERRAIN — état

05 §9.7 confie à L5a la moitié terrain de deux garde-fous. Vérifié :

- **Le garde-fou de réinitialisation** (« le serveur refuse la réinitialisation tant que l'outbox
  n'est pas vide ») : `etatAvantChangementDeMotDePasse` (`coffre-appareil.ts:135-147`) compte la file
  **réelle** (`outbox.where('statut').equals('en_attente').count()`) et produit un avertissement
  explicite. C'est **vrai par construction** et non déclaratif, comme `LOT_L5.md` §3.3-② l'exigeait.
  **Tenu.** Réserve : la fonction est publiée et **aucun écran ne l'appelle** dans L5a — le changement
  de mot de passe n'a pas d'interface. Ce n'est pas une faille, c'est une dépendance à ne pas perdre
  en route à L5c.
- **La KEK n'est tenue qu'en mémoire de session** : tenu, structurellement (§3).

---

## 11. TABLEAU DES SONDES EXÉCUTÉES

Toutes les sondes importent les **modules réels** de `apps/field/src/local/**` (empaquetés par
esbuild, `fake-indexeddb` + WebCrypto de Node) et sont exécutées **hors du dépôt** : aucun fichier du
worktree n'a été créé, modifié ni supprimé.

| Sonde | Question posée | Réponse mesurée | Constat |
| --- | --- | --- | --- |
| 1 | Que fait l'application d'un `meta.coffre` illisible ? | Écran « Préparer cet appareil » → DEK écrasée → données définitivement illisibles | **F-22** |
| 2a | Une enveloppe se déchiffre-t-elle sur une autre ligne ? | Oui, sans alerte | **F-24** |
| 2b | Une enveloppe périmée se rejoue-t-elle ? | Oui, sans trace | **F-24** |
| 2c | L'en-tête en clair est-il lié à sa charge ? | Non : `flagReview`, `horsParcours`, `clientUpdatedAt` réécrits, déchiffrement intact | **F-24** |
| 2d | L'enveloppe du jeton passe-t-elle pour une réponse ? | **Non** — Zod la refuse (AAD partielle de fait) | *tenu* |
| 2e | 3 000 chiffrements : collision de nonce ? | 3 000 nonces distincts | *tenu* |
| 2f | Un mot de passe d'un caractère crée-t-il un coffre ? | Oui | **F-23** |
| 5 | Coût de la dérivation au profil confirmé | 56–64 ms, médiane **61 ms** (machine de dev) | *tenu* |
| 6a | Un `clientUpdatedAt` falsifié bloque-t-il une correction du siège ? | Oui — la descente est refusée, `conservees = 1` | **F-24** |
| 6b | Une ligne `interviews` forgée bloque-t-elle les mises à jour ? | Oui — `activationPermise()` passe de `true` à `false` | **F-24** |
| 7 | Les paramètres KDF du stockage sont-ils bornés ? | Non : `m = 4 000 000`, `t = 1 000 000` acceptés par Zod | **F-25** |
| — | Suite de tests du dépôt (vérité terrain, 11 §9ter) | `vitest run --project unit` : **39 fichiers, 923 tests verts**, 0 skippé | *tenu* |

---

## 12. RECOMMANDATIONS, PAR ORDRE

**Je ne corrige aucun code de production (09 §5.6).** Ce qui suit est une indication d'intention à
l'équipe qui possède les fichiers — **A24/A20**, avec les tests écrits par **A26** (règle de
croisement 09 §5.6), et jamais par moi.

1. **AVANT LE MERGE DE #30 — trois fermetures, un seul fichier ou presque, ~40 lignes :**
   1. **F-22** — `lireCoffreAuRepos` doit **lever** sur une ligne présente-mais-illisible ;
      `initialiserCoffre` doit **refuser** dès qu'une ligne `meta.coffre` existe ; `contexte.tsx` doit
      router ce cas vers `phase: 'erreur'`. Seconde ceinture : pas de création de coffre si une table
      miroir ou l'outbox n'est pas vide.
   2. **F-23** — importer `MOT_DE_PASSE_LONGUEUR_MIN` de `@axion/shared` et l'imposer dans
      `initialiserCoffre` **et** à l'écran.
   3. **F-25** — plafonner `memoireKio` et `iterations` dans `parametresKdfSchema`, et refuser un
      coffre hors bornes par une erreur explicite.

   Les trois sont testables **sans navigateur** et sans base : trois tests unitaires suffisent.
2. **AVANT LA PORTE P-C — ré-arbitrage de F-24 sur la prémisse corrigée.** La fiche A-008 doit être
   relue en sachant qu'écrire dans IndexedDB n'exige **ni** le verrou **ni** le coffre, et en incluant
   les deux conséquences que la fiche ne mentionne pas (immunité à la correction du siège ; épinglage
   de la version de la PWA). Si le durcissement est retenu, l'AAD **et** l'authentification de
   l'en-tête d'index se traitent dans le même geste — les séparer coûterait deux fois.
3. **AVANT L5c** — **F-28** (séparation de domaine des sous-clés, sel neuf par export, en-tête dans
   l'AAD) : c'est l'incrément qui écrit `.axionbackup`, et le format se fige là. **F-32** (comptage
   des styles inline et bascule sur hachages statiques) : la condition est déjà remplie.
4. **AVANT L6a** — **F-29** (`derniereErreur` = un code, jamais un message réseau). Le verdict A51 sur
   L3 a déjà montré ce que coûte un message d'erreur qui republie ses paramètres.
5. **QUAND ON VOUDRA** — **F-26** (horloge monotone pour le verrou), **F-27** (le service worker
   revérifie avant de s'activer), **F-30** (`fill(0)` sur le matériel de clé), **F-33**.
6. **HORS L5a, À A01 ET WILLIAMS** — **F-31** : `ZAP_BLOQUANT` devait passer à `'true'` à la porte L2,
   franchie le 2026-08-31 ; le job est par ailleurs `skipped` depuis le 2026-09-02. Soit la bascule se
   fait, soit un report **écrit et daté** la remplace. Un silence, non.

---

## 13. DOUTES DE SPEC POUR `DECISIONS.md`

1. **Emplacement du verdict A51.** B2 exige `docs/portes/VERDICT_A51_L5a_<date>.md` ; la commande
   d'A50 impose `docs/securite/VERDICT_A51_L5A.md`. Les deux verdicts A51 antérieurs vivent dans
   `docs/portes/`. **Où vivent les verdicts de sécurité ?** Je n'invente pas la règle : je signale
   l'écart. *(Question de rangement, pas de fond — mais un dossier de porte qui ne trouve pas sa pièce
   est un dossier incomplet.)*
2. **Quelle est la politique de mot de passe du COFFRE LOCAL ?** 06 §10.1 fixe « 12+ caractères » pour
   l'authentification serveur. Le pack ne dit **nulle part** si le mot de passe qui dérive la KEK est
   le même que celui du compte, ni s'il hérite de la même politique. J'ai audité en supposant que oui
   (F-23) — **c'est une déduction, pas une lecture**, et elle mérite un arbitrage : si le mot de passe
   local est indépendant, il lui faut sa propre politique écrite ; s'il est le même, il faut dire ce
   qui se passe quand l'admin le réinitialise côté serveur alors que le coffre local garde l'ancien.
3. **Quel est le seuil d'intégrité attendu des données locales ?** Le pack exige un IndexedDB
   **chiffré** (06 §10.5) et ne dit rien de son **intégrité**. F-24 démontre que la confidentialité
   sans intégrité laisse un dossier d'audit modifiable par qui tient l'appareil — **y compris par
   l'auditeur lui-même, sans trace**. Pour un outil dont le produit est une preuve opposable à un
   client grand compte, c'est une question de fond : **le pack veut-il un coffre, ou un scellé ?**
4. **Un plafond de coût pour la dérivation de clé.** 11 §4 borne par le **haut** (dérivation < 1 s) et
   ne borne pas par le **bas**. La mesure (61 ms sur une machine de bureau) laisse une marge d'un ordre
   de grandeur : faut-il relever le profil Argon2id maintenant que le budget est mesuré, ou attendre la
   mesure sur iPad ? **C'est une décision humaine (11 §8-4), et je ne la prends pas.**

---

## 14. SIGNATURE

**VERDICT : FUSIONNABLE SOUS RÉSERVE — 1 CRITIQUE, 3 MAJEURS, 4 MINEURS, 4 OBSERVATIONS.**

L5a est un socle **solide sur l'axe qu'il déclare** : la confidentialité au repos tient, et elle tient
structurellement — clés non extractables, verrou qui ferme réellement le coffre, index en clair dont
la liste est **encore fermée** et vérifiée par un balayage exécuté, aucune sortie réseau, aucun
journal, aucun secret. Les paramètres Argon2id confirmés par Williams sont les bons, correctement
transcrits et correctement exécutés.

Ce que la revue ajoute, et que ni A29 ni A02 ne pouvaient voir depuis leur poste : **ce coffre protège
le contenu et ne protège ni sa clé, ni son en-tête, ni sa propre existence.** Une ligne écrite dans
IndexedDB — sans mot de passe, sans franchir le verrou — suffit à substituer une réponse, à rejouer
une valeur périmée, à immuniser une ligne contre la correction du siège, à épingler la PWA sur une
version, à rendre un appareil indéverrouillable, ou — le pire — à faire **inviter l'auditeur à
détruire lui-même sa journée de collecte**. C'est ce dernier chemin, F-22, qui commande la réserve :
il est irréversible, il ne coûte rien, il n'a même pas besoin d'attaquant, et il se ferme en une
poignée de lignes.

**Rappel : je ne corrige aucun code de production (09 §5.6).** Ce verdict est une démonstration et une
liste ordonnée, pas un correctif.

**Signature verdict sécurité : A51 — 2026-09-04 (UTC), sur `lot/l5a` @ `8901109`.**
