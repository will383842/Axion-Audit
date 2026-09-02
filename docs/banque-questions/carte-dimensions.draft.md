# CARTE DES DIMENSIONS À COUVRIR — banque de questions

**Date : 2026-08-31** · Auteur : agent ARCHITECTE du chantier « banque de questions »

> ## BROUILLON — non validé — aucune question, dimensions uniquement
>
> Ce document ne contient **aucune question**, **aucune ancre de cotation**, **aucun barème**.
> Il liste les **thèmes** qu'un audit professionnel doit établir, avec leur source, pour que la
> rédaction des questions (`modele-a-remplir.csv`) sache ce qu'elle doit couvrir et ce qu'elle
> laisse de côté sciemment. Il doit être arbitré par un humain avant toute rédaction.

---

## Les quatre référentiels balayés — versions exactes

| # | Référentiel | Version retenue |
| - | ----------- | --------------- |
| 1 | **Règlement (UE) 2024/1689** — « AI Act » | Publié au JOUE le 12/07/2024, en vigueur le 01/08/2024, **tel que modifié par le règlement (UE) 2026/1744** (« omnibus numérique sur l'IA », du 08/07/2026, publié au JOUE le 24/07/2026, **en vigueur depuis le 27/07/2026**) |
| 2 | **ISO/IEC 42001:2023** — Système de management de l'IA | Première édition, décembre 2023 (clauses 4 à 10 + Annexe A, 38 contrôles) |
| 3 | **Règlement (UE) 2016/679** — RGPD | Version consolidée en vigueur |
| 4 | **NIST AI RMF 1.0** — NIST AI 100-1 | Janvier 2023 (fonctions GOVERN, MAP, MEASURE, MANAGE) |

---

## ⚠️ Trois avertissements à lire avant d'utiliser ce document

### 1. ISO/IEC 42001 est une norme **payante** — je n'ai pas son texte intégral

La structure des clauses 4 à 10 et la numérotation des 38 contrôles de l'Annexe A (A.2.2 à A.10.4)
sont largement documentées publiquement et ont été **recoupées** ici sur des sources tierces
concordantes. En revanche, **le libellé exact et surtout la portée précise de chaque contrôle ne
sont pas vérifiables sans le texte acheté.** Règle appliquée dans ce document :

- `sûre` — le numéro et l'intitulé du contrôle recouvrent **littéralement** la dimension ;
- `à vérifier` — le rattachement est **interprétatif** : la dimension est juste, le contrôle cité
  est le plus probable, mais un lecteur du texte officiel pourrait le rattacher ailleurs.

**Action recommandée avant validation : acquérir ISO/IEC 42001:2023 et repasser la colonne Source
de toutes les lignes ISO marquées `à vérifier`.**

### 2. Le calendrier de l'AI Act a **bougé le 27/07/2026** — un mois avant ce document

Le règlement (UE) 2026/1744 a **reporté** la quasi-totalité des obligations relatives aux systèmes
à haut risque. Au **31/08/2026**, l'état réel est le suivant :

| État au 31/08/2026 | Contenu |
| ------------------ | ------- |
| **APPLICABLE** | Art. 5 (pratiques interdites, depuis le 02/02/2025) · Art. 4 (littératie IA, **réécrit** par l'omnibus en obligation de moyens, depuis le 02/02/2025) · Art. 51 à 56 (modèles d'IA à usage général, depuis le 02/08/2025) · **Art. 50 (transparence), depuis le 02/08/2026** · Chapitre VII (gouvernance) · Art. 99 (sanctions) |
| **PAS ENCORE — 02/12/2026** | Fin du sursis de l'art. 50(2) pour les systèmes déjà sur le marché au 02/08/2026 · deux nouvelles interdictions ajoutées à l'art. 5 (contenus intimes non consentis, matériel pédocriminel) |
| **PAS ENCORE — 02/12/2027** | **Tout le chapitre III** pour les systèmes autonomes de l'**annexe III** : art. 8 à 27 (dont art. 26 déployeur et art. 27 AIDF), art. 43, 47, 48, 49 — et, en pratique, art. 72 et 73 |
| **PAS ENCORE — 02/08/2028** | Systèmes à haut risque intégrés à des produits réglementés (**annexe I**) |

**Conséquence directe pour la banque de questions** : au 31/08/2026, une question qui demande à une
entreprise si elle a réalisé son AIDF (art. 27) ou enregistré son système dans la base européenne
(art. 49) porte sur une obligation **non encore exigible**. Elle reste utile — en anticipation — mais
elle **ne peut pas être `bloquant`** et le rapport doit dire qu'il s'agit d'une préparation, pas d'un
manquement. La colonne **Applicabilité** porte cette information ligne par ligne.

### 3. Ce document ne remplace pas un avis juridique

Une référence fausse est pire qu'une référence absente. Aucun numéro d'article ou de clause n'a été
inventé. Là où aucun référentiel ne couvre une dimension pourtant nécessaire, la source est écrite
`jugement professionnel — à valider` et la ligne est regroupée en fin de document pour arbitrage.

---

## Conventions des colonnes

- **ID** — `D-B<bloc>-<n°>`, compteur par bloc à partir de 001.
- **Nature** — `obligation légale` (AI Act, RGPD) · `exigence normative` (ISO 42001) ·
  `bonne pratique` (NIST AI RMF, non contraignant) · `jugement professionnel`.
- **Applicabilité** — `socle` = vaut pour **toute** entreprise auditée, quels que soient son secteur,
  sa taille et ses systèmes. `conditionnée : <critère>` sinon. **Le socle est notre priorité absolue.**
  Pour les dimensions AI Act, le report est noté `→ 02/12/2027` etc.
- **Rôle AI Act** — `fournisseur` · `déployeur` · `les deux` · `s.o.`
- **Collecte** — `relevé` = un fait à constater, **qui ne se cote jamais** · `jugement` = une
  appréciation qui se cote. L'inventaire ne se cote pas ; ce qu'on en déduit se cote.
- **Confiance** — `sûre` · `à vérifier`.

## Chiffres du brouillon

**199 dimensions** au total.

| bloc_1 | bloc_2 | bloc_3 | bloc_4 | bloc_5 | bloc_6 | bloc_7 | bloc_8 | bloc_9 |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| 20 | 17 | 29 | 29 | 19 | 12 | 14 | 25 | 34 |

- **Applicabilité** — 137 `socle` · 62 `conditionnée` (dont 9 conditionnées juridiquement mais
  recommandées comme socle en bonne pratique).
- **Nature** — 77 obligation légale · 55 exigence normative · 44 bonne pratique · 23 jugement professionnel.
- **Collecte** — 82 `relevé` (jamais cotés) · 117 `jugement` (cotables).
- **Confiance** — 148 `sûre` · 28 `à vérifier` · 23 sans objet (dimensions sans source).
- **38 dimensions portent une obligation AI Act NON exigible au 31/08/2026.**

---

# bloc_1 — Cadrage stratégique

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B1-001 | Existence d'une intention IA formalisée | Qu'il existe, ou non, un document écrit portant l'ambition IA de l'organisation | ISO 42001 cl. 4.1 · NIST AI RMF MAP 1.3 | exigence normative | socle | s.o. | relevé | sûre |
| D-B1-002 | Alignement de l'IA avec la mission et la stratégie de l'organisation | Que les usages IA servent les objectifs déclarés de l'entreprise et non l'inverse | NIST AI RMF MAP 1.3 · ISO 42001 cl. 4.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B1-003 | Politique IA écrite et approuvée par la direction | L'existence d'une politique IA formelle, datée et validée au bon niveau | ISO 42001 cl. 5.2 · ISO 42001 A.2.2 | exigence normative | socle | s.o. | relevé | sûre |
| D-B1-004 | Cohérence de la politique IA avec les autres politiques internes | Que la politique IA ne contredit ni la politique sécurité, ni la politique RH, ni la charte informatique | ISO 42001 A.2.3 | exigence normative | socle | s.o. | jugement | sûre |
| D-B1-005 | Revue périodique de la politique IA | Qu'un cycle de revue existe et qu'il a effectivement tourné | ISO 42001 A.2.4 · ISO 42001 cl. 9.3 | exigence normative | socle | s.o. | jugement | sûre |
| D-B1-006 | Périmètre du système de management de l'IA | Ce qui est dans le champ du dispositif et ce qui en est explicitement exclu | ISO 42001 cl. 4.3 | exigence normative | conditionnée : organisation visant ou revendiquant un SMIA | s.o. | relevé | sûre |
| D-B1-007 | Identification des parties intéressées et de leurs attentes | Qui a un intérêt légitime dans les usages IA (clients, salariés, régulateur, assureur, financeur) | ISO 42001 cl. 4.2 · NIST AI RMF MAP 1.2 | exigence normative | socle | s.o. | jugement | sûre |
| D-B1-008 | Engagement effectif de la direction générale | Que la direction porte le sujet en actes (arbitrages, budget, présence) et pas seulement en discours | ISO 42001 cl. 5.1 · NIST AI RMF GOVERN 2.3 | exigence normative | socle | s.o. | jugement | sûre |
| D-B1-009 | Attribution nominative des rôles et responsabilités IA | Qu'une fonction identifiée porte le sujet, avec une autorité réelle | ISO 42001 cl. 5.3 · ISO 42001 A.3.2 · NIST AI RMF GOVERN 2.1 | exigence normative | socle | s.o. | jugement | sûre |
| D-B1-010 | Sponsor exécutif et instance de décision IA | L'existence d'un point de décision unique et de sa cadence | NIST AI RMF GOVERN 2.3 · ISO 42001 cl. 5.1 | bonne pratique | socle | s.o. | relevé | sûre |
| D-B1-011 | Appétence et tolérance au risque IA | Ce que l'organisation accepte de risquer, écrit et non implicite | NIST AI RMF GOVERN 1.3 · NIST AI RMF MAP 1.5 · ISO 42001 cl. 6.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B1-012 | Objectifs IA mesurables et planifiés | Que les objectifs sont chiffrés, datés et rattachés à un responsable | ISO 42001 cl. 6.2 · NIST AI RMF MAP 1.4 | exigence normative | socle | s.o. | jugement | sûre |
| D-B1-013 | Ressources allouées (budget, temps, compétences) | Que l'ambition affichée est financée | ISO 42001 cl. 7.1 · ISO 42001 A.4.2 | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B1-014 | Connaissance du cadre légal et réglementaire applicable à l'IA | Que l'organisation sait quelles règles la concernent — au minimum AI Act et RGPD | NIST AI RMF GOVERN 1.1 · AI Act art. 4 | bonne pratique | socle | les deux | jugement | sûre |
| D-B1-015 | Qualification du rôle de l'organisation dans la chaîne de valeur IA | Si l'organisation est fournisseur, déployeur, importateur ou distributeur — la question qui commande tout le reste de l'AI Act | AI Act art. 3(3) · AI Act art. 3(4) · AI Act art. 25 | obligation légale | socle | les deux | relevé | sûre |
| D-B1-016 | Culture du risque et posture « sécurité d'abord » | Si la remontée d'un problème est valorisée ou pénalisée dans l'organisation | NIST AI RMF GOVERN 4.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B1-017 | Examen d'alternatives non-IA avant engagement | Que le recours à l'IA a été comparé à une solution plus simple | NIST AI RMF MANAGE 2.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B1-018 | Communication interne et externe sur les usages IA | Ce que l'organisation dit de son IA, à qui, et si c'est exact | ISO 42001 cl. 7.4 · ISO 42001 A.8.5 | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B1-019 | Veille sur l'état de l'art et le positionnement du secteur | Que l'organisation sait où elle se situe par rapport à ses pairs | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B1-020 | Écart entre la maturité déclarée et la maturité constatée | Le décalage entre le discours de la direction et ce que l'audit observe sur le terrain — l'un des constats les plus utiles du rapport | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |

---

# bloc_2 — Cartographie des processus

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B2-001 | Inventaire des processus métier de l'organisation | La liste des processus, leur propriétaire et leur périmètre | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B2-002 | Écart entre le circuit officiel et le circuit réellement pratiqué | Comment le travail se fait vraiment, par-delà la procédure affichée | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B2-003 | Volumétrie et fréquence des tâches par processus | Le gisement réel — sans volume, pas de gain | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B2-004 | Part de tâches répétitives à faible valeur ajoutée | Où se trouve le temps récupérable | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B2-005 | Points de décision humaine dans le processus | Où un humain tranche, et avec quelle marge réelle | AI Act art. 14 · NIST AI RMF MAP 3.5 | obligation légale | socle | les deux | jugement | sûre |
| D-B2-006 | Interfaces entre processus et systèmes d'information | Les ruptures de charge, les ressaisies, les exports manuels | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B2-007 | Inventaire des systèmes d'IA déjà en service | La liste exhaustive et tenue à jour des systèmes d'IA utilisés ou fournis — la pierre angulaire de tout le reste | NIST AI RMF GOVERN 1.6 · ISO 42001 A.4.2 | bonne pratique | socle | les deux | relevé | sûre |
| D-B2-008 | Recensement de l'IA non déclarée (outils grand public utilisés par les équipes) | L'écart entre l'inventaire officiel et les usages réels — presque toujours non nul | NIST AI RMF GOVERN 1.6 · ISO 42001 A.9.2 | bonne pratique | socle | déployeur | relevé | à vérifier |
| D-B2-009 | Contexte de déploiement documenté par système | La finalité, le cadre d'usage et les conditions de fonctionnement prévues | NIST AI RMF MAP 1.1 · ISO 42001 A.9.4 | bonne pratique | socle | les deux | relevé | sûre |
| D-B2-010 | Goulots d'étranglement et délais de traitement | Où le processus bloque, mesuré et non supposé | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B2-011 | Coût complet des processus candidats | La base de calcul de tout retour sur investissement ultérieur | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B2-012 | Dépendances envers des prestataires dans le processus | Ce qui n'est pas maîtrisé en interne | NIST AI RMF GOVERN 6.1 · ISO 42001 A.10.3 | bonne pratique | socle | s.o. | relevé | sûre |
| D-B2-013 | Traçabilité des décisions prises dans le processus | Si l'on peut reconstituer a posteriori qui a décidé quoi, sur quelle base | AI Act art. 12 · RGPD art. 5(2) | obligation légale | socle | les deux | jugement | sûre |
| D-B2-014 | Processus produisant des effets juridiques ou significatifs sur des personnes | Le déclencheur commun de l'art. 22 RGPD et de l'annexe III de l'AI Act — à repérer tôt | RGPD art. 22 · AI Act annexe III | obligation légale | socle | déployeur | relevé | sûre |
| D-B2-015 | Données consommées et produites par chaque processus | Le lien entre la cartographie des processus et l'audit de la donnée | ISO 42001 A.4.3 · ISO 42001 A.7.2 | exigence normative | socle | s.o. | relevé | à vérifier |
| D-B2-016 | Existence et fraîcheur de la documentation de processus | Si la documentation décrit encore la réalité | ISO 42001 cl. 7.5 | exigence normative | socle | s.o. | jugement | sûre |
| D-B2-017 | Mesure de la performance des processus | S'il existe des indicateurs avant IA, sans lesquels aucun gain ne sera démontrable | NIST AI RMF MEASURE 1.1 | bonne pratique | socle | s.o. | jugement | sûre |

---

# bloc_3 — Audit de la donnée

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B3-001 | Inventaire des sources de données | La liste des jeux de données, leur origine et leur détenteur | ISO 42001 A.4.3 · ISO 42001 A.7.3 · RGPD art. 30 | exigence normative | socle | les deux | relevé | sûre |
| D-B3-002 | Provenance et traçabilité des données | D'où vient chaque jeu de données et par quelles mains il est passé | ISO 42001 A.7.5 · AI Act art. 10(2) | exigence normative | socle | fournisseur | relevé | sûre |
| D-B3-003 | Qualité des données : exactitude, complétude, fraîcheur | Si les données sont utilisables, mesuré et non affirmé | ISO 42001 A.7.4 · AI Act art. 10(3) · RGPD art. 5(1)(d) | obligation légale | socle | fournisseur | jugement | sûre |
| D-B3-004 | Représentativité et pertinence des jeux de données au regard de la finalité | Que les données décrivent bien la population et le cas d'usage visés | AI Act art. 10(3) · NIST AI RMF MAP 2.3 | obligation légale | conditionnée : haut risque annexe III · NON exigible au 31/08/2026 → 02/12/2027 | fournisseur | jugement | sûre |
| D-B3-005 | Examen des biais possibles portés par les données | Que les biais ont été cherchés, pas seulement niés | AI Act art. 10(2) · NIST AI RMF MEASURE 2.11 | obligation légale | conditionnée : haut risque annexe III · NON exigible au 31/08/2026 → 02/12/2027 · **socle en bonne pratique** | fournisseur | jugement | à vérifier |
| D-B3-006 | Mesures de détection, de prévention et d'atténuation des biais | Ce qui est fait des biais identifiés | AI Act art. 10(2) · NIST AI RMF MEASURE 2.11 | obligation légale | conditionnée : haut risque annexe III → 02/12/2027 | fournisseur | jugement | à vérifier |
| D-B3-007 | Opérations de préparation des données (nettoyage, annotation, étiquetage) | Comment la donnée brute devient donnée d'entraînement, et qui l'a touchée | ISO 42001 A.7.6 · AI Act art. 10(2) | exigence normative | conditionnée : organisation entraînant ou affinant un modèle | fournisseur | relevé | sûre |
| D-B3-008 | Documentation des jeux d'entraînement, de validation et de test | Que les trois jeux existent, sont distincts et sont documentés | AI Act art. 10 · AI Act art. 11 + annexe IV · ISO 42001 A.7.2 | obligation légale | conditionnée : haut risque annexe III → 02/12/2027 | fournisseur | relevé | sûre |
| D-B3-009 | Lacunes et insuffisances connues des jeux de données | Ce que les données ne couvrent pas — souvent plus instructif que ce qu'elles couvrent | AI Act art. 10(2) · NIST AI RMF MAP 2.2 | obligation légale | conditionnée : haut risque annexe III → 02/12/2027 | fournisseur | jugement | à vérifier |
| D-B3-010 | Base légale de chaque traitement de données personnelles | Le fondement juridique, identifié traitement par traitement | RGPD art. 6 | obligation légale | conditionnée : traitement de données personnelles (quasi universel) | s.o. | relevé | sûre |
| D-B3-011 | Traitement de catégories particulières de données | Si des données sensibles sont en jeu et sous quelle exception | RGPD art. 9 · AI Act art. 10(5) | obligation légale | conditionnée : données sensibles présentes | fournisseur | relevé | sûre |
| D-B3-012 | Minimisation des données | Que seules les données nécessaires sont collectées et conservées | RGPD art. 5(1)(c) · RGPD art. 25(2) | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-013 | Limitation des finalités et compatibilité des réutilisations | Que les données collectées pour X ne servent pas à Y sans examen | RGPD art. 5(1)(b) · RGPD art. 6(4) | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-014 | Durées de conservation et purge effective | Que les durées sont définies **et** appliquées | RGPD art. 5(1)(e) · RGPD art. 17 | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-015 | Registre des activités de traitement | Son existence, son exhaustivité et sa mise à jour | RGPD art. 30 | obligation légale | conditionnée : art. 30(5) prévoit une dispense limitée sous 250 salariés, rarement applicable en pratique | s.o. | relevé | sûre |
| D-B3-016 | Information des personnes concernées | Ce qui est effectivement dit aux personnes, et quand | RGPD art. 12 · RGPD art. 13 · RGPD art. 14 | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-017 | Exercice effectif des droits des personnes | Qu'une demande d'accès, de rectification ou d'effacement aboutit dans les délais | RGPD art. 15 à art. 21 | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-018 | Transferts de données hors Union européenne et garanties associées | Où les données partent réellement, y compris via les services d'IA utilisés | RGPD art. 44 à art. 49 | obligation légale | socle | s.o. | relevé | sûre |
| D-B3-019 | Contrats de sous-traitance des données | Que chaque sous-traitant est encadré par un acte juridique conforme | RGPD art. 28 · ISO 42001 A.10.3 | obligation légale | socle | s.o. | relevé | sûre |
| D-B3-020 | Qualification de responsabilité conjointe le cas échéant | Si l'organisation est co-responsable avec un partenaire, et avec quelle répartition écrite | RGPD art. 26 | obligation légale | conditionnée : partage de finalités et de moyens avec un tiers | s.o. | relevé | sûre |
| D-B3-021 | Anonymisation et pseudonymisation | Si ces techniques sont employées, correctement, et pas confondues l'une avec l'autre | RGPD art. 4(5) · RGPD art. 32(1)(a) | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-022 | Protection des données dès la conception et par défaut | Que les choix techniques intègrent la protection en amont, pas en rattrapage | RGPD art. 25 | obligation légale | socle | s.o. | jugement | sûre |
| D-B3-023 | Non-réutilisation des données confiées à des services d'IA tiers pour l'entraînement | Ce que le fournisseur du service s'autorise à faire des données saisies — clause contractuelle à lire, pas à supposer | RGPD art. 28(3) · ISO 42001 A.10.3 | obligation légale | socle | déployeur | relevé | sûre |
| D-B3-024 | Droits de propriété intellectuelle sur les données et contenus utilisés | Que l'organisation a le droit d'utiliser ce qu'elle utilise | AI Act art. 53(1)(c) · jugement professionnel — à valider | obligation légale | conditionnée : fournisseur de modèle à usage général — sinon jugement professionnel | fournisseur | jugement | à vérifier |
| D-B3-025 | Résumé suffisamment détaillé des contenus d'entraînement | Publication du résumé exigé des fournisseurs de modèles à usage général | AI Act art. 53(1)(d) | obligation légale | conditionnée : fournisseur de modèle d'IA à usage général · **APPLICABLE depuis le 02/08/2025** | fournisseur | relevé | à vérifier |
| D-B3-026 | Classification de sensibilité des données | Que les données sont étiquetées selon leur criticité, et que l'étiquette gouverne les accès | ISO 42001 A.4.3 · jugement professionnel — à valider | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B3-027 | Propriétaire désigné par jeu de données | Qu'une personne répond de chaque jeu de données | ISO 42001 A.4.3 · jugement professionnel — à valider | exigence normative | socle | s.o. | relevé | à vérifier |
| D-B3-028 | Surveillance de la dérive des données en production | Que l'écart entre les données d'entraînement et les données réelles est mesuré dans le temps | NIST AI RMF MEASURE 2.4 · NIST AI RMF MANAGE 4.1 | bonne pratique | conditionnée : système d'IA en production | les deux | jugement | sûre |
| D-B3-029 | Séparation des environnements et des jeux de données | Que les données de production ne circulent pas librement en test | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |

---

# bloc_4 — Audit technique & sécurité

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B4-001 | Architecture technique des systèmes d'IA documentée | Ce qui compose le système, où il tourne, à quoi il est connecté | AI Act art. 11 + annexe IV · ISO 42001 A.6.2.7 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | fournisseur | relevé | sûre |
| D-B4-002 | Exigences et spécifications du système | Que ce que le système doit faire a été écrit avant d'être construit | ISO 42001 A.6.2.2 · NIST AI RMF MAP 1.6 | exigence normative | socle | fournisseur | jugement | sûre |
| D-B4-003 | Vérification et validation avant mise en service | Que le système a été éprouvé, et sur quels critères d'acceptation | ISO 42001 A.6.2.4 · AI Act art. 9 | exigence normative | socle | fournisseur | jugement | sûre |
| D-B4-004 | Niveaux d'exactitude déclarés et effectivement mesurés | La performance réelle, chiffrée, et la méthode qui l'a produite | AI Act art. 15 · NIST AI RMF MEASURE 2.3 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | fournisseur | jugement | sûre |
| D-B4-005 | Robustesse et résilience aux entrées inattendues et aux pannes | Le comportement du système hors de son cadre nominal | AI Act art. 15 · NIST AI RMF MEASURE 2.5 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | fournisseur | jugement | sûre |
| D-B4-006 | Cybersécurité propre à l'IA (empoisonnement, attaques adverses, extraction de modèle) | Que les menaces spécifiques à l'IA ont été traitées, distinctement de la sécurité informatique générale | AI Act art. 15 · NIST AI RMF MEASURE 2.7 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | fournisseur | jugement | à vérifier |
| D-B4-007 | Journalisation automatique des événements du système | Que le système enregistre son propre fonctionnement | AI Act art. 12 · ISO 42001 A.6.2.8 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | fournisseur | relevé | sûre |
| D-B4-008 | Conservation des journaux et durée retenue | Combien de temps les traces sont gardées et si elles sont exploitables | AI Act art. 19 · AI Act art. 26(6) | obligation légale | conditionnée : haut risque → 02/12/2027 (art. 26(6) : au moins six mois) | les deux | relevé | sûre |
| D-B4-009 | Supervision humaine outillée dans l'interface | Que l'humain dispose des moyens concrets d'intervenir : comprendre, contredire, arrêter | AI Act art. 14 · NIST AI RMF MAP 3.5 · NIST AI RMF GOVERN 3.2 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | fournisseur | jugement | sûre |
| D-B4-010 | Mécanisme de désactivation, de neutralisation ou de retrait | Qu'il existe un moyen d'arrêter le système, testé et connu | NIST AI RMF MANAGE 2.4 · NIST AI RMF GOVERN 1.7 | bonne pratique | socle | les deux | relevé | sûre |
| D-B4-011 | Gestion des versions et des changements de modèle | Que l'on sait quelle version tourne, depuis quand, et ce qui a changé | ISO 42001 cl. 6.3 · ISO 42001 A.6.2.5 · NIST AI RMF MANAGE 4.2 | exigence normative | socle | les deux | relevé | sûre |
| D-B4-012 | Explicabilité et interprétabilité des sorties du système | Ce que l'on est capable de dire sur le pourquoi d'une sortie donnée | NIST AI RMF MEASURE 2.9 · AI Act art. 13 · AI Act art. 86 | bonne pratique | socle | les deux | jugement | sûre |
| D-B4-013 | Surveillance du système en production | Que la performance, la disponibilité et le comportement sont suivis après mise en service | ISO 42001 A.6.2.6 · NIST AI RMF MEASURE 2.4 · NIST AI RMF MANAGE 4.1 | exigence normative | conditionnée : système d'IA en production | les deux | jugement | sûre |
| D-B4-014 | Détection et traitement des incidents liés à l'IA | Qu'un incident IA est reconnu comme tel et suit un circuit défini | ISO 42001 A.8.4 · NIST AI RMF MANAGE 4.3 | exigence normative | socle | les deux | jugement | sûre |
| D-B4-015 | Notification des violations de données personnelles | Que le circuit de notification à l'autorité et aux personnes existe et tient les délais | RGPD art. 33 · RGPD art. 34 | obligation légale | socle | s.o. | jugement | sûre |
| D-B4-016 | Plan de continuité et de reprise en cas de défaillance du système d'IA | Ce qui se passe si le système s'arrête — et si le mode dégradé a été essayé | NIST AI RMF GOVERN 6.2 | bonne pratique | socle | les deux | jugement | sûre |
| D-B4-017 | Sauvegardes et tests de restauration | Que les sauvegardes existent **et** qu'une restauration a été réellement rejouée | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B4-018 | Contrôle d'accès aux modèles, aux données et aux interfaces de programmation | Qui peut accéder à quoi, et sur quelle base ce droit est revu | RGPD art. 32 | obligation légale | socle | s.o. | jugement | sûre |
| D-B4-019 | Chiffrement des données au repos et en transit | L'état réel du chiffrement, y compris vers les services d'IA externes | RGPD art. 32(1)(a) | obligation légale | socle | s.o. | jugement | sûre |
| D-B4-020 | Gestion des secrets et des clés d'accès aux services d'IA | Où vivent les clés d'API, qui les détient, et si elles tournent | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B4-021 | Sécurité de la chaîne d'approvisionnement logicielle et des modèles pré-entraînés | Ce qui est intégré sans avoir été vérifié, modèles téléchargés compris | NIST AI RMF GOVERN 6.1 · NIST AI RMF MANAGE 3.2 · ISO 42001 A.10.3 | bonne pratique | socle | les deux | jugement | sûre |
| D-B4-022 | Ressources système et de calcul disponibles | Que le dimensionnement soutient l'usage prévu | ISO 42001 A.4.5 | exigence normative | conditionnée : système entraîné ou hébergé en interne | s.o. | relevé | sûre |
| D-B4-023 | Outillage et plateformes utilisés | L'inventaire des cadres, bibliothèques et plateformes d'IA en service | ISO 42001 A.4.4 | exigence normative | socle | s.o. | relevé | sûre |
| D-B4-024 | Environnements et jeux d'évaluation documentés | Que les tests reposent sur des jeux stables, décrits et rejouables | NIST AI RMF MEASURE 2.1 · ISO 42001 A.6.2.4 | bonne pratique | conditionnée : organisation développant ou affinant un système | fournisseur | relevé | sûre |
| D-B4-025 | Mise à l'épreuve délibérée du système (tests d'usage détourné) | Que quelqu'un a cherché activement à faire échouer le système | NIST AI RMF MEASURE 2.6 · NIST AI RMF MEASURE 2.7 · AI Act art. 55 | bonne pratique | conditionnée : obligation seulement pour les modèles à usage général présentant un risque systémique (art. 55, applicable) — bonne pratique ailleurs | fournisseur | jugement | à vérifier |
| D-B4-026 | Garde-fous sur les sorties du système (filtrage, vérification, refus) | Ce qui empêche une sortie erronée d'atteindre l'utilisateur ou le client | NIST AI RMF MEASURE 2.5 · jugement professionnel — à valider | bonne pratique | conditionnée : système génératif en production | les deux | jugement | à vérifier |
| D-B4-027 | Marquage machine-lisible des contenus générés | Que les sorties synthétiques portent une marque détectable par une machine | AI Act art. 50(2) | obligation légale | conditionnée : système générant du contenu de synthèse · **APPLICABLE depuis le 02/08/2026** ; sursis jusqu'au 02/12/2026 pour les systèmes déjà sur le marché | fournisseur | relevé | sûre |
| D-B4-028 | Empreinte environnementale du système d'IA | La consommation associée aux usages IA, mesurée ou au moins estimée | NIST AI RMF MEASURE 2.12 · ISO 42001 A.4.5 | bonne pratique | socle | s.o. | jugement | à vérifier |
| D-B4-029 | Traçabilité entre une sortie du système et les données qui l'ont produite | La capacité à remonter d'un résultat contesté jusqu'à son origine | ISO 42001 A.6.2.8 · AI Act art. 12 | exigence normative | socle | les deux | jugement | à vérifier |

---

# bloc_5 — Audit humain & compétences

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B5-001 | Mesures prises pour développer la littératie IA du personnel | Ce que l'organisation fait concrètement pour que ses équipes comprennent l'IA qu'elles emploient. **Obligation de moyens depuis la réécriture de l'art. 4 par le règlement (UE) 2026/1744 — plus une obligation de résultat par individu** | AI Act art. 4 (version 2026/1744) · NIST AI RMF GOVERN 2.2 | obligation légale | socle · **APPLICABLE au 31/08/2026** | les deux | jugement | sûre |
| D-B5-002 | Identification des compétences nécessaires aux activités IA | Que l'organisation sait quelles compétences elle doit détenir | ISO 42001 cl. 7.2 · ISO 42001 A.4.6 | exigence normative | socle | s.o. | jugement | sûre |
| D-B5-003 | Dispositif de formation et son suivi effectif | L'existence d'un plan, et la preuve qu'il a été exécuté | ISO 42001 cl. 7.2 · NIST AI RMF GOVERN 2.2 | exigence normative | socle | les deux | jugement | sûre |
| D-B5-004 | Sensibilisation du personnel aux risques et limites de l'IA | Que les équipes connaissent les modes d'échec des outils qu'elles utilisent | ISO 42001 cl. 7.3 | exigence normative | socle | s.o. | jugement | sûre |
| D-B5-005 | Compétence et autorité des personnes chargées de la supervision humaine | Que celui qui doit pouvoir contredire la machine en a les moyens et le mandat | AI Act art. 26(2) · AI Act art. 14 | obligation légale | conditionnée : haut risque → 02/12/2027 · **socle en bonne pratique** | déployeur | jugement | sûre |
| D-B5-006 | Ressources humaines dédiées à l'IA | Combien de personnes, à quel taux, sur quels rôles | ISO 42001 A.4.6 | exigence normative | socle | s.o. | relevé | sûre |
| D-B5-007 | Pluridisciplinarité des équipes intervenant sur l'IA | Que la décision ne repose pas exclusivement sur un point de vue technique | NIST AI RMF GOVERN 3.1 · NIST AI RMF MAP 1.2 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B5-008 | Canal de remontée des préoccupations sur l'IA | Qu'un salarié peut signaler un problème lié à l'IA sans passer par sa hiérarchie directe | ISO 42001 A.3.3 · NIST AI RMF GOVERN 4.2 | exigence normative | socle | s.o. | relevé | sûre |
| D-B5-009 | Information des travailleurs et de leurs représentants avant déploiement | Que les personnes soumises au système ont été informées, et à quel moment | AI Act art. 26(7) | obligation légale | conditionnée : déploiement d'un système haut risque au travail → 02/12/2027 | déployeur | relevé | sûre |
| D-B5-010 | Information des personnes soumises à une décision assistée par IA | Que la personne concernée sait qu'un système d'IA intervient dans la décision qui la vise | AI Act art. 26(11) · RGPD art. 13 · RGPD art. 14 | obligation légale | conditionnée : art. 26(11) → 02/12/2027 ; obligation RGPD de transparence **déjà applicable** | déployeur | relevé | sûre |
| D-B5-011 | Règles d'usage des outils d'IA générative par les salariés | L'existence d'une charte ou de consignes écrites, et leur portée réelle | ISO 42001 A.9.2 · ISO 42001 A.9.3 | exigence normative | socle | déployeur | relevé | sûre |
| D-B5-012 | Contrôle du respect de ces règles d'usage | Ce qui vérifie que la charte est autre chose qu'un document classé | ISO 42001 A.9.2 | exigence normative | socle | déployeur | jugement | à vérifier |
| D-B5-013 | Acceptabilité et adhésion des utilisateurs internes | Ce que les équipes pensent réellement des outils déployés | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B5-014 | Impact anticipé sur l'emploi et l'évolution des métiers | Ce que l'organisation a examiné, ou évité d'examiner, sur les conséquences humaines | ISO 42001 A.5.5 · jugement professionnel — à valider | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B5-015 | Conduite du changement et accompagnement | Ce qui est prévu entre la décision et l'usage effectif | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B5-016 | Retour d'expérience des utilisateurs vers les équipes techniques | Que la boucle de retour existe et qu'elle produit des effets | NIST AI RMF MEASURE 3.3 · NIST AI RMF GOVERN 5.1 | bonne pratique | socle | les deux | jugement | sûre |
| D-B5-017 | Dépendance à une personne clé | Ce qui s'effondre si une seule personne part | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B5-018 | Formation des dirigeants et des instances de décision | Que ceux qui arbitrent comprennent ce qu'ils arbitrent | NIST AI RMF GOVERN 2.2 · NIST AI RMF GOVERN 2.3 · AI Act art. 4 | obligation légale | socle · **APPLICABLE au 31/08/2026** | les deux | jugement | sûre |
| D-B5-019 | Diversité, équité et accessibilité dans la conception et l'usage | Que les décisions de conception ne reflètent pas un seul profil d'utilisateur | NIST AI RMF GOVERN 3.1 | bonne pratique | socle | les deux | jugement | sûre |

---

# bloc_6 — Cas d'usage

> Bloc volontairement **maigre**. Un cas d'usage est un objet à décrire, pas un domaine à
> réglementer : les référentiels n'en disent presque rien, et l'essentiel de sa matière est traité
> ailleurs (données en bloc 3, technique en bloc 4, arbitrage en bloc 7). Le remplir davantage
> reviendrait à dupliquer d'autres blocs.

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B6-001 | Recensement des cas d'usage candidats | La liste de ce qui est envisagé, indépendamment de ce qui est décidé | NIST AI RMF MAP 1.1 | bonne pratique | socle | s.o. | relevé | sûre |
| D-B6-002 | Origine du cas d'usage (remontée terrain ou décision descendante) | D'où vient l'idée — un prédicteur fiable de son adoption | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B6-003 | Finalité et périmètre d'application visé | Ce que le cas d'usage doit faire, et surtout ce qu'il ne doit pas faire | NIST AI RMF MAP 3.3 · ISO 42001 A.9.4 | bonne pratique | socle | les deux | relevé | sûre |
| D-B6-004 | Bénéfices attendus, documentés | Ce que l'organisation espère en tirer, écrit avant et non reconstruit après | NIST AI RMF MAP 3.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B6-005 | Coûts attendus et risques associés | La contrepartie du bénéfice, examinée au même moment | NIST AI RMF MAP 3.2 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B6-006 | Valeur métier définie ou réévaluée | Que la valeur a été formulée en termes métier, pas en termes techniques | NIST AI RMF MAP 1.4 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B6-007 | Existence d'une alternative non-IA examinée | Que la solution la plus simple a été considérée avant la plus complexe | NIST AI RMF MANAGE 2.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B6-008 | Catégorisation de la tâche et de la méthode de mise en œuvre | Ce que fait réellement le système : classer, prédire, générer, recommander | NIST AI RMF MAP 2.1 | bonne pratique | socle | les deux | relevé | sûre |
| D-B6-009 | Limites de connaissance et hypothèses du système | Ce que le système ne peut pas savoir, explicité | NIST AI RMF MAP 2.2 | bonne pratique | socle | les deux | jugement | sûre |
| D-B6-010 | Qualification préliminaire du cas d'usage au regard de l'AI Act | Le classement provisoire : interdit, haut risque, soumis à transparence, ou minimal — confirmé en bloc 9 | AI Act art. 5 · AI Act art. 6 + annexe III · AI Act art. 50 | obligation légale | socle | les deux | relevé | sûre |
| D-B6-011 | Maturité du cas d'usage (idée, pilote, production) | Où en est chaque cas d'usage réellement, sans confusion entre essai et déploiement | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B6-012 | Cas d'usage abandonnés et motifs de l'abandon | Ce qui a déjà échoué dans cette organisation — l'information la moins volontiers donnée et la plus utile | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |

---

# bloc_7 — Priorisation

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B7-001 | Existence de critères de priorisation explicites | Sur quoi l'organisation décide de faire A avant B, écrit et partagé | NIST AI RMF MANAGE 1.2 · jugement professionnel — à valider | bonne pratique | socle | s.o. | relevé | sûre |
| D-B7-002 | Hiérarchisation des risques par impact et vraisemblance | Que les risques sont classés, pas seulement listés | NIST AI RMF MANAGE 1.2 · ISO 42001 cl. 6.1.2 | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B7-003 | Options de traitement du risque retenues | Ce qui est évité, réduit, transféré ou accepté, et par qui | ISO 42001 cl. 6.1.3 · ISO 42001 cl. 8.3 | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B7-004 | Risques résiduels documentés et formellement acceptés | Que ce qui reste après traitement est écrit et assumé au bon niveau | NIST AI RMF MANAGE 1.4 · ISO 42001 cl. 6.1.3 | bonne pratique | socle | s.o. | relevé | sûre |
| D-B7-005 | Réponses développées pour les risques prioritaires | Que les risques de tête ont une réponse concrète et un responsable | NIST AI RMF MANAGE 1.3 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B7-006 | Atteinte des finalités visées comme critère de poursuite ou d'arrêt | Qu'un système qui n'atteint pas son but peut être arrêté | NIST AI RMF MANAGE 1.1 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B7-007 | Effort de mise en œuvre estimé par chantier | La charge, estimée avec une méthode et non au doigt mouillé | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B7-008 | Dépendances entre chantiers | Ce qui ne peut pas commencer avant qu'autre chose soit fini | jugement professionnel — à valider | jugement professionnel | socle | s.o. | relevé | s.o. |
| D-B7-009 | Capacité d'absorption réelle de l'organisation | Combien de changements simultanés les équipes peuvent encaisser | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B7-010 | Rapport bénéfice sur risque par cas d'usage | La mise en regard explicite des deux, cas par cas | NIST AI RMF MAP 3.1 · NIST AI RMF MAP 3.2 · NIST AI RMF MANAGE 1.2 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B7-011 | Disponibilité des données comme préalable de priorisation | Qu'un chantier n'est pas priorisé si la donnée qui le nourrit n'existe pas | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B7-012 | Contrainte réglementaire comme critère de priorisation | Que les échéances de l'AI Act pèsent dans l'ordre des chantiers | NIST AI RMF GOVERN 1.1 · AI Act art. 113 | bonne pratique | socle | les deux | jugement | à vérifier |
| D-B7-013 | Gains rapides identifiés | Ce qui peut produire un effet visible à court terme, pour tenir la dynamique | jugement professionnel — à valider | jugement professionnel | socle | s.o. | jugement | s.o. |
| D-B7-014 | Traçabilité de l'arbitrage | Que la décision de priorisation est écrite, datée et signée | ISO 42001 cl. 7.5 | exigence normative | socle | s.o. | relevé | sûre |

---

# bloc_8 — Feuille de route & gouvernance

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B8-001 | Feuille de route IA écrite et datée | L'existence d'un plan, avec un horizon et des échéances | ISO 42001 cl. 6.2 | exigence normative | socle | s.o. | relevé | sûre |
| D-B8-002 | Jalons, livrables et responsables par étape | Que le plan est exécutable et non déclaratif | ISO 42001 cl. 6.2 | exigence normative | socle | s.o. | jugement | sûre |
| D-B8-003 | Indicateurs de suivi et valeurs cibles | Ce qui sera mesuré pour dire que le plan avance | ISO 42001 cl. 9.1 · NIST AI RMF MEASURE 1.1 | exigence normative | socle | s.o. | jugement | sûre |
| D-B8-004 | Pertinence des indicateurs, réexaminée dans le temps | Que l'on vérifie périodiquement que l'on mesure la bonne chose | NIST AI RMF MEASURE 1.2 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B8-005 | Instance de gouvernance IA et cadence de réunion | Où les décisions IA se prennent, à quelle fréquence, avec quelles traces | ISO 42001 cl. 5.3 · NIST AI RMF GOVERN 2.1 | exigence normative | socle | s.o. | relevé | sûre |
| D-B8-006 | Revue de direction du dispositif IA | Que la direction réexamine périodiquement le dispositif dans son ensemble | ISO 42001 cl. 9.3 | exigence normative | conditionnée : organisation dotée d'un SMIA — **socle en bonne pratique** | s.o. | jugement | sûre |
| D-B8-007 | Audit interne du dispositif IA | Qu'un regard indépendant, interne, s'exerce sur le dispositif | ISO 42001 cl. 9.2 | exigence normative | conditionnée : organisation dotée d'un SMIA | s.o. | relevé | sûre |
| D-B8-008 | Traitement des non-conformités et actions correctives | Ce qui se passe quand un écart est constaté, et si l'action est suivie jusqu'à clôture | ISO 42001 cl. 10.2 | exigence normative | socle | s.o. | jugement | sûre |
| D-B8-009 | Amélioration continue du dispositif | Que le dispositif évolue au lieu de se figer à sa première version | ISO 42001 cl. 10.1 | exigence normative | socle | s.o. | jugement | sûre |
| D-B8-010 | Maîtrise de l'information documentée | Que les documents sont versionnés, accessibles aux bonnes personnes et conservés | ISO 42001 cl. 7.5 | exigence normative | socle | s.o. | jugement | sûre |
| D-B8-011 | Planification des changements | Qu'un changement du dispositif est préparé et non subi | ISO 42001 cl. 6.3 | exigence normative | socle | s.o. | jugement | sûre |
| D-B8-012 | Processus d'évaluation d'impact des systèmes d'IA | L'existence d'une méthode d'évaluation d'impact, distincte de l'analyse de risque | ISO 42001 A.5.2 · ISO 42001 cl. 6.1.4 | exigence normative | socle | les deux | relevé | à vérifier |
| D-B8-013 | Documentation et conservation des évaluations d'impact | Que les évaluations réalisées sont retrouvables et exploitables | ISO 42001 A.5.3 | exigence normative | socle | les deux | relevé | sûre |
| D-B8-014 | Évaluation de l'impact sur les individus et les groupes | Ce que le système fait aux personnes, examiné explicitement | ISO 42001 A.5.4 · NIST AI RMF MAP 5.1 | exigence normative | socle | les deux | jugement | sûre |
| D-B8-015 | Surveillance et revue périodiques planifiées | Que le rythme de contrôle est décidé à l'avance, pas déclenché par les incidents | NIST AI RMF GOVERN 1.5 | bonne pratique | socle | s.o. | jugement | sûre |
| D-B8-016 | Politique de gestion des tiers et des fournisseurs d'IA | Les règles qui s'appliquent avant de faire entrer un tiers dans le dispositif | NIST AI RMF GOVERN 6.1 · ISO 42001 A.10.3 | bonne pratique | socle | s.o. | relevé | sûre |
| D-B8-017 | Répartition écrite des responsabilités le long de la chaîne de valeur | Qui répond de quoi entre le fournisseur du modèle, l'intégrateur et l'utilisateur final | ISO 42001 A.10.2 · AI Act art. 25 | exigence normative | socle | les deux | relevé | sûre |
| D-B8-018 | Obligations et informations dues aux clients ou utilisateurs aval | Ce que l'organisation transmet à ceux qui utilisent ce qu'elle produit | ISO 42001 A.10.4 · AI Act art. 13 | exigence normative | conditionnée : organisation fournissant un système ou un service intégrant de l'IA | fournisseur | relevé | sûre |
| D-B8-019 | Processus de conception et de développement responsables | Que des objectifs de responsabilité sont fixés en amont du développement | ISO 42001 A.6.1.2 · ISO 42001 A.6.1.3 | exigence normative | conditionnée : organisation développant ou affinant un système | fournisseur | jugement | sûre |
| D-B8-020 | Plan de retrait et de fin de vie des systèmes d'IA | Comment un système est mis hors service proprement, données comprises | NIST AI RMF GOVERN 1.7 · NIST AI RMF MANAGE 2.4 | bonne pratique | socle | les deux | relevé | sûre |
| D-B8-021 | Recueil et intégration du retour externe | Que les retours des utilisateurs, clients ou personnes affectées remontent et sont traités | NIST AI RMF GOVERN 5.1 · NIST AI RMF GOVERN 5.2 | bonne pratique | socle | les deux | jugement | sûre |
| D-B8-022 | Communication externe et rapport public sur l'IA | Ce que l'organisation publie sur ses usages IA, et l'exactitude de ce qu'elle publie | ISO 42001 A.8.3 · ISO 42001 A.8.5 | exigence normative | socle | s.o. | jugement | à vérifier |
| D-B8-023 | Désignation d'un délégué à la protection des données | Si un DPO est requis, s'il est désigné, déclaré, et effectivement associé aux projets IA | RGPD art. 37 · RGPD art. 38 · RGPD art. 39 | obligation légale | conditionnée : cas de désignation obligatoire de l'art. 37(1) — sinon bonne pratique | s.o. | relevé | sûre |
| D-B8-024 | Adhésion à un code de conduite volontaire | Si l'organisation s'est engagée dans un cadre volontaire, et ce que cet engagement implique | AI Act art. 95 | bonne pratique | socle | les deux | relevé | sûre |
| D-B8-025 | Soutenabilité budgétaire pluriannuelle du dispositif | Que le dispositif est financé au-delà de sa première année | ISO 42001 cl. 7.1 · jugement professionnel — à valider | exigence normative | socle | s.o. | jugement | à vérifier |

---

# bloc_9 — Conformité AI Act & registre IA

> **Rappel du calendrier (voir avertissement n° 2)** : au 31/08/2026, les obligations du chapitre III
> (systèmes à haut risque) **ne sont pas exigibles**. Elles sont recensées ici parce qu'un audit
> sérieux prépare l'échéance du 02/12/2027 — mais un écart constaté sur ces lignes est une
> **préparation manquante**, pas un manquement. La distinction doit être visible dans le rapport.

| ID | Dimension | Ce qu'elle établit | Source(s) | Nature | Applicabilité | Rôle AI Act | Collecte | Confiance |
| -- | --------- | ------------------ | --------- | ------ | ------------- | ----------- | -------- | --------- |
| D-B9-001 | Registre interne des systèmes d'IA | L'existence d'un inventaire tenu, daté, complet — le socle sans lequel aucune autre ligne de ce bloc n'est vérifiable | NIST AI RMF GOVERN 1.6 · ISO 42001 A.4.2 | bonne pratique | socle | les deux | relevé | sûre |
| D-B9-002 | Qualification du rôle pour chaque système inventorié | Fournisseur, déployeur, importateur ou distributeur — système par système, car une même organisation peut cumuler les quatre | AI Act art. 3(3) · AI Act art. 3(4) · AI Act art. 23 · AI Act art. 24 | obligation légale | socle | les deux | relevé | sûre |
| D-B9-003 | Bascule de rôle : le déployeur devenu fournisseur | Les trois cas où un déployeur devient fournisseur : apposition de son nom ou de sa marque, modification substantielle, changement de finalité — le piège le plus courant pour une entreprise qui affine un modèle | AI Act art. 25(1) | obligation légale | socle | les deux | jugement | sûre |
| D-B9-004 | Classement de risque de chaque système | Interdit, haut risque, soumis à transparence, ou minimal — la qualification qui commande toutes les obligations suivantes | AI Act art. 5 · AI Act art. 6 + annexe III · AI Act art. 50 | obligation légale | socle | les deux | jugement | sûre |
| D-B9-005 | Absence de pratiques interdites | Qu'aucun système ne relève des interdictions de l'art. 5. Deux interdictions supplémentaires (contenus intimes non consentis, matériel pédocriminel) ont été ajoutées par le règlement (UE) 2026/1744 et deviennent applicables le 02/12/2026 | AI Act art. 5 · règlement (UE) 2026/1744 | obligation légale | socle · **APPLICABLE depuis le 02/02/2025** ; ajouts → 02/12/2026 | les deux | relevé | à vérifier |
| D-B9-006 | Recensement des systèmes relevant des annexes I et III | Lesquels des systèmes inventoriés basculeront en haut risque, et à quelle date | AI Act art. 6 + annexe I + annexe III | obligation légale | conditionnée : présence de systèmes concernés · annexe III → 02/12/2027 · annexe I → 02/08/2028 | les deux | relevé | sûre |
| D-B9-007 | Système de gestion des risques du système à haut risque | Un processus continu et itératif de gestion du risque sur tout le cycle de vie | AI Act art. 9 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | jugement | sûre |
| D-B9-008 | Gouvernance des données d'entraînement, de validation et de test | Les pratiques de gouvernance exigées de l'art. 10 — détaillées en bloc 3 | AI Act art. 10 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | jugement | sûre |
| D-B9-009 | Documentation technique conforme à l'annexe IV | L'existence et la complétude de la documentation technique du système | AI Act art. 11 + annexe IV | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | relevé | sûre |
| D-B9-010 | Enregistrement automatique des événements | La capacité technique de journalisation exigée du système | AI Act art. 12 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | relevé | sûre |
| D-B9-011 | Notice d'utilisation et information fournie au déployeur | Que le fournisseur transmet au déployeur ce qu'il lui faut pour utiliser le système correctement | AI Act art. 13 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | relevé | sûre |
| D-B9-012 | Conception permettant une supervision humaine effective | Que le système est conçu pour être supervisé, et pas seulement accompagné d'une consigne | AI Act art. 14 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | jugement | sûre |
| D-B9-013 | Exactitude, robustesse et cybersécurité | Les trois exigences techniques cumulées de l'art. 15 — détaillées en bloc 4 | AI Act art. 15 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | jugement | sûre |
| D-B9-014 | Système de gestion de la qualité du fournisseur | L'existence d'un SMQ documenté couvrant la conception, le développement et le suivi | AI Act art. 17 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | relevé | sûre |
| D-B9-015 | Conservation de la documentation et des journaux | Les durées de conservation exigées : documentation (art. 18), journaux du fournisseur (art. 19), journaux du déployeur — au moins six mois (art. 26(6)) | AI Act art. 18 · AI Act art. 19 · AI Act art. 26(6) | obligation légale | conditionnée : haut risque → 02/12/2027 | les deux | relevé | sûre |
| D-B9-016 | Actions correctives et devoir d'information | Ce que le fournisseur fait, et à qui il le dit, lorsqu'un système non conforme est déjà sur le marché | AI Act art. 20 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | jugement | sûre |
| D-B9-017 | Coopération avec les autorités compétentes | Que l'organisation sait qui contacter et peut produire ce qui lui sera demandé | AI Act art. 21 · AI Act art. 26(12) | obligation légale | conditionnée : haut risque → 02/12/2027 | les deux | jugement | sûre |
| D-B9-018 | Mandataire établi dans l'Union | Que le fournisseur établi hors UE a désigné un mandataire | AI Act art. 22 | obligation légale | conditionnée : fournisseur établi hors Union · haut risque → 02/12/2027 | fournisseur | relevé | sûre |
| D-B9-019 | Obligations du déployeur d'un système à haut risque | Le paquet de l'art. 26 : usage conforme aux instructions (1), supervision confiée à des personnes compétentes (2), maîtrise des données d'entrée (4), surveillance et signalement (5) | AI Act art. 26 | obligation légale | conditionnée : haut risque → 02/12/2027 | déployeur | jugement | sûre |
| D-B9-020 | Analyse d'impact sur les droits fondamentaux | L'AIDF exigée de certains déployeurs — reportée avec le reste du chapitre III | AI Act art. 27 | obligation légale | conditionnée : déployeurs visés à l'art. 27(1) · **NON exigible au 31/08/2026** → 02/12/2027 | déployeur | jugement | sûre |
| D-B9-021 | Évaluation de la conformité, déclaration UE et marquage CE | Le parcours de mise en conformité formelle du système à haut risque | AI Act art. 43 · AI Act art. 47 · AI Act art. 48 | obligation légale | conditionnée : haut risque → 02/12/2027 | fournisseur | relevé | sûre |
| D-B9-022 | Enregistrement dans la base de données de l'Union | L'inscription du système et, pour les autorités publiques déployeuses, de leur usage (art. 26(8)). **Le règlement (UE) 2026/1744 a allégé ce dispositif : la portée exacte de l'obligation résiduelle doit être vérifiée sur le texte consolidé** | AI Act art. 49 · AI Act art. 26(8) · règlement (UE) 2026/1744 | obligation légale | conditionnée : haut risque → 02/12/2027 · portée modifiée par l'omnibus | les deux | relevé | à vérifier |
| D-B9-023 | Signalement de l'interaction avec un système d'IA | Que la personne sait qu'elle parle à une machine, sauf évidence manifeste | AI Act art. 50(1) | obligation légale | conditionnée : système interagissant directement avec des personnes · **APPLICABLE depuis le 02/08/2026** | fournisseur | relevé | sûre |
| D-B9-024 | Marquage des contenus de synthèse dans un format lisible par machine | Que les sorties générées sont marquées et détectables automatiquement | AI Act art. 50(2) | obligation légale | conditionnée : système générant du contenu de synthèse · **APPLICABLE depuis le 02/08/2026** ; sursis au 02/12/2026 pour les systèmes déjà sur le marché à cette date | fournisseur | relevé | sûre |
| D-B9-025 | Information en cas de reconnaissance des émotions ou de catégorisation biométrique | Que les personnes exposées à ces systèmes en sont informées | AI Act art. 50(3) | obligation légale | conditionnée : usage d'un tel système · **APPLICABLE depuis le 02/08/2026** | déployeur | relevé | sûre |
| D-B9-026 | Divulgation des hypertrucages et des textes d'information au public | Que le contenu manipulé ou généré diffusé au public est déclaré comme tel | AI Act art. 50(4) | obligation légale | conditionnée : diffusion de tels contenus · **APPLICABLE depuis le 02/08/2026** | déployeur | relevé | sûre |
| D-B9-027 | Clarté, moment et accessibilité de l'information de transparence | Que l'information est donnée dès la première interaction, de façon distinguable et accessible | AI Act art. 50(5) | obligation légale | conditionnée : art. 50 applicable · **APPLICABLE depuis le 02/08/2026** | les deux | jugement | sûre |
| D-B9-028 | Obligations du fournisseur de modèle d'IA à usage général | Documentation technique, information des fournisseurs en aval, politique de respect du droit d'auteur, résumé des contenus d'entraînement | AI Act art. 53 | obligation légale | conditionnée : fournisseur de modèle à usage général · **APPLICABLE depuis le 02/08/2025** | fournisseur | relevé | sûre |
| D-B9-029 | Obligations liées au risque systémique d'un modèle à usage général | Évaluation du modèle, mise à l'épreuve contradictoire, atténuation des risques, signalement des incidents graves, cybersécurité | AI Act art. 55 | obligation légale | conditionnée : modèle à usage général présentant un risque systémique · **APPLICABLE depuis le 02/08/2025** | fournisseur | jugement | sûre |
| D-B9-030 | Surveillance après commercialisation et signalement des incidents graves | Le dispositif de suivi post-déploiement et le circuit de signalement aux autorités | AI Act art. 72 · AI Act art. 73 | obligation légale | conditionnée : haut risque · suit le calendrier du chapitre III → 02/12/2027 | fournisseur | jugement | à vérifier |
| D-B9-031 | Droit à l'explication de la décision individuelle | Que la personne visée par une décision prise sur la base d'un système à haut risque peut en obtenir l'explication | AI Act art. 86 | obligation légale | conditionnée : haut risque annexe III → 02/12/2027 | déployeur | jugement | sûre |
| D-B9-032 | Décision individuelle entièrement automatisée | Le régime RGPD : interdiction de principe, exceptions limitées, garanties dont l'intervention humaine — **déjà applicable, indépendamment de l'AI Act** | RGPD art. 22 | obligation légale | socle · **APPLICABLE** | déployeur | jugement | sûre |
| D-B9-033 | Analyse d'impact relative à la protection des données et son articulation avec l'AIDF | Que l'AIPD est réalisée quand elle est due, et que le déployeur sait qu'il peut s'appuyer sur l'information fournie au titre de l'art. 13 (art. 26(9)) et sur l'AIPD pour l'AIDF (art. 27(4)) | RGPD art. 35 · RGPD art. 36 · AI Act art. 26(9) · AI Act art. 27(4) | obligation légale | conditionnée : risque élevé au sens de l'art. 35 RGPD — **APPLICABLE** ; l'articulation AI Act suit le 02/12/2027 | déployeur | jugement | à vérifier |
| D-B9-034 | Connaissance de l'exposition aux sanctions | Que l'organisation sait quel régime de sanctions la vise et à quelle hauteur | AI Act art. 99 | obligation légale | socle · **APPLICABLE** | les deux | jugement | sûre |

---

---

# I. Exigences sans bloc d'accueil

Ces exigences existent dans les quatre référentiels et **ne rentrent proprement dans aucun des neuf
blocs**. Elles sont listées franchement : certaines sont hors périmètre assumé, d'autres révèlent
un vrai trou de découpage.

## I.1 — Trois trous réels dans le découpage

**A. Les droits et recours des personnes soumises à un système d'IA n'ont pas de bloc.**
Elles sont aujourd'hui rangées de force en bloc 9, qui est un bloc de **registre et de conformité
documentaire** — un bloc que l'auditeur remplit en lisant des documents, pas en rencontrant des
personnes. Or ces exigences se vérifient auprès des personnes concernées :
- AI Act art. 85 (droit de déposer une plainte auprès d'une autorité de surveillance du marché) ;
- AI Act art. 86 (droit à l'explication) — actuellement en D-B9-031 ;
- RGPD art. 15 à 21 (exercice des droits) — actuellement en D-B3-017 ;
- AI Act art. 26(11) (information des personnes visées) — actuellement en D-B5-010.
**Ces quatre lignes vivent aujourd'hui dans trois blocs différents.** Un audit ne peut pas conclure
sur « la personne est-elle protégée » sans les recoller. *Recommandation : soit créer un dixième
bloc « Personnes concernées et recours », soit assumer explicitement qu'elles restent éclatées et
que le rapport les rassemble à la génération.*

**B. Les impacts sociétaux et environnementaux n'ont pas de bloc.**
- ISO 42001 A.5.5 (évaluation des impacts sociétaux) — logé provisoirement en D-B5-014 ;
- NIST AI RMF MEASURE 2.12 (impact environnemental et durabilité) — logé provisoirement en D-B4-028.
Les deux sont mal logés : l'un dans les compétences humaines, l'autre dans la sécurité technique.
Aucun des neuf blocs ne porte la responsabilité extra-organisationnelle. *Pour un cabinet d'audit
qui vend un diagnostic à des entreprises soumises par ailleurs à des obligations extra-financières,
c'est une lacune commercialement significative.*

**C. La chaîne de valeur contractuelle est éclatée sur trois blocs.**
ISO 42001 A.10.2, A.10.3, A.10.4, NIST GOVERN 6.1/6.2, MANAGE 3.1/3.2, RGPD art. 28 et AI Act
art. 25 décrivent tous **la même relation** — ce que l'organisation confie à un tiers et ce dont
elle reste responsable. Ces exigences sont aujourd'hui réparties entre le bloc 3 (contrats de
données), le bloc 4 (chaîne d'approvisionnement logicielle) et le bloc 8 (politique fournisseurs).
Un auditeur devra poser trois fois des questions voisines au même interlocuteur.

## I.2 — Exigences hors périmètre, à écarter explicitement

| Exigence | Source | Pourquoi elle n'a pas de bloc |
| -------- | ------ | ----------------------------- |
| Bacs à sable réglementaires | AI Act art. 57 à 59 (échéance de mise en place repoussée au 02/08/2027 par le règlement 2026/1744 — *à vérifier*) | Concerne les États membres, pas l'entreprise auditée. À écarter. |
| Essais en conditions réelles hors bac à sable | AI Act art. 60 · art. 61 | Ne concerne qu'un fournisseur menant des essais encadrés. Population marginale. |
| Mesures en faveur des PME et jeunes pousses | AI Act art. 62 | C'est un **droit** offert à l'entreprise, pas une obligation. Pourrait nourrir une recommandation de rapport, pas une cotation. |
| Obligations détaillées des importateurs et distributeurs | AI Act art. 23 · art. 24 | Le bloc 9 ne couvre que la **qualification** du rôle (D-B9-002), pas les obligations qui en découlent. Trou assumé tant que le cabinet n'audite pas d'importateurs. |
| Organismes notifiés et notification | AI Act chapitre III section 4 | Concerne les organismes d'évaluation, jamais l'entreprise auditée. À écarter. |
| Traitements à des fins de recherche scientifique ou statistique | RGPD art. 89 | Population très marginale dans notre cible. |
| Évaluations impliquant des sujets humains | NIST AI RMF MEASURE 2.2 | Suppose un protocole d'expérimentation humaine : hors du champ d'un diagnostic d'entreprise. |
| Assurance et transfert du risque IA vers un assureur | *aucun référentiel* | Aucun des quatre référentiels ne l'aborde. Question de plus en plus posée par les dirigeants. À arbitrer. |

---

# II. Dimensions sans source — `jugement professionnel`, pour arbitrage humain

**23 dimensions** ne s'appuient sur aucun des quatre référentiels et reposent sur le jugement
professionnel de l'auditeur. Chacune doit être **validée ou retirée par un humain** avant rédaction :
une dimension sans source est une dimension que le cabinet devra défendre seul devant un client.

| Bloc | Dimensions concernées |
| ---- | --------------------- |
| bloc_1 | D-B1-019 (veille et positionnement sectoriel) · D-B1-020 (écart maturité déclarée / constatée) |
| bloc_2 | D-B2-001 (inventaire des processus) · D-B2-002 (circuit réel vs officiel) · D-B2-003 (volumétrie) · D-B2-004 (tâches répétitives) · D-B2-006 (interfaces SI) · D-B2-010 (goulots d'étranglement) · D-B2-011 (coût complet) |
| bloc_3 | D-B3-029 (séparation des environnements) |
| bloc_4 | D-B4-017 (sauvegardes et tests de restauration) · D-B4-020 (gestion des secrets et clés d'API) |
| bloc_5 | D-B5-013 (acceptabilité utilisateurs) · D-B5-015 (conduite du changement) · D-B5-017 (dépendance à une personne clé) |
| bloc_6 | D-B6-002 (origine du cas d'usage) · D-B6-011 (maturité du cas d'usage) · D-B6-012 (cas d'usage abandonnés) |
| bloc_7 | D-B7-007 (effort estimé) · D-B7-008 (dépendances entre chantiers) · D-B7-009 (capacité d'absorption) · D-B7-011 (disponibilité des données comme préalable) · D-B7-013 (gains rapides) |
| bloc_9 | *aucune* |

**Deux observations pour l'arbitre.**
1. **Le bloc 2 est à 7 dimensions sur 17 sans source, et le bloc 7 à 5 sur 14.** Ce n'est pas un
   défaut : ces deux blocs relèvent du métier d'auditeur-conseil, pas de la conformité. Aucun
   référentiel ne dit comment cartographier un processus ou comment prioriser un portefeuille.
   Mais cela signifie que **la crédibilité de ces deux blocs repose entièrement sur la méthode du
   cabinet** et devra être défendue autrement que par une citation.
2. Trois dimensions de sécurité classique (D-B4-017, D-B4-020) sont sans source **dans les quatre
   référentiels retenus** alors qu'elles sont couvertes par ISO/IEC 27001. *Si le cabinet veut les
   sourcer, le référentiel à ajouter est ISO/IEC 27001:2022 — c'est une décision de périmètre à
   remonter, pas une décision d'architecte.*

---

# III. Recouvrements — là où deux référentiels demandent la même chose

Signalés pour une raison opératoire : **coter deux fois le même fait sur deux échelles différentes
fausse le score de la mission.** Chaque recouvrement ci-dessous doit donner lieu à **une seule
question**, portant plusieurs sources dans sa `guidance_fr`.

| # | Le même fait | Vu par | Dimensions concernées | Traitement recommandé |
| - | ------------ | ------ | --------------------- | --------------------- |
| R1 | Gouvernance et responsabilités IA | ISO 42001 cl. 5.1-5.3 + A.3.2 · NIST GOVERN 2.1-2.3 | D-B1-008, D-B1-009, D-B1-010, D-B8-005 | Une question sur la désignation, une sur l'autorité réelle. Ne pas dédoubler par référentiel. |
| R2 | Politique IA écrite | ISO 42001 cl. 5.2 + A.2.2 · NIST GOVERN 1.4 | D-B1-003 | Une seule question. ISO fait référence : elle est plus précise. |
| R3 | Inventaire des systèmes d'IA | NIST GOVERN 1.6 · ISO 42001 A.4.2 · (prérequis de fait de l'AI Act art. 49) | D-B2-007, D-B9-001 | **Recouvrement interne au découpage** : la même chose apparaît en bloc 2 et en bloc 9. Une seule question, en bloc 9, référencée depuis le bloc 2. |
| R4 | Appréciation et traitement du risque | ISO 42001 cl. 6.1.2-6.1.3 · NIST MANAGE 1.2-1.4 · AI Act art. 9 | D-B7-002, D-B7-003, D-B7-004, D-B9-007 | Une question générique (socle) + une question spécifique art. 9 conditionnée au haut risque. |
| R5 | Évaluation d'impact | ISO 42001 A.5.2-A.5.4 · AI Act art. 27 · RGPD art. 35 · NIST MAP 5.1 | D-B8-012, D-B8-013, D-B8-014, D-B9-020, D-B9-033 | **Le recouvrement le plus coûteux.** Trois évaluations d'impact distinctes juridiquement mais largement redondantes en pratique — l'art. 27(4) prévoit lui-même l'appui sur l'AIPD. Une question sur le fait qu'une évaluation existe, une sur sa couverture juridique. |
| R6 | Qualité et gouvernance des données | AI Act art. 10 · ISO 42001 A.7.2-A.7.6 · RGPD art. 5(1)(d) | D-B3-002 à D-B3-009 | Sources cumulées sur les mêmes questions ; le conditionnement AI Act est porté par la colonne `niveaux` / la condition de haut risque, pas par une question séparée. |
| R7 | Journalisation et traçabilité | AI Act art. 12 + art. 19 + art. 26(6) · ISO 42001 A.6.2.8 | D-B4-007, D-B4-008, D-B4-029, D-B9-010, D-B9-015 | Trois angles réellement distincts : capacité technique, durée de conservation, exploitabilité. Ne pas fusionner, mais ne pas coter la capacité deux fois. |
| R8 | Supervision humaine | AI Act art. 14 + art. 26(2) · NIST MAP 3.5 + GOVERN 3.2 | D-B2-005, D-B4-009, D-B5-005, D-B9-012 | Trois angles : le point de décision (bloc 2), l'outillage (bloc 4), la compétence du superviseur (bloc 5). Découpage sain, à conserver — mais l'auditeur doit savoir que c'est le même sujet. |
| R9 | Surveillance en production et dérive | ISO 42001 A.6.2.6 · NIST MEASURE 2.4 + MANAGE 4.1 · AI Act art. 26(5) + art. 72 | D-B3-028, D-B4-013, D-B9-030 | Une question sur le dispositif de surveillance, une sur la dérive des données spécifiquement. |
| R10 | Incidents | ISO 42001 A.8.4 · NIST MANAGE 4.3 · AI Act art. 73 · RGPD art. 33-34 | D-B4-014, D-B4-015, D-B9-030 | **Quatre régimes de signalement, quatre destinataires, quatre délais.** Une seule question sur l'existence du circuit ; le détail des destinataires relève de la `guidance_fr`, pas de quatre questions. |
| R11 | Gestion des tiers et de la chaîne d'approvisionnement | ISO 42001 A.10.2-A.10.4 · NIST GOVERN 6.1-6.2 + MANAGE 3.1-3.2 · RGPD art. 28 · AI Act art. 25 | D-B2-012, D-B3-019, D-B3-023, D-B4-021, D-B8-016, D-B8-017, D-B8-018 | **Sept dimensions pour une seule relation** (voir trou C ci-dessus). À rationaliser avant rédaction : risque élevé de lasser l'interlocuteur. |
| R12 | Formation et compétences | AI Act art. 4 · ISO 42001 cl. 7.2-7.3 + A.4.6 · NIST GOVERN 2.2 | D-B5-001, D-B5-002, D-B5-003, D-B5-004, D-B5-018 | L'art. 4 étant devenu une **obligation de moyens**, la question ne peut plus porter sur un niveau atteint mais sur les mesures prises. Un seul fait coté. |
| R13 | Transparence envers les personnes | AI Act art. 50 + art. 26(11) + art. 86 · RGPD art. 12-14 + art. 22 | D-B5-010, D-B9-023 à D-B9-027, D-B9-031, D-B9-032 | Les régimes AI Act et RGPD se superposent avec des déclencheurs différents. Une question par **situation vécue** (interaction, contenu généré, décision subie), pas une par article. |
| R14 | Explicabilité | NIST MEASURE 2.9 · AI Act art. 13 + art. 86 · RGPD art. 15(1)(h) *(à vérifier)* | D-B4-012, D-B9-031 | Une question technique (bloc 4), une question de droit des personnes (bloc 9). |

---

## Ce qui reste à faire avant de rédiger la première question

1. **Arbitrer les trois trous de découpage** (section I.1) : dixième bloc, ou éclatement assumé.
2. **Valider ou retirer les 24 dimensions sans source** (section II).
3. **Trancher l'ajout d'ISO/IEC 27001:2022** comme cinquième référentiel, ou assumer que la sécurité
   classique reste en jugement professionnel.
4. **Acquérir ISO/IEC 42001:2023** et repasser toutes les lignes ISO marquées `à vérifier`.
5. **Décider comment la colonne `Applicabilité` se traduit dans le CSV** : le modèle actuel offre
   `secteurs`, `services_cibles`, `niveaux`, `effectif_min`/`effectif_max` — **mais rien pour
   conditionner une question à la classe de risque AI Act ni au rôle fournisseur/déployeur.**
   C'est un manque du format, pas de la carte. À remonter au chantier technique.
6. **Décider du traitement des obligations reportées au 02/12/2027** : questions posées mais non
   bloquantes, ou questions réservées à un niveau d'audit spécifique.

*Fin du brouillon. Aucune question n'a été rédigée.*
