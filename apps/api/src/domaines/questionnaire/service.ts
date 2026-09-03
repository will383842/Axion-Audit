// =============================================================================
// SERVICE DU QUESTIONNAIRE — prévisualisation §33.4 et FIGEAGE M2.
// Lot L3, incrément L3d, tâche T3.
//
// ── LES DEUX ACTES, ET CE QUI LES SÉPARE ────────────────────────────────────
//   · `previsualiserQuestionnaire` — LIT et calcule. **N'écrit rien, ne journalise
//     rien**, ne verrouille rien. Elle répond à « qu'est-ce que je m'apprête à
//     figer ? » (§33.4 : « plus jamais 240 questions découvertes après figeage ») ;
//   · `figerLeQuestionnaire` — la CAPTURE. Une transaction, un `FOR UPDATE` sur la
//     mission, un `INSERT`, et un refus dès que quoi que ce soit s'y oppose.
//
// Les deux appellent LA MÊME fonction pure (`assembler`) sur LES MÊMES lectures :
// c'est la seule façon que la prévisualisation dise la vérité. Un aperçu calculé
// autrement que le figeage serait un aperçu qui ment de temps en temps.
//
// ── CE QUE CE SERVICE NE FAIT JAMAIS ────────────────────────────────────────
//   · il ne recalcule aucun filtre, aucun tri, aucun rang : tout cela vit dans
//     `assembleur.ts`, qui est pur et testé comme tel. Ce fichier ORCHESTRE ;
//   · il n'écrit AUCUN `UPDATE` sur une colonne `*_snapshot` — deuxième temps de la
//     preuve de non-dérive (note de conception L3 §3.a). Il n'y a pas d'`update`
//     dans ce fichier, et il ne doit pas y en avoir ;
//   · il ne journalise pas la prévisualisation : elle recopierait des codes de
//     blocs et de services du client (11 §2, `DECISIONS.md` 2026-08-29).
//
// ── LA RE-VÉRIFICATION DE `question_version`, ET OÙ ELLE VIT ────────────────
// La note L3 §3.a promet qu'à chaque LECTURE d'un questionnaire figé,
// `mission_questions.question_version` est confronté à la ligne pointée. Aucune
// route de L3d ne lit le questionnaire figé : l'obligation est **transmise au
// premier lecteur** — le pull de mission (L5a/L6a) et `resync` (L9)
// (`DECISIONS.md` 2026-09-02). Ce que L3d garantit, et que le test éprouve : après
// mutation de la banque, les captures NE BOUGENT NI NE SE RÉPARENT.
//
// Traçabilité : E39 (machine à états mission : figer n'est possible qu'en
// préparation, et le figeage conditionne la transition vers la collecte) · E24
// (validation obligatoire de chaque étape : le figeage referme la préparation) ·
// E30 (3 niveaux d'audit) · E43 (exécutabilité autopilote : conventions d'API).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import { AppError } from '@axion/shared';
import { db } from '../../db.js';
import type { ExecuteurSql } from '../auth/depot.js';
import { journaliserActivite, type ContexteJournal } from '../journal/service.js';
import { assembler, LIBELLES_FILTRE_ASSEMBLAGE, type SortieAssemblage } from './assembleur.js';
import {
  compterQuestionsFigees,
  insererQuestionsFigees,
  lireBanquePourAssemblage,
  lireDateDeFigeage,
  lireMissionPourFigeage,
  lireMissionPourQuestionnaire,
  lirePalierDeMission,
  lireProfilsPourAssemblage,
  lireUnitesPourAssemblage,
  type LigneMissionQuestionnaire,
  type LigneQuestionFigee,
} from './depot.js';

/** Même message que les autres services de mission — un 404 ne se décline pas. */
const MESSAGE_MISSION_INTROUVABLE = "Cette mission n'existe pas.";

/**
 * Le SEUL état où figer est permis (03 §32.2, brief L3D §8-10).
 *
 * Figer une mission `en_cours` réécrirait le questionnaire sous les pieds du
 * terrain : les appareils ont déjà tiré les questions et les réponses pointent des
 * `mission_questions` qui cesseraient d'être celles du siège.
 */
const STATUT_AUTORISANT_LE_FIGEAGE = 'preparation';

/** Libellés français des états, pour un refus lisible (invariant 5). */
const LIBELLES_STATUT: Readonly<Record<string, string>> = {
  preparation: 'préparation',
  en_cours: 'collecte en cours',
  en_analyse: 'analyse',
  livree: 'livrée',
  cloturee: 'clôturée',
};

/** Traduit un état pour un humain ; rend le code brut si l'état est inconnu. */
function libelleStatut(statut: string): string {
  return LIBELLES_STATUT[statut] ?? statut;
}

/**
 * « le 2026-09-02 à 14:33 (UTC) » — l'instant, sans fuseau deviné.
 *
 * Les horodatages sont UTC en base et en API (11 §3) ; le fuseau de mission ne sert
 * qu'à l'AFFICHAGE (§22.2), et un message d'erreur du serveur ne connaît pas
 * l'écran qui le lira. On écrit donc « UTC » plutôt que de laisser croire à une
 * heure locale.
 */
function formaterInstantUtc(instant: Date): string {
  const iso = instant.toISOString();
  return `le ${iso.slice(0, 10)} à ${iso.slice(11, 16)} (UTC)`;
}

// -----------------------------------------------------------------------------
// L'ASSEMBLAGE — les cinq lectures, puis la fonction pure
// -----------------------------------------------------------------------------

/**
 * Rassemble les entrées et appelle l'assembleur. Aucune décision ici.
 *
 * Les lectures sont SÉQUENTIELLES et non `Promise.all` : sur le chemin du figeage
 * elles partagent le client PostgreSQL d'une transaction, qui les sérialise de
 * toute façon ; les lancer en parallèle ne gagnerait rien et rendrait illisible
 * l'ordre des requêtes le jour où l'on débogue un verrou. Même geste, même raison,
 * que `mesurerConditionsMission` (domaines/missions/depot.ts).
 */
async function assemblerPourMission(
  executeur: ExecuteurSql,
  mission: LigneMissionQuestionnaire,
): Promise<SortieAssemblage> {
  const palier = await lirePalierDeMission(executeur, mission.sizeTierId);
  const unites = await lireUnitesPourAssemblage(executeur, mission.id);
  const questions = await lireBanquePourAssemblage(executeur);
  const profils = await lireProfilsPourAssemblage(executeur);

  return assembler({ mission, palier, unites, questions, profils });
}

// -----------------------------------------------------------------------------
// PRÉVISUALISATION — §33.4
// -----------------------------------------------------------------------------

/**
 * `GET /v1/missions/:id/questionnaire-preview`.
 *
 * Rend l'assemblage COMPLET (l'entonnoir compris) : la route choisit ce qu'elle en
 * publie. Un service qui rendrait déjà la forme d'API obligerait à le réécrire le
 * jour où un second appelant — l'écran de figeage, un export — a besoin d'un champ
 * de plus.
 *
 * ⚠ **La prévisualisation reste possible APRÈS le figeage**, et ce n'est pas un
 * oubli : elle montre alors ce que la banque produirait AUJOURD'HUI, ce qui est
 * exactement la question que se pose un administrateur avant de demander un
 * `resync` (L9). Elle ne prétend pas décrire les lignes figées — celles-ci se
 * lisent dans `mission_questions`, et leur lecteur devra vérifier `question_version`
 * (voir l'en-tête).
 */
export async function previsualiserQuestionnaire(missionId: string): Promise<SortieAssemblage> {
  const mission = await lireMissionPourQuestionnaire(db, missionId);
  if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

  return assemblerPourMission(db, mission);
}

// -----------------------------------------------------------------------------
// FIGEAGE — la capture, une fois, sous verrou
// -----------------------------------------------------------------------------

/** Ce que rend un figeage réussi : de quoi confirmer l'acte, rien de plus. */
export interface ResultatFigeage {
  readonly total: number;
  readonly parBloc: SortieAssemblage['parBloc'];
}

/** Le refus « déjà figé » — avec le COMPTE et la DATE (`DECISIONS.md` 2026-08-29). */
function refusDejaFige(compte: number, dateFigeage: Date | null): AppError {
  const quand =
    dateFigeage === null
      ? "la date du figeage n'est pas connue du journal d'activité"
      : `figées ${formaterInstantUtc(dateFigeage)}`;

  const message =
    `Le questionnaire de cette mission est déjà figé : ${String(compte)} question(s), ${quand}. ` +
    'Un questionnaire figé ne se régénère pas.';

  return new AppError('QUESTIONNAIRE_ALREADY_FROZEN', message, [
    // `code` porte la cause MACHINE, `message` la phrase française — convention
    // transverse du 2026-09-01. Le front branche sur `code`, jamais sur la phrase.
    { path: 'missionId', code: 'questionnaire_deja_fige', message },
  ]);
}

/** Le refus « pas au bon état » — `409 ILLEGAL_STATE_TRANSITION` (2026-09-02). */
function refusEtatInterdit(statut: string): AppError {
  const message =
    'Le questionnaire ne peut être figé que pendant la préparation de la mission ; ' +
    `celle-ci est à l'état « ${libelleStatut(statut)} ».`;

  return new AppError('ILLEGAL_STATE_TRANSITION', message, [
    { path: 'status', code: statut, message: `État actuel : ${libelleStatut(statut)}.` },
  ]);
}

/**
 * Le refus « sélection vide » — `409 CONFLICT` NOMMANT le filtre fautif.
 *
 * Figer zéro ligne produirait une mission « figée et vide », indistinguable d'une
 * mission non figée : l'existence des lignes EST la preuve du figeage (note L3
 * §3.a). Le message nomme « le premier filtre qui a vidé l'ensemble » parce que
 * c'est la seule information actionnable — sans elle, l'administrateur ne sait pas
 * quel réglage de cadrage reprendre.
 */
function refusSelectionVide(assemblage: SortieAssemblage): AppError {
  const filtre = assemblage.premierFiltreVidant;

  if (filtre === null) {
    const message =
      'Aucune question ne correspond au cadrage de cette mission : la banque de questions ' +
      "ne contient aucune question exploitable. Le questionnaire n'a pas été figé.";
    return new AppError('CONFLICT', message, [
      { path: 'banque', code: 'banque_sans_question', message },
    ]);
  }

  const message =
    'Aucune question ne correspond au cadrage de cette mission : le filtre « ' +
    `${LIBELLES_FILTRE_ASSEMBLAGE[filtre]} » a écarté les dernières questions candidates. ` +
    "Ajustez le cadrage de la mission avant de figer ; le questionnaire n'a pas été figé.";

  return new AppError('CONFLICT', message, [
    {
      path: 'filtre',
      code: filtre,
      message: `Filtre bloquant : ${LIBELLES_FILTRE_ASSEMBLAGE[filtre]}.`,
    },
  ]);
}

/**
 * `POST /v1/missions/:id/generate-questionnaire` — LE FIGEAGE.
 *
 * ── L'ORDRE DES SIX TEMPS EST LA GARANTIE ───────────────────────────────────
 *  1. **`SELECT … FOR UPDATE` sur la mission**, en PREMIER : tout le reste se
 *     décide sur un état que personne ne peut changer d'ici le commit ;
 *  2. **compter les lignes existantes** → `409 QUESTIONNAIRE_ALREADY_FROZEN`, avec
 *     le compte et la date. Ce contrôle passe AVANT celui de l'état parce qu'il est
 *     plus précis : une mission déjà figée puis passée en collecte doit s'entendre
 *     dire « déjà figé » — le front peut alors montrer le questionnaire, là où un
 *     refus d'état l'enverrait modifier un statut sans rien résoudre ;
 *  3. **l'état** → `409 ILLEGAL_STATE_TRANSITION` (§32.2, `DECISIONS.md` 2026-09-02) ;
 *  4. **l'assemblage**, dans la MÊME transaction : la banque lue est celle de
 *     l'instant du verrou, jamais celle d'une lecture antérieure ;
 *  5. **sélection vide** → `409 CONFLICT` nommant le filtre — et RIEN n'est écrit ;
 *  6. **l'INSERT**, puis le journal APRÈS le commit.
 *
 * ── IDEMPOTENCE : CE QUE LE MOT VEUT DIRE ICI ───────────────────────────────
 * Rejouer l'appel ne produit JAMAIS un second jeu de lignes : le deuxième passage
 * compte n non nul et sort en 409 **sans avoir rien écrit** (le refus est levé
 * avant tout `INSERT`, et la transaction est de toute façon annulée). L'état final
 * est celui d'un seul appel — c'est l'idempotence de l'EFFET, la même que celle des
 * transitions de mission. « Un refus qui écrit serait pire qu'un refus. »
 *
 * ── LES SNAPSHOTS SONT COPIÉS DE LA LIGNE DE BASE, PAS D'UN DTO ─────────────
 * `assembler` construit `capture` à partir de `LigneQuestionBanque`, c'est-à-dire
 * de la ligne Drizzle elle-même : `weight` reste la CHAÎNE que rend le pilote
 * (jamais un `number`, qui arrondirait), `options` et `scoring` restent les JSONB
 * tels quels (jamais passés par un `strictObject`, qui rejetterait une clé de plus).
 * Le service n'ajoute que ce que l'écriture exige : un `id` **UUID v7 applicatif**
 * (invariant 1) et le `missionId`.
 */
export async function figerLeQuestionnaire(
  auteurId: string,
  missionId: string,
  contexte: ContexteJournal,
): Promise<ResultatFigeage> {
  const resultat = await db.transaction(async (tx) => {
    // ① Le verrou d'abord.
    const mission = await lireMissionPourFigeage(tx, missionId);
    if (mission === null) throw new AppError('NOT_FOUND', MESSAGE_MISSION_INTROUVABLE);

    // ② Déjà figé ? — la seule preuve est l'existence des lignes.
    const dejaFigees = await compterQuestionsFigees(tx, missionId);
    if (dejaFigees > 0) {
      throw refusDejaFige(dejaFigees, await lireDateDeFigeage(tx, missionId));
    }

    // ③ Le bon état.
    if (mission.status !== STATUT_AUTORISANT_LE_FIGEAGE) {
      throw refusEtatInterdit(mission.status);
    }

    // ④ L'assemblage, sous le même verrou.
    const assemblage = await assemblerPourMission(tx, mission);

    // ⑤ Une sélection vide ne se fige pas.
    if (assemblage.total === 0) throw refusSelectionVide(assemblage);

    // ⑥ La capture.
    const lignes: readonly LigneQuestionFigee[] = assemblage.questions.map((question) => ({
      id: uuidv7(),
      missionId,
      questionId: question.capture.questionId,
      questionVersion: question.capture.questionVersion,
      textSnapshot: question.capture.textSnapshot,
      guidanceSnapshot: question.capture.guidanceSnapshot,
      answerTypeSnapshot: question.capture.answerTypeSnapshot,
      optionsSnapshot: question.capture.optionsSnapshot,
      weightSnapshot: question.capture.weightSnapshot,
      scoringSnapshot: question.capture.scoringSnapshot,
      criticalitySnapshot: question.capture.criticalitySnapshot,
      allowRangeSnapshot: question.capture.allowRangeSnapshot,
      position: question.position,
      addedAdHoc: question.capture.addedAdHoc,
    }));

    await insererQuestionsFigees(tx, lignes);

    return { total: assemblage.total, parBloc: assemblage.parBloc };
  });

  // Le journal APRÈS le commit : `journaliserActivite` écrit par `db` et non par la
  // transaction, et NE LÈVE JAMAIS. L'appeler dedans n'aurait rien atomisé ; avant,
  // il aurait daté un figeage qui pouvait encore échouer — et c'est cette date que
  // le refus « déjà figé » relira.
  await journaliserActivite(
    {
      action: 'mission.questionnaire_freeze',
      utilisateurId: auteurId,
      missionId,
      questionsFigees: resultat.total,
    },
    contexte,
  );

  return resultat;
}
