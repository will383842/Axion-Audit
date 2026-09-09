// =============================================================================
// LES POINTS À REVOIR D'UNE MISSION — la matière du compteur cliquable (03 §34.2)
//
// ── CE QUE LE PACK DEMANDE, MOT POUR MOT ────────────────────────────────────
// 03 §34.2 : « ses à-revoir en attente (**compteur cliquable par mission**) ».
// Un compteur cliquable suppose une destination, et le pack la nomme ailleurs —
// 03 M3 : « Vue “synthèse mission” sur le terrain : liste des entretiens,
// complétude par bloc, **liste consolidée des “à revoir”** (= la liste des zones
// d'ombre à éclaircir avant de partir — décision prise) ». Ce module construit
// cette liste consolidée ; `EcranARevoir` la rend.
//
// Et 03 §17.2 dit ce qu'on fait d'un item de cette liste : « cliquer sur un item
// incomplet amène directement à l'écran qui le résout ». D'où `interviewId` et
// `missionQuestionId` sur chaque point : ce sont les deux clés que
// `session/position.ts` mémorise pour rouvrir l'entretien SUR la question.
//
// ── 100 % LOCAL, ET INSTANTANÉ SUR UNE MISSION CHARGÉE ─────────────────────
// Le drapeau `flagReview` vit dans l'en-tête d'index EN CLAIR (`LOT_L5.md` §3.2,
// et voir `local/formes.ts` : c'est un `0 | 1` parce qu'IndexedDB n'indexe pas
// les booléens). Le tri des 5 000 réponses d'une mission se fait donc SANS
// déchiffrer ; seules les lignes RETENUES sont ouvertes, pour leur motif et le
// texte figé de la question. C'est la même économie que le cockpit.
//
// ── INVARIANT 6 : ON COMPTE SES PROPRES LIGNES, ON N'AGRÈGE RIEN ───────────
// `LOT_L5.md` §3.5 autorise sur l'appareil « les compteurs de SES propres lignes
// (complétude d'une session, à-revoir ouverts) ». Cette liste est le détail du
// compteur déjà rendu par le cockpit — pas une analyse : aucun score, aucune
// pondération, aucun croisement entre auditeurs.
//
// Traçabilité : E12 (entretiens par interlocuteur, à-revoir), E6 (hors ligne
// total), E23 (hyper intuitif, novice < 30 min).
// =============================================================================
import { CLES_META, ecrireMeta, effacerMeta, lireMeta, type BaseLocale } from '../local/base.js';
import { contexteLocal } from '../local/contexte.js';
import { depotSessions, type SessionLocale } from '../local/depots/sessions.js';
import { chargeAnswerSchema } from '../local/formes.js';
import { LIBELLE_TYPE_SESSION } from './sessions.js';
import { lireMissionLocale, lireMissionsLocales, type MissionLocale } from '../session/missions.js';

/** Un point à revoir, prêt à afficher et à ROUVRIR (03 §17.2). */
export interface PointARevoir {
  readonly reponseId: string;
  readonly interviewId: string;
  readonly missionQuestionId: string;
  /** Le texte FIGÉ de la question, tel qu'elle a été posée (04, redondance V1). */
  readonly question: string;
  /** Le motif saisi au moment du drapeau — facultatif (03 §17.4). */
  readonly motif: string | null;
  /** La session où le point a été posé : la personne, à défaut le type. */
  readonly session: string;
  /** Instant UTC de la dernière écriture — formaté au fuseau de la mission. */
  readonly poseLe: string;
}

/** Les points à revoir d'UNE mission, avec de quoi les dater à son fuseau. */
export interface MissionARevoir {
  readonly mission: MissionLocale;
  readonly points: readonly PointARevoir[];
}

/**
 * Le libellé d'une session dans la liste : la personne, à défaut le type.
 *
 * Jamais l'identifiant : 03 §17.4 veut qu'on reconnaisse un entretien à ce qu'on
 * en sait, pas à une clé.
 */
function libelleSession(session: SessionLocale | null): string {
  if (session === null) return 'Session introuvable sur cet appareil';
  return session.personName ?? LIBELLE_TYPE_SESSION[session.kind];
}

/**
 * Les points à revoir d'une mission, ou de TOUTES si `missionId` est `null`.
 *
 * L'ordre : par session, puis par ordre de pose. C'est celui du geste qui suit —
 * on rouvre UN entretien et on lève ses zones d'ombre les unes après les autres
 * (03 §25.6 N6 : l'entretien complémentaire lève un à-revoir).
 */
export async function construireARevoir(
  missionId: string | null,
): Promise<readonly MissionARevoir[]> {
  const { base, coffre } = contexteLocal();
  const missions =
    missionId === null
      ? await lireMissionsLocales()
      : ((mission) => (mission === null ? [] : [mission]))(await lireMissionLocale(missionId));

  const listes: MissionARevoir[] = [];
  for (const mission of missions) {
    const lignes = await base.answers
      .where('missionId')
      .equals(mission.id)
      .filter((ligne) => ligne.supprimeLe === null && ligne.flagReview === 1)
      .toArray();

    // Une session est déchiffrée UNE fois, même si elle porte dix à-revoir.
    const sessions = new Map<string, SessionLocale | null>();
    const points: PointARevoir[] = [];
    for (const ligne of lignes) {
      if (!sessions.has(ligne.interviewId)) {
        sessions.set(ligne.interviewId, await depotSessions.parId(ligne.interviewId));
      }
      const charge = await coffre.dechiffrer(ligne.charge, chargeAnswerSchema);
      points.push({
        reponseId: ligne.id,
        interviewId: ligne.interviewId,
        missionQuestionId: ligne.missionQuestionId,
        question: charge.questionTextSnapshot,
        motif: charge.reviewReason,
        session: libelleSession(sessions.get(ligne.interviewId) ?? null),
        poseLe: ligne.clientUpdatedAt,
      });
    }

    points.sort(
      (a, b) => a.session.localeCompare(b.session, 'fr') || a.poseLe.localeCompare(b.poseLe) || 0,
    );
    listes.push({ mission, points });
  }

  return listes;
}

/**
 * La mission dont on vient de taper le compteur.
 *
 * La navigation terrain ne connaît que des CODES de vue, sans paramètre
 * (`app/navigation.ts` : pas de routeur, donc pas d'URL porteuse). Le choix
 * transite donc par `meta`, comme la session courante (`session/position.ts`) —
 * un identifiant, en clair, qui ne dit rien de personne (`LOT_L5.md` §3.2).
 */
export async function memoriserMissionARevoir(
  base: BaseLocale,
  missionId: string | null,
): Promise<void> {
  if (missionId === null) await effacerMeta(base, CLES_META.missionARevoir);
  else await ecrireMeta(base, CLES_META.missionARevoir, missionId);
}

/** La mission choisie, ou `null` — auquel cas la liste porte TOUTES les missions. */
export async function lireMissionARevoir(base: BaseLocale): Promise<string | null> {
  const valeur = await lireMeta(base, CLES_META.missionARevoir);
  return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}
