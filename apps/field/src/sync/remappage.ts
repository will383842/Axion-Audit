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

/** Ce qu'une absorption réécrit ; chaque écriture nomme la ou les absorbées qu'elle sert. */
interface Plan {
  readonly absorbees: ReadonlyMap<string, string>;
  readonly pieces: { readonly id: string; readonly absorbee: string; readonly cible: string }[];
  readonly sessions: {
    readonly id: string;
    readonly absorbee: string;
    readonly avant: Enveloppe;
    readonly apres: Enveloppe;
  }[];
  readonly ops: {
    readonly opId: string;
    readonly absorbees: readonly string[];
    readonly avant: Enveloppe;
    readonly apres: Enveloppe;
    readonly relancer: boolean;
  }[];
}

const memeEnveloppe = (a: Enveloppe, b: Enveloppe): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Les réponses locales absorbées par les réponses descendues de cette page. */
async function absorptionsDeLaPage(
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

/**
 * A29-2 : les absorptions révélées par une sortie `superseded`. Y a pu descendre
 * AVANT que le siège ne tranche (l'op de X était encore en file : rien n'était
 * absorbé alors). Au `superseded` de X, on cherche au couple (session, question)
 * de X la ligne locale retenue par le siège : visible, et sans op en file (une
 * ligne qui attend encore son envoi n'est pas une version du siège). Une seule
 * candidate, sinon rien : on n'arbitre pas à l'aveugle (invariant 7).
 */
async function absorptionsALaSortie(
  base: BaseLocale,
  reponsesArbitrees: readonly string[],
): Promise<Absorption[]> {
  const enFile = new Set((await base.outbox.toArray()).map((op) => op.entiteId));
  const trouvees: Absorption[] = [];
  for (const x of new Set(reponsesArbitrees)) {
    const ligneX = await base.answers.get(x);
    if (ligneX?.supprimeLe !== null || enFile.has(x)) continue;
    const candidates = (
      await base.answers
        .where('[interviewId+missionQuestionId]')
        .equals([ligneX.interviewId, ligneX.missionQuestionId])
        .toArray()
    ).filter((r) => r.id !== x && r.supprimeLe === null && !enFile.has(r.id));
    const [cible] = candidates;
    if (candidates.length === 1 && cible !== undefined) {
      trouvees.push({ absorbee: x, cible: cible.id });
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
  const plan: Plan = { absorbees: cibles, pieces: [], sessions: [], ops: [] };

  for (const [absorbee, cible] of cibles) {
    for (const piece of await base.attachments.where('answerId').equals(absorbee).toArray()) {
      plan.pieces.push({ id: piece.id, absorbee, cible });
    }
  }

  // Toutes les lectures Dexie AVANT le premier chiffrement.
  const sessions = await base.interviews.where('missionId').equals(missionId).toArray();
  const ops: LigneOutbox[] = await base.outbox.where('missionId').equals(missionId).toArray();

  for (const session of sessions) {
    const charge = await coffre.dechiffrer(session.charge, chargeInterviewSchema);
    const absorbee = charge.linkedReviewAnswerId;
    const cible = absorbee === null ? undefined : cibles.get(absorbee);
    if (absorbee === null || cible === undefined) continue;
    plan.sessions.push({
      id: session.id,
      absorbee,
      avant: session.charge,
      apres: await coffre.chiffrer({ ...charge, linkedReviewAnswerId: cible }),
    });
  }

  for (const op of ops) {
    if (op.statut === 'rejetee') continue;
    const charge = await coffre.dechiffrer(op.charge, chargeOpSchema);
    const servies: string[] = [];
    const realignee: Record<string, unknown> = { ...charge };
    for (const cle of CLES_REFERENCE_REPONSE) {
      const valeur = charge[cle];
      const cible = typeof valeur === 'string' ? cibles.get(valeur) : undefined;
      if (typeof valeur === 'string' && cible !== undefined) {
        realignee[cle] = cible;
        servies.push(valeur);
      }
    }
    if (servies.length === 0) continue;
    plan.ops.push({
      opId: op.opId,
      absorbees: servies,
      avant: op.charge,
      apres: await coffre.chiffrer(realignee),
      relancer: op.statut === 'a_examiner',
    });
  }
  return plan;
}

/**
 * Exécute un plan dans UNE transaction. A29-1 : la file est RELUE ici, à
 * l'intérieur : une absorbée qui a reçu une op entre la préparation et
 * l'écriture (l'auditeur l'a re-saisie) n'est PAS absorbée, et rien de ce qui la
 * concerne n'est réécrit — ni ligne, ni op : jamais un remappage à moitié.
 */
async function executer(base: BaseLocale, plan: Plan): Promise<number> {
  const horodatage = maintenant();
  let remappees = 0;
  await base.transaction(
    'rw',
    [base.answers, base.attachments, base.interviews, base.outbox],
    async () => {
      const retenues = new Set<string>();
      for (const absorbee of plan.absorbees.keys()) {
        const enFile = await base.outbox.where('entiteId').equals(absorbee).count();
        const ligne = await base.answers.get(absorbee);
        if (enFile === 0 && ligne?.supprimeLe === null) retenues.add(absorbee);
      }
      if (retenues.size === 0) return;

      for (const op of plan.ops) {
        if (!op.absorbees.every((a) => retenues.has(a))) continue;
        const actuelle = await base.outbox.get(op.opId);
        // Disparue, rejetée ou réécrite entre-temps : on ne l'écrase pas.
        if (actuelle === undefined || actuelle.statut === 'rejetee') continue;
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
        if (!retenues.has(session.absorbee)) continue;
        const actuelle = await base.interviews.get(session.id);
        if (actuelle === undefined || !memeEnveloppe(actuelle.charge, session.avant)) continue;
        await base.interviews.update(session.id, { charge: session.apres });
        remappees += 1;
      }
      for (const piece of plan.pieces) {
        if (!retenues.has(piece.absorbee)) continue;
        const actuelle = await base.attachments.get(piece.id);
        if (actuelle?.answerId !== piece.absorbee) continue;
        await base.attachments.update(piece.id, { answerId: piece.cible });
        remappees += 1;
      }
      for (const absorbee of retenues) {
        await base.answers.update(absorbee, { supprimeLe: horodatage });
      }
    },
  );
  return remappees;
}

async function remapper(
  deps: DependancesRemappage,
  missionId: string,
  liste: readonly Absorption[],
): Promise<number> {
  if (liste.length === 0) return 0;
  return executer(deps.base, await planifier(deps, missionId, liste));
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
  return remapper(deps, missionId, await absorptionsDeLaPage(deps.base, enregistrements));
}

/**
 * Réaligne à la sortie `superseded` (A29-2) : `reponsesArbitrees` sont les ids
 * des réponses dont l'op vient d'être tranchée par le siège. Appelé par le
 * moteur APRÈS son passage, pour que les ops relancées partent au suivant.
 */
export async function remapperALaSortie(
  deps: DependancesRemappage,
  missionId: string,
  reponsesArbitrees: readonly string[],
): Promise<number> {
  if (reponsesArbitrees.length === 0) return 0;
  return remapper(deps, missionId, await absorptionsALaSortie(deps.base, reponsesArbitrees));
}
