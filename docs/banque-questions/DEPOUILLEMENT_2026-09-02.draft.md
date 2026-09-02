# DÉPOUILLEMENT — cotation croisée à blanc du 02/09/2026

**État : BROUILLON, non arbitré** · Coteurs : deux agents indépendants, consignes identiques,
contextes isolés, sans accès à la feuille d'animation ni à la grille de l'autre.
Grilles : `cotation-coteur-A.draft.csv` · `cotation-coteur-B.draft.csv`.

> ⚠️ **Limite de l'exercice, à lire avant les chiffres** : les deux coteurs sont deux instances du
> même modèle avec la même consigne. Leur **convergence prouve peu** — deux humains divergeraient
> davantage. Leur **divergence, en revanche, est un signal fort** : si deux copies du même lecteur
> se séparent sur une ancre, deux consultants s'y sépareront à coup sûr. Ce dépouillement est la
> répétition générale de la passe humaine du 15/09, pas son remplacement.

---

## 1. Chiffres

| | FIL-TPE | FIL-GC |
| --- | --- | --- |
| Écarts de cotation (sur 81 questions cotées) | **9** | **13** |
| dont ≥ 2 points ou changement de bande | 1 (B5-003 : 86 % contre 0 %) | 2 (B8-001 : 1/3 · B3-009 : 1/3) |
| dont désaccords NA ou NC contre note | 1 (B4-013) | 5 (B2-005, B3-005, B3-012, B3-014, B3-011) |
| Drapeaux rouges | **13 et 13 — listes identiques** | 4 contre 5 (l'écart passe par B3-011 : NC contre `non_verifie`) |
| Relevés divergents sur le fond | 1 (B9-002) | 0 |
| Lignes `ancre_a_revoir` renseignées | 60 (A) · 55 (B) | — |

Convergence brute : **89 % des cotations**. La couche critique tient : **les deux coteurs
déclenchent exactement les mêmes drapeaux rouges sur FIL-TPE**, et le seul désaccord de drapeau
sur FIL-GC vient d'un défaut de doctrine (NC), pas d'une ancre.

---

## 2. Les cinq défauts SYSTÉMIQUES — ils traversent la banque entière

### D1 — Le silence du dossier : NC ou 1 ? *(6 écarts, et chaque coteur s'est contredit lui-même)*

A a mis NC sur B3-011/012/014 et 1 sur B3-005 ; B a fait **exactement l'inverse**. Aucun des deux
n'a de règle, parce que la banque n'en a pas. C'est le défaut qui a produit le plus d'écarts, et le
seul qui fasse diverger un drapeau rouge.
**Proposition** : une entreprise qui ne peut rien montrer sur une pratique qu'elle devrait avoir
se cote **1** ; **NC** est réservé à l'information demandée et matériellement non obtenue (refus,
absence de l'interlocuteur, pièce hors délai). En exercice sur dossier : silence du dossier = NC.

### D2 — Quel système fait foi quand le parc est hétérogène ? *(B8-003 : 3/4 · B3-009 : 1/3 · B4-014 : 5/4)*

Chez FIL-GC, l'AIPD est exemplaire sur un système, en suspens sur un autre, absente sur quatre.
B3-009 : B a compté l'AIPD de la présélection comme « examen écrit »… pour juger le versement de
40 000 documents dans un AUTRE système. Les guidances disent tantôt « le dernier outil mis en
service », tantôt rien.
**Proposition** : une règle unique, écrite dans le MODE_EMPLOI : *on cote le système le plus
défavorable parmi ceux relevés au registre* — un audit ne moyenne pas les vigilances — sauf quand
la guidance désigne explicitement « le dernier mis en service ».

### D3 — Les notes 2 et 4 n'ont pas de règle *(B1-007, B8-007, B7-005, B5-010, B5-004, B6-004, B6-005, B7-001, B8-005 : tous à ±1 point)*

Neuf écarts d'un point, tous entre deux ancres : un coteur interpole, l'autre reste à l'ancre.
**Proposition** : « la note 2 (resp. 4) exige qu'au moins UN élément de l'ancre 3 (resp. 5) soit
établi, sans que l'ancre entière le soit ; sinon on reste à l'ancre inférieure. »

### D4 — La frontière NA / 1 *(B4-013 : 1 contre NA)*

Une entreprise 100 % SaaS qui n'« intègre » aucun modèle : la question de la vérification des
intégrations est-elle sans objet, ou vaut-elle 1 ? Même famille que l'absence de CSE (B5-011) et le
DPO facultatif (B8-010), convergents cette fois mais signalés par les deux coteurs.
**Proposition** : chaque question porteuse d'un prérequis structurel (intégration, effectif,
obligation conditionnelle) dit dans sa guidance ce qui rend la question NA — sinon NA est interdit.

### D5 — L'agrégation multi-unités *(non tranchée, signalée partout)*

3 agences modifient les plannings, la 4ᵉ n'ose plus. Les deux coteurs ont lissé — dans le même
sens, par chance. La banque n'a pas de règle ; la couverture par unité relève de la mission
(03 §27.1), pas de la banque, mais la note unique doit savoir ce qu'elle fait d'un terrain divisé.
**Proposition** : à trancher par Williams — l'unité la plus défavorable, ou la pratique majoritaire
avec mention obligatoire de l'exception au rapport.

> **D1, D2, D3, D5 sont de la doctrine de cotation, pas de la formulation d'ancre.** Ils touchent
> potentiellement 03 §32.4 : c'est un arbitrage de Williams, à tracer dans `DECISIONS.md` —
> pas une correction d'autopilote.

## 3. Les défauts d'ancre PONCTUELS — corrigeables ligne à ligne

| Ancre | Défaut constaté | Réécriture proposée |
| --- | --- | --- |
| **Q-B3-008** (planté T6 — **attrapé par les deux**) | L'ancre 5 juge la DATE de révision, pas le contenu : une mention muette sur l'IA révisée après mise en service la satisfait à la lettre | Ancre 5 : « révisée après la mise en service **et mentionnant le traitement automatisé**, révision datée, support identifiable » |
| **Q-B5-003** (planté G9 — **écart maximal : 86 % contre 0 %**) | « La formation prévue » ne dit ni ce qu'elle doit couvrir ni quoi faire quand rien n'est prévu | Guidance : la formation compte si elle porte sur l'outil d'IA **et ses limites** — une prise en main éditeur n'en est pas une ; aucune formation prévue = 0 % |
| **Q-B1-005** (planté G2 — attrapé) | Une politique de 11 mois jamais revue tombe à 1 comme une politique morte ; la revue pré-approbation n'est prévue nulle part | Ancre 1 : « aucune politique, ou politique **de plus de 24 mois** jamais revue » ; politique plus jeune jamais revue = 3 au plus |
| **Q-B2-004** | Les ancres 1 et 3 sont vraies EN MÊME TEMPS pour FIL-TPE (« validation qui n'a jamais rien refusé » / « peut aller contre mais aucun cas citable ») | Ancre 3 : exiger un élément matériel de la marge (droit écrit, cas raconté même non daté) — la seule possibilité théorique reste à 1 |
| **Q-B4-009** (non planté — **trouvé par les deux**) | Le cas inverse de l'ancre 3 (mode dégradé PRATIQUÉ mais jamais écrit) n'existe pas | Ancre 3 : « un mode dégradé décrit mais jamais essayé, **ou** pratiqué avec succès mais jamais écrit » |
| **Q-B8-001** | « Feuille de route » non définie : un programme budgété en tient-il lieu ? (écart 1/3) | Guidance : un budget voté ou un mandat n'est pas une feuille de route — il faut le document de jalons |
| **Q-B3-011** (planté T5) | « Clause lue » ne dit ni par qui ni quand — la lecture faite en séance avec l'auditeur satisfait l'option à la lettre | Option 3 : « lue **par l'entreprise avant l'audit** mais sans trace » ; lecture en séance = `non_verifie` |
| **Q-B9-002** | « Registre produit pour l'audit » : la liste construite EN séance en est-elle un ? (A : date du jour, B : vide) | Guidance : liste construite en séance = date du jour + mention au rapport ; « vide » réservé au refus de l'exercice |
| **Q-B9-010** (planté G7 — attrapé) | « Garanties documentées » ne dit pas si une garantie écrite mais NON APPLIQUÉE compte | Option 3 : « garanties documentées **et effectivement en place** » |
| **Q-B1-003 / Q-B1-010** (rapports des coteurs) | « Arbitrage daté » sans exiger l'écrit (B1-003) ; refus antérieur au document de limites indécidable (B1-010) | B1-003 ancre 5 : arbitrage daté **et tracé par écrit** ; B1-010 guidance : le refus doit être postérieur ou contemporain de la limite écrite |
| **Q-B4-011** (planté G12 — signalé) | Trois options écrasent « rien vérifié » et « tout chiffré sauf une exception reconnue » sur la même note 3 | Passer à 4 options, ou guidance : une exception unique reconnue et datée reste `complet` si un plan de correction existe — à défaut `transit` |

## 4. Verdict des faits plantés (feuille d'animation §5)

- **Confirmés par un écart** : G8, G9 (sur FIL-TPE, plus fort que prévu), G1 (formulation des
  relevés), plus le conflit d'ancres de B2-004 — cousin direct de T1.
- **Confirmés par malaise convergent** (note identique, défaut signalé des deux côtés) : T1, T3,
  T5, T6, T7→T12, G2, G4 (témoin passé ✓), G7, G11, G12, G14, G16.
- **RATÉS — ni écart ni malaise, à soulever d'office en séance humaine** :
  **T4** (un support de vœux vaut-il « objectif écrit » ?), **G3** (registre « incomplet » ET
  « ayant servi » : les deux ancres de Q-B9-003 restent en conflit), **G6** (l'existence de la
  mention machine a éclipsé sa lisibilité — le couple Q-B9-008/009 n'a pas joué son rôle),
  **G5** (la bascule de rôle de l'assistant documentaire a été décrite mais jamais tranchée).
- **G15** : conforme — aucun coteur n'a trouvé où loger le rapport de mise à l'épreuve refusé ;
  le trou de couverture de la vague 2 est réel et reste assumé.

## 5. Ce qui est fait, ce qui attend

- **Fait** : les deux grilles, ce dépouillement, le tableau des réécritures.
- **Rien n'est corrigé dans les CSV** — délibérément. Le protocole impose de corriger d'un bloc
  après arbitrage : les réécritures du §3 attendent le go de Williams, les doctrines du §2
  attendent son arbitrage (et probablement une entrée `DECISIONS.md` si 03 §32.4 est touché).
- **La passe humaine du 15/09 reste due.** Elle réutilise les mêmes dossiers — la feuille
  d'animation s'enrichit des quatre plantés ratés (T4, G3, G5, G6), qui deviennent ses points à
  soulever d'office.

---

**Mise à jour du 02/09/2026, sur go explicite de Williams** : les onze réécritures du §3 sont
**appliquées** aux CSV de la banque (grille de contrôle repassée : zéro écart, 100 questions).
Les cinq doctrines du §2 sont **posées dans `DECISIONS.md`** (entrée du 2026-09-02, arbitrage
réservé à Williams, aucune appliquée). La feuille d'animation (`COTATION_CROISEE.md` §5.4) est
enrichie pour la passe humaine : ancres réécrites où l'attendu s'inverse, quatre plantés ratés à
soulever d'office, doctrines à ne pas normer en séance.
