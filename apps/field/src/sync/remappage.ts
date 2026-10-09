// =============================================================================
// LE REMAPPAGE D'UNE RÉPONSE ABSORBÉE — L6b (DECISIONS [L6a], re-revue A17)
//
// La situation : l'appareil a créé la réponse X ; le siège avait DÉJÀ une réponse
// Y au même couple (session, question). X a été absorbée dans Y (`superseded` :
// l'op de X a quitté la file, la valeur perdante est archivée au siège). Les
// références locales à X — une pièce (`answerId`), une session liée
// (`linkedReviewAnswerId`) — désignent un UUID que le siège ne connaît pas : leurs
// ops échouent et finissent « à examiner ».
//
// Ce que la descente de Y déclenche ici, dans UNE transaction :
//   · les lignes locales qui référencent X passent à Y (pièce, session liée) ;
//   · leurs ops `a_examiner` sont réécrites EN PLACE (même opId, même rang dans
//     la file), charge réalignée sur Y, `tentatives` à 0, `en_attente` ; une op
//     `en_attente` voit sa charge réalignée sans changer de statut ;
//   · une op `rejetee` (05 §9.9) n'est JAMAIS touchée : elle ne se rejoue pas ;
//   · la ligne X n'est pas supprimée (invariant 7) : elle reçoit `supprimeLe` et
//     sort de la vue — une seule réponse visible au couple.
// X n'est absorbée que si AUCUNE op de X n'est en file : une op encore en file
// est une saisie que le siège n'a pas tranchée, rien ne bouge alors.
//
// Exception DÉCLARÉE à la règle « Dexie ne s'écrit que dans `local/ecriture.ts` »
// (`eslint.config.js`, bloc de ce fichier) : un remappage réécrit des lignes ET
// leurs ops existantes sans en créer — ce que ni `ecrireLocal` (qui crée une op)
// ni `appliquerDescente` (qui ne touche jamais la file) ne savent faire.
//
// Le chiffrement se fait AVANT la transaction (cf. `local/ecriture.ts`), et la
// transaction revérifie que rien n'a bougé entre-temps : une op ou une ligne
// réécrite par l'auditeur pendant ce temps n'est pas écrasée.
//
// Traçabilité : E9 ; invariants 1 et 7.
// =============================================================================
import { z } from 'zod';
import type { BaseLocale, LigneOutbox } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import type { EnregistrementDescendant } from '../local/ecriture.js';
import type { Enveloppe } from '../local/enveloppe.js';
import { chargeInterviewSchema } from '../local/formes.js';
import { maintenant } from '../local/horloge.js';

export interface DependancesRemappage {
  readonly base: BaseLocale;
  readonly coffre: Coffre;
}

/** La charge d'une op déchiffrée : l'entité à plat (`ecrireLocal`). */
const chargeOpSchema = z.record(z.string(), z.unknown());

/** Les clés d'une charge d'op qui désignent une réponse. */
const CLES_REFERENCE_REPONSE = ['answerId', 'linkedReviewAnswerId'] as const;

interface Absorption {
  readonly absorbee: string;
  readonly cible: string;
}

interface Plan {
  readonly absorbees: string[];
  readonly pieces: { readonly id: string; readonly cible: string }[];
  readonly sessions: {
    readonly id: string;
    readonly avant: Enveloppe;
    readonly apres: Enveloppe;
  }[];
  readonly ops: {
    readonly opId: string;
    readonly avant: Enveloppe;
    readonly apres: Enveloppe;
    readonly relancer: boolean;
  }[];
}

const memeEnveloppe = (a: Enveloppe, b: Enveloppe): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Les réponses locales absorbées par les réponses descendues de cette page. */
async function absorptions(
  base: BaseLocale,
  enregistrements: readonly EnregistrementDescendant[],
): Promise<Absorption[]> {
  const enFile = new Set((await base.outbox.toArray()).map((op) => op.entiteId));
  const trouvees: Absorption[] = [];
  for (const enr of enregistrements) {
    if (enr.table !== 'answers' || enr.index.supprimeLe !== null) continue;
    const { id, interviewId, missionQuestionId } = enr.index;
    const auCouple = await base.answers
      .where('[interviewId+missionQuestionId]')
      .equals([interviewId, missionQuestionId])
      .toArray();
    for (const locale of auCouple) {
      if (locale.id === id || locale.supprimeLe !== null || enFile.has(locale.id)) continue;
      trouvees.push({ absorbee: locale.id, cible: id });
    }
  }
  return trouvees;
}

async function planifier(
  { base, coffre }: DependancesRemappage,
  missionId: string,
  liste: readonly Absorption[],
): Promise<Plan> {
  const cibles = new Map(liste.map((a) => [a.absorbee, a.cible]));
  const plan: Plan = { absorbees: [...cibles.keys()], pieces: [], sessions: [], ops: [] };

  for (const [absorbee, cible] of cibles) {
    for (const piece of await base.attachments.where('answerId').equals(absorbee).toArray()) {
      plan.pieces.push({ id: piece.id, cible });
    }
  }

  for (const session of await base.interviews.where('missionId').equals(missionId).toArray()) {
    const charge = await coffre.dechiffrer(session.charge, chargeInterviewSchema);
    const cible =
      charge.linkedReviewAnswerId === null ? undefined : cibles.get(charge.linkedReviewAnswerId);
    if (cible === undefined) continue;
    plan.sessions.push({
      id: session.id,
      avant: session.charge,
      apres: await coffre.chiffrer({ ...charge, linkedReviewAnswerId: cible }),
    });
  }

  const ops: LigneOutbox[] = await base.outbox.where('missionId').equals(missionId).toArray();
  for (const op of ops) {
    if (op.statut === 'rejetee') continue;
    const charge = await coffre.dechiffrer(op.charge, chargeOpSchema);
    let modifiee = false;
    const realignee: Record<string, unknown> = { ...charge };
    for (const cle of CLES_REFERENCE_REPONSE) {
      const valeur = charge[cle];
      const cible = typeof valeur === 'string' ? cibles.get(valeur) : undefined;
      if (cible !== undefined) {
        realignee[cle] = cible;
        modifiee = true;
      }
    }
    if (!modifiee) continue;
    plan.ops.push({
      opId: op.opId,
      avant: op.charge,
      apres: await coffre.chiffrer(realignee),
      relancer: op.statut === 'a_examiner',
    });
  }
  return plan;
}

/**
 * Réaligne sur Y les références locales aux réponses absorbées par la page
 * descendue. Rend le nombre de lignes et d'ops réalignées.
 */
export async function remapperAbsorptions(
  deps: DependancesRemappage,
  missionId: string,
  enregistrements: readonly EnregistrementDescendant[],
): Promise<number> {
  const { base } = deps;
  const liste = await absorptions(base, enregistrements);
  if (liste.length === 0) return 0;
  const plan = await planifier(deps, missionId, liste);
  const horodatage = maintenant();
  let remappees = 0;

  await base.transaction(
    'rw',
    [base.answers, base.attachments, base.interviews, base.outbox],
    async () => {
      for (const op of plan.ops) {
        const actuelle = await base.outbox.get(op.opId);
        // Disparue, rejetée ou réécrite entre-temps : on ne l'écrase pas.
        if (actuelle?.statut === undefined || actuelle.statut === 'rejetee') continue;
        if (!memeEnveloppe(actuelle.charge, op.avant)) continue;
        await base.outbox.update(
          op.opId,
          op.relancer
            ? { charge: op.apres, statut: 'en_attente', tentatives: 0, derniereErreur: null }
            : { charge: op.apres },
        );
        remappees += 1;
      }
      for (const session of plan.sessions) {
        const actuelle = await base.interviews.get(session.id);
        if (actuelle === undefined || !memeEnveloppe(actuelle.charge, session.avant)) continue;
        await base.interviews.update(session.id, { charge: session.apres });
        remappees += 1;
      }
      for (const piece of plan.pieces) {
        await base.attachments.update(piece.id, { answerId: piece.cible });
        remappees += 1;
      }
      for (const absorbee of plan.absorbees) {
        await base.answers.update(absorbee, { supprimeLe: horodatage });
      }
    },
  );
  return remappees;
}
