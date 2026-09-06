// =============================================================================
// PROPOSITION D'UNITÉ DEPUIS LE TERRAIN — 03 §25.3 (N1, noyau strict)
//
// ── LA RÈGLE, MOT POUR MOT ──────────────────────────────────────────────────
// 03 §25.3 : « Un auditeur crée **hors ligne** une unité `proposee` (nom, type,
// rattachement supposé, effectif estimé, note) et **y rattache immédiatement des
// entretiens**. À la sync : alerte au lead/admin → valider (devient `active`,
// entre dans la couverture et le scoring) ou fusionner […]. Amendement de la
// règle §9.5 : **le terrain ne MODIFIE jamais les entités siège, mais peut
// PROPOSER** (unités, questions ad hoc) — le siège qualifie. »
//
// Trois conséquences, toutes structurelles plutôt que déclaratives :
//   ① l'unité naît `proposee`, jamais `active` — c'est le siège qui qualifie, et
//     ce module n'expose aucun chemin vers `active` ou `fusionnee` ;
//   ② `proposedBy` porte l'auteur, sans quoi le lead ne saurait pas à qui poser
//     la question à la qualification ;
//   ③ `inScope: true` — l'unité proposée entre dans le périmètre TANT QUE le
//     siège ne dit pas le contraire. La sortir du périmètre par défaut ferait
//     disparaître de la couverture le travail qu'on vient d'y rattacher.
//
// ── CE QUE CE MODULE NE FAIT PAS ────────────────────────────────────────────
// Il ne valide pas, ne fusionne pas, ne renomme pas une unité du siège. Ce sont
// des gestes de qualification, ils vivent dans la console (L7), et les offrir ici
// contredirait §9.5 amendé — c'est-à-dire la ligne exacte qui autorise cette
// fonctionnalité.
//
// Traçabilité : E12 (entretiens par interlocuteur, arbre organisationnel),
// E6 (hors ligne total).
// =============================================================================
import { uuidv7 } from 'uuidv7';
import { ecrireLocal } from '../local/ecriture.js';
import { maintenant } from '../local/horloge.js';
import { type STATUTS_UNITE, type TYPES_UNITE } from '../local/formes.js';

export type TypeUnite = (typeof TYPES_UNITE)[number];

/** Libellés français des types d'unité (04, 03 §26.3 — jusqu'au POSTE). */
export const LIBELLE_TYPE_UNITE: Record<TypeUnite, string> = {
  groupe: 'Groupe',
  filiale: 'Filiale',
  etablissement: 'Établissement',
  direction: 'Direction',
  service: 'Service',
  equipe: 'Équipe',
  poste: 'Poste',
};

/** Le statut d'une unité née au terrain. 03 §25.3 : jamais autre chose. */
export const STATUT_UNITE_PROPOSEE = 'proposee' satisfies (typeof STATUTS_UNITE)[number];

export interface DemandePropositionUnite {
  readonly missionId: string;
  /** « nom » (03 §25.3). Obligatoire : une unité sans nom n'est pas qualifiable. */
  readonly nom: string;
  /** « type » — l'une des sept valeurs du 04. */
  readonly kind: TypeUnite;
  /** « rattachement supposé » — l'unité parente, ou `null` si l'auditeur l'ignore. */
  readonly parentId: string | null;
  /** « effectif estimé » — une estimation vaut mieux qu'un vide (§25.3). */
  readonly effectifEstime: number | null;
  /** L'auteur de la proposition (`org_units.proposed_by`, 04). */
  readonly proposeePar: string;
  /**
   * Position dans l'arbre. Les propositions se rangent APRÈS l'arbre du siège :
   * une unité terrain qui s'insérerait au milieu déplacerait visuellement des
   * unités que le terrain n'a pas le droit de modifier (§9.5 amendé).
   */
  readonly position: number;
}

/**
 * Propose une unité depuis le terrain. Hors ligne, UUID v7 client (P1-4).
 *
 * ── LA « NOTE » DU §25.3 N'EST PAS DEMANDÉE, ET C'EST DÉLIBÉRÉ ─────────────
 * 03 §25.3 énumère cinq champs : « nom, type, rattachement supposé, effectif
 * estimé, **note** ». Les quatre premiers existent dans `chargeOrgUnitSchema`
 * (L5a, transcrit du 04). **Le cinquième n'existe nulle part** : ni colonne au
 * 04, ni champ dans la charge locale.
 *
 * Trois issues, et deux sont mauvaises. La glisser dans `name` polluerait
 * l'arbre du siège avec du texte libre, sur une entité que le terrain n'a pas le
 * droit de modifier (§9.5 amendé). L'ACCEPTER puis la jeter serait pire : une
 * perte silencieuse de saisie, exactement ce que l'invariant 7 interdit — et
 * l'auditeur n'en saurait rien. La troisième est celle-ci : **ne pas offrir le
 * champ**, et remonter le manque. Un formulaire qui ne demande pas est honnête ;
 * un formulaire qui demande et oublie ne l'est pas.
 * Escalade tracée dans `DECISIONS.md` — le 04 n'est pas un fichier que L5c
 * modifie (`CLAUDE.md` §3-2).
 */
export async function proposerUnite(demande: DemandePropositionUnite): Promise<string> {
  const nom = demande.nom.trim();
  if (nom === '') {
    throw new Error('Une unité proposée a besoin d’un nom : c’est ce que le siège qualifiera.');
  }
  if (demande.effectifEstime !== null && demande.effectifEstime < 0) {
    throw new Error('L’effectif estimé ne peut pas être négatif.');
  }

  const id = uuidv7();
  const instant = maintenant();

  await ecrireLocal({
    entite: 'org_unit_proposal',
    id,
    missionId: demande.missionId,
    action: 'upsert',
    index: {
      parentId: demande.parentId,
      kind: demande.kind,
      status: STATUT_UNITE_PROPOSEE,
      position: demande.position,
    },
    charge: {
      name: nom,
      countryCode: null,
      timezone: null,
      headcount: demande.effectifEstime,
      serviceRefId: null,
      sectorId: null,
      // Voir l'en-tête, ③ : une unité proposée est DANS le périmètre tant que le
      // siège n'a pas tranché, sans quoi les entretiens qu'on vient d'y rattacher
      // sortiraient de la couverture au moment même où on les saisit.
      inScope: true,
      proposedBy: demande.proposeePar,
      mergedIntoId: null,
      clientCreatedAt: instant,
    },
  });
  return id;
}
