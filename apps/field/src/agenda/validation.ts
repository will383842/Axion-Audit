// =============================================================================
// VALIDATION D'ENTRETIEN — terminer, rouvrir, valider, déverrouiller, en groupe
// 03 §19.1 (règle V2.10) · §34.2 (validation groupée en fin de journée)
//
// ── LES DEUX GESTES QUE CE MODULE REFUSE DE FUSIONNER ───────────────────────
// « **Terminer l'entretien** » est le geste À CHAUD de fin de rencontre. La
// session passe `termine` et **reste rouvrable LIBREMENT par son auteur** : « la
// note de couloir dix minutes après a sa place, sans révision ni paperasse ».
// « **Valider l'entretien** » est le geste QUALITÉ, posé « typiquement en fin de
// journée », qui VERROUILLE — après lui, toute modification est une révision
// tracée (invariant 7, portée par `answers.revision`).
//
// Les fusionner rendrait l'écran plus simple et coûterait exactement ce que la
// V2.10 est venue corriger : soit l'auditeur verrouille à chaud et perd la note
// de couloir, soit il ne verrouille jamais. 09 §5.7 nomme ce raccourci ; ce
// module existe pour qu'il ne soit pas pris.
//
// ── AUCUNE RÈGLE N'EST RÉÉCRITE ICI ─────────────────────────────────────────
// Les transitions autorisées, les profils et les motifs obligatoires vivent dans
// `session/machine.ts` (L5a), transcrit du 03 §19.1. Ce module ne décide RIEN :
// il demande à la machine, applique ce qu'elle autorise, et propage son motif de
// refus tel quel. Une seconde table de transitions, même « juste pour l'écran »,
// serait une seconde vérité — et c'est la première qui dériverait sans qu'on le
// voie.
//
// ── OFFLINE-FIRST (invariant 1) ─────────────────────────────────────────────
// Aucune de ces fonctions ne touche le réseau. Chacune écrit la ligne ET son op
// d'outbox dans UNE transaction (`reecrireSession` → `ecrireLocal`). Une
// validation posée en mode avion est acquise ; elle remontera quand L6 existera.
//
// ── CE QUI N'EST PAS PERSISTÉ, ET POURQUOI C'EST DIT ────────────────────────
// Le MOTIF d'un déverrouillage est EXIGÉ (03 §19.1 : « motif obligatoire,
// journalisé ») et vérifié ici, mais il n'a **aucun champ dans les formes locales**
// (`local/formes.ts`, L5a) ni de table de journal côté terrain. Le journal du 03
// §19.1 est `activity_log`, qui est SERVEUR (06 §10.4). Inventer un champ serait
// modifier le schéma d'un autre incrément ; le glisser dans `generalNotes`
// polluerait une donnée d'audit. Le point est remonté dans `DECISIONS.md` — et
// l'invariant 7 reste tenu par ailleurs, puisque toute correction de RÉPONSE qui
// suivra le déverrouillage incrémentera `answers.revision`.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E12 (entretiens par
// interlocuteur), E6 (hors ligne total).
// =============================================================================
import type { SessionLocale } from '../local/depots/sessions.js';
import { maintenant } from '../local/horloge.js';
import { etatSession, peutTransiter, type ProfilAuditeur } from '../session/machine.js';
import { reecrireSession } from './ecriture-session.js';

/** Une session refusée par la machine, avec le motif à afficher tel quel. */
export interface RefusValidation {
  readonly id: string;
  readonly personName: string | null;
  readonly motif: string;
}

export interface ResultatValidationGroupee {
  /** Les identifiants réellement passés à `valide`, dans l'ordre du lot. */
  readonly validees: readonly string[];
  readonly refusees: readonly RefusValidation[];
}

/** Le récapitulatif cumulé montré AVANT la confirmation (03 §19.1 V2.10). */
export interface SyntheseValidation {
  readonly nombre: number;
  /** Les personnes rencontrées, pour que l'auditeur reconnaisse ce qu'il valide. */
  readonly personnes: readonly string[];
}

/**
 * Demande la transition à la machine et lève son motif si elle refuse.
 *
 * Lever plutôt que rendre un booléen : l'appelant est un écran, et 03 §19.1 exige
 * qu'il affiche « PRÉCISÉMENT ce qui manque […], jamais un simple cadenas muet ».
 * Le message de la machine est déjà cette phrase — le reformuler ici la ferait
 * dériver.
 */
function exigerTransition(
  session: SessionLocale,
  action: Parameters<typeof peutTransiter>[1],
  profil: ProfilAuditeur,
): void {
  const autorisation = peutTransiter(etatSession(session), action, profil);
  if (!autorisation.autorise) throw new Error(autorisation.motif);
}

/**
 * « Terminer l'entretien » — geste à chaud, `en_cours` → `termine`.
 *
 * `endedAt` est posé, `valideeLe` reste `null` : c'est précisément ce couple qui
 * rend la session ROUVRABLE (`session/machine.ts`, `etatSession`).
 */
export async function terminerSession(
  session: SessionLocale,
  profil: ProfilAuditeur,
): Promise<void> {
  exigerTransition(session, 'terminer', profil);
  await reecrireSession({ ...session, status: 'termine', endedAt: maintenant() });
}

/**
 * « Rouvrir » — `termine` → `en_cours`, sans motif, sans révision (V2.10).
 *
 * `endedAt` retourne à `null`, et ce n'est pas une perte : une session rouverte
 * n'est plus terminée, et lui laisser une heure de fin ferait mentir la synthèse
 * de fin de journée. La saisie, elle, n'est pas touchée — invariant 7 : ce module
 * n'écrit jamais dans `answers`.
 */
export async function rouvrirSession(
  session: SessionLocale,
  profil: ProfilAuditeur,
): Promise<void> {
  exigerTransition(session, 'rouvrir', profil);
  await reecrireSession({ ...session, status: 'en_cours', endedAt: null });
}

/**
 * « Valider l'entretien » — le geste QUALITÉ qui verrouille.
 *
 * Le 04 n'a pas de colonne `valide` : l'état est `status='termine'` PLUS un
 * `valideeLe` non nul dans la charge chiffrée (voir `session/machine.ts`).
 * `versStatutPersiste` n'est pas appelé ici parce que la transition part déjà de
 * `termine` — le statut persisté ne change pas, seul l'horodatage apparaît.
 */
export async function validerSession(
  session: SessionLocale,
  profil: ProfilAuditeur,
): Promise<void> {
  exigerTransition(session, 'valider', profil);
  await reecrireSession({ ...session, status: 'termine', valideeLe: maintenant() });
}

/**
 * « Déverrouiller » une session validée — `expert` UNIQUEMENT, motif OBLIGATOIRE.
 *
 * Le motif est exigé AVANT la machine parce qu'un motif vide n'est pas un refus
 * de profil : l'auditeur expert a le droit, il lui manque une phrase. Les deux
 * refus ne mènent pas au même écran, donc ils ne portent pas le même message.
 */
export async function deverrouillerSession(
  session: SessionLocale,
  profil: ProfilAuditeur,
  motif: string,
): Promise<void> {
  const autorisation = peutTransiter(etatSession(session), 'deverrouiller', profil);
  if (!autorisation.autorise) throw new Error(autorisation.motif);
  if (autorisation.motifRequis && motif.trim() === '') {
    throw new Error(
      'Le déverrouillage d’un entretien validé exige un motif : il sera journalisé avec votre nom et l’heure.',
    );
  }
  await reecrireSession({ ...session, status: 'en_cours', valideeLe: null, endedAt: null });
}

/**
 * Les sessions d'un lot que ce profil peut valider MAINTENANT.
 *
 * Sert à armer la case à cocher de l'écran de fin de journée : proposer une
 * session non validable puis la refuser à la confirmation ferait porter à
 * l'auditeur le travail que l'outil doit faire (03 §17.3, anti-oubli).
 */
export function sessionsValidablesEnGroupe(
  sessions: readonly SessionLocale[],
  profil: ProfilAuditeur,
): SessionLocale[] {
  return sessions.filter(
    (session) => peutTransiter(etatSession(session), 'valider', profil).autorise,
  );
}

/** Le récapitulatif cumulé — il COMPTE ce qu'on lui donne, il n'ajoute rien. */
export function syntheseDeValidation(sessions: readonly SessionLocale[]): SyntheseValidation {
  return {
    nombre: sessions.length,
    personnes: sessions.map((session) => session.personName ?? 'Interlocuteur non nommé'),
  };
}

/**
 * La VALIDATION GROUPÉE (03 §19.1 V2.10) : « les entretiens terminés du jour
 * cochés → une seule confirmation, un seul récapitulatif cumulé ».
 *
 * ── UNE SESSION REFUSÉE N'ARRÊTE PAS LE LOT ────────────────────────────────
 * C'est le point qui compte pour le terrain. Si la troisième session d'un lot de
 * cinq n'est pas validable, s'arrêter là laisserait l'auditeur devant un écran
 * qui a fait la moitié du travail sans dire laquelle. Chaque refus est collecté
 * AVEC son motif et rendu à l'écran ; les autres passent.
 *
 * Séquentiel et non `Promise.all` : chaque écriture ouvre une transaction Dexie
 * sur `[interviews, outbox]`, et les paralléliser sur la même paire de tables ne
 * gagne rien tout en rendant l'ordre des ops de la file non déterministe — or
 * 11 §4 exige que « l'ordre de file » soit préservé.
 */
export async function validerEnGroupe(
  sessions: readonly SessionLocale[],
  profil: ProfilAuditeur,
): Promise<ResultatValidationGroupee> {
  const validees: string[] = [];
  const refusees: RefusValidation[] = [];

  for (const session of sessions) {
    const autorisation = peutTransiter(etatSession(session), 'valider', profil);
    if (!autorisation.autorise) {
      refusees.push({
        id: session.id,
        personName: session.personName,
        motif: autorisation.motif,
      });
      continue;
    }
    await reecrireSession({ ...session, status: 'termine', valideeLe: maintenant() });
    validees.push(session.id);
  }

  return { validees, refusees };
}
