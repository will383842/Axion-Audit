// =============================================================================
// FIXTURE — un écrivain de sauvegarde EN MÉMOIRE, pour les tests (A26, L6c-1).
//
// Revue A29 (`DECISIONS.md` [L6c]) : l'export de secours v2 s'écrit PAR
// SEGMENTS, une photo chiffrée à la fois. Le port attendu (sauvegarde.ts) :
//   export interface EcrivainSauvegarde { ecrire(partie: string): Promise<void>; }
//   export interface BilanEcritureSauvegarde {
//     readonly enTete: EnTeteSauvegarde;
//     readonly piecesIllisibles: readonly string[];
//   }
//   export function ecrireSauvegarde(demande: DemandeExport, ecrivain: EcrivainSauvegarde)
//     : Promise<BilanEcritureSauvegarde>;
// La concaténation des parties, dans l'ordre, EST le texte du `.axionbackup` :
// un document JSON que `fichierSauvegardeSchema` accepte et qu'`importerSauvegarde`
// restaure. Ici, et ici seulement (un test), les parties sont réunies.
// =============================================================================
import { fichierSauvegardeSchema, type FichierSauvegarde } from '../format.js';
import {
  ecrireSauvegarde,
  type BilanEcritureSauvegarde,
  type DemandeExport,
  type EcrivainSauvegarde,
} from '../sauvegarde.js';

export function ecrivainEnMemoire(): EcrivainSauvegarde & { readonly parties: string[] } {
  const parties: string[] = [];
  return {
    parties,
    ecrire(partie: string): Promise<void> {
      parties.push(partie);
      return Promise.resolve();
    },
  };
}

export async function exporterAvecBilan(demande: DemandeExport): Promise<{
  readonly fichier: FichierSauvegarde;
  readonly texte: string;
  readonly parties: readonly string[];
  readonly bilan: BilanEcritureSauvegarde;
}> {
  const ecrivain = ecrivainEnMemoire();
  const bilan = await ecrireSauvegarde(demande, ecrivain);
  const texte = ecrivain.parties.join('');
  const fichier = fichierSauvegardeSchema.parse(JSON.parse(texte));
  return { fichier, texte, parties: ecrivain.parties, bilan };
}

/** Le fichier seul, comme le rendait `exporterSauvegarde` — mais écrit par segments. */
export async function exporterParSegments(demande: DemandeExport): Promise<FichierSauvegarde> {
  return (await exporterAvecBilan(demande)).fichier;
}
