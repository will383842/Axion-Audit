// =============================================================================
// SERVICE DES MISSIONS — et, au centre, l'APPLICATION de la machine à états du
// 03 §32.2. Lot L3, incrément L3b.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LA MACHINE À ÉTATS EST UNE DONNÉE ; CE FICHIER NE FAIT QUE LA PARCOURIR.
// ═══════════════════════════════════════════════════════════════════════════════
// `docs/conception/LOT_L3.md` §3b : « Aucun `if` de transition ailleurs. Appliquée
// dans le SERVICE (`transitionnerMission`), pas dans la route (qui ne fait que
// valider l'I/O et traduire l'`AppError`), pas en base. » On peut vérifier la
// promesse en cherchant un nom de statut dans ce fichier : **il n'y en a qu'UN**,
// `'livree'`, et il ne décide d'aucune transition — il désigne le seul état auquel
// le fichier 04 attache une colonne, `delivered_at`. Tout le reste passe par
// `evaluerTransitionMission`, qui lit `TRANSITIONS_MISSION`.
//
// ── CE QUI VIT ICI, ET NULLE PART AILLEURS ──────────────────────────────────
//   · la MESURE des conditions (le dépôt les lit, la table partagée les nomme,
//     personne ne les juge à part `evaluerTransitionMission`) ;
//   · la traduction d'un refus de la table en `AppError` française ;
//   · le fait qu'une mission et son unité racine naissent dans UNE transaction ;
//   · le fait qu'une modification qui NE CHANGE RIEN ne produit NI écriture NI
//     ligne de journal ;
//   · l'appel à la porte d'écriture unique du journal, TOUJOURS après le succès.
//
// ── CE QUE LE JOURNAL NE PORTE JAMAIS ───────────────────────────────────────
// Ni le titre de la mission, ni la référence du NDA, ni le TEXTE du motif d'une
// transition (voir `mission.status_change` dans `packages/shared/src/journal.ts` :
// c'est un trou du pack, écrit et remonté, pas une négligence d'ici).
// Traçabilité : E39 (Machine à états mission) · E24 (Validation obligatoire de
// chaque étape) · E4 (Arbre organisationnel profondeur libre — racine créée
// d'office) · E30 (3 niveaux d'audit) · E43 (Exécutabilité autopilote —
// conventions d'API).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import {
  AppError,
  evaluerTransitionMission,
  STATUT_MISSION_INITIAL,
  TYPE_UNITE_RACINE_DEFAUT,
  type CHAMPS_MISSION_JOURNALISABLES,
  type CodeConditionMission,
  type CreateMissionRequest,
  type FournisseurLlmMission,
  type MissionStatusRequest,
  type MotifRefusTransition,
  type NiveauAuditMission,
  type OffreCommercialeMission,
  type PaginationQuery,
  type PerimetreGeoMission,
  type RoleMission,
  LIBELLES_STATUT_MISSION,
  type StatutMission,
  type TransitionMission,
  type UpdateMissionRequest,
} from '@axion/shared';
import { db } from '../../db.js';
import type { PageCurseur } from '../../http/pagination.js';
import { journaliserActivite, type ContexteJournal } from '../journal/service.js';
import {
  insererMission,
  insererUniteRacine,
  lireMission,
  lireMissionPourEcriture,
  lireNomEntreprise,
  listerMissions,
  mesurerConditionsMission,
  mettreAJourMission,
  poserStatutMission,
  type LigneMission,
} from './depot.js';

/** Une colonne dont `mission.update` sait dire le NOM (jamais la valeur). */
type ChampJournalisable = (typeof CHAMPS_MISSION_JOURNALISABLES)[number];

/** Message unique de la mission introuvable. */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/**
 * Rendu quand un `UPDATE … RETURNING` ne rend rien alors que la ligne vient d'être
 * lue SOUS VERROU dans la même transaction : inatteignable, mais on échoue plutôt
 * qu'on asserte — une assertion mentirait au compilateur.
 */
function incoherenceInterne(): AppError {
  return new AppError('INTERNAL_ERROR', 'Une erreur interne est survenue.');
}

// -----------------------------------------------------------------------------
// LECTURES
// -----------------------------------------------------------------------------

/**
 * `GET /v1/missions`. Aucune journalisation : le catalogue ne trace aucune
 * consultation ordinaire — une liste se rafraîchit à chaque ouverture d'écran et
 * noierait la table. La seule consultation tracée du produit reste
 * `financier.consultation`, parce que 06 §10.5 l'exige nommément, et pour elle
 * seule.
 */
export async function listerLesMissions(
  pagination: PaginationQuery,
): Promise<PageCurseur<LigneMission>> {
  return listerMissions(pagination);
}

/** `GET /v1/missions/:id`. `NOT_FOUND` si elle n'existe pas ou est supprimée. */
export async function lireUneMission(id: string): Promise<LigneMission> {
  const ligne = await lireMission(id);
  if (ligne === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);
  return ligne;
}

// -----------------------------------------------------------------------------
// CRÉATION — la mission ET sa racine, ou rien
// -----------------------------------------------------------------------------

/** Ce qu'une création rend : la mission, et l'unité racine née avec elle. */
export interface CreationMission {
  readonly ligne: LigneMission;
  readonly uniteRacineId: string;
}

/**
 * `POST /v1/missions`.
 *
 * Les deux `id` sont des **UUID v7 frappés côté applicatif** (11 §2 : « côté
 * applicatif, client ET serveur » ; PostgreSQL 16 n'a pas d'`uuidv7()` native, et
 * une fonction SQL de génération v7 est explicitement interdite).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNE MISSION SANS RACINE N'EXISTE PAS — D'OÙ LA TRANSACTION.
 * ═══════════════════════════════════════════════════════════════════════════════
 * 03 §16.2 : « l'arbre est optionnel en pratique : **une racine est créée par
 * défaut** ». Créer la mission puis, dans un second aller-retour, sa racine,
 * laisserait une fenêtre où une mission existe SANS aucune unité — et tout ce qui
 * suit en dépend : un entretien se rattache à une unité (`interviews.org_unit_id`,
 * §16.2), le moteur M2 croise « unités `in_scope` », la couverture compte par
 * unité. Une mission sans unité n'est pas une mission incomplète : c'est une
 * mission sur laquelle rien du produit ne fonctionne. Les deux écritures sont donc
 * UNE transaction.
 *
 * ── L'ORDRE DES QUATRE OPÉRATIONS EST LA LOGIQUE, PAS UNE COMMODITÉ ─────────
 *  1. le NOM de l'entreprise est lu — il baptise la racine (voir `lireNomEntreprise`)
 *     et son absence est un refus AVANT toute écriture, avec un message utile ;
 *  2. la mission est insérée, `status` imposé à `STATUT_MISSION_INITIAL` : l'état
 *     initial n'est pas un choix de l'appelant (voir `createMissionRequestSchema`) ;
 *  3. la racine est insérée, `parent_id NULL` ;
 *  4. le journal est écrit APRÈS le commit — `journaliserActivite` écrit par `db`,
 *     pas par la transaction, et NE LÈVE JAMAIS : l'appeler dedans n'aurait rien
 *     atomisé, et l'appeler avant aurait tracé un acte qui n'a pas eu lieu.
 */
export async function creerUneMission(
  auteurId: string,
  entree: CreateMissionRequest,
  contexte: ContexteJournal,
): Promise<CreationMission> {
  const maintenant = new Date();
  const missionId = uuidv7();
  const racineId = uuidv7();

  const resultat = await db.transaction(async (tx) => {
    const nomEntreprise = await lireNomEntreprise(tx, entree.companyId);
    if (nomEntreprise === null) {
      throw new AppError('VALIDATION_FAILED', "Cette entreprise n'existe pas.", [
        { path: 'companyId', message: "Cette entreprise n'existe pas." },
      ]);
    }

    const ligne = await insererMission(
      tx,
      {
        id: missionId,
        companyId: entree.companyId,
        parentMissionId: entree.parentMissionId,
        title: entree.title,
        geoScope: entree.geoScope,
        countryCode: entree.countryCode,
        sizeTierId: entree.sizeTierId,
        activeSectors: entree.activeSectors,
        activeBlocks: entree.activeBlocks,
        auditLevel: entree.auditLevel,
        commercialOffer: entree.commercialOffer,
        timezone: entree.timezone,
        ndaRef: entree.ndaRef,
        ndaSignedAt: entree.ndaSignedAt,
        llmProvider: entree.llmProvider,
        startPlanned: entree.startPlanned,
        endPlanned: entree.endPlanned,
        createdBy: auteurId,
        statutInitial: STATUT_MISSION_INITIAL,
      },
      maintenant,
    );

    const uniteRacineId = await insererUniteRacine(
      tx,
      {
        id: racineId,
        missionId: ligne.id,
        // Le nom de l'entreprise auditée, LU EN BASE — invariant 2 : aucune
        // référence client ne descend dans le code.
        name: nomEntreprise,
        kind: TYPE_UNITE_RACINE_DEFAUT,
      },
      maintenant,
    );

    return { ligne, uniteRacineId };
  });

  await journaliserActivite(
    {
      action: 'mission.create',
      utilisateurId: auteurId,
      missionId: resultat.ligne.id,
      entrepriseId: resultat.ligne.companyId,
      avecRacine: true,
    },
    contexte,
  );

  return resultat;
}

// -----------------------------------------------------------------------------
// MODIFICATION
// -----------------------------------------------------------------------------

/**
 * Compare un champ demandé à sa valeur actuelle, et n'enregistre le changement que
 * s'il en est un.
 *
 * `undefined` = « ne touche pas » ; `null` = « efface ». Le premier n'entre jamais
 * dans le `SET`, le second oui — c'est toute la différence entre un `PATCH` et un
 * `PUT`, et la confondre rendrait impossible de retirer une référence de NDA saisie
 * par erreur.
 */
function comparer<Valeur>(
  demande: Valeur | undefined,
  actuelle: Valeur,
): { readonly change: false } | { readonly change: true; readonly valeur: Valeur } {
  if (demande === undefined || demande === actuelle) return { change: false };
  return { change: true, valeur: demande };
}

/**
 * Deux listes de codes sont égales si elles portent les mêmes valeurs DANS LE MÊME
 * ORDRE. L'ordre compte parce que la colonne est un JSONB — un tableau, pas un
 * ensemble : réordonner les blocs actifs EST une modification de la donnée stockée,
 * et la taire produirait une mission dont la valeur en base ne correspond plus à la
 * dernière écriture acceptée.
 */
function memesCodes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code, index) => code === b[index]);
}

/**
 * `PATCH /v1/missions/:id`.
 *
 * ── LA COMPARAISON AVANT/APRÈS N'EST PAS UNE OPTIMISATION ───────────────────
 * On n'écrit QUE les champs qui changent VRAIMENT, et on ne journalise QUE
 * ceux-là. Un `PATCH` qui renvoie le titre déjà en base produirait autrement une
 * ligne `mission.update` décrivant une modification qui n'a pas eu lieu, et un
 * `updated_at` bousculé sans raison. C'est ce journal-là qu'on relit le jour où
 * quelqu'un conteste une donnée de mission (invariant 7).
 *
 * ⚠ **`status` NE PASSE PAS PAR ICI**, et rien dans cette fonction ne pourrait
 * l'écrire : `updateMissionRequestSchema` est un `strictObject` sans clé `status`,
 * et `ChampsMissionModifiables` n'en déclare pas. La machine à états n'a qu'une
 * porte, et c'est `transitionnerMission`.
 *
 * ⚠ **AUCUN GARDE-FOU DE STATUT SUR CE `PATCH`**, et c'est écrit plutôt que
 * supposé : le pack ne dit nulle part qu'une mission `cloturee` cesserait d'être
 * modifiable dans ses champs de cadrage (§32.2 dit « jamais rouvert », ce qui parle
 * du STATUT). Le figeage, lui, protège ce qui doit l'être : le questionnaire, par
 * ses snapshots (LOT_L3.md §3a). Inventer ici un verrou de modification que le pack
 * ne demande pas empêcherait une correction légitime — corriger la référence d'un
 * NDA après clôture, par exemple — que l'invariant 7 suppose possible. Remonté au
 * rapport de l'incrément comme candidat `DECISIONS.md`.
 *
 * Transaction + `FOR UPDATE` : le lire-puis-écrire doit voir un état stable, sinon
 * la liste des champs journalisés décrit une transition qui n'a pas eu lieu.
 */
export async function modifierUneMission(
  auteurId: string,
  missionId: string,
  corps: UpdateMissionRequest,
  contexte: ContexteJournal,
): Promise<LigneMission> {
  const resultat = await db.transaction(async (tx) => {
    const avant = await lireMissionPourEcriture(tx, missionId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

    // Objet MUTABLE ici, `ChampsMissionModifiables` (en lecture seule) au passage :
    // on construit, puis on transmet une valeur que le dépôt ne peut plus altérer.
    const champs: {
      parentMissionId?: string | null;
      title?: string;
      geoScope?: PerimetreGeoMission;
      countryCode?: string | null;
      sizeTierId?: string | null;
      activeSectors?: string[];
      activeBlocks?: string[];
      auditLevel?: NiveauAuditMission;
      commercialOffer?: OffreCommercialeMission | null;
      timezone?: string;
      ndaRef?: string | null;
      ndaSignedAt?: string | null;
      llmProvider?: FournisseurLlmMission;
      startPlanned?: string | null;
      endPlanned?: string | null;
    } = {};
    const touches: ChampJournalisable[] = [];

    const missionMere = comparer(corps.parentMissionId, avant.parentMissionId);
    if (missionMere.change) {
      champs.parentMissionId = missionMere.valeur;
      touches.push('parent_mission_id');
    }

    const titre = comparer(corps.title, avant.title);
    if (titre.change) {
      champs.title = titre.valeur;
      touches.push('title');
    }

    const perimetre = comparer(corps.geoScope, avant.geoScope);
    if (perimetre.change) {
      champs.geoScope = perimetre.valeur;
      touches.push('geo_scope');
    }

    const pays = comparer(corps.countryCode, avant.countryCode);
    if (pays.change) {
      champs.countryCode = pays.valeur;
      touches.push('country_code');
    }

    const palier = comparer(corps.sizeTierId, avant.sizeTierId);
    if (palier.change) {
      champs.sizeTierId = palier.valeur;
      touches.push('size_tier_id');
    }

    const secteurs = corps.activeSectors;
    if (secteurs !== undefined && !memesCodes(secteurs, avant.activeSectors)) {
      champs.activeSectors = [...secteurs];
      touches.push('active_sectors');
    }

    const blocs = corps.activeBlocks;
    if (blocs !== undefined && !memesCodes(blocs, avant.activeBlocks)) {
      champs.activeBlocks = [...blocs];
      touches.push('active_blocks');
    }

    const niveau = comparer(corps.auditLevel, avant.auditLevel);
    if (niveau.change) {
      champs.auditLevel = niveau.valeur;
      touches.push('audit_level');
    }

    const offre = comparer(corps.commercialOffer, avant.commercialOffer);
    if (offre.change) {
      champs.commercialOffer = offre.valeur;
      touches.push('commercial_offer');
    }

    const fuseau = comparer(corps.timezone, avant.timezone);
    if (fuseau.change) {
      champs.timezone = fuseau.valeur;
      touches.push('timezone');
    }

    const nda = comparer(corps.ndaRef, avant.ndaRef);
    if (nda.change) {
      champs.ndaRef = nda.valeur;
      touches.push('nda_ref');
    }

    const ndaSigne = comparer(corps.ndaSignedAt, avant.ndaSignedAt);
    if (ndaSigne.change) {
      champs.ndaSignedAt = ndaSigne.valeur;
      touches.push('nda_signed_at');
    }

    const fournisseur = comparer(corps.llmProvider, avant.llmProvider);
    if (fournisseur.change) {
      champs.llmProvider = fournisseur.valeur;
      touches.push('llm_provider');
    }

    const debut = comparer(corps.startPlanned, avant.startPlanned);
    if (debut.change) {
      champs.startPlanned = debut.valeur;
      touches.push('start_planned');
    }

    const fin = comparer(corps.endPlanned, avant.endPlanned);
    if (fin.change) {
      champs.endPlanned = fin.valeur;
      touches.push('end_planned');
    }

    if (touches.length === 0) {
      return { ligne: avant, touches };
    }

    const apres = await mettreAJourMission(tx, missionId, champs, new Date());
    if (apres === null) throw incoherenceInterne();

    return { ligne: apres, touches };
  });

  const [premier, ...reste] = resultat.touches;
  if (premier !== undefined) {
    // Le tableau est reconstruit NON VIDE pour le schéma partagé (`min(1)`) : la
    // variante `mission.update` refuse une liste de champs vide, et elle a raison —
    // « j'ai modifié quelque chose, je ne sais pas quoi » n'est pas une trace.
    await journaliserActivite(
      {
        action: 'mission.update',
        utilisateurId: auteurId,
        missionId,
        champs: [premier, ...reste],
      },
      contexte,
    );
  }

  return resultat.ligne;
}

// =============================================================================
// LA MACHINE À ÉTATS — 03 §32.2, APPLIQUÉE
// =============================================================================

/**
 * Le libellé FRANÇAIS d'un statut, tel qu'un message d'erreur doit le nommer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE N'EST PAS UNE MACHINE À ÉTATS BIS, ET LA DIFFÉRENCE COMPTE.
 * ═══════════════════════════════════════════════════════════════════════════════
 * C'est un DICTIONNAIRE d'affichage : il ne dit rien de ce qui est permis, il
 * traduit un identifiant technique en français (invariant 5 : « libellés, codes
 * d'étape affichables et messages en français »). Écrire « la transition
 * preparation → en_cours est refusée » exposerait à l'utilisateur le vocabulaire de
 * la base ; le §32.2 lui-même parle de « Préparation » et de « Collecte ».
 * `Record<StatutMission, string>` est EXHAUSTIF par le type : ajouter un sixième
 * statut au 04 ne compilerait plus tant que son libellé manque.
 */
const LIBELLES_STATUT = LIBELLES_STATUT_MISSION;

/**
 * Le libellé FRANÇAIS de chaque condition du §32.2 — ce qui MANQUE, dit à
 * l'utilisateur plutôt qu'au développeur.
 *
 * `Record<CodeConditionMission, string>` est exhaustif par le type : ajouter une
 * condition à `CODES_CONDITION_MISSION` sans son libellé ne compile plus. Les trois
 * conditions non mesurables y figurent quand même — elles ne peuvent pas apparaître
 * dans un refus aujourd'hui (le dépôt ne les évalue pas, et une clé absente vaut
 * satisfaite), mais leur libellé sera dû le jour où leur fonctionnalité arrivera, et
 * une table trouée est une table qu'on complète en catastrophe.
 */
const LIBELLES_CONDITION: Record<CodeConditionMission, string> = {
  etape_cadrage_validee: "l'étape « cadrage » doit être validée",
  etape_preparation_validee: "l'étape « préparation » doit être validée",
  questionnaire_fige: 'le questionnaire de la mission doit être figé',
  plan_entretiens_etabli: "le plan d'entretiens doit être établi",
  etape_collecte_validee: "l'étape « collecte » doit être validée",
  export_realise: "l'export de la mission doit avoir été réalisé",
  etape_livraison_validee: "l'étape « livraison » doit être validée",
  retrospective_faite: 'la rétrospective de mission doit avoir été faite',
};

/** La phrase qui nomme le départ et l'arrivée. Présente dans TOUS les refus. */
function nommerTransition(depuis: StatutMission, vers: StatutMission): string {
  return `de « ${LIBELLES_STATUT[depuis]} » vers « ${LIBELLES_STATUT[vers]} »`;
}

/**
 * Traduit un refus de `evaluerTransitionMission` en `AppError`.
 *
 * ── LE CHOIX DES CODES, ÉCRIT PARCE QU'IL SE DISCUTE ────────────────────────
 * Trois refus sur quatre sortent en **409 `ILLEGAL_STATE_TRANSITION`**, y compris
 * `motif_manquant`. Ce n'est pas un raccourci : **409 est le statut de « l'état de
 * la ressource s'oppose à la demande »**, et c'est exactement le cas. Le même corps
 * de requête — sans motif — est parfaitement valide pour une transition « avant » et
 * refusé pour un retour arrière ; ce qui décide n'est pas la FORME de la requête
 * (ce serait un 400) mais l'ÉTAT de la mission. `errors.ts` tient déjà ce
 * raisonnement pour `COMPANY_DUPLICATE`.
 *
 * L'exception est `role_insuffisant`, qui sort en **403 `FORBIDDEN`** : là, ce n'est
 * ni la requête ni l'état, c'est le demandeur — et c'est le vocabulaire que le socle
 * d'autorisation emploie déjà partout. **Ce refus est aujourd'hui INATTEIGNABLE par
 * la route** : `config.acces` la réserve aux administrateurs (§34.1), et `admin`
 * figure sur les sept lignes de `TRANSITIONS_MISSION`. Il est traduit quand même,
 * parce que le service est appelable autrement qu'à travers cette route, et parce
 * que le jour où le lead entrera dans la console (§34.1, Phase 2) ce chemin
 * s'ouvrira sans qu'on ait à le redécouvrir.
 *
 * ── `details[]` : CE QUE CHAQUE REFUS Y MET, ET POURQUOI ─────────────────────
 *   · `conditions_non_remplies` — **CHAQUE** condition manquante, jamais la
 *     première seule (`LOT_L3.md` §3b) : s'arrêter au premier manque imposerait à
 *     l'utilisateur autant d'allers-retours qu'il y a de manques. `path` porte le
 *     CODE de la condition, `message` son libellé français ;
 *   · `motif_manquant` — une entrée sur `path: 'motif'`, qui dit quel champ
 *     remplir ;
 *   · `transition_inexistante` — les deux états, `path` disant lequel (`depuis` /
 *     `vers`), `code` portant l'état EXACT pour le support et `message` son libellé
 *     français pour l'écran (arbitrage A01 du 2026-09-01) ;
 *   · `role_insuffisant` — **RIEN**, et c'est délibéré : `conditionsNonRemplies`
 *     est vide par contrat, et transporter les manques apprendrait l'avancement
 *     d'une mission à quelqu'un qui n'a pas le droit de la faire avancer.
 */
function refusEnErreur(
  depuis: StatutMission,
  vers: StatutMission,
  motifRefus: MotifRefusTransition,
  conditionsNonRemplies: readonly CodeConditionMission[],
): AppError {
  const trajet = nommerTransition(depuis, vers);

  switch (motifRefus) {
    case 'transition_inexistante':
      return new AppError(
        'ILLEGAL_STATE_TRANSITION',
        depuis === vers
          ? `La mission est déjà à l'état « ${LIBELLES_STATUT[depuis]} » : ce changement de statut n'en est pas un.`
          : `Le passage ${trajet} n'est pas autorisé.`,
        // LES DEUX ÉTATS, DANS LES DEUX LANGUES QU'IL FAUT — arbitrage A01 du
        // 2026-09-01 sur la rencontre tests × code de L3b.
        //
        // Le besoin est celui du SUPPORT : lire les états EXACTS sans avoir à
        // retraduire des libellés d'affichage. Il est servi par `code`, le champ
        // technique d'`errorDetailSchema` (amendement `DECISIONS.md` du 2026-08-29,
        // dont ceci est le premier appelant). `message` reste ce qu'il est partout
        // ailleurs : une phrase française affichable telle quelle — invariant 5, que
        // l'en-tête d'`errors.ts` promet « sans exception ». Écrire `en_analyse` dans
        // `message` aurait fait de ces deux lignes la seule exception du produit.
        //
        // Les deux entrées sont posées pour les DEUX branches ci-dessus, identités
        // comprises : c'est précisément sur une identité que le support a besoin de
        // voir que `depuis` et `vers` portent le même code.
        [
          { path: 'depuis', code: depuis, message: LIBELLES_STATUT[depuis] },
          { path: 'vers', code: vers, message: LIBELLES_STATUT[vers] },
        ],
      );

    case 'role_insuffisant':
      return new AppError(
        'FORBIDDEN',
        `Votre rôle ne vous permet pas de faire passer une mission ${trajet}.`,
      );

    case 'motif_manquant':
      return new AppError(
        'ILLEGAL_STATE_TRANSITION',
        `Le passage ${trajet} exige un motif : indiquez pourquoi vous faites ce changement.`,
        [{ path: 'motif', message: 'Un motif est obligatoire pour ce changement de statut.' }],
      );

    case 'conditions_non_remplies':
      return new AppError(
        'ILLEGAL_STATE_TRANSITION',
        `Le passage ${trajet} est refusé : toutes les conditions ne sont pas remplies.`,
        conditionsNonRemplies.map((code) => ({
          path: code,
          message: LIBELLES_CONDITION[code],
        })),
      );
  }
}

/** Ce qu'une transition réussie rend : la mission, et ce que la transition a été. */
export interface ResultatTransition {
  readonly ligne: LigneMission;
  readonly depuis: StatutMission;
  readonly transition: TransitionMission;
  readonly surchargeUtilisee: boolean;
}

/**
 * `POST /v1/missions/:id/status` — **LE point d'application du 03 §32.2.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * LES SEPT ÉTAPES, DANS UN ORDRE QUI N'EST PAS INDIFFÉRENT.
 * ═══════════════════════════════════════════════════════════════════════════════
 *  1. **verrou** — la mission est lue `FOR UPDATE`. C'est ce qui rend la décision
 *     vraie : sans lui, deux demandes concurrentes jugeraient sur le même `depuis`
 *     et écriraient toutes deux (voir `lireMissionPourEcriture`) ;
 *  2. **`depuis` vient de la BASE**, jamais de l'appelant. Une console peut afficher
 *     un statut périmé ; accepter son `depuis` reviendrait à laisser le client
 *     choisir la ligne de la table qu'on va parcourir ;
 *  3. **mesure** des conditions, sur `step_validations` et `mission_questions` —
 *     cinq mesurées, trois absentes et donc réputées satisfaites (03 §17.2 V2.9 ;
 *     voir `mesurerConditionsMission`) ;
 *  4. **jugement** par `evaluerTransitionMission`, fonction PURE de
 *     `packages/shared` : c'est elle, et elle seule, qui lit `TRANSITIONS_MISSION`.
 *     Aucun `if` de transition n'est écrit ici ;
 *  5. **refus** traduit en `AppError` française nommant le départ et l'arrivée ;
 *  6. **écriture** du statut — la seule du code — avec `delivered_at` posé à la
 *     première entrée en `livree` ;
 *  7. **journal** APRÈS le commit (§32.2 : les retours arrière sont « tracés
 *     `activity_log` » ; on trace les sept transitions, pas seulement les trois
 *     retours — un journal qui ne raconte que les marches arrière ne permet pas de
 *     reconstituer le chemin).
 *
 * ── IDEMPOTENCE : CE QUE LE MOT VEUT DIRE ICI ───────────────────────────────
 * Rejouer la MÊME demande ne produit **jamais** un second changement d'état ni une
 * seconde ligne de journal : la deuxième fois, `depuis` vaut déjà `vers`, le couple
 * n'existe pas dans la table (aucune ligne n'a `depuis === vers`) et la demande est
 * refusée en 409 sans rien écrire. L'état final est le même qu'après un seul appel —
 * c'est l'idempotence de l'EFFET. Rendre 200 à la place aurait exigé d'autoriser les
 * identités, donc d'écrire une ligne `activity_log` pour un non-événement, ce que la
 * table partagée refuse explicitement.
 */
export async function transitionnerMission(
  auteur: { readonly id: string; readonly role: RoleMission },
  missionId: string,
  corps: MissionStatusRequest,
  contexte: ContexteJournal,
): Promise<ResultatTransition> {
  const resultat = await db.transaction(async (tx) => {
    // ① + ②
    const avant = await lireMissionPourEcriture(tx, missionId);
    if (avant === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

    const depuis = avant.status;

    // ③
    const evaluees = await mesurerConditionsMission(tx, missionId);

    // ④ — LE seul juge. Aucune règle de transition n'est réécrite ici.
    // `motif` n'est AJOUTÉ que s'il existe : `exactOptionalPropertyTypes` distingue
    // « propriété absente » de « propriété à `undefined` », et
    // `DemandeTransitionMission.motif` est déclaré optionnel — pas nullable. La
    // distinction n'est pas cosmétique : elle est exactement celle que
    // `motifFourni` interroge dans la table partagée.
    const verdict = evaluerTransitionMission({
      depuis,
      vers: corps.vers,
      role: auteur.role,
      ...(corps.motif === undefined ? {} : { motif: corps.motif }),
      surcharge: corps.surcharge,
      conditions: { evaluees },
    });

    // ⑤
    if (!verdict.ok) {
      throw refusEnErreur(depuis, corps.vers, verdict.motifRefus, verdict.conditionsNonRemplies);
    }

    // ⑥ — `delivered_at` posé à la PREMIÈRE entrée en `livree`, jamais effacé.
    //
    // ⚠ C'EST LA SEULE MENTION D'UN STATUT DANS CE FICHIER, et elle ne décide
    // d'aucune transition : elle répond à la question « quand cette mission a-t-elle
    // été livrée ? », à laquelle le fichier 04 consacre une colonne que personne
    // d'autre n'écrit. `avant.deliveredAt === null` garantit qu'un aller-retour
    // `livree → en_analyse → livree` conserve la date de PREMIÈRE livraison :
    // invariant 7, « rien n'est jamais silencieusement écrasé ». Le pack ne dit pas
    // explicitement qui pose cette colonne — remonté comme candidat `DECISIONS.md`.
    const maintenant = new Date();
    const deliveredAt =
      corps.vers === 'livree' && avant.deliveredAt === null ? maintenant : undefined;

    const apres = await poserStatutMission(
      tx,
      missionId,
      depuis,
      corps.vers,
      deliveredAt,
      maintenant,
    );
    if (apres === null) throw incoherenceInterne();

    return {
      ligne: apres,
      depuis,
      transition: verdict.transition,
      surchargeUtilisee: verdict.surchargeUtilisee,
    };
  });

  // ⑦
  await journaliserActivite(
    {
      action: 'mission.status_change',
      utilisateurId: auteur.id,
      missionId,
      statutAvant: resultat.depuis,
      statutApres: resultat.ligne.status,
      sens: resultat.transition.sens,
      surcharge: resultat.surchargeUtilisee,
      // LE MOTIF LUI-MÊME, en code — arbitrage Williams du 2026-09-02, « motif
      // codé ». Ce n'est plus « il y en a eu un » mais LEQUEL : `perimetre_a_reprendre`
      // et `erreur_de_manipulation` ne racontent pas la même mission, et le booléen
      // qui vivait ici les confondait. La clé n'est AJOUTÉE que si le motif existe
      // (`exactOptionalPropertyTypes` : la variante le déclare optionnel, pas
      // nullable) ; la projection du journal écrit `null` en son absence, pour que
      // la forme de `meta` reste la même sur les sept transitions.
      ...(corps.motif === undefined ? {} : { motif: corps.motif }),
    },
    contexte,
  );

  return resultat;
}
