// =============================================================================
// AGENDA ET SESSIONS DE COLLECTE — 03 §25.2 (agenda), §27.1 + §28.1 (les 6 kind),
// §25.6 (entretien complémentaire), §34.2 (démarrage pré-rempli en un tap),
// §34.6 (anti-collision, NON bloquant)
//
// ── LES SIX TYPES, ET LA DISTINCTION QUE 03 §32.6 EXIGE ─────────────────────
// 03 §32.6-1 : « `interviews.kind` (6 valeurs : entretien, observation,
// demonstration, analyse_documentaire, releve_donnees, atelier — §27.1/§28.1) est
// DISTINCT du mode d'entretien `interviews.mode` (sur_site, distanciel,
// complementaire — §25.6, applicable si `kind='entretien'`). **« Complémentaire »
// est un mode, pas un type.** »
// C'est la collision interne que la V2.2 est venue résoudre, et la confondre
// referait exactement l'erreur qu'elle corrige. `mode` est donc `null` dès que le
// `kind` n'est pas `entretien` — et le compilateur ne peut pas l'imposer seul,
// donc `modeApplicable` le fait, à UN endroit.
//
// ── LE DÉMARRAGE EN UN TAP (03 §34.2, V2.10) ────────────────────────────────
// « Taper une session PLANIFIÉE du jour la DÉMARRE PRÉ-REMPLIE (nom, fonction,
// unité, type — déjà saisis à la planification §25.2 : **zéro champ à
// ressaisir**, ne reste que l'accord de participation). » Le pré-remplissage
// n'est donc pas une commodité d'écran : c'est que la session EXISTE DÉJÀ, créée
// à la planification. Démarrer = une transition d'état, pas une saisie.
// `demarrerEntretien` (L5b) est réutilisée telle quelle plutôt que réécrite : elle
// porte déjà l'exigence d'accord et le passage par la machine à états.
//
// ── L'ANTI-COLLISION N'EST JAMAIS BLOQUANTE ─────────────────────────────────
// 03 §25.2 : « Détection de chevauchement même interlocuteur (**avertissement,
// non bloquant**) » ; §34.6 : « le terrain n'est jamais bloqué par le planning
// d'un collègue ». Et 03 §19.1 : « **Aucun verrou ne peut jamais bloquer la
// SAISIE de données** ». `chevauchements` rend donc une LISTE à afficher, jamais
// une erreur — c'est un critère de la porte P-C (§33.7 : aucun verrou en session
// active de 45 min).
//
// Traçabilité : E12 (entretiens par interlocuteur), E6 (hors ligne total),
// E23 (novice < 30 min).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import type { SessionLocale } from '../local/depots/sessions.js';
import { ecrireLocal } from '../local/ecriture.js';
import { maintenant } from '../local/horloge.js';
import { type MODES_ENTRETIEN, TYPES_DE_SESSION, type TypeDeSession } from '../local/formes.js';

export type ModeEntretien = (typeof MODES_ENTRETIEN)[number];

/** Libellés français des six types de session (03 §27.1, §28.1). */
export const LIBELLE_TYPE_SESSION: Record<TypeDeSession, string> = {
  entretien: 'Entretien',
  observation: 'Observation de poste',
  demonstration: 'Démonstration d’outil',
  analyse_documentaire: 'Analyse documentaire',
  releve_donnees: 'Relevé de données',
  atelier: 'Atelier collectif',
};

/** Ce que l'auditeur fait dans chaque type — 03 §27.1, colonne « ce qu'on fait ». */
export const AIDE_TYPE_SESSION: Record<TypeDeSession, string> = {
  entretien: 'On interroge une personne.',
  observation: 'On regarde le travail réel : un poste, un atelier, un flux.',
  demonstration: 'Un utilisateur montre son outil en conditions réelles.',
  analyse_documentaire: 'On lit les documents remis.',
  releve_donnees: 'On collecte des chiffres : volumétries, temps, coûts, effectifs.',
  atelier: 'Atelier collectif de co-identification, avec ses participants.',
};

export const LIBELLE_MODE_ENTRETIEN: Record<ModeEntretien, string> = {
  sur_site: 'Sur site',
  distanciel: 'À distance',
  complementaire: 'Complémentaire (lève un à-revoir)',
};

/**
 * 03 §32.6-1 : le mode n'existe QUE pour `kind='entretien'`.
 *
 * Une fonction plutôt qu'une comparaison recopiée : la règle est écrite une fois,
 * et le jour où un septième type arrive, il n'y a qu'un endroit à relire.
 */
export function modeApplicable(kind: TypeDeSession): boolean {
  return kind === 'entretien';
}

/** Un participant d'atelier (03 §28.1-3 : « liste des participants »). */
export interface Participant {
  readonly nom: string;
  readonly fonction: string;
}

export interface DemandePlanification {
  readonly missionId: string;
  readonly orgUnitId: string;
  readonly kind: TypeDeSession;
  /** Le propriétaire (05 §9.9) — jamais inventé, il vient de `auditeur.ts`. */
  readonly conductedBy: string;
  /** ISO 8601 UTC. `null` = à planifier plus tard, la session existe quand même. */
  readonly scheduledAt: string | null;
  readonly dureeMin: number | null;
  /** Applicable si `kind='entretien'` (03 §32.6-1). Défaut `sur_site` (04). */
  readonly mode?: ModeEntretien;
  readonly personName?: string | null;
  readonly personRole?: string | null;
  readonly personEmail?: string | null;
  /** Atelier (03 §28.1-3). `null` hors atelier. */
  readonly participants?: readonly Participant[] | null;
  /**
   * 03 §25.6 N6 : l'entretien COMPLÉMENTAIRE lève un à-revoir — il pointe la
   * réponse initiale, qui sera révisée avec le drapeau levé et la référence.
   */
  readonly linkedReviewAnswerId?: string | null;
}

/**
 * Crée une session de collecte PLANIFIÉE, de n'importe lequel des six types.
 *
 * Hors ligne intégralement (invariant 1), UUID v7 côté client (P1-4). Le statut
 * est `non_demarre` et le `scheduleStatus` `planifie` dès qu'une date est
 * donnée : 03 §25.2 fait de `a_planifier` l'état de ce qui n'a pas encore de
 * créneau, pas de ce qui vient d'être créé avec un créneau.
 *
 * `mode` : le 04 dit « défaut APPLICATIF `sur_site` si `kind='entretien'`, NULL
 * sinon ». `LOT_L5.md` §5-5 laissait ouvert de quel côté vit ce défaut et
 * proposait « terrain uniquement — c'est là que la session naît » ; L5b l'a déjà
 * appliqué dans `session/ecriture-session.ts`, et ce module fait le MÊME choix,
 * pour la même raison. Deux défauts applicatifs des deux côtés dériveraient.
 */
export async function planifierSession(demande: DemandePlanification): Promise<string> {
  if (!TYPES_DE_SESSION.includes(demande.kind)) {
    throw new Error(`Type de session inconnu : « ${demande.kind} ».`);
  }
  if (demande.orgUnitId === '') {
    throw new Error('Une session de collecte se rattache toujours à une unité.');
  }
  if (demande.linkedReviewAnswerId != null && demande.mode !== 'complementaire') {
    throw new Error(
      'Une session qui lève un à-revoir est un entretien complémentaire : choisissez le mode « Complémentaire ».',
    );
  }
  if (demande.kind === 'atelier' && (demande.participants?.length ?? 0) === 0) {
    throw new Error('Un atelier collectif a besoin d’au moins un participant.');
  }

  const id = uuidv7();
  const instant = maintenant();

  await ecrireLocal({
    entite: 'interview',
    id,
    missionId: demande.missionId,
    action: 'upsert',
    index: {
      orgUnitId: demande.orgUnitId,
      kind: demande.kind,
      status: 'non_demarre',
      scheduleStatus: demande.scheduledAt === null ? 'a_planifier' : 'planifie',
      scheduledAt: demande.scheduledAt,
    },
    charge: {
      conductedBy: demande.conductedBy,
      mode: modeApplicable(demande.kind) ? (demande.mode ?? 'sur_site') : null,
      personName: demande.personName?.trim() ?? null,
      personRole: demande.personRole?.trim() ?? null,
      personServiceId: null,
      personEmail: demande.personEmail?.trim() ?? null,
      participants: demande.kind === 'atelier' ? [...(demande.participants ?? [])] : null,
      generalNotes: null,
      linkedReviewAnswerId: demande.linkedReviewAnswerId ?? null,
      documentRequestId: null,
      consentGiven: false,
      consentAudio: false,
      consentedAt: null,
      informationNoticeVersion: null,
      noticeShownAt: null,
      scheduledDurationMin: demande.dureeMin,
      startedAt: null,
      endedAt: null,
      valideeLe: null,
      clientCreatedAt: instant,
    },
  });
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-COLLISION D'AGENDA (03 §25.2, §34.6) — un AVERTISSEMENT, jamais un verrou
// ─────────────────────────────────────────────────────────────────────────────
/** Durée retenue quand la planification n'en donne pas — 60 min, et c'est dit. */
export const DUREE_PAR_DEFAUT_MIN = 60;

export interface Chevauchement {
  readonly sessionId: string;
  readonly personName: string | null;
  readonly message: string;
}

function borne(session: {
  readonly scheduledAt: string | null;
  readonly scheduledDurationMin: number | null;
}): { debut: number; fin: number } | null {
  if (session.scheduledAt === null) return null;
  const debut = Date.parse(session.scheduledAt);
  if (Number.isNaN(debut)) return null;
  const duree = (session.scheduledDurationMin ?? DUREE_PAR_DEFAUT_MIN) * 60 * 1000;
  return { debut, fin: debut + duree };
}

/**
 * Les sessions qui chevauchent un créneau, POUR LA MÊME PERSONNE OU LA MÊME
 * UNITÉ (03 §34.6 : « la même unité ou la même personne »).
 *
 * **Rend une liste, ne lève jamais.** C'est le point de conformité : 03 §25.2 dit
 * « avertissement, NON bloquant », §34.6 dit « le terrain n'est jamais bloqué par
 * le planning d'un collègue », et §19.1 dit qu'aucun verrou ne bloque la saisie.
 * Une fonction qui lèverait ici transformerait trois phrases du pack en verrou.
 *
 * Fonction PURE : elle reçoit les sessions plutôt que de les lire. C'est ce qui
 * la rend testable sans base, et donc réellement testée.
 */
export function chevauchements(
  candidate: {
    readonly id?: string;
    readonly orgUnitId: string;
    readonly personName: string | null;
    readonly scheduledAt: string | null;
    readonly scheduledDurationMin: number | null;
  },
  existantes: readonly SessionLocale[],
): Chevauchement[] {
  const creneau = borne(candidate);
  if (creneau === null) return [];

  const trouves: Chevauchement[] = [];
  for (const autre of existantes) {
    if (autre.id === candidate.id) continue;
    if (autre.supprimeLe !== null) continue;
    if (autre.scheduleStatus === 'annule') continue;

    const memePersonne =
      candidate.personName !== null &&
      autre.personName !== null &&
      autre.personName.trim().toLowerCase() === candidate.personName.trim().toLowerCase();
    const memeUnite = autre.orgUnitId === candidate.orgUnitId;
    if (!memePersonne && !memeUnite) continue;

    const autreCreneau = borne(autre);
    if (autreCreneau === null) continue;
    if (autreCreneau.fin <= creneau.debut || autreCreneau.debut >= creneau.fin) continue;

    trouves.push({
      sessionId: autre.id,
      personName: autre.personName,
      message: memePersonne
        ? `${autre.personName ?? 'Cet interlocuteur'} a déjà une session sur ce créneau. Vous pouvez tout de même planifier celle-ci.`
        : 'Cette unité a déjà une session sur ce créneau. Vous pouvez tout de même planifier celle-ci.',
    });
  }
  return trouves;
}
