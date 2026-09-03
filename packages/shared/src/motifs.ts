// =============================================================================
// LES MOTIFS CODÉS — deux vocabulaires FERMÉS, partagés API ↔ fronts.
// Lot L3, incréments L3b (03 §32.2, retours arrière) et L3d (03 §34.4,
// réaffectation d'une session).
//
// ── D'OÙ VIENT CE FICHIER ────────────────────────────────────────────────────
// `DECISIONS.md`, 2026-09-02, « Le motif d'un retour arrière et d'une
// réaffectation est un CODE, pas un texte — tranché par Williams », option 3 :
// « **motif codé** ». Le motif est EXIGÉ à l'appel, VALIDÉ contre le vocabulaire,
// et TRACÉ dans `activity_log` par `journaliserActivite`. Aucune colonne ni table
// nouvelle : ce qui vivait comme un booléen (`avecMotif`) devient une VALEUR.
//
// ── POURQUOI UN CODE, ET PAS UNE PHRASE ──────────────────────────────────────
// `activity_log.meta` est la seule colonne libre du 04, et la ceinture 2 du
// journal (`verifierValeursAtomiques`) n'y admet que du vocabulaire technique :
// 64 caractères, ni espace ni arobase. Une phrase française y serait refusée EN
// BLOC — emportant avec elle le statut d'avant, le statut d'après et les deux
// auditeurs (voir `META_REFUSEE`). Un code passe la ceinture par construction ;
// le libellé français, lui, vit ICI et n'entre jamais en base.
//
// Ce que le produit gagne au passage, et qui vaut plus que le contournement :
// un motif CODÉ se COMPTE. « Combien de collectes rouvertes pour un rapport à
// corriger, ce trimestre ? » est une question qu'un texte libre ne sait pas
// répondre, et qu'un `GROUP BY meta->>'motif'` répond en une ligne.
//
// ── POURQUOI DANS `packages/shared` ──────────────────────────────────────────
// Même raison que `TRANSITIONS_MISSION` et `LIBELLES_STATUT_MISSION` : la console
// (L7) doit peupler sa liste déroulante SANS appeler l'API, et l'API doit refuser
// tout ce qui n'y figure pas. Une seule source, importée des deux côtés ; deux
// listes finiraient par diverger sans que rien ne le signale (11 §3, « le front
// importe LES MÊMES schémas »).
//
// ── CE QUE CE FICHIER N'IMPORTE PAS, ET POURQUOI C'EST DÉLIBÉRÉ ──────────────
// **C'est une FEUILLE du graphe de modules : il n'importe RIEN, pas même `zod`.**
// L'arête utile serait `motifs → journal` (pour vérifier les codes contre
// `MOTIF_VALEUR_JOURNAL`) ; elle refermerait un CYCLE À L'EXÉCUTION, car
// `journal.ts` importe `missions.ts`, qui importe ce fichier — et le premier
// module chargé lirait une constante encore en zone morte temporelle. La
// vérification vit donc à l'AUTRE bout de l'arête, dans `journal.ts`, juste sous
// `MOTIF_VALEUR_JOURNAL` : elle s'exécute AU CHARGEMENT du paquet, avec le motif
// RÉEL (aucune copie, aucune dérive possible), et un code non conforme ajouté ici
// fait échouer le premier test venu — pas la vigilance d'un relecteur.
//
// ── LES LIBELLÉS, ET L'INVARIANT 5 ──────────────────────────────────────────
// Chaque vocabulaire a son dictionnaire `Record<Motif…, string>`, EXHAUSTIF PAR
// LE TYPE : ajouter un code sans son libellé ne compile pas. Le partage est celui
// de la convention transverse du 2026-09-01 : **le CODE est de la machine
// (`details[].code`, `activity_log.meta`), le LIBELLÉ est de l'interface
// (`details[].message`, la liste déroulante), et l'invariant 5 s'applique au
// second, jamais au premier.**
//
// ── AUCUNE RÉFÉRENCE CLIENT (invariant 2) ────────────────────────────────────
// Ces deux listes décrivent des SITUATIONS D'AUDIT, jamais un client, jamais un
// secteur, jamais une mission. Elles sont vraies pour les quatre archétypes du
// 01 §2, du cabinet de 8 personnes au groupe de 150 unités.
//
// Traçabilité : E39 (machine à états mission) · E25 (plan d'entretiens et
// affectations) · E33 (sécurité / RGPD : rien de personnel dans le journal) ·
// E43 (exécutabilité autopilote : conventions d'API) · invariant 7 (« toute
// correction de donnée = révision tracée » : tracée AVEC SA RAISON).
// =============================================================================

// -----------------------------------------------------------------------------
// 03 §32.2 — LE MOTIF D'UN CHANGEMENT DE STATUT EXCEPTIONNEL
// -----------------------------------------------------------------------------

/**
 * Pourquoi un administrateur défait, ou force, un changement de statut de mission.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE VOCABULAIRE SERT LES **DEUX** CAS OÙ `TRANSITIONS_MISSION` EXIGE UN MOTIF.
 * ═══════════════════════════════════════════════════════════════════════════════
 *   · les TROIS RETOURS ARRIÈRE du §32.2 (`motifRequis: true`) :
 *     `en_cours → preparation`, `en_analyse → en_cours` (réouverture de collecte),
 *     `livree → en_analyse` (correction de rapport) ;
 *   · la SURCHARGE ADMIN du §17.3 (`surchargeAdminMotivee`), qui n'est pas un
 *     retour mais exige elle aussi un motif : « passer en analyse ou livrée
 *     affiche les manques ; l'admin peut forcer, **avec motif journalisé** ».
 *
 * Les deux cas partagent UN SEUL champ de requête (`missionStatusRequestSchema
 * .motif`) : leur donner deux vocabulaires obligerait le service à choisir lequel
 * valider APRÈS avoir lu l'état de la mission — c'est-à-dire à faire en 409 ce que
 * Zod fait en 400. Le nom retenu (`MOTIFS_RETOUR_ARRIERE`) est celui de l'usage
 * principal ; les deux derniers codes de la liste servent surtout le forçage.
 * Point remonté à `DECISIONS.md` le 2026-09-02 plutôt que tranché en silence.
 *
 * ── CE QUE CHAQUE CODE DIT, ET D'OÙ IL VIENT ────────────────────────────────
 * Aucun n'est inventé pour faire nombre : chacun répond à une situation nommée
 * par le pack, et l'ordre suit le cycle de vie (préparation → rapport).
 */
export const MOTIFS_RETOUR_ARRIERE = [
  /**
   * Le périmètre ou l'arbre organisationnel doit être repris — 03 §17.2, étape
   * Cadrage (« périmètre géo tranché · arbre organisationnel saisi ») et §25.1
   * (réduction de périmètre : des unités passent `in_scope = false`). C'est LA
   * raison de `en_cours → preparation` : on ne collecte pas sur un arbre faux.
   */
  'perimetre_a_reprendre',
  /**
   * Le questionnaire ou le plan d'entretiens doit être repris — 03 §17.2, étape
   * Préparation (« questionnaire généré · plan d'entretiens établi »). Seconde
   * raison de `en_cours → preparation` : le terrain est parti avec le mauvais jeu
   * de questions ou la mauvaise cible d'entretiens.
   */
  'questionnaire_a_reprendre',
  /**
   * La collecte doit être complétée — 03 §16.6 (plan de couverture, « réel vs
   * plan ») et §17.3 (« unité Logistique : 0/2 entretiens »). C'est la
   * « réouverture de collecte » que le §32.2 nomme pour `en_analyse → en_cours`.
   */
  'collecte_a_completer',
  /**
   * Des réponses ou des à-revoir doivent être corrigés — 03 §17.2, étape Collecte
   * (« à-revoir purgés ») et invariant 7. Se distingue du précédent : il ne manque
   * pas d'entretien, ce sont les DONNÉES déjà saisies qu'il faut reprendre.
   */
  'donnees_a_corriger',
  /**
   * Le rapport livré doit être corrigé — 03 §32.2, VERBATIM, pour le troisième
   * retour : `livree → en_analyse` (« correction de rapport »).
   */
  'rapport_a_corriger',
  /**
   * Les manques constatés sont connus et assumés — 03 §17.3 : « passer en analyse
   * ou livrée AFFICHE LES MANQUES ; l'admin peut forcer, avec motif journalisé ».
   * C'est le motif type d'une SURCHARGE : rien n'est cassé, la décision est prise
   * en connaissance de cause, et le journal doit garder qu'elle l'a été.
   */
  'manques_assumes',
  /**
   * Changement demandé par le client audité — 03 §6.4 et §20.2 : la restitution
   * est un moment de dialogue, et le commanditaire peut demander un complément ou
   * une correction. Le journal enregistre QUE la demande venait du client, jamais
   * qui l'a formulée (aucune personne dans `activity_log`, 11 §2).
   */
  'demande_du_client',
  /**
   * Le changement de statut précédent a été fait par erreur — le cas le plus banal
   * d'un retour arrière, et celui qu'une liste « propre » oublierait. L'omettre
   * forcerait l'administrateur à cocher une raison FAUSSE pour réparer un clic :
   * un vocabulaire fermé qui ne sait pas dire « je me suis trompé » produit une
   * trace mensongère, ce que l'invariant 7 refuse plus sûrement qu'un trou.
   */
  'erreur_de_manipulation',
  /**
   * Incident technique — 03 §32.5 (sauvegarde terrain) et invariant 8 : perte
   * d'appareil, synchronisation muette, données arrivées après coup. La mission
   * revient en arrière parce que la RÉALITÉ des données a changé, pas l'audit.
   */
  'incident_technique',
] as const;

export type MotifRetourArriere = (typeof MOTIFS_RETOUR_ARRIERE)[number];

/**
 * Le français des motifs de changement de statut (invariant 5).
 *
 * `Record<MotifRetourArriere, string>` est EXHAUSTIF PAR LE TYPE : ajouter un code
 * ci-dessus sans son libellé ici ne compile pas. Même garde-fou que
 * `LIBELLES_STATUT_MISSION`, et pour la même raison — une liste déroulante à trou
 * afficherait un identifiant technique à un administrateur.
 */
export const LIBELLES_MOTIF_RETOUR_ARRIERE: Record<MotifRetourArriere, string> = {
  perimetre_a_reprendre: 'Le périmètre ou l’arbre organisationnel doit être repris',
  questionnaire_a_reprendre: 'Le questionnaire ou le plan d’entretiens doit être repris',
  collecte_a_completer: 'La collecte doit être complétée (unités ou entretiens manquants)',
  donnees_a_corriger: 'Des réponses ou des à-revoir doivent être corrigés',
  rapport_a_corriger: 'Le rapport livré doit être corrigé',
  manques_assumes: 'Les manques constatés sont connus et assumés',
  demande_du_client: 'Changement demandé par le client audité',
  erreur_de_manipulation: 'Le changement de statut précédent a été fait par erreur',
  incident_technique: 'Incident technique (perte ou retard de synchronisation)',
};

// -----------------------------------------------------------------------------
// 03 §34.4 — LE MOTIF D'UNE RÉAFFECTATION DE SESSION
// -----------------------------------------------------------------------------

/**
 * Pourquoi une session PLANIFIÉE non commencée change d'auditeur.
 *
 * Le §34.4 est le seul endroit du pack qui décrit ce geste, et il le décrit comme
 * un RUNBOOK — « SORTIE / INDISPONIBILITÉ » : sync forcée, révocation du compte,
 * retrait des `mission_users`, puis réaffectation des sessions non commencées.
 * Les trois premiers codes sont donc une transcription de ce runbook ; les quatre
 * suivants viennent du pilotage ORDINAIRE d'une équipe, qui réaffecte bien plus
 * souvent qu'elle ne perd un auditeur (§18.2 répartition des unités, §34.4
 * ACTIVITÉ « l'espace 3 pilote la charge », §34.6 anti-collision d'agenda).
 *
 * ⚠ **AUCUN CODE NE DÉSIGNE UNE PERSONNE.** « Départ de l'auditeur » dit ce qui
 * s'est passé, pas qui : les deux auditeurs sont déjà dans `meta` en IDENTIFIANTS
 * (`auditeur_avant`, `auditeur_apres`), et un motif qui nommerait quelqu'un ferait
 * entrer une donnée personnelle dans la table d'audit (11 §2, §34.5 « piloter,
 * pas surveiller »).
 */
export const MOTIFS_REAFFECTATION = [
  /**
   * Départ de l'auditeur — 03 §34.4, SORTIE : révocation du compte et des jetons,
   * retrait des `mission_users`. La session doit repartir : elle n'a plus de
   * conducteur possible.
   */
  'depart_auditeur',
  /**
   * Indisponibilité de l'auditeur — 03 §34.4, dont le titre nomme les deux cas
   * (« SORTIE / INDISPONIBILITÉ »). Le compte VIT toujours ; c'est la personne qui
   * n'est pas là au moment prévu. La distinction compte : après un départ, plus
   * aucune session ne revient ; après une indisponibilité, elles reviennent.
   */
  'indisponibilite_auditeur',
  /**
   * Appareil hors service ou non récupérable — 03 §34.4, point 5 du runbook
   * (« perte bornée par l'invariant 8, constat tracé »). L'auditeur est là, ses
   * données planifiées ne le sont plus.
   */
  'incident_appareil',
  /**
   * La répartition des unités entre auditeurs a été revue — 03 §18.2 (« l'admin
   * répartit les unités de l'arbre entre les auditeurs ») et §18, espace 2
   * (« actions : réaffecter des unités »). La session suit son unité.
   */
  'repartition_revue',
  /**
   * Rééquilibrage de la charge — 03 §34.4, ACTIVITÉ : « l'espace 3 pilote la
   * charge ». Personne n'est absent, personne ne s'est trompé : c'est du pilotage,
   * et c'est probablement le motif le plus fréquent d'une mission à trois auditeurs.
   */
  'equilibrage_de_charge',
  /**
   * Conflit d'agenda sur le créneau prévu — 03 §34.6 (anti-collision : « la même
   * unité ou la même personne a déjà une session sur un créneau chevauchant par un
   * AUTRE auditeur ») et §25.2 (détection de chevauchement). L'avertissement n'est
   * pas bloquant ; sa résolution, elle, passe par ici.
   */
  'conflit_agenda',
  /**
   * La session avait été affectée au mauvais auditeur — l'erreur de planification,
   * pendant exact de `erreur_de_manipulation` côté statut, et pour la même raison :
   * un vocabulaire fermé qui ne sait pas dire « erreur » se fait mentir.
   */
  'erreur_de_planification',
] as const;

export type MotifReaffectation = (typeof MOTIFS_REAFFECTATION)[number];

/**
 * Le français des motifs de réaffectation (invariant 5). Exhaustif par le type,
 * même garde-fou que `LIBELLES_MOTIF_RETOUR_ARRIERE`.
 */
export const LIBELLES_MOTIF_REAFFECTATION: Record<MotifReaffectation, string> = {
  depart_auditeur: 'Départ de l’auditeur',
  indisponibilite_auditeur: 'Indisponibilité de l’auditeur',
  incident_appareil: 'Appareil hors service ou non récupérable',
  repartition_revue: 'La répartition des unités entre auditeurs a été revue',
  equilibrage_de_charge: 'Rééquilibrage de la charge entre auditeurs',
  conflit_agenda: 'Conflit d’agenda sur le créneau prévu',
  erreur_de_planification: 'La session avait été affectée au mauvais auditeur',
};
