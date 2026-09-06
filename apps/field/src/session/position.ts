// =============================================================================
// LA POSITION DE REPRISE — 03 §17.4 : « rouvrir l'app = revenir EXACTEMENT à la
// question en cours »
//
// La navigation du socle ne connaît que des CODES de vue (`app/vues.ts`) — pas
// de paramètre, pas d'URL (`LOT_L5.md` §1). La session ouverte et la question
// où l'on en est vivent donc dans `meta`, la seule table que les écrans ont le
// droit d'écrire directement (« aucune écriture Dexie hors de `ecriture.ts`,
// hors `meta` qui ne se synchronise pas »).
//
// Ce sont des IDENTIFIANTS, en clair : ils sont dans la liste fermée du §3.2 et
// ne disent rien de personne. Le nom de l'interviewé, lui, reste dans la charge.
//
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E23 (hyper intuitif).
// =============================================================================
import { CLES_META, ecrireMeta, effacerMeta, lireMeta, type BaseLocale } from '../local/base.js';

export function cleQuestionCourante(interviewId: string): string {
  return `${CLES_META.prefixeQuestionCourante}${interviewId}`;
}

/** La session affichée par l'écran d'entretien, ou `null` si aucune n'est ouverte. */
export async function lireSessionCourante(base: BaseLocale): Promise<string | null> {
  const valeur = await lireMeta(base, CLES_META.sessionCourante);
  return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}

export async function memoriserSessionCourante(
  base: BaseLocale,
  interviewId: string | null,
): Promise<void> {
  if (interviewId === null) await effacerMeta(base, CLES_META.sessionCourante);
  else await ecrireMeta(base, CLES_META.sessionCourante, interviewId);
}

/** La question où l'auditeur en était dans cette session, ou `null` (début). */
export async function lireQuestionCourante(
  base: BaseLocale,
  interviewId: string,
): Promise<string | null> {
  const valeur = await lireMeta(base, cleQuestionCourante(interviewId));
  return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}

export async function memoriserQuestionCourante(
  base: BaseLocale,
  interviewId: string,
  missionQuestionId: string,
): Promise<void> {
  await ecrireMeta(base, cleQuestionCourante(interviewId), missionQuestionId);
}
