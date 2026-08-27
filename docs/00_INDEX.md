# 00 — INDEX DU PACK D'IMPLÉMENTATION « AXION AUDIT »
**Version 2.12 — consolidée après audit documentaire (§24), recette (§25), certification (§29), revue adversariale indépendante (§32), revue d'exécutabilité (fichier 11), revue UX/UI (§33), revue du pilotage humain (§34), marche à blanc (§35), audit de profondeur (§36), passe adversariale interne V2.8, certification adversariale externe multi-agents V2.9, revue de fluidité terrain V2.10, revue d'exécution de bout en bout V2.11 ET protocole de sauvegarde-reprise V2.12 · 27/08/2026 · Axion-IA SAS — usage interne**

## Règle de précédence (V2.2 — remplace toute règle antérieure)
Le présent pack (12 fichiers) est **LA source d'exécution unique**. En cas de divergence interne : **§32-36 (corrections et compléments V2.2→V2.12 — le plus récent prévaut) > §24-31 > §16-22 > §1-15**. Le CDC maître est une **archive de référence** (il ne prévaut plus). Les rapports d'audit cités dans le texte (30 agents, recette conditions réelles, certification 60 agents) ne sont **pas joints** : leurs conclusions sont intégralement reprises aux §24, §25 et §29 — aucun document extérieur au pack ne fait foi. **Le DDL vit exclusivement dans le fichier 04** ; tout SQL apparaissant ailleurs est historique.

## Contenu du pack
| Fichier | Contenu |
|---|---|
| 01_PRODUIT_ET_METHODOLOGIE.md | Vision, 9 blocs d'audit, 3 niveaux, 8 étapes publiques, rôles, généricité (4 archétypes de test) |
| 02_ARCHITECTURE_ET_INFRA.md | Stack (Hetzner, Docker, Postgres, Fastify, PWA React/Dexie), exploitation, sauvegardes 3-2-1 (Postgres + MinIO), RPO terrain corrigé |
| 03_MODULES_FONCTIONNELS.md | M1-M9, arbre organisationnel, UX guidée + validation d'étapes, chiffrage/devis, multi-auditeurs, console 7 espaces, design system, monde entier, **§32 : scoring, machine à états, consolidation groupe, ROI/échantillonnage/ancres** · **§33 : UX/UI 2026-2027** · **§34 : pilotage humain** · **§35 : marche à blanc de bout en bout** · **§36 : profondeur fonctionnelle (matrice de complétude, FORMAT DE L'EXPORT DE MISSION, format d'import de la banque)** |
| 04_MODELE_DE_DONNEES.md | **Schéma PostgreSQL V2.2 INTÉGRAL — source UNIQUE du DDL** (lot L1) : toutes tables et colonnes des §1-32 |
| 05_API_ET_SYNC.md | API REST /v1 + moteur de sync hors ligne V2.2 : contrat d'opérations, LWW par ligne, protocole de chunks, propriété des écritures (§9.9), DEK/KEK, export de secours |
| 06_SECURITE_RGPD.md | Auth, OWASP, RGPD V2.2 (base légale précisée, AIPD complète, notice versionnée, NER), AI Act post-Omnibus, exigences grands comptes |
| 07_PLAN_TESTS_RISQUES.md | Lots V2.2 (contenus, durées, critères À JOUR des §24-32), 8 scénarios de sync, risques, jalon de descope 15/09, checklist du client pilote |
| 08_TRACABILITE.md | 47 exigences → sections (contrôle de complétude à chaque livraison) |
| 09_PLAN_EXECUTION_AUTOPILOTE.md | Rôles d'agents, pipeline 7 étapes par lot, portes P-A à P-F + P-DESCOPE, règles d'autopilotage, calendrier |
| 10_CHANGELOG_V2.2.md | Journal cumulatif des passes de revue V2.2 → V2.12 (nom de fichier historique conservé) : constat → correction → localisation |
| 11_CONTRAT_TECHNIQUE.md | **Contrat technique d'implémentation (chargé par TOUS les lots, en premier)** : versions épinglées, pièges interdits (UUID v7 applicatif…), conventions API, contrat d'ops, format export de secours, seeds, incréments L5a-c/L6a-c, CI, limites d'autonomie |

## Ordre de lecture PAR LOT (pour Claude Code)
- **TOUS les lots : 11 (contrat technique) EN PREMIER**, puis :
- **L0 (infra)** : 02 → 06 (§10.3) → 07
- **L1 (schéma)** : **04 EN ENTIER (source unique du DDL)** → 03 (§32.1-32.2 pour le sens métier des champs) → 01 (§2)
- **L2 (auth/RBAC)** : 06 → 04 (users dont habilitated_at, scoping_financials, sync_log.outbox_remaining) → 05 (§8.1, **§9.7 garde-fou reset**, §9.9) → 03 (§34.1, §34.4)
- **L3 (missions/arbre/questionnaire/états)** : 01 → 03 (M1-M2, §16, §18.1, §32.2, §32.4, **§35.2 format CSV**) → 04 → 05
- **L4 (import banque)** : 03 (M1.1 + §32.1 format scoring + §32.4 ancres + **§36.4 format CSV**) → 04 (questions, contrôle d'import §7.3)
- **L5 (PWA terrain)** : 03 (M3, §17, §19, §22.1, §25, §27, §32.5, **§33**, §34.2) → 01 (**§20.4** — types d'alertes du cockpit) → 05 (§9 INTÉGRAL + **§31**) → 06 (§10, chiffrement local)
- **L6 (sync)** : 05 (§9 INTÉGRAL + les 8 scénarios §9.8 + §9.9) → 04 (UUID clients, unicité answers)
- **L7-L8 (console/scoring)** : 03 (§18, §22.3, M5, **§27.1 couverture par source**, **§32.1 scoring**, §33.4, **§36.3 format export**) → 04 (unit_scores, findings)
- **L10-L11 (rapports/LLM)** : 03 (M6, §26.2, §36.6) → 01 (**§20.3** — structure du rapport, vit au fichier 01) → 04 (report_sections, roadmap_items) → 06 (pseudonymisation 2 passes)

## RÉFÉRENCE DE CHARGE UNIQUE (V2.2 — remplace tout autre chiffre du pack et du CDC)
**Noyau strict : 26 j-h** (détail par lot : fichier 07 V2.2) — condition de la collecte du client pilote, échéance fin septembre 2026 : L0, L1, L2, L3, L4, L5, L6, L7-min, marge de recette.
**Différable 2-4 semaines : ~11 j-h**, à livrer pendant la collecte : L8 scoring/radar (exécuté en semaine 4 UNIQUEMENT si la porte P-D est passée à l'heure ; **butoir dur : en production le dernier jour de collecte, §35.3**), heatmap, centre d'alertes complet, avance/retard, console espaces 3-7, simulateur de chiffrage complet.
**Phase 1 complète : ~37 j-h.** Règle : n'est prioritaire que ce qui conditionne une COLLECTE terrain fiable. **Jalon de descope : 15/09** (fichier 07 §14 et fichier 09 porte P-DESCOPE).
Tout chiffrage figurant dans les sections historiques (§16.8, §17.7, §18.5, §19.3, §20.7, §22.4, §24.5, §25.8, §26.5, §27.6, §28.4, §29) est **historique et remplacé** par la présente référence.

## Invariants non négociables (rappel à charger dans CHAQUE session de codage)
1. Offline-first : l'app terrain fonctionne à 100 % sans réseau ; UUID v7 côté client pour toute entité créable hors ligne ; push idempotent.
2. Aucune référence client dans le code : tout ce qui varie est une donnée de mission.
3. RBAC serveur systématique ; données financières (scoping_financials) : routes admin exclusivement ; écritures de sync réservées au propriétaire de la session (§9.9).
4. Aucune couleur/taille en dur : tokens du design system uniquement (charte : terracotta #c24a1b action, ivoire #faf8f3 fond, bleu #1a4dd9 info, mocha #2a2520 texte ; l'alerte est un rouge distinct).
5. Interface 100 % en français ; horodatages en UTC + fuseau de mission à l'affichage.
6. Le terrain collecte, le siège produit : jamais de génération lourde sur la machine terrain.
7. Toute correction de donnée = révision tracée ; rien n'est jamais silencieusement écrasé ou supprimé.
8. **Sauvegarde terrain (V2.2)** : en mission, synchronisation au moins 1×/jour (au besoin par partage de connexion) + export de secours chiffré disponible et testé ; aucune donnée ne vit sur un seul appareil plus de 24 h ouvrées ; alerte automatique au-delà.
