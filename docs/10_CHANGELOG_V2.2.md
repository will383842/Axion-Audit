# 10 — CHANGELOG — JOURNAL CUMULATIF DES PASSES V2.2 → V2.12 (27/08/2026)
*(Nom de fichier historique `10_CHANGELOG_V2.2.md` conservé pour ne casser aucun renvoi. La première section ci-dessous est la revue adversariale indépendante V2.2.)*
> **Pack d'implémentation Axion Audit — fichier 10/12** · Pack V2.12 (27/08/2026)
> **Objet :** journal exhaustif constat → correction → localisation. La revue a porté sur le pack V2.1 complet + CDC maître. Verdict d'entrée : NO-GO conditionnel ; les conditions de levée sont TOUTES traitées ci-dessous → **GO.**

## BLOQUANTS
| # | Constat | Correction V2.2 | Où |
|---|---|---|---|
| B1 | Fichier 04 prétendu « consolidé » mais DDL incomplet (≈10 tables absentes : org_units, unit_scores, findings, work_assignments, scoping_estimates, estimation_params, roadmap_items, document_requests, tools_inventory, mission_rebaselines + colonnes des avenants 25-29) | Fichier 04 **réécrit intégralement** : DDL unique et exhaustif (~40 tables), toutes colonnes des §16-29 + §32 intégrées, index complets, règle « le DDL vit exclusivement dans 04 » gravée, diff schéma-vs-04 en CI (lot L1, porte P-A) | 04 (entier), 00_INDEX, 07 L1 |
| B2 | Fichier 07 (source des briefs de lots) périmé : table Phase 1 sans les ajouts noyau strict des §25-29, titre client erroné | Fichier 07 **réécrit** : chaque lot liste TOUTES les features noyau V2.2 avec critères ; « la présente table est LA définition des lots » ; titre corrigé | 07 (entier) |
| B3 | Règle de précédence pointant vers 3 documents absents du zip ; CDC affiché V2.0 avec sommaire s'arrêtant à §23 | Nouvelle règle de précédence : **le pack V2.2 est LA source d'exécution** (§32 > §24-31 > §16-22 > §1-15), CDC = archive, conclusions des rapports absents intégralement reprises aux §24/25/29 ; CDC passé en V2.2 avec sommaire complété (§24-32) et primauté du pack affichée | 00_INDEX + en-têtes de TOUS les fichiers + CDC |
| B4 | Sync sous-spécifiée : « LWW par champ » impossible (horodatage par ligne), réponse `conflict` non définie, protocole de chunks absent | §9.4 : **LWW par LIGNE** (décision documentée) ; §9.3 : contrat complet `applied/duplicate/superseded/forbidden/error` avec devenir de chaque op ; §9.6 : protocole de chunks spécifié (routes, reprise, checksum, 409) | 05 §9.3, §9.4, §9.6 |
| B5 | Vol/casse d'un appareil hors ligne = perte de collecte ; « RPO ≈ 0 terrain » faux ; aucune procédure de sauvegarde terrain | **Export de secours chiffré** (création + restauration) + consigne « sync ≥ 1×/jour » + alerte « sync muette > 24 h » + invariant 8 + RPO terrain corrigé + tests et checklist dédiés | 05 §9.7, 02 §11.4, 00_INDEX inv. 8, 07 L5/§13/§14/§15 |

## MAJEURS
| # | Constat | Correction V2.2 | Où |
|---|---|---|---|
| M1 | Scoring incalculable : aucun barème valeur→score par type de réponse, « réponse rouge » indéfinie | **§32.1** : format `questions.scoring` JSONB normé par type, agrégation complète (question→bloc→unité→roll-up pondéré headcount), complétude, divergence, drapeaux rouges ; contrôle bloquant à l'import (L4) ; `scoring_snapshot` figé par mission | 03 §32.1, 04 §7.3, 07 L4/L8 |
| M2 | `attachments.kind` sans 'note' vs note volante P1-5 | CHECK étendu à `'note'` + colonne `content TEXT` | 04 |
| M3 | `report_templates` par palier (M1.5) vs par niveau d'audit (§26.2) ; colonne `kind` absente | Décision : clé = **audit_level** (§26.2 prévaut) + `kind IN ('rapport','point_etape')` | 04, 03 §32.6 |
| M4 | Unicité réponse/question/entretien non tranchée (idempotence ambiguë) | **UNIQUE(interview_id, mission_question_id)** ; re-réponse = révision ; hors-parcours = flag de la même réponse ; testé | 04, 07 §13 |
| M5 | Trois systèmes d'étapes concurrents, `step_code` jamais énuméré, transitions de statut mission non définies | **§32.2** : machine à états complète (transitions autorisées/interdites/retours admin motivés), mapping statuts ↔ 6 étapes pilote ↔ 8 étapes publiques, `step_code` CHECK fermé | 03 §32.2, 04, 07 L3 |
| M6 | Clé de chiffrement locale dérivée du mot de passe → reset admin = données locales perdues | Architecture **DEK/KEK** (ré-enveloppement au changement de mdp en ligne) + garde-fou serveur sur le reset si outbox non vide | 05 §9.7, 07 L2/§14 |
| M7 | Multi-pays « Phase 2 » alors que le client pilote n'a pas tranché (collecte octobre) | **Décision forcée au RDV du 01/09** + plan de repli documenté et chiffré (missions par pays sans consolidation outillée, questionnaire exporté EN mode papier) | 01 §2.4, 07 §14/§15 |
| M8 | Consolidation groupe citée partout, spécifiée nulle part | **§32.3** : cadre complet (agrégation pondérée des missions filles, heatmap filles×blocs, gabarit dédié, findings éditoriaux) — Phase 2 L14, mais spécifié | 03 §32.3, 04 (parent_mission_id) |
| M9 | Pseudonymisation LLM incomplète (tiers cités en verbatim partent en clair) | **Deux passes** : table de correspondance + NER sur textes libres AVANT appel + consigne de saisie terrain | 06 §10.4, 09 A42 |
| M10 | Droits d'écriture croisés entre auditeurs non tranchés côté serveur | **§9.9** : écritures de sync réservées au propriétaire (`conducted_by`), sinon `forbidden` ; corrections siège via PATCH tracé uniquement ; testé porte P-B | 05 §9.9, 07 L2/L6, 09 P-B |
| M11 | Devenir des données d'une unité sortie du périmètre non défini | Règle : données **conservées**, exclues scoring/couverture, annexe « périmètre réduit » au rapport | 03 §25.1 (amendé) |
| M12 | L8 « différable » vs programmé semaine 4 ; « 7 scénarios » vs 8e ajouté en §31.3 | L8 = différable, exécuté S4 **uniquement si P-D à l'heure** ; « **8 scénarios** » harmonisé partout (le 8e : expiration du refresh token) | 05 §9.8, 07, 09 |
| M13 | Cinq totaux de charge Phase 1 contradictoires (27,5 → 33 j-h ; noyau 22 → 26) | **Référence de charge unique dans 00_INDEX** (noyau 26 · différable ~11 · Phase 1 ~37) ; tous les chiffrages historiques marqués remplacés | 00_INDEX + 01/03 (10 renvois) |
| M14 | Correction siège d'une réponse : aucune route API | **`PATCH /v1/answers/:id`** (lead/admin, motif obligatoire, révision automatique `correction_siege`) | 05 §8.5/§24.2, 04 (change_origin) |

## MINEURS
| # | Correction | Où |
|---|---|---|
| m1 | E31 : « 3 missions types » → 4 archétypes (§21.1) | 08 |
| m2 | Pages rapports harmonisées : diagnostic 12-18 p., stratégique 40-60 p. (§26.1 fait foi) | 01 §1.2/§20.1, 03 M6.1, 08 E15 |
| m3 | Couverture clients « 1 à 20 000+ salariés » (aligné TPE 1-2 p.) | 01 §1.3 |
| m4 | Ordre de lecture : L4 ajouté ; numérotation d'en-têtes « /11 » ; versions V2.2 partout | 00_INDEX + en-têtes |
| m5 | `companies.siren` : NULL autorisé (filiales étrangères) + UNIQUE partiel + alerte doublon | 04 |
| m6 | NDA : `missions.nda_ref` + `nda_signed_at` + checklist | 04, 07 §15 |
| m7 | Titre « Les 8 blocs » → « Les 9 blocs » | 01 §2.1 |
| m8 | Seuil `answers_count` : défaut 3 (app_settings/estimation_params) | 03 §16.4, 04 |
| m9 | `activity_log` : rétention 12 mois, IP anonymisée à 90 j (jobs de purge) | 06 §10.4, 04 |
| m10 | Webhooks : anti-rejeu (timestamp + nonce, fenêtre 5 min, nonces 24 h) + colonnes `integration_events` | 05 §8.6, 04, 07 §13 |
| m11 | Staging/prod même VPS : cohabitation ASSUMÉE (limites de ressources + gel staging pendant la collecte, VPS dédié V2) | 02 §11.2 |
| m12 | `questions.options` : structure JSONB normée `[{code, label, score}]` (porte le barème des choix) | 04 |
| m13 | Job DOCX : brief L10 durci (idempotent, rejouable, retry borné, fichiers partiels purgés, crash worker testé) | 07 Phase 2 (L10), 09 A41/A45 |
| m14 | AI Act actualisé : Omnibus (règl. UE 2026/1744, en vigueur 27/07/2026) — annexe III → 02/12/2027, art. 6(1) → 08/2028, art. 50 applicable depuis 02/08/2026, **art. 4 = obligation de MOYENS** ; ajout ISO/IEC 42001 + NIST AI RMF (Phase 2) | 03 §6.1, 07 L12 |

## COMPLÉTUDE MÉTIER (ajouts V2.2)
| Ajout | Contenu | Où |
|---|---|---|
| Ancres de cotation | Obligatoires sur toute question à échelle (« 1 = …, 3 = …, 5 = … » dans guidance) ; critère d'admission en banque ; exercice de cotation croisée au bac à sable (jalon contenu 15/09) | 03 §32.4, 04, 07 §14, 09 P-DESCOPE |
| Référentiel ROI | Formule normée (gain annuel = volume × temps unitaire économisé × taux horaire chargé via `estimation_params`), hypothèses obligatoires, fourchettes basse/haute | 03 §32.4, 04 |
| Règles d'échantillonnage | n minimal d'entretiens + sessions complémentaires par taille d'unité, affiché au plan d'entretiens | 03 §32.4, 07 L3 |
| RGPD renforcé | Base légale précisée (intérêt légitime envers les interviewés), **AIPD complète**, mention d'information versionnée (`information_notice_version`), feuille de présence papier normée mission 1 | 06 §10.4, 04, 07 §15 |
| Jalon de descope | Porte P-DESCOPE fixe au 15/09 (charge + contenu) | 07 §14, 09 §4/§6 |
| Résolutions de collisions | kind/mode des sessions (§25.6 vs §27.1), clé des gabarits (§26.2 vs M1.5), profils `group_code` pour la divergence direction/terrain | 03 §32.6, 04 |

**Résultat : les 5 bloquants, 14 majeurs et 14 mineurs sont corrigés ; la matrice de traçabilité passe à 42 exigences (E37-E42 ajoutées) — fichier 08.**

---

# V2.3 — REVUE D'EXÉCUTABILITÉ AUTOPILOTE DE BOUT EN BOUT (27/08/2026)
Angle : « un agent autonome peut-il coder ce pack sans deviner ? ». Constats et corrections (tout est épinglé dans le fichier 11_CONTRAT_TECHNIQUE) :
| # | Trou d'exécution constaté | Correction |
|---|---|---|
| I1 | `processed_ops` absente du schéma alors que §9 exige « op_id déjà vu → ignoré » | Table ajoutée au fichier 04 + contrat d'ops formalisé (11 §4) |
| I2 | ORM ambigu (« Drizzle ou Kysely ») → un agent choisirait au hasard | Tranché : Drizzle + migrations SQL brut (11 §1) |
| I3 | Aucune convention API (format d'erreur, pagination, dates, CSRF/cookies vs Bearer) | Conventions complètes tranchées (11 §3) |
| I4 | Versions non épinglées → dérive de dépendances en plein sprint | Liste épinglée save-exact + Renovate gelé Phase 1 (11 §1) |
| I5 | Piège UUID v7 : PG16 n'a pas de fonction native, un agent tenterait uuid_generate_v7() | Interdiction explicite, génération applicative (11 §2) |
| I6 | Curseur du pull delta non formalisé | GET /v1/sync/pull?since=… + next_since par mission (11 §4) |
| I7 | Format du fichier d'export de secours non spécifié (clé de dérivation ?) | Format .axionbackup + clé dérivée du MOT DE PASSE (restaurable partout) (11 §4) |
| I8 | Bibliothèques crypto navigateur non tranchées (Argon2id en WASM) | WebCrypto + hash-wasm + budgets de perf (11 §4) |
| I9 | Seeds non codables : profils d'interlocuteur et valeurs estimation_params jamais énumérés | Seeds complets fournis (9 blocs, 11 fonctions, 9 profils+group_code, paliers, params par défaut « à valider avant P-A ») (11 §5) |
| I10 | L5 (7,5 j) et L6 (4,5 j) trop gros pour des sessions autopilotées sans point de commit | Découpage imposé L5a/b/c et L6a/b/c, commit + tests verts par incrément (11 §6) |
| I11 | Limite Playwright/service workers iOS non documentée → faux sentiment de couverture | Limite assumée : mode avion réel rejoué à la main aux portes P-C/P-E (11 §7) |
| I12 | Pas de liste de ce que l'autopilote ne décide JAMAIS seul | 6 interdictions d'autonomie + escalade DECISIONS.md (11 §8) |
| I13 | Fixtures E2E non déterministes, CORS/MinIO exposition non tranchés, logs et données personnelles | seed:demo déterministe, même domaine via Caddy (zéro CORS), MinIO interne uniquement, redaction pino (11 §2, §5, §7) |

**Résultat : traçabilité 43/43 (E43). Le pack passe en V2.3 — exécutable de bout en bout par Claude Code.**

---

# V2.4 — REVUE UX/UI & INTUITIVITÉ (27/08/2026)
Constat d'ensemble honnête : le socle §17/§19 était DÉJÀ solide et moderne (guidé strict, pilote de mission, verrous parlants, une question/écran, raccourcis de base, enregistrement continu, états vides rédigés, Inter/Lucide/shadcn, AA, /design, test novice <30 min, mode sombre correctement différé en V2). Les manques réels, tous corrigés en §33 :
| # | Manque | Correction |
|---|---|---|
| U1 | **Police non auto-hébergée = l'UI casse en mode avion** (Inter via CDN aurait échoué hors ligne) | @fontsource-variable/inter épinglée (11 §1), test « police rendue hors ligne » à P-C |
| U2 | Tokens sans valeurs chiffrées (typo, espacement, rayons, ombres, motion) → l'autopilote aurait inventé | Échelles complètes fixées (§33.1) |
| U3 | Aucune règle systématique des états d'écran | Règle des 4 états (vide/chargement/erreur/hors ligne), bloquante en revue (§33.2) |
| U4 | Rien pour montrer l'écran à l'interviewé sans fuiter notes/flags internes | **Mode écran partagé** (toggle, raccourci E, bandeau) — noyau L5 (§33.3) |
| U5 | Questionnaire figé SANS prévisualisation → mauvaises surprises post-snapshot | Écran de prévisualisation par bloc × interlocuteur avant figeage (L3, §33.4) |
| U6 | Ancres de cotation (§32.4) non garanties À L'ÉCRAN | Composant ÉchelleAncrée : ancres visibles sous le curseur (§33.3, §33.5) |
| U7 | Raccourcis incomplets (pas de N/A, à-revoir, recherche), pas de swipe iPad, clavier virtuel non typé | Jeu complet 1-5/O/N/A/R/↵//, swipe, claviers adaptés (§33.3) |
| U8 | Inventaire packages/ui non défini → composants divergents entre agents | Inventaire ordonné base shadcn + 12 composants métier (§33.5) |
| U9 | reduced-motion, desktop-first console (≥1280), focus visible, AA par token : non épinglés | Épinglés (§33.1, §33.4, §33.6) |
| U10 | Décisions Phase 2 non tranchées (Cmd+K, grand texte, sombre) → risque de scope creep autopilote | Tranchées et datées : Cmd+K et grand texte Phase 2, sombre V2 confirmé (§33.1, §33.4, §33.6) |

Charge : L5 7,5→8 j, prévisualisation absorbée L3, marge 2,5→2 j — **noyau strict inchangé : 26 j-h**. Traçabilité : 44/44 (E44).

---

# V2.5 — REVUE PILOTAGE HUMAIN : CONSOLE, AUDITEURS, ÉQUIPE (27/08/2026)
Constat d'ensemble : la MÉCANIQUE de pilotage était déjà là (§18 : work_assignments par unité, vue terrain filtrée, avance/retard par auditeur, étanchéité financière ; §22.3 : espace 3 Équipe complet, tour de contrôle, réaffectation d'unités). Les RÈGLES humaines manquaient — toutes écrites en §34 :
| # | Manque | Correction |
|---|---|---|
| H1 | Qui accède à quel espace console : jamais tranché (le consultant dans la console ?) | Matrice rôle × espace ; V1 console = ADMIN SEUL ; le cockpit du consultant = la PWA ; lead borné à ses missions en Phase 2 (§34.1) |
| H2 | Pas d'écran de tête pour l'auditeur multi-missions (« qu'est-ce que je fais maintenant ? ») | Écran « Aujourd'hui » : agenda agrégé, à-revoir, sync par mission, alertes — données locales, absorbé L5 (§34.2) |
| H3 | Le rôle lead existait sans énumération de ses pouvoirs | Droits énumérés (validations, qualification d'unités, PATCH, réaffectation, plan) + interdits (financier) (§34.3) |
| H4 | AUCUN cycle de vie auditeur : n'importe quel compte pouvait auditer un client ; aucun runbook de départ | Habilitation obligatoire (bac à sable + cotation croisée ≤ 0,5 d'écart → users.habilitated_at, refus serveur sinon) ; runbook de sortie 5 étapes ; sessions réalisées immuables (§34.4) |
| H5 | Réaffecter une session planifiée : aucune route, et conflit potentiel avec la propriété §9.9 | PATCH /v1/interviews/:id/reassign (admin/lead, motif, refusée si commencée) — compatible §9.9 car action siège tracée (§34.4, 05 §24.2, 04) |
| H6 | Le suivi d'équipe (fiches, rythme réel) = monitoring de salariés sans cadre de proportionnalité | Cadre écrit : granularité sessions/jours, métriques fines INTERDITES en individuel, durées réelles → abaques agrégées seulement, information des auditeurs, accès admin seul (§34.5) |
| H7 | Collision d'agenda entre auditeurs non gérée à la planification | Avertissement non bloquant au chevauchement (unité/personne), résolution au calendrier équipe (§34.6) |
| H8 | Espace 3 « Phase 2 » sans déclencheur | Déclencheur explicite : premier recrutement d'auditeur → espace 3 EN TÊTE de Phase 2 (§34.7) |

Schéma : + `users.habilitated_at`, note d'immuabilité `conducted_by`. Charge : cockpit/habilitation/reassign absorbés (L2/L3/L5) — **noyau inchangé : 26 j-h**. Traçabilité : 45/45 (E45).

---

# V2.6 — MARCHE À BLANC DE BOUT EN BOUT (27/08/2026)
Méthode : déroulé chronologique complet de la mission du client pilote (avant-vente → cadrage → préparation → collecte → analyse → livraison → après), chaque geste confronté à « quel outil, quel écran, quel chantier, quelle date ? ». Constat : le CODE était planifié à la journée près, les livrables NON-CODE étaient cités partout mais datés nulle part.
| # | Trou | Correction |
|---|---|---|
| Z1 | Aucun calendrier consolidé des chantiers non-code (banque, AIPD, notice, gabarit Word, devis sur tableur, arbre, plan d'entretiens) — dispersés sans dates ni responsable | Calendrier semaine par semaine sept→déc, colonne code / colonne Williams (§35.1) |
| Z2 | Format du CSV d'import de l'arbre organisationnel jamais spécifié (l'autopilote ET le sponsor auraient inventé chacun le leur) | Format complet : colonnes, exemple, import atomique + rapport d'erreurs (§35.2) ; critère L3 ajouté |
| Z3 | L8 « livré pendant la collecte » sans date dure — or l'ANALYSE a besoin du scoring | Butoir : en production le dernier jour de collecte ; repli manuel §32.1 documenté (§35.3) |
| Z4 | « Export transmis à la console (pont Qualiopi) » ambigu alors que L13 est Phase 2 | Précisé : transmission MANUELLE en V1, zéro dépendance à L13 (§35.4) |
| Z5 | Aucune vue des coûts d'exploitation | Postes listés sans chiffres inventés ; zéro coût LLM en Phase 1 (génération = L11) (§35.5) |
| Z6 | Absence de maquettes visuelles ni décidée ni assumée | Décision écrite : design-system-first, portes P-C/P-E = revues de goût ; option 0,5 j de maquette HTML des 3 écrans clés avant L5 (§35.6) |

| Z7 | Android cité comme supporté mais absent de la matrice de recette — et la hiérarchie des cas (iPad = pire cas) jamais écrite | Écrit en §22.1 : iPad/Safari = cible la plus dure (ce qui y passe, passe partout) ; Android = cas plus facile, recetté au premier appareil en service |

Traçabilité : 46/46 (E46). Aucune charge code ajoutée — noyau inchangé : 26 j-h ; la nouveauté est le plan de charge PERSONNEL de Williams (§35.1, colonne droite).

---

# V2.7 — AUDIT DE PROFONDEUR FONCTIONNELLE (27/08/2026)
Méthode : chaque module M1-M9 + avenants confronté à « données + API + écran + critères présents ? ». Verdict : noyau profond, alertes et M1.1 complets contrairement au soupçon — mais 2 formats CRITIQUES absents et 3 implicites d'exécution.
| # | Trou | Correction |
|---|---|---|
| F1 | **Format de l'export de mission jamais spécifié** — or c'est LA matière du rapport V1 (l'autopilote aurait inventé des colonnes, et le rapport le client pilote en dépend) | ZIP normé complet (mission.json, arbre, sessions, **reponses.csv** central, constats, scores, manifest PJ) + critère L7-min réécrit : « rapport rédigeable EN ENTIER depuis le ZIP » (§36.3) |
| F2 | Format d'import de la banque : décision « CSV/JSON scripté » sans colonnes — même trou que l'arbre (§35.2) | Colonnes exactes + contrôles bloquants (dont ANCRES obligatoires sur les échelles) (§36.4) ; critère L4 durci |
| F3 | Recherche globale console : une ligne, sans règle de confidentialité | Périmètre défini ; les RÉPONSES exclues de la recherche globale (mission ouverte uniquement) (§36.2) |
| F4 | Déroulé Claude Code : DECISIONS.md sans format, branches sans convention, portes sans trace matérielle | Fichier 11 §9bis : branches lot/<x> + squash + tags, format d'entrée DECISIONS.md, checklist de porte commitée avec preuves et signature |
| F5 | « Profondeur » jamais définie → impossible de distinguer un survol fautif d'un phasage sain | Règle écrite : noyau = implémentation près (fait), Phase 2 = décision + brief au lancement, Phase 3 = intention (§36.1) + matrice de complétude (§36.2) |

Traçabilité : 47/47 (E47). Charge inchangée (formats = précisions des lots existants L4/L7-min).

---

# V2.8 — PASSE ADVERSARIALE SUR LE PACK LUI-MÊME (27/08/2026)
Cible : les dérives INTERNES introduites par 7 passes d'ajouts successifs — le pack attaqué comme par un relecteur hostile. Récolte :
| # | Faille | Correction |
|---|---|---|
| A1 | **Règle de précédence périmée dans 11 fichiers** : « §32 > §24-31… » alors que §33-36 sont POSTÉRIEURES à §32 — un agent aurait fait prévaloir §32 sur §36 | Chaîne actualisée partout : §32-36 (le plus récent prévaut) > §24-31 > §16-22 > §1-15 |
| A2 | Sommaire du CDC arrêté à §32 alors que §33-36 y sont annexées | ToC complétée |
| A3 | **AUTO-VERROUILLAGE** : la règle d'habilitation (V2.5) refuse toute affectation si `habilitated_at` NULL — or l'admin fondateur naît NULL → Williams n'aurait pas pu créer SA PROPRE mission du client pilote | Seed L1 pose `habilitated_at` sur le compte fondateur (04, 07 L1, 11 §5) |
| A4 | Export §36.3 ambigu : les réponses des unités sorties du périmètre (§25.1) dans `reponses.csv` ou dans l'annexe ? Deux agents = deux exports différents | Tranché : TOUTES les réponses dans `reponses.csv` + colonne `unite_in_scope` ; l'annexe ne liste que les unités et motifs |
| A5 | Raccourcis à une touche (O/N/A/R/E, 1-5, /) : rien n'empêchait leur déclenchement PENDANT la frappe d'une note (« Rien à signaler » = chaos) | Règle : raccourcis inactifs sous focus d'un champ ; Échap rend le focus (§33.3) |
| A6 | Description du fichier 10 dans l'index figée à V2.3 ; butoir L8 (§35.3) absent de la ligne « différable » de l'index | Les deux actualisés |
| A7 | `interviews.mode` : commentaire DDL suggérait un DEFAULT SQL conditionnel — inexistant en SQL, l'autopilote aurait buté | Précisé : défaut APPLICATIF |

| A8 | Next.js jamais explicitement écarté — un agent React scaffolde Next « par habitude », et le SSR casserait l'offline-first | Interdiction motivée gravée au contrat technique (11 §2) : Vite + React SPA/PWA, point final |
| A9 | MFA reléguée en Phase 3 (L21) alors que la console pilote des données de grands comptes | MFA TOTP des comptes ADMIN avancée en Phase 2 (~0,5 j) ; SSO OIDC complet reste L21 |

| A10 | La page publique vend « 4 NIVEAUX » d'audit, l'outil en modélise 3 (audit_level) × 5 offres — le commercial et l'outil ne parlaient pas la même langue | Table de correspondance FIXÉE (§20.1) : diagnostic ciblé/TPE/PME/ETI ↔ audit_level × commercial_offer — à reprendre telle quelle dans les devis |
| A11 | La promesse publique du rapport (« justifié, chiffré, priorisé, effort honnête, zéro remplissage ») était couverte par les DONNÉES mais sans contrôle de sortie | Checklist qualité rapport en 6 points, intégrée au gabarit Word et à la checklist de livraison — un rapport qui ne passe pas ne part pas (§36.6) |

Bilan honnête : 11 failles, toutes de cohérence inter-passes sauf A3 (vraie faille logique) et A5 (vraie faille UX). Aucune ne touchait le fond du produit — c'est le comportement attendu d'un corpus après 7 couches : la passe adversariale récurrente APRÈS chaque grosse évolution devient une règle (prochaine : à la porte P-D, contre le code réel). Traçabilité inchangée : 47/47.


---

# V2.9 — CERTIFICATION ADVERSARIALE EXTERNE MULTI-AGENTS (27/08/2026)
Méthode : 12 agents adversariaux indépendants (compilateur SQL, chaos réseau, voleur d'iPad, auditeur novice, avocat, agent Claude Code isolé sur son lot, comptable, client hostile, concurrent, testeur, calendrier, successeur), pack V2.8 attaqué de bout en bout, vérification web du droit AI Act incluse (exact : règl. UE 2026/1744 confirmé). Récolte : 1 bloquant, 12 majeurs, 13 mineurs — aucun ne touchait la sync, la crypto, le RGPD ni la méthodologie d'audit ; le bloquant et la moitié des majeurs sont des trous d'IDENTITÉ/ÉTAT du modèle (code de question, statut de session, horodatages LWW) que 8 passes documentaires ne pouvaient plus voir sans transcrire le DDL.

## BLOQUANT
| # | Constat | Correction V2.9 | Où |
|---|---|---|---|
| X1 | **Identité et versionnage des questions incomplets** : (a) `questions.code` ABSENT du DDL alors que l'import L4 (§36.4) exige `code`* unique + contrôle bloquant « code unique » — le lot L4 (S2) était inimplémentable sans modifier le fichier 04, ce que le contrat 11 §8 interdit ; (b) « nouvelle version » jamais tranchée (mutation en place vs nouvelle ligne) ; (c) snapshot `mission_questions` PARTIEL (guidance/ancres, answer_type, criticality, allow_range non figés) → l'écran d'entretien hors ligne (§33.3) et l'export §36.3 auraient dépendu de la banque VIVANTE, contradiction avec le figeage M2.4 | `questions.code TEXT NULL` + UNIQUE(code, version) partiel ; règle gravée : nouvelle version = NOUVELLE LIGNE (même code, version+1, ancienne `archived`), jamais de mutation ; snapshot élargi : `guidance_snapshot`, `answer_type_snapshot`, `criticality_snapshot`, `allow_range_snapshot` — le pull terrain lit les snapshots, jamais la banque | 04 (questions, mission_questions, index), 03 §36.4, 07 L1/L4 |

## MAJEURS
| # | Constat | Correction V2.9 | Où |
|---|---|---|---|
| X2 | `interviews.status CHECK IN ('en_cours','termine')` sans état « non commencée » : l'agenda §25.2 crée des sessions planifiées et la réaffectation §34.4 exige `status ≠ en_cours/termine` — valeur IMPOSSIBLE avec ce CHECK | `status IN ('non_demarre','en_cours','termine') DEFAULT 'non_demarre'` | 04 |
| X3 | LWW par ligne (§9.4) et contrat d'op (11 §4) comparent `client_updated_at` sur `interview` et `attachment_meta` — colonne ABSENTE de ces deux tables (seules `answers` l'avaient) ; la fusion de l'export de secours en dépend aussi | `client_updated_at` ajouté à `interviews` et `attachments` ; §9.4 précise « les TROIS entités synchronisées » | 04, 05 §9.4 |
| X4 | Conditions automatiques du pilote §17.2 INEXÉCUTABLES en V1 : « client relié console » (intégration = L13 Phase 2) et « documents demandés » (L13bis) → toute mission V1 bloquée à Cadrage/Préparation en guidé strict sans dérogation admin systématique | Jeu de conditions V1 énuméré ; règle : une condition dont la fonctionnalité porteuse n'est pas livrée est RÉPUTÉE SATISFAITE | 03 §17.2 |
| X5 | Le fichier 11 CONTREDIT le pack sur 3 points alors que sa propre règle le lui interdit — et la précédence aurait fait perdre les valeurs les plus récentes : rate limiting (06 §10.2 : 5 et 100/min vs 11 §3 : 10 et 300), CORS (06 : « restreint » vs 11 : « pas de CORS, même domaine »), Dependabot (02 §30.5 : hebdo dès L0 vs 11 §1 : gelé Phase 1) | 06 §10.2 et 02 §30.5 alignés sur le contrat 11 (qui fait foi) ; ClamAV tranché au passage (X12) | 06 §10.2, 02 §30.5 |
| X6 | **La faille A1 de la V2.8 (« chaîne de précédence actualisée partout ») n'était PAS corrigée dans le fichier 07** — le fichier source des briefs portait encore « §32 > §24-31… » : un agent de lot aurait fait prévaloir §32 sur §33-36 | Chaîne actualisée dans le 07 ; parenthèse « V2.2→V2.9 » harmonisée dans les 12 fichiers | 07 en-tête, tous les en-têtes |
| X7 | Ordres de lecture (00_INDEX) INCOMPLETS vs briefs 07 : L2 cite §9.7 non chargé, L5 cite §31 et les alertes §20.4 non chargés, L7-min exige la couverture par source §27.1 non chargée — or la règle 09 §5.8 INTERDIT de charger au-delà de l'ordre | Trois lignes d'ordre de lecture complétées (L2 +§9.7 ; L5 +01 §20.4 +05 §31 ; L7-L8 +§27.1 ; L10-L11 : §20.3 pointé vers le fichier 01 où il vit) | 00_INDEX |
| X8 | Modèle local Dexie §9.1 PÉRIMÉ : ni `org_units` (sélecteur d'arbre hors ligne, propositions §25.3) ni `work_assignments` ; et le cockpit §34.2 affiche des « alertes (§20.4) » alors que `alerts` est générée côté SERVEUR, absente du pull — « données 100 % locales » intenable | §9.1 réécrit (org_units, work_assignments, snapshots complets) ; règle : alertes du cockpit V1 = CALCULÉES localement (à-revoir, sync muette, entretien non terminé) ; `alerts` serveur rejoint le pull avec le centre d'alertes différable | 05 §9.1, 03 §34.2 |
| X9 | Critère L4 « 200 questions le client pilote importées » INTENABLE à la date du lot (S2) : le jalon contenu n'exige que 100 questions au 15/09 (S3) et la banque complète arrive en S4 — la porte L4 aurait échoué ou été truquée | Critère L4 = import du JEU DE RECETTE ; l'import des 200 questions réelles = opération S4, même script, tracée checklist §15 | 07 L4 |
| X10 | Contrat d'ops : une question ad hoc doit créer `questions` ET `mission_questions` (P1-4 : les DEUX portent un UUID client) mais l'op `question_adhoc` n'a qu'un `entity_id` — le lien mission_questions était indéfini (L5b et L6a auraient divergé) | Payload normé : `{question, mission_question: {id uuidv7 client, position}}`, création atomique des 2 lignes | 11 §4 |
| X11 | « diff schéma-vs-04 = zéro écart » (CI, L1, P-A) sans base de comparaison : le 04 est un DDL abrégé sans types sur la plupart des colonnes — deux agents = deux diffs | Base DÉFINIE : tables + colonnes + PK/FK/UNIQUE/CHECK + index §7.1, via manifeste `schema-manifest.json` extrait du 04, commité au L1, relu à P-A ; types absents = TEXT (convention gravée en tête du 04) | 11 §7, 07 L1, 04 conventions |
| X12 | Exigence ORPHELINE : « antivirus ClamAV (worker) » (06 §10.2) sans lot porteur — absente de L0 (compose), de L6c (uploads) et des versions 11 §1 ; aucun agent ne charge §10.2 → jamais implémentée ou escalade tardive | Tranché : ClamAV DIFFÉRÉ Phase 2 (L10, fiche sécurité) — uploads V1 réservés aux consultants authentifiés, photos compressées client ; risque assumé et écrit | 06 §10.2 |
| X13 | Checklist qualité rapport §36.6-1 (« CHAQUE recommandation : gain chiffré en HEURES et en EUROS » + « ne part pas sinon ») INEXÉCUTABLE pour les actions de conformité/risque/gouvernance → blocage de livraison ou chiffres inventés (l'inverse de la promesse) | Exception écrite : actions conformité/risque/gouvernance = bénéfice QUALITATIF explicite (obligation couverte, risque/sanction cités), jamais de chiffre inventé ; la formule §32.4 vaut pour les actions de productivité | 03 §36.6 |

## MINEURS
| # | Correction V2.9 | Où |
|---|---|---|
| x1 | Étiquettes périmées harmonisées : 08 « 36 exigences »→47, titre §23 V2.0→V2.9, 00_INDEX « 42 exigences »→47, 09 « E1-E42 »→E1-E47 (×2), 07 titre/footer/« à jour des §24-32 »→V2.9/§24-36, titre du fichier 10 (nom de fichier historique conservé et assumé) | 08, 00_INDEX, 09, 07, 10 |
| x2 | Sections DUPLIQUÉES éliminées : §26 vivait EN DOUBLE (fichiers 01 et 03) et §31 EN DOUBLE (03 et 05) — deux copies du même numéro que « le plus récent prévaut » ne peut pas départager ; copies de référence désignées (03 pour §26, 05 pour §31), l'autre exemplaire devient un renvoi | 01 §26, 03 §31 |
| x3 | Seuils de scoring : commentaires du 04 (`app_settings`) contredisaient §32.1 et le seed 11 §5 (`estimation_params`) — corrigés (seuil_completude_bloc, seuil_fiabilite_answers) | 04 |
| x4 | FK avant/circulaires (`interviews.linked_review_answer_id → answers`, `interviews.document_request_id`) : convention « ALTER TABLE en fin de migration » gravée — la transcription littérale ne compilait pas | 04 conventions |
| x5 | `missions.geo_scope` : sémantique gravée (périmètre COMMERCIAL ; une fille de déclinaison garde 'multi_pays' + son country_code — jamais 'france' hors France) | 04 |
| x6 | Renvoi « bac à sable (§17.6) » erroné ×2 → §17.5 (le §17.6 est « états vides ») | 03 §32.4, §34.4 |
| x7 | Garde-fou reset §9.7 : la DONNÉE existait nulle part — le push remonte `outbox_remaining`, colonne `sync_log.outbox_remaining` ajoutée | 05 §9.7, 04 |
| x8 | Format `value` monétaire sans devise (promise §22.2) → `{type:'money', v, currency}` (déf. EUR), fourchette comprise | 04 |
| x9 | Re-réponse hors ligne : matérialisation de la révision par le SERVEUR à l'upsert (origine `terrain`) gravée — le client n'émet jamais d'op de révision | 05 §9.3 |
| x10 | Export de RÉVERSIBILITÉ client (§10.5) distingué de l'export interne §36.3 : variante expurgée des notes internes et flags de travail | 06 §10.5 |
| x11 | Benchmarks (§6.2) : section du rapport rendue CONDITIONNELLE tant que k ≥ 5 n'existe pas (missions 1 à ~10) — jamais de comparaison inventée | 03 §26.1 |
| x12 | Divergence §32.1-5 : évaluée à partir de 2 réponses (écart-type sur n = 1 indéfini — jamais de NaN dans les jeux de tests L8) | 03 §32.1 |
| x13 | Calendrier S3 : « fin L5 + L6 EXCLUSIF » la même semaine contredisait la règle 09 §5.3 — séquencement explicite : P-C au plus tard le mardi de S3, ensuite L6 SEUL, arbitrage à P-DESCOPE sinon | 09 §6 |

Bilan honnête : les attaques SANS prise (preuves de solidité) — le contrat de sync §9.3/§9.6/§9.9 et les 8 scénarios tiennent pas à pas (chaos réseau) ; la chaîne DEK/KEK + garde-fou + export de secours + runbook de sortie ne laisse aucun chemin de perte au-delà de l'invariant 8, ni de lecture d'un appareil volé (voleur d'iPad — risque résiduel assumé : mot de passe OUBLIÉ hors ligne = perte bornée à 24 h, inhérent au zéro-connaissance) ; le droit AI Act/Omnibus est EXACT au 27/08/2026 (vérification web : règl. UE 2026/1744, annexe III → 02/12/2027, art. 6(1) → 02/08/2028, art. 50 depuis le 02/08/2026, sanctions 15 M€/3 % et 35 M€/7 %) ; la base légale RGPD (intérêt légitime + information) est correcte ; les totaux 26 j-h, la somme des lots, les 12 fichiers et le compte des tables (~46) sont justes ; le SQL historique des fichiers 01/03 est correctement neutralisé par la règle « le DDL vit dans le 04 ». Traçabilité inchangée : 47/47. Prochaine revue légitime : porte P-D (contre le code réel), comme déjà prévu.


---

# V2.10 — REVUE DE FLUIDITÉ TERRAIN (27/08/2026)
Méthode : simulation minute par minute d'une journée d'auditeur (iPad et PC, du déverrouillage du matin au rituel du soir), comptage des gestes et des ressaisies, sur le pack V2.9. Objectif : simplicité maximale d'utilisation SANS toucher aux mécanismes de qualité (ancres, à-revoir, couverture, triangulation, validation). Récolte : 5 majeurs, 4 mineurs — tous des frictions de GESTE ou des ambiguïtés de MOMENT, aucun défaut de fond.

## MAJEURS (friction réelle, plusieurs fois par jour)
| # | Constat | Correction V2.10 | Où |
|---|---|---|---|
| U1 | **Verrou 15 min pendant les sessions longues** : une observation d'atelier ou un interlocuteur qui parle 20 min = ressaisie du mot de passe (12+ car.) au clavier virtuel EN PLEINE COLLECTE, plusieurs fois par jour — la friction n° 1 de la journée | Verrou en deux temps : 15 min hors session, **60 min pendant une session `en_cours`** (inactivité = toute interaction) + Screen Wake Lock ; **bouton verrouiller d'un geste** (tablette posée = verrou volontaire) ; décision gravée : jamais de déverrouillage affaibli (biométrie WebAuthn/PRF = étude Phase 2, confort sans clé plus faible) | 05 §9.7 |
| U2 | **« Terminer » vs « Valider » l'entretien : deux notions jamais articulées** (M3.2 « terminé ou rouvert » / §19.1 « validé = verrouillé ») — l'auditeur ne sait pas quel bouton presser, et valider à chaud interdit la note de couloir 10 min après (révision tracée pour une virgule) | Règle gravée : TERMINER (à chaud, récap, rouvrable librement par son auteur) ≠ VALIDER (geste qualité verrouillant, en fin de journée, **validation GROUPÉE** depuis la synthèse). Le verrou qualité intégral est conservé — posé au bon moment | 03 §19.1 |
| U3 | **Démarrer une session PLANIFIÉE = ressaisir les 3 champs** déjà saisis à la planification (§25.2 stocke nom/unité/type… que l'écran de démarrage redemandait) | Tap sur une session du cockpit « Aujourd'hui » = **démarrage PRÉ-REMPLI, zéro champ** ; ne reste que l'accord de participation ; « Nouvel entretien » 3 champs conservé pour l'imprévu | 03 §34.2 |
| U4 | **L'invariant 8 (sync + export de secours quotidiens) était une discipline de mémoire** : l'export vivait dans une action isolée « Exporter une sauvegarde » — le soir d'une journée de 6 entretiens, il ne sera pas fait | Bouton « **Fin de journée** » sur le cockpit : UN geste = sync forcée + export de secours + synthèse du jour (à-revoir, validation groupée U2, photos en attente) + rappel discret tant que le rituel n'est pas fait ; « Quitter le site » y trouve aussi son point d'entrée | 03 §34.2 |
| U5 | **Moment et libellé de l'accord jamais spécifiés** : M3.2 imposait une « case de consentement » sans dire sur quel écran ni quand — et le mot « consentement » suggère une base RGPD consentement alors que la collecte repose sur l'intérêt légitime | Case sur l'écran de démarrage (y c. pré-rempli), libellé « **Accord de participation** », **phrase-script fournie** à lire ; l'audio (V2) garde un CONSENTEMENT explicite distinct | 03 M3.2 |

## MINEURS
| # | Correction V2.10 | Où |
|---|---|---|
| u1 | Recherche hors-parcours : le raccourci **/** était le SEUL accès — bouton Recherche visible ajouté à la barre permanente (le / reste un accélérateur PC) | 03 §17.4 |
| u2 | Décision gravée : **pas d'avancement automatique après cotation** (coter n'est pas finir — note/à-revoir/photo arrivent après) ; l'avance est toujours volontaire (Suivant, ↵, swipe) — l'autopilote ne choisira pas l'auto-advance « moderne » qui casse le geste d'audit | 03 §17.4 |
| u3 | Type `table` au doigt : rendu V1 = liste de lignes (formulaire par ligne), jamais de grille tableur tactile ; tableaux riches Phase 2 | 03 §33.3 |
| u4 | « Quitter le site » (§17.3) n'avait aucun point d'entrée défini — il vit au cockpit et est suggéré après la dernière session planifiée du jour sur le site | 03 §34.2 |

## Ce qui était DÉJÀ fluide (vérifié, aucune correction)
Démarrage imprévu en 3 champs · zéro bouton « sauvegarder » + reprise instantanée à la question courante · note volante globale · hors-parcours autorisé en guidé strict (§25.4 — le geste normal d'un auditeur) · aucune différence fonctionnelle en mode avion · ancres de cotation sous le curseur · mode écran partagé en un toggle · swipe + claviers virtuels adaptés · 4 états par écran, jamais d'erreur technique brute · les verrous ne bloquent JAMAIS la saisie (§19.1) · bac à sable + visite guidée + consignes = formation portée par l'outil. **Frictions DÉLIBÉRÉMENT conservées (c'est la qualité)** : récap de fin d'entretien, purge des à-revoir avant de quitter le site, accord de participation, ancres obligatoires, validation d'étapes, couverture par type de source — simplifier LE GESTE, jamais LE CONTRÔLE.

Charge : 100 % assemblage de fonctions déjà spécifiées — absorbé L5 (au besoin 0,5 j sur la marge : 2 j → 1,5 j) ; total noyau strict INCHANGÉ : 26 j-h. Porte P-C enrichie d'une « journée terrain simulée » (§33.7).


---

# V2.11 — REVUE D'EXÉCUTION DE BOUT EN BOUT (27/08/2026)
Méthode : simulation du chantier complet jour par jour (S1→S4), du prompt de démarrage (11 §9) à la porte P-E, contre les fichiers 09 + 07 + 11 + 00_INDEX : chaque étape du pipeline, chaque porte, chaque main humaine. Objet : garantir que l'autopilote Claude Code produit un outil de niveau mondial SANS revue finale surprise — et rendre EXÉCUTABLE l'autorisation donnée par Williams d'ajouter en cours de route ce qui manque au professionnalisme de l'outil. Récolte : 6 majeurs, 5 mineurs — la hiérarchie et le pipeline étaient déjà solides (40 gabarits, 7 étapes, portes matérialisées) ; les manques étaient l'INTÉGRATION CONTINUE inter-lots, la CONCEPTION avant le code critique, et l'absence de véhicule pour les améliorations.

## MAJEURS
| # | Constat | Correction V2.11 | Où |
|---|---|---|---|
| G1 | **L'autorisation d'améliorer n'avait aucun véhicule** : « tout ajout = Phase 2 » (07 §14) + « tout écart refusé ou documenté » (09 §5.2) — un autopilote qui découvre un manque n'avait le choix qu'entre noyer Williams d'escalades ou ajouter en silence (interdit) | **Canal d'amélioration à deux étages (09 §5.9)** : étage 1 = micro-améliorations UX/robustesse autorisées D'OFFICE (plafond 0,5 j/lot, jamais schéma/API/crypto, journal `AMELIORATIONS.md`, relues en croisé) ; étage 2 = fonctionnalité manquante → fiche PROPOSÉE, arbitrée par Williams à la porte suivante (absorbée sur la marge ≤ 2 j / Phase 2 par défaut / refusée), JAMAIS implémentée avant arbitrage (11 §8.7) | 09 §5.9, 11 §8, 11 §9 |
| G2 | **Aucun scénario de bout en bout cumulatif** : chaque lot testait SON périmètre + non-régression des suites, mais l'intégration inter-lots (questionnaire L3 → rendu L5 → sync L6 → export L7) ne se prouvait qu'aux portes P-D/P-E — semaine 3-4, trop tard pour corriger sereinement | **Fil rouge `@filrouge` (09 §4bis)** : 2 missions canoniques en fixtures dès L1 — FIL-TPE (micro) et FIL-GC (grand compte fictif, arbre 150 unités/4 niveaux, 60 sessions, ~8 000 réponses générées) — le parcours complet disponible à date rejoué à CHAQUE merge, sur les deux échelles ; toute porte l'exige vert. Preuve continue du « de la TPE au grand groupe » | 09 §4bis, 07 §13 |
| G3 | **Aucune étape de conception avant le code** : le pipeline passait du brief à l'implémentation — sur L5/L6 (PWA offline, sync), un mauvais découpage se paie en jours de refactor que le calendrier n'a pas | Étape **1bis — note de conception ≤ 1 page** (`docs/conception/LOT_<X>.md`) pour les lots à risque L2/L3/L5/L6, validée A01 + gardien avant la première ligne ; les lots simples sautent l'étape | 09 §3 |
| G4 | **Pas de Definition of Done transverse** : les critères par lot existaient, mais AUCUN seuil de couverture de tests n'était chiffré nulle part, et « 4 états, axe-core, migrations testées, zéro TODO » vivaient dispersés | **DoD unique (09 §3)** cochée par le gardien à chaque lot : lint/types 0 erreur · aucun test skippé · **couverture ≥ 90 % MESURÉE sur les modules critiques (sync, crypto, scoring, RBAC)** · migrations up/down staging · 4 états · axe-core · `@filrouge` vert · README · zéro TODO non tracé · diff schéma = zéro écart | 09 §3 |
| G5 | **Traçabilité à sens unique** : le gardien cochait exigences → code, personne ne vérifiait code → exigences — avec le canal G1, le scope creep silencieux devenait indétectable | Contrôle INVERSE à l'étape 6 : toute route, table, écran ou job sans rattachement E1-E47 OU ligne AMELIORATIONS = **refusé** (généralisation du 11 §8.6 aux écrans, tables et jobs) | 09 §3.6 |
| G6 | **« Les portes arrêtent » sans procédure d'échec** : rien n'écrivait ce qui se passe quand P-C échoue — le risque réel était le passage « presque validé » | Procédure gravée : ÉCHEC tracé au fichier de porte → correctifs SEULS (aucun lot suivant, aucun ajout) → re-porte EN ENTIER → 2 échecs consécutifs = arbitrage Williams type P-DESCOPE (réduire, jamais bâcler) | 09 §4bis |

## MINEURS
| # | Correction V2.11 | Où |
|---|---|---|
| g1 | La table des portes n'avait pas suivi la V2.10 : P-C exige désormais la **journée terrain simulée** (§33.7) — plus deux définitions divergentes de la même porte | 09 §4 |
| g2 | Résumé quotidien sans suivi de charge : **une ligne de burn-down** (consommé/restant vs 26 j-h) — P-DESCOPE devient factuelle, pas une impression | 09 §5.4 |
| g3 | Le prompt de démarrage ne créait ni `AMELIORATIONS.md` ni `docs/conception/` — complété (L0 pose tout le cadre de gouvernance) | 11 §9 |
| g4 | La hiérarchie existait mais la chaîne d'escalade et « qui signe quoi » n'étaient écrits nulle part : agent → chef d'équipe → A01 → Williams, signatures par étape du pipeline | 09 §1 |
| g5 | Le test novice ne se jouait que sur la mission bac à sable (petite) : à P-E, la recette novice se joue AUSSI sur FIL-GC (naviguer 150 unités, trouver sa session, p95 < 100 ms sur listes longues) — simple à TOUTE échelle | 09 §4 P-E |

## Ce qui tenait DÉJÀ de bout en bout (vérifié, aucune correction)
40 gabarits en 2 niveaux + 5 équipes avec chefs et réviseurs croisés dédiés (≤ 12 actifs/lot — budget de contexte §5.8) · pipeline 7 étapes sans raccourci, producteur ≠ testeur (§5.6) · tests `@critique` jamais skippables + CI qui détecte les tests désactivés (§5.7) · portes MATÉRIALISÉES en fichiers commités avec preuves et signature humaine (11 §9bis) · branches/squash/tags + reprise de session sans mémoire implicite (11 §9bis) · anti-boucle (3 tentatives → escalade §5.5) · L6 seul sur sa semaine (§5.3) · limite Playwright/iOS assumée et compensée à la main aux portes (11 §7) · incréments ≤ 1 j commitables (11 §6) · le réel peut amender la spec à UNE porte prévue pour ça (P-D) — jamais en silence.

Charge : fil rouge = outillage de test déjà dû (le générateur FIL-GC s'écrit au L1) ; conception = 4 × ~1 h ; DoD = déjà en CI pour l'essentiel + un seuil chiffré ; canal d'amélioration étage 1 plafonné DANS les lots, étage 2 sur la marge par arbitrage — **total noyau strict INCHANGÉ : 26 j-h**.


---

# V2.12 — ULTIME VÉRIFICATION PRÉ-LANCEMENT : SAUVEGARDE CONTINUE ET REPRISE APRÈS COUPURE (27/08/2026)
Méthode : simulation d'une coupure de Claude Code à chaque étape du pipeline (en plein incrément, entre deux commits, pendant une porte, à l'épuisement du contexte) — que reste-t-il ? où reprend-on ? Récolte : 4 majeurs, 3 mineurs. Constat central : la continuité ENTRE les jours existait (11 §9bis), la continuité APRÈS UNE COUPURE non prévue n'existait pas.

## MAJEURS
| # | Constat | Correction V2.12 | Où |
|---|---|---|---|
| H1 | « Une session = un lot » intenable : L5 = 8 jours — l'épuisement du contexte en plein lot était LA coupure la plus probable, et elle n'était pas prévue | **Une session = un INCRÉMENT** (le découpage 11 §6 existait déjà — il devient la frontière de session) ; règle : contexte qui se tend = fin de session PROPRE (ETAT.md + commit + push), jamais de session poussée à la limite | 09 §2, 11 §6 |
| H2 | **Aucun fichier d'état** : la reprise reposait sur DECISIONS.md (des décisions, pas un état) et le journal (quotidien) — après une coupure en milieu d'incrément, impossible de savoir OÙ reprendre | **`docs/ETAT.md`** normé (lot, incrément, étape pipeline N/7, dernier commit vert, poussé o/n, tâche en cours, PROCHAINE ACTION, tests rouges connus), mis à jour à chaque changement d'étape et toutes les ~2 h | 11 §9ter |
| H3 | Commits verts uniquement = tout le travail en cours mourait avec la session ; et un commit non poussé mourait avec la machine | Commits **`wip:` autorisés sur la branche du lot** (jamais sur main — le squash merge les efface) + **push systématique après chaque commit** : la durabilité vit sur origin. Coût maximal d'une coupure : ~2 h | 11 §9ter |
| H4 | **Protocole de reprise non écrit** : « lire DECISIONS.md + journal » ne disait ni l'ordre, ni la source de vérité, ni quoi faire si les traces divergent | Protocole en 6 pas : ETAT.md → git log/status → DECISIONS + AMELIORATIONS + journal → **suite de tests complète = LA vérité terrain** → divergence tests/ETAT = reconstruction depuis git + tests (jamais de confiance aveugle au fichier) → reprise à la « Prochaine action ». LE MÊME prompt couvre froid et reprise | 11 §9ter, §9 |

## MINEURS
| # | Correction V2.12 | Où |
|---|---|---|
| i1 | Le prompt de démarrage réécrit en PROMPT UNIQUE : rôle A01 + armée d'agents, détection d'ETAT.md (reprise) vs démarrage à froid, règles de marche condensées (pipeline, sauvegarde, portes, précédence, canal d'amélioration) — à coller tel quel | 11 §9 |
| i2 | La fin de journée d'autopilote (09 §5.4) inclut la mise à jour d'ETAT.md + le push | 09 §5.4 |
| i3 | L0 crée ETAT.md avec le reste du cadre de gouvernance (via le prompt §9) | 11 §9 |

Vérification finale du déroulé S1→S4 avec ce protocole : chaque coupure simulée (kill en étape 2, kill pendant les tests, kill pendant une porte, contexte épuisé en L5b) aboutit à une reprise déterministe en < 5 minutes de lecture, perte bornée à ~2 h de travail non poussé. Le pack est prêt au lancement ; les prérequis restants sont HUMAINS : dépôt GitHub créé avec le pack dans /docs, secrets Hetzner provisionnés (critère L0), et Williams disponible aux portes.
