// =============================================================================
// LA FILE DE SYNCHRONISATION, LUE DANS LE LOCAL — ce que les écrans affichent (L6b)
//
// 05 §9.3 : « à examiner » visible (jamais de suppression silencieuse), « n
// réponse(s) arbitrée(s) » cliquable ; 05 §9.9 : « rejetée » visible, jamais
// rejouée. `LOT_L6.md` §3ter C.2 : le statut lit le LOCAL, jamais le réseau.
//
// Lecture seule : ce module n'écrit rien. Les écrans (`ecrans/sync/**`, l'accueil,
// « Aujourd'hui ») ne calculent rien : ils rendent ce qui est lu ici.
// Les motifs (`derniereErreur`) sont en français et sans donnée personnelle
// (11 §2) — c'est le moteur qui les écrit ainsi.
//
// Traçabilité : E7, E38 ; invariants 7 et 8.
// =============================================================================
import type { BaseLocale } from '../local/base.js';
import type { Coffre } from '../local/coffre.js';
import type { EntiteSync } from '../local/contrat-sync.js';
import { chargeMissionSchema } from '../local/formes.js';
import { PREFIXE_REPONSES_ARBITREES } from './moteur.js';

/** Une op bloquée, telle que l'écran la montre. */
export interface OpBloquee {
  readonly opId: string;
  readonly missionId: string;
  /** Titre de la mission, ou une mention neutre si la mission n'est plus sur l'appareil. */
  readonly missionTitre: string;
  readonly entite: EntiteSync;
  readonly motif: string;
}

export interface FileSync {
  readonly enAttente: number;
  readonly aExaminer: readonly OpBloquee[];
  readonly rejetees: readonly OpBloquee[];
  /** Compte CUMULÉ des réponses arbitrées, toutes missions (`meta`). */
  readonly arbitrees: number;
}

/** Le résumé que portent l'accueil et « Aujourd'hui » : des comptes, sans déchiffrer. */
export interface ResumeFileSync {
  readonly enAttente: number;
  readonly aExaminer: number;
  readonly rejetees: number;
  readonly arbitrees: number;
}

const MISSION_ABSENTE = 'Mission absente de cet appareil';
const MOTIF_INCONNU = 'Aucun motif n’a été enregistré pour cette opération.';

async function compterArbitrages(base: BaseLocale): Promise<number> {
  let total = 0;
  await base.meta
    .where('cle')
    .startsWith(PREFIXE_REPONSES_ARBITREES)
    .each((ligne) => {
      if (typeof ligne.valeur === 'number' && Number.isFinite(ligne.valeur)) total += ligne.valeur;
    });
  return total;
}

/** Les comptes seuls — aucune charge déchiffrée. */
export async function lireResumeFileSync(base: BaseLocale): Promise<ResumeFileSync> {
  let enAttente = 0;
  let aExaminer = 0;
  let rejetees = 0;
  await base.outbox.each((op) => {
    if (op.statut === 'en_attente') enAttente += 1;
    else if (op.statut === 'a_examiner') aExaminer += 1;
    else rejetees += 1;
  });
  return { enAttente, aExaminer, rejetees, arbitrees: await compterArbitrages(base) };
}

/** La file détaillée : ops bloquées avec leur motif et le titre de leur mission. */
export async function lireFileSync(base: BaseLocale, coffre: Coffre): Promise<FileSync> {
  // TOUTES les lectures Dexie d'abord, le déchiffrement ensuite : une `liveQuery`
  // ne suit plus les tables lues après une promesse étrangère à Dexie
  // (`crypto.subtle`) — l'écran ne verrait alors plus la file bouger.
  const missions = await base.missions.toArray();
  // Ordre de la file (`opId` v7) : l'auditeur lit ses ops dans l'ordre de saisie.
  const ops = await base.outbox.orderBy('opId').toArray();
  const arbitrees = await compterArbitrages(base);

  const titres = new Map<string, string>();
  for (const mission of missions) {
    const charge = await coffre.dechiffrer(mission.charge, chargeMissionSchema);
    titres.set(mission.id, charge.titre);
  }

  let enAttente = 0;
  const aExaminer: OpBloquee[] = [];
  const rejetees: OpBloquee[] = [];
  for (const op of ops) {
    if (op.statut === 'en_attente') {
      enAttente += 1;
      continue;
    }
    const vue: OpBloquee = {
      opId: op.opId,
      missionId: op.missionId,
      missionTitre: titres.get(op.missionId) ?? MISSION_ABSENTE,
      entite: op.entite,
      motif: op.derniereErreur ?? MOTIF_INCONNU,
    };
    if (op.statut === 'a_examiner') aExaminer.push(vue);
    else rejetees.push(vue);
  }
  return { enAttente, aExaminer, rejetees, arbitrees };
}
