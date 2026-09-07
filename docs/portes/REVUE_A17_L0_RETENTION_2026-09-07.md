# REVUE CROISÉE A17 — lot L0 — PR #86 (`3431fe4`), rétention à trois étages

> **Revue faite APRÈS la fusion**, et c'est un écart au pipeline (09 §3, étape 4) : la PR débloquait
> quatre autres PR et un geste d'exploitation attendu depuis cinq jours. L'écart est assumé et tracé
> ici plutôt que tu. **L'auteur réclamait lui-même cette revue** dans sa signature d'auto-revue :
> « j'ai touché à la fois au script et au test qui l'éprouve — exactement le croisement que
> 09 §5.6 interdit ».
>
> **VERDICT : ACCEPTÉ SOUS RÉSERVES — R1 BLOQUANTE.**
> Périmètre relu : 7 fichiers, 411 insertions, 76 suppressions, 100 %.

---

## 1. CE QUI EST CONFIRMÉ — mesuré par le réviseur, pas repris de l'auteur

| Affirmation de l'auteur | Mesure indépendante | |
| --- | --- | --- |
| Défaut réel, 7 j sur 7, portée 69→75 j | `20260630`, 69/70/71/72/73/74/75 — table reproduite à l'identique | exact |
| Correctif : 99→105 j | `20260531`, 99/100/101/102/103/104/105 | exact |
| 14 archives avant comme après | 14/14 les sept jours | exact |
| Le non-chevauchement est aveugle le dimanche | assertion VERTE le 2026-09-13 sur le code d'avant, ROUGE les six autres jours | exact |
| La profondeur voit le défaut les 7 jours | ROUGE (69…75 < 90) les sept jours sur le code d'avant | exact |
| Contre-épreuve hebdo=0 : le 30 août remplace le 31 | `20260830 gardée — mensuelle 1/3 (mois 202608)` | exact |
| Le substitut de date est INERTE sans sa variable | Debian bookworm, coreutils 9.1 : delta epoch = 0 | exact |
| `l0-sauvegarde` 67/67 | 67/67 verts, rejoué, 1251 s | exact |

**Le substitut n'entre dans aucune image de production** : `grep -rn "faux-date\|AXION_TEST_AUJOURDHUI"`
hors `apps/api/tests/` ne rend rien ; il est `docker cp`é dans le conteneur de banc.

**Non-régression de calendrier, non mesurée par l'auteur** : séries à pas 2, 3, 5, 7, 10, 14 jours —
le correctif est neutre ou strictement meilleur partout (pas = 3 : 99 j → **132 j**).

---

## 2. R1 — BLOQUANTE. Le correctif SUPPRIME une archive que le code d'avant gardait

**`infra/postgres/sauvegarde.sh:1333`** (la condition ajoutée) et son commentaire `:1360`.

**Le veto de semaine s'applique même quand l'étage hebdomadaire est ÉPUISÉ.** À ce moment il ne
protège plus rien : il détruit.

### Reproduction, en secondes

```
plan 7/4/3, série :
20260907 20260906 20260905 20260904 20260903 20260902 20260901
20260830 20260823 20260816 20260802 20260731 20260630 20260531
```

| | AVANT #86 | APRÈS #86 |
| --- | --- | --- |
| archives gardées | **14** | **13** |
| mois couverts | 05, 06, 07, 08, 09 | 05, 06, **—**, 08, 09 |
| `20260731` | `mensuelle 1/3 (mois 202607)` | **SUPPRIMÉE** |
| places mensuelles dépensées | 3/3 | **2/3** |

Quand `20260731` est examinée, l'hebdomadaire est à `4/4` : le veto ne libère aucune place, il en
gaspille une. **Le budget de 14 reste inutilisé et juillet 2026 n'a plus aucune archive.**

**Second cas, plus simple** : `20260831` seule archive d'août, semaine 202636 tenue par le
quotidien → AVANT garde 12 fichiers dont le 31 août, APRÈS en garde 11 et **août disparaît**.

### Pourquoi c'est bloquant, et pas une remarque

Ce n'est pas le jugement du réviseur contre celui de l'auteur : c'est **la décision que le correctif
implémente** qui tranche — `DECISIONS.md`, **D-2, Williams, 2026-08-28** :

> « Le coût d'une archive gardée en trop est de quelques mégaoctets ; celui d'une archive supprimée
> à tort est **une restauration impossible**. »

Et `sauvegarde.sh:1254-1257` le redit : « une rotation qui ne sait pas dater un fichier ne doit
JAMAIS trancher en faveur de la suppression ». **Le nouveau veto fait exactement l'échange interdit.**

### Et le commentaire affirme le contraire, en majuscules

`sauvegarde.sh:1360` : « **LE MOIS N'EST JAMAIS SAUTÉ POUR AUTANT, ET C'EST MESURÉ, PAS DÉDUIT.** »

C'est faux. Ce qui a été mesuré, c'est une série **dense**, où l'archive suivante du même mois existe
toujours. **La thèse entière de la PR était « le code contredisait son propre commentaire » — et le
correctif réinstalle ce défaut une ligne plus bas.** Aucun des sept cas ne couvre la série creuse :
ils jouent tous 120 jours consécutifs.

### Honnêteté sur la fréquence

Une panne de service ordinaire (fenêtre contiguë de 25 j à J-8, J-20, J-35, série de 180 j) **ne
déclenche pas** R1 : 14 → 14, aucun mois perdu. R1 exige une série creuse **au voisinage d'une
frontière de mois**. La fréquence naturelle est basse — **elle n'est pas nulle, elle est sur le
chemin de la suppression, et elle n'est pas testée.**

Le réviseur ne prononce pas REFUSÉ parce que revenir en arrière restaurerait un défaut strictement
pire sur le chemin nominal (69-75 j contre 99-105). **Le correctif de R1 se fait en avant.**
**La porte L0 n'est pas franchissable en l'état.**

### La règle juste est déjà écrite

`sauvegarde.sh:1355`, de la main de l'auteur : « **tant que** l'hebdomadaire a des places ».
La condition écrite ne l'implémente pas.

---

## 3. R2 — `faux-date.sh` laisse fuir le relatif non prévu, en silence

**`apps/api/tests/aide/faux-date.sh:88-93`**, en-tête `:20-30`.

L'en-tête annonce le partage **absolu / relatif**. La règle réelle du code est
**`now|today|yesterday|tomorrow` / tout le reste**. Toute autre expression relative traverse et se
résout sur l'**horloge réelle**.

| Expression | Attendu (base 2026-09-13) | Obtenu |
| --- | --- | --- |
| `-d "-7 days"` | `20260906` | **`20260831`** |
| `-d "7 days ago"` | `20260906` | **`20260831`** |
| `-d "last monday"` | `20260907` | **`20260831`** |
| `-d "+1 month"` | `20261013` | **`20261007`** |
| `--date yesterday` (espace) | `20260912` | **`20260906`** |

**Aucune de ces formes n'est utilisée aujourd'hui** — les 11 sites d'appel du dépôt sont soit
`yesterday|today|tomorrow …`, soit absolus. **La mesure des sept jours n'est pas entachée.** R2 est
un piège posé pour le prochain qui écrira un cas. **Un substitut qui échoue bruyamment sur une forme
qu'il ne sait pas traiter fermerait le sujet.**

---

## 4. R3 — le contrôle qui doit prouver l'instrument ne prouvait rien

**`apps/api/tests/l0-sauvegarde.integration.test.ts:430-436`.** Mesuré **sans aucun substitut** :

```
docker run --rm debian:bookworm-slim bash -c \
  'export AXION_TEST_AUJOURDHUI=2026-09-07; date -u +%Y%m%d; date -u -d 20260831 +%G%V'
→ 20260907, 202636   ← les deux valeurs assertées
```

- La 2ᵉ assertion porte sur une date **absolue** : elle rend `202636` avec, sans, ou en l'absence
  totale du substitut. Elle ne discrimine **jamais**.
- La 1ʳᵉ ne discrimine que les jours ≠ 2026-09-07. **Le 2026-09-07 — jour de la PR, jour de la CI,
  le seul jour où l'on en avait besoin — le contrôle était tautologique.**
- Il ne vérifie **pas l'inertie**, la propriété qui protège les 58 autres cas du fichier.

*La PR corrige « un cas dont le verdict dépend du jour où on le lance » et introduit un contrôle dont
la valeur dépend du jour où on le lance.*

---

## 5. R4 — citation mal attribuée, propagée en cinq endroits

`sauvegarde.sh:1349` · `l0-sauvegarde…test.ts:873` · `DECISIONS.md` (2026-09-07) · message de commit
(×2) : « **02 §11.4 EN PROMET TROIS MOIS** ».

`docs/02_ARCHITECTURE_ET_INFRA.md:93` dit « rétention **30 j** ». Et D-2 le dit elle-même :
« le 02 §11.4 fixe la rétention PostgreSQL à 30 jours et **ne prescrit rien pour le volume
applicatif** ». **Les ~90 jours viennent de D-2 option (c).** Le seuil `>= 90` du test est juste —
c'est la référence qui est fausse.

**Gravité réelle** : `test:873` est un **message d'échec que lit un exploitant à 2 h du matin**. Il
l'envoie lire une section où il trouvera « 30 j », et conclura que le test a tort.

---

## 6. Remarques, sans réserve attachée

- **`shellcheck`** : les avertissements ont été relus un par un — **aucun ne touche la correctness de
  la rétention**. L'arbitrage « fiche d'étage 2 » se défend. Deux chiffres de la fiche ne sont
  toutefois pas reproductibles (9 annoncés, 7 mesurés sur ce fichier, avec shellcheck 0.11.0 — le
  runner peut différer), et « 2 481 lignes » est la longueur d'**avant** la PR ; le fichier en fait
  **2 522**.
- **Angle mort élargi par la PR** : `ci.yml:204` limite `shellcheck` à `infra/scripts/*.sh` et
  `.github/scripts/*.sh`. La PR ajoute `apps/api/tests/aide/faux-date.sh`, **hors périmètre**. (Il
  est propre — vérifié.)
- **La forme abandonnée par l'auteur ne survit nulle part** — mesuré : les 4 occurrences de
  `x="$(ls … | grep …)"` du dépôt portent toutes `|| true`.
- **Durée** : le fichier passe de 52 à 67 cas et tourne en **1251 s (20 min 51 s)**. Son propre
  en-tête prévient qu'« une suite qui dure une demi-heure finit par ne plus être exécutée » : il est
  à 70 % de ce seuil.
- **Fuseau du substitut** : sous `TZ=Europe/Paris`, il rend un epoch décalé de 2 h. Sans effet ici
  (tous les appels portent `-u`), et documenté à `faux-date.sh:41-42` — mais **il rend une valeur
  fausse au lieu d'échouer** si le cas tombe.

---

## 7. CE QUI N'A PAS PU ÊTRE ÉPROUVÉ — dit plutôt que tu

Les **trois limites déclarées par l'auteur sont confirmées** : la moitié MinIO du banc reste
substituée, aucune restauration réelle n'a été rejouée, le balayage large de 121 jours n'entre pas
dans la suite. S'y ajoutent celles du réviseur :

1. **Le taux de déclenchement de R1 n'est pas mesuré.** Deux campagnes (séries de 150 et 180 jours,
   15/30/45/60 % de passes manquées, 8 graines) ont été **coupées par le temps d'exécution** sous
   Git Bash/Windows. Il y a donc une **preuve d'existence** solide et une **contre-mesure partielle**
   (la panne contiguë ne déclenche pas), mais **pas de taux**. **À rejouer sous Linux avant de
   statuer sur l'urgence.**
2. **La restauration effective** d'une archive du plan n'a pas été jouée : on mesure quels fichiers
   survivent, pas qu'ils se rouvrent.
3. **La copie hors serveur (R2/Storage Box)** n'est pas éprouvée — `mc` est substitué.
4. Le banc du réviseur **isole `faire_tourner_par_rang` + `cle_periode`** (extraites verbatim, une
   seule ligne de différence entre les deux bancs) : l'environnement n'est pas la passe entière.

---

## 8. CE QUE CETTE REVUE ENSEIGNE, ET QUI DÉPASSE LE CORRECTIF

**L'arbitrage à l'origine de R1 était celui du pilote**, rendu sous délégation, et il était **faux**.
Il disait : *« l'option 2 ne peut rien retirer — le plan atteint plus loin, jamais moins »*. C'est
exactement ce que R1 réfute. L'agent a appliqué une consigne erronée ; la faute n'est pas la sienne.

Et la revue est arrivée **après** la fusion. R1 en est la démonstration coûteuse :

> **Le seul défaut qu'aucune des mesures de l'auteur ne pouvait voir est celui que ses propres
> mesures définissaient comme hors champ.**

C'est très exactement ce que la règle de croisement 09 §5.6 achète — et ce que l'auteur avait
lui-même réclamé.

---

**Signature revue croisée : A17 — 2026-09-07.** Aucune ligne produite : `git status` vide dans les
deux arbres.
