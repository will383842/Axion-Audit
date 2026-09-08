# ATTESTATION A20 — croisement 09 §5.6, incrément L5b (PR #97, `912a9b4`)

> Demandée par le pilote en clôture de la réserve **R-4 d'A29**, qu'A02 conditionnait à un tableau
> d'attribution fichier→agent contresigné par le chef d'équipe. **A20 REFUSE d'attester le tableau
> d'A02 en l'état** et atteste un tableau corrigé, plus sévère.
>
> **Destination : `docs/portes/PORTE_C_<date>.md`**, quand le dossier de porte sera ouvert. Ce
> fichier existe pour que l'attestation ne se perde pas d'ici là — elle a été rendue pendant que les
> faits étaient frais, pas reconstituée à la porte.

---

## Le fait qui retourne le dossier : l'historique d'avant-squash n'est PAS perdu

A02 écrivait que le squash avait effacé la séparation par agent et que §5.6 était « **indécidable
depuis les artefacts** ». **C'est faux, et le vérifier coûte cinq secondes.** La branche
`origin/fix/n1-ancres-paysage` part de la même base `e6dc7d1` et **conserve les commits
d'avant-squash**. La frontière se prouve en une commande :

```
git diff 912a9b4 94930c6   →  VIDE
```

Les deux arbres sont identiques, donc `b5a11a4..94930c6` est exactement ce qui est devenu `912a9b4`.
**18 commits** redeviennent lisibles. L'attribution est donc **décidable**, par commit et par
fichier — et la réponse est **pire** que le tableau qu'elle remplace.

## Tableau attesté (périmètre : `912a9b4` seul)

| Fichier | Nature | Lignes / commits | Mono-agent prouvé | A02 disait | Verdict §5.6 |
| --- | --- | --- | --- | --- | --- |
| `packages/ui/src/composants/EchelleAncree.tsx` | production | 224 / 5 | 35 (`48eb831 [A21 seul]`) — 16 % | A21 seul ✅ | **PARTIEL** |
| `packages/ui/src/composants/EchelleAncree.test.tsx` | test | 890 / 6 | 150 (`213f0ad [A26 seul]`) — 17 % | A26 seul ✅ | **NON TENU** |
| `e2e/hors-ligne-l5.e2e.ts` | test | 163 / 3 | 5 (`213f0ad`) — 3 % | A26 seul ✅ | **NON TENU** |
| `packages/ui/src/composants.css` | production | 22 / 4 | 0 | mixte ⚠️ | **NON TENU** (A02 exact) |
| `e2e/fixtures/appareil-terrain.ts` | fixture | 74 / 1 | 0 | mixte ⚠️ | **NON TENU** (A02 exact) |

**Trois des cinq lignes d'A02 sur-déclaraient, les trois dans le sens permissif.** Ses deux ⚠️
étaient justes.

Les deux faits qui fondent le refus, **revérifiés par le pilote** :

- `a071fcb`, sujet « **second tour A21 applique** », ajoute **303 lignes à `EchelleAncree.test.tsx`**
  (`REPLI_SANS_AUCUNE_ANCRE`, `REPLI_DEPLIANT`, `repliSurLaNote()`, `MARQUE_DERIVEE`, harnais
  `EchelleAuDoigt`). Un commit dont le sujet nomme A21 et qui porte 300 lignes de test est
  exactement l'artefact que §5.6 doit rendre impossible.
- `d97b27b`, sans étiquette d'agent, ajoute **157 des 163 lignes** de `e2e/hors-ligne-l5.e2e.ts`
  **dans le même commit** qui modifie `EchelleAncree.tsx` et `composants.css` — production et test,
  une main indistincte.

## VERDICT : 09 §5.6 est NON TENU AU SENS PROBATOIRE pour L5b

**Non tenu n'est pas violé, et la nuance est due à l'équipe.** Aucun artefact ne montre A21 écrivant
un test avec intention, ni A26 écrivant de la production. Les corps de `a000071` et `a071fcb` se
déclarent **instantanés d'un worktree PARTAGÉ** (« les deux agents écrivent dans l'arbre »), et les
307 lignes de test peuvent être le travail en vol d'A26 capturé sous un titre A21. **Peut.**
Il n'y a pas preuve de faute : il y a **absence de preuve de conformité** — l'objet même de R-4.
**La prose n'est pas un artefact.**

**CONSÉQUENCE : R-4 d'A29 NE PEUT PAS ÊTRE FERMÉE sur cette attestation.** Elle reste **OUVERTE**,
requalifiée : « §5.6 non démontrable sur les deux premiers tours de L5b ; démontrable et démontré à
partir du 3ᵉ tour (`48eb831`, `213f0ad`) ». Les commits ne sont pas rétro-écrits : l'écart se
constate, il ne se répare pas.

## Ce que l'attestation couvre, et ce qu'elle ne couvre pas

**Couvre** : la provenance par commit et par fichier des cinq fichiers ci-dessus, dans `912a9b4`
uniquement.
**Ne couvre pas** : la justesse fonctionnelle du correctif, la santé CI (40/40 et 86 tests, vérifiées
par le pilote et non revérifiées ici), N1, N2, R2, et tout commit hors `b5a11a4..94930c6`.

## Deux incréments à ouvrir dans l'équipe 2 — SIGNALÉS, non ouverts

- **L5d — invariant 5 à l'écran.** A20 l'a vérifié et c'est **pire qu'un écart** : `session/fuseau.ts`
  est **CONFORME** — son en-tête dit que le fuseau de mission « n'intervient qu'ICI ». C'est
  **l'appelant qui le désarme** : `EcranRestauration.tsx:360` passe `formaterDateHeure(…, undefined)`
  et `Intl` retombe alors sur le fuseau de **l'appareil** ; `:364` rend un UUID brut ;
  `EcranFinDeJournee.tsx:333` rend une chaîne d'horodatage non formatée. **Un module d'invariant
  contourné par son appelant est un défaut de lot, pas une coquille.**
- **N1/N2 liés.** La citation verbatim porte la liste de 163 à **436 px** et pousse 4 ancres sur 5
  hors écran en iPad paysage ; `toBeVisible()` ne mesure pas le viewport. Le remède existe déjà et
  **n'est pas fusionné** : `b2c5eae [A26 seul]` sur `fix/n1-ancres-paysage` — tests seuls, zéro
  production, **rouge par construction**. C'est un artefact PROPRE : la correction de méthode a tenu
  **après** la fusion.

**P-C reste NON FRANCHISSABLE.** Cette attestation ne coche aucun critère de porte.

```
Signé : A20, chef d'équipe 2 (PWA terrain et synchronisation) — 2026-09-08
Portée : 912a9b4 · Source de vérification : origin/fix/n1-ancres-paysage
```

---

## NOTE DU PILOTE — j'ai propagé le tableau sur-déclarant dans `main`

Le message de fusion de `912a9b4` **recopie le tableau d'A02**, y compris ses trois ✅ que la
présente attestation réfute. Je l'ai recopié parce qu'A02 demandait qu'il survive au squash, et je
ne l'ai **pas vérifié ligne à ligne avant de fusionner** — j'ai vérifié ce que la PR demandait de
surveiller (les gardes s'exécutent-elles sur le Chromium épinglé : oui, 86 contre 84), pas la
provenance qu'elle affirmait. **Le message de fusion est dans l'histoire et ne se réécrit pas ; cette
attestation le corrige, et c'est elle qui fait foi.**

Les quatre faits d'A20 sont **remesurés par moi** : `git diff 912a9b4 94930c6` vide · 18 commits
retrouvés · `a071fcb` = +303 lignes dans le fichier de test · `d97b27b` = 157 lignes d'e2e dans le
même commit que la production.

**Et la leçon de méthode qu'A20 rend à A02, qui vaut pour tout le dépôt** : conclure « indécidable
depuis les artefacts » sans chercher la branche sœur survivante. `git diff <squash> <tête>` **vide**
est le test qui rouvre l'historique. Cinq secondes, et ici il a retourné **trois lignes sur cinq**.
