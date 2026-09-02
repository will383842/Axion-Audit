# COTATION CROISÉE — protocole et feuille d'animation

**Date : 2026-09-02** · État : **BROUILLON, non arbitré** · Réf. : 03 §32.4 · jalon du **15/09**

> Le jalon du 15/09 exige **100 questions relues et testées**, pas rédigées (07 §14). Le test, c'est
> cet exercice : **deux personnes cotent le même cas fictif, chacune de son côté, puis on compare.**
> Un écart entre les deux n'est pas une erreur de coteur : c'est une **ancre ambiguë démasquée** —
> et c'est exactement ce qu'on cherche. L'exercice a réussi s'il produit une liste d'ancres à
> réécrire, pas s'il produit deux colonnes identiques.

---

## 1. Le matériel

| Pièce | Qui la reçoit |
| --- | --- |
| `MODE_EMPLOI.md` + les 10 fichiers de la banque (100 questions) | les deux coteurs |
| `cas-fictif-FIL-TPE.draft.md` | les deux coteurs |
| `cas-fictif-FIL-GC.draft.md` | les deux coteurs |
| `grille-depouillement.csv` (100 lignes, générée depuis la banque) | les deux coteurs, une copie chacun |
| **La section 5 du présent fichier** (faits plantés) | **l'animateur SEULEMENT — jamais les coteurs** |

Les deux dossiers ne contiennent aucune cotation, délibérément : ils décrivent ce qu'un auditeur a
vu, entendu, obtenu ou pas obtenu. Toute la cotation reste à faire.

## 2. Les règles de cotation (valables pour l'exercice, à confirmer ensuite comme doctrine)

1. **On cote avec les ancres, rien qu'avec les ancres.** Si l'ancre ne permet pas de trancher,
   on cote quand même — au plus proche — et on note le malaise en colonne `ancre_a_revoir`.
   **Le malaise est la récolte de l'exercice.**
2. **Toutes les échéances se calculent contre le 02/09/2026.** Plusieurs faits sont à quelques
   semaines d'une borne : calculer, pas estimer.
3. **`NA`** (non applicable) est permis, avec une justification d'une ligne. **`NC`** (l'information
   n'a pas pu être obtenue) est autre chose que `NA` — et autre chose qu'un 1. Les confusions
   NA / NC / 1 font partie de ce que l'exercice mesure : ne pas les « corriger » en séance.
4. **Les relevés (`table`, `date`, poids 0) se remplissent en une ligne de synthèse**, pas en note.
   Un relevé auquel le dossier ne permet pas de répondre se marque `NC` — c'est un trou du cas, à
   noter aussi.
5. **Interdiction de se parler avant le dépouillement.** Chaque coteur travaille seul, dossiers et
   banque en main, sans échange — c'est la condition de validité de tout l'exercice.
6. Ordre conseillé : **FIL-TPE d'abord** (plus court), FIL-GC ensuite. Budget réaliste :
   **une demi-journée par cas et par coteur**, plus 2 h de dépouillement commun.

## 3. Le dépouillement (les deux coteurs + l'animateur)

1. Poser les deux grilles côte à côte. **Tout écart compte**, y compris NA contre 1.
2. Pour chaque écart, chacun lit à voix haute l'ancre qui a fondé sa note. Trois issues possibles :
   - **l'un des deux a mal lu le dossier** → pas d'action sur la banque ;
   - **l'ancre est ambiguë** → ligne dans le tableau de sortie, l'ancre sera réécrite ;
   - **la question est inposable en mission réelle** (l'information ne s'obtient jamais) → la
     question est à revoir en profondeur, pas seulement son ancre.
3. Écarts de **2 points ou plus** sur une échelle, désaccords **NA/1**, et désaccords sur un
   **drapeau rouge** se traitent en priorité : ce sont eux qui faussent un score de mission.
4. Sortie de séance : un tableau `ancre | défaut constaté | réécriture proposée`, reporté ensuite
   dans les CSV de la banque. C'est ce tableau qui prouve « relues et testées » au 15/09.

## 4. Ce que les cas testent structurellement

- **FIL-TPE** : rien d'écrit, beaucoup de fait. Teste la moitié basse des ancres (1 contre 3), les
  drapeaux rouges, la frontière NA/1 dans une structure de 8 personnes, et le réflexe « préparation
  manquante, pas manquement » sur les obligations reportées.
- **FIL-GC** : tout est écrit, peu est prouvé. Teste la moitié haute des ancres (3 contre 5) — la
  quasi-totalité des niveaux 5 de la banque exigent *un cas réel daté* — l'agrégation multi-unités
  (que cote-t-on quand 3 agences sur 4 font bien ?), et la couverture (4 agences sur 150 unités).
- Les deux ensemble : la même banque doit tenir aux deux échelles — c'est la promesse
  « de la TPE au grand groupe », version contenu.

---

---

## 5. FEUILLE D'ANIMATION — faits plantés ⚠️ NE PAS REMETTRE AUX COTEURS

> Chaque fait ci-dessous a été posé **exprès** dans les dossiers pour provoquer une divergence à un
> endroit précis. Si les deux coteurs convergent partout, y compris ici, les ancres sont plus
> solides que prévu — ou les coteurs se sont parlé. Si un fait planté ne produit ni écart ni
> malaise noté, l'animateur le soulève lui-même au dépouillement.

### 5.1 FIL-TPE

| # | Fait planté | Questions visées | Divergence attendue | Ce que ça teste |
| - | --- | --- | --- | --- |
| T1 | Candidatures sous 50 **jamais ouvertes**, seuil « pratique » à 60, courrier type — mais « la décision reste humaine » | Q-B9-010, Q-B2-004 | `non` (une personne tranche) contre `oui_sans_garantie` (rejet de fait automatisé) — le drapeau rouge bascule avec | Une validation humaine qui ne refuse jamais est-elle une intervention humaine ? L'ancre le dit — encore faut-il l'appliquer contre le discours |
| T2 | Assistant du site **sous le nom et les couleurs** de l'entreprise, **aucune mention** machine, constaté le 02/09 | Q-B9-008, Q-B9-005, Q-B1-013 | 5 possible si le coteur ne voit que le module de tri interne · 0 + drapeau s'il voit l'assistant public | Art. 50(1) applicable depuis le 02/08/2026 ; apposition de marque = bascule possible vers fournisseur (art. 25) |
| T3 | Tri de candidatures = **annexe III** (recrutement), obligations → 02/12/2027 | Q-B9-006, Q-B9-012 | Coter le défaut de classement comme manquement au lieu de préparation manquante | Le réflexe calendrier : écart ≠ manquement avant l'échéance |
| T4 | Objectif « 5 jours au lieu de 12 » dans un **support de vœux**, sans responsable ni suivi | Q-B1-008 | 1 contre 3 : un support de vœux est-il « un objectif écrit et chiffré » ? | Ce que vaut le mot « écrit » dans l'ancre |
| T5 | Clause de non-réutilisation **lue pendant la séance**, option du compte **non vérifiée** | Q-B3-011 | `non_verifie` (0) contre `lue_sans_trace` (3) | Une lecture faite pendant l'audit compte-t-elle pour l'entreprise ? |
| T6 | Mentions candidats révisées le **20/08/2025** — après la mise en service (03/2025) mais **muettes** sur le tri automatisé | Q-B3-008 | 5 « à la lettre » (révision postérieure, datée, support identifiable) contre 1-2 en substance | **Défaut d'ancre planté** : l'ancre 5 est satisfaite littéralement par une mention qui ne dit rien — elle devra être réécrite |
| T7 | Signalement biais/âge de **02/2026**, resté sans réponse, signalant « pas fâché » | Q-B1-014 | 1 contre 3 | La borne basse : absence de trace contre absence de suite |
| T8 | Tableur `acces divers` partagé à tous — des **mots de passe**, pas des clés de programmation | Q-B4-012 | oui contre non (le drapeau bascule) | Le mot « clé d'accès » couvre-t-il un mot de passe ? L'ancre doit le dire |
| T9 | Score de tri **recalculé**, non conservé — date et utilisateur, eux, conservés | Q-B4-014 | 1 contre 3 | Trace partielle : où passe la frontière |
| T10 | AIPD : « le consultant avait dit qu'on n'était pas concernés », **sans écrit** | Q-B8-003, Q-B3-015 | 1 (« jamais examiné ») contre 3 (« l'examen a eu lieu mais rien n'est écrit ») | Un avis oral d'expert est-il un examen ? |
| T11 | Pas de représentants du personnel (8 pers.) · DPO non obligatoire et absent | Q-B5-011, Q-B8-010 | NA contre 1 sur B5-011 · `absent_facultatif` attendu sur B8-010 | La frontière NA/1 dans une TPE — la banque doit-elle la trancher en guidance ? |
| T12 | Direction : « je savais pour les annonces, pas pour les CV » | Q-B2-006 | 0 contre 1 — le drapeau tient dans les deux cas | Deux options rouges voisines : l'écart est tolérable si le drapeau converge |

### 5.2 FIL-GC

| # | Fait planté | Questions visées | Divergence attendue | Ce que ça teste |
| - | --- | --- | --- | --- |
| G1 | 4 convocations, **2 comptes rendus**, 1 réunion annulée | Q-B1-002 (relevé), Q-B8-005 | Combien de réunions « réellement tenues » ? 2, 3 ou 4 | La guidance dit « convocations **ou** comptes rendus » — le *ou* est le défaut |
| G2 | Politique approuvée le **15/09/2025** (11,6 mois), revue annuelle promise, **jamais tenue** — et une « revue » du 20/08/2025 antérieure à l'approbation | Q-B1-005 | 1 « à la lettre » (aucune revue depuis l'approbation) contre 3 (la revue annuelle n'est pas encore due) | **Défaut d'ancre planté** : l'ancre ne prévoit pas la politique jeune — à réécrire |
| G3 | Registre : à jour (11/07), propriétaires nommés, **a servi** à une décision tracée (04/06) — mais **4 systèmes « en cours » depuis janvier** | Q-B9-003 | 5 contre 3 — les deux ancres sont vraies en même temps | **Conflit d'ancres planté** : « incomplet » (3) contre « servi à une décision » (5) |
| G4 | 19 rôles écrits sur 23 = **83 %** | Q-B9-004 | Aucune — 83 < 90 → 3, mécanique | Question témoin : si ELLE diverge, le problème est le coteur, pas l'ancre |
| G5 | Assistant documentaire : modèle du marché **affiné** + diffusé **sous la marque du groupe** — mais interne seulement, jamais mis à disposition de tiers | Q-B9-005, section 9 du dossier | `ponctuel` contre `jamais`, et surtout la qualification elle-même | La bascule art. 25 en zone grise réelle : affinage = modification substantielle ? usage interne = mise en service ? |
| G6 | Mention « Assistant automatisé » **corps 10, gris clair sur blanc** | Q-B9-008 contre Q-B9-009 | 5 sur l'existence, 2-3 sur la clarté — les coteurs peuvent écraser les deux questions l'une sur l'autre | Le couple existence/qualité fait-il doublon ou distingue-t-il vraiment ? |
| G7 | Seuil 35 : rejet **automatique** avec courriel type — AIPD signée le prévoyant, mesure **non mise en œuvre** | Q-B9-010 | `oui_sans_garantie` (0, drapeau) contre `oui_avec_garanties` (3) | Une garantie documentée mais non appliquée est-elle une garantie ? L'option doit le dire |
| G8 | AIPD : une **faite et datée avant** service, une **en suspens** depuis 10/2025, **4 jamais examinées** | Q-B8-003 | 5, 3 ou 1 selon le système que le coteur choisit de regarder | **Défaut d'agrégation planté** : l'ancre ne dit pas comment coter un parc hétérogène — à réécrire |
| G9 | Formés : **32 %** de l'effectif total, **85 %** des 210 utilisateurs identifiés — et des utilisateurs réels hors des 210 (planificateurs, techniciens) | Q-B5-003 | 3 contre 5 selon le dénominateur | La guidance impose le dénominateur « utilisateurs réels » — les 210 le sont-ils ? |
| G10 | Module depuis 03/2026, session comité exécutif 19/06/2026 — mais 4 planificateurs sur 4 jamais formés, 3 ignorent le module | Q-B5-001 | `mesures_suivies` (5) contre `sensibilisation` (3) | Obligation de moyens : jusqu'où le terrain peut-il contredire le dispositif ? |
| G11 | Revue d'accès du 28/05 avec 3 retraits — mais **clé d'API d'août 2024 jamais renouvelée** dans des carnets | Q-B4-010 contre Q-B4-012 | 5 sur l'une, `oui` + drapeau sur l'autre — tentation de lisser | Deux questions voisines doivent pouvoir dire deux choses opposées sur la même entreprise |
| G12 | Transit chiffré, **partage réseau source non chiffré** | Q-B4-011 | `complet` contre `transit` | La guidance dit « le stockage d'appoint compte comme du repos » — lecture de guidance |
| G13 | 3 agences modifient tous les jours, la 4ᵉ « ne touche plus » ; mandat = fiche de poste sans citer l'outil | Q-B5-005, Q-B2-004 | 3 contre 5, et **que fait-on de l'agence 4 ?** | L'agrégation multi-unités — la banque n'a pas de règle, il en faudra une |
| G14 | Aucun examen écrit de l'art. 5, « le classement en tient lieu » — mais l'outil de reconnaissance d'émotions a été **arrêté** en 09/2025 | Q-B9-007 | `non` + drapeau contre l'envie de valoriser le bon comportement | Le `yes_no` sans nuance : un comportement conforme sans examen écrit reste un « non » — l'assumer ou changer le type |
| G15 | Rapport de mise à l'épreuve **refusé** (confidentialité), existence confirmée par deux fonctions | pas de question socle dédiée (D-B4-025 non retenue) | Les coteurs chercheront où le mettre — et ne trouveront pas | Trou de couverture assumé de la vague 2 : le fait planté vérifie qu'il est réellement assumé |
| G16 | 4 agences visitées sur 150 unités, 2 régions sur 12 | toutes | Aucune note, mais le malaise doit apparaître | La banque cote des faits, la couverture est portée par la mission (03 §27.1) — vérifier que personne n'essaie de la coter |

### 5.3 Après le dépouillement

1. Reporter chaque défaut confirmé dans le tableau de sortie (§3.4), **une ligne par ancre**.
2. Les défauts **plantés volontairement** (T6, G2, G3, G8, et la règle d'agrégation de G13) ont déjà
   leur réécriture à prévoir : ils sont dans les dossiers précisément pour être confirmés par
   l'exercice avant d'être corrigés.
3. Corriger les CSV, re-passer la grille de contrôle, commiter. **Ne pas corriger les ancres en
   cours d'exercice** : tout se corrige après, d'un bloc, sinon les deux grilles ne sont plus
   comparables.

---

*Les deux dossiers sont fictifs de bout en bout. Toute ressemblance serait fortuite — et surtout,
toute correspondance avec un client réel serait une violation de l'invariant 2 : si un lecteur
croit reconnaître quelqu'un, c'est le dossier qu'on réécrit.*
