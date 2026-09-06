// =============================================================================
// RÉÉCRITURE D'UNE SESSION DE COLLECTE — la porte d'écriture de L5c
//
// ── POURQUOI CE FICHIER EXISTE ALORS QU'IL RESSEMBLE À CELUI DE L5b ─────────
// `session/ecriture-session.ts` (A22, incrément L5b) porte déjà un `decomposer`
// et un `reecrire` de la même forme, mais **tous deux privés**. `LOT_L5.md` §1
// donne `src/session/**` à A22 et `src/agenda/**` à A23, et interdit qu'un
// fichier soit écrit par deux incréments : exporter ceux d'A22 serait modifier
// son fichier, et le seul fichier partagé nommé par la note est `app/vues.ts`.
//
// **La duplication est donc assumée, et elle est remontée** (rapport d'auto-revue
// A23) plutôt que masquée : la bonne correction est une extraction vers un module
// commun, et elle appartient à A20 après la fusion de L5b et L5c, pas à un agent
// qui écrirait dans le répertoire d'un autre pour s'éviter trente lignes.
//
// Ce que la duplication NE met PAS en danger : la forme elle-même. `satisfies
// ClesIndex<'interview'>` et `satisfies ChargeUtile<'interview'>` sont vérifiés
// par le compilateur contre `local/formes.ts`, source unique. Si un champ
// apparaît, disparaît ou change de côté, LES DEUX copies cassent à la
// compilation — une dérive silencieuse entre elles n'est pas possible.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E12 (entretiens par
// interlocuteur), E6 (hors ligne total).
// =============================================================================
import type { SessionLocale } from '../local/depots/sessions.js';
import { ecrireLocal, type ChargeUtile, type ClesIndex } from '../local/ecriture.js';

/**
 * Sépare une session à plat en son en-tête d'index (EN CLAIR, liste fermée
 * `LOT_L5.md` §3.2) et sa charge (CHIFFRÉE). Les `satisfies` sont la garantie :
 * un champ personnel qui glisserait dans l'index ne compilerait pas.
 */
function decomposer(session: SessionLocale): {
  index: ClesIndex<'interview'>;
  charge: ChargeUtile<'interview'>;
} {
  const index = {
    orgUnitId: session.orgUnitId,
    kind: session.kind,
    status: session.status,
    scheduleStatus: session.scheduleStatus,
    scheduledAt: session.scheduledAt,
  } satisfies ClesIndex<'interview'>;
  const charge = {
    conductedBy: session.conductedBy,
    mode: session.mode,
    personName: session.personName,
    personRole: session.personRole,
    personServiceId: session.personServiceId,
    personEmail: session.personEmail,
    participants: session.participants,
    generalNotes: session.generalNotes,
    linkedReviewAnswerId: session.linkedReviewAnswerId,
    documentRequestId: session.documentRequestId,
    consentGiven: session.consentGiven,
    consentAudio: session.consentAudio,
    consentedAt: session.consentedAt,
    informationNoticeVersion: session.informationNoticeVersion,
    noticeShownAt: session.noticeShownAt,
    scheduledDurationMin: session.scheduledDurationMin,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    valideeLe: session.valideeLe,
    clientCreatedAt: session.clientCreatedAt,
  } satisfies ChargeUtile<'interview'>;
  return { index, charge };
}

/**
 * Ré-upserte la session ENTIÈRE : ligne locale + op d'outbox, dans UNE
 * transaction (`local/ecriture.ts`). Le serveur n'a pas nos index, donc l'op
 * porte l'entité complète — c'est le port qui s'en charge, pas cet appelant.
 */
export async function reecrireSession(session: SessionLocale): Promise<void> {
  const { index, charge } = decomposer(session);
  await ecrireLocal({
    entite: 'interview',
    id: session.id,
    missionId: session.missionId,
    action: 'upsert',
    index,
    charge,
  });
}
