// =============================================================================
// DOUBLE DE TEST — « le siège n'a rien à faire descendre » (A26, L6b)
//
// `tirer` est OBLIGATOIRE au type de `DependancesPort.transport` depuis la revue
// A29 de L6b. Les doubles de L6a, écrits pour la montée seule, reçoivent ce pull
// sans changement : il ne modifie rien de ce qu'ils vérifient.
//   · `serverTime` = `maintenant()` (horloge CORRIGÉE) : `reglerDecalage` retrouve
//     exactement le décalage courant, l'horloge des tests ne bouge pas ;
//   · `changes` vide, `nextSince` nul : aucune ligne, aucun remappage, curseur
//     inchangé.
// Fichier de banc, jamais importé par le code de production.
// =============================================================================
import type { ReponsePull } from '../../local/contrat-sync.js';
import { maintenant } from '../../local/horloge.js';
import type { ResultatTransport } from '../transport.js';

export function tirerSansChangement(): Promise<ResultatTransport<ReponsePull>> {
  return Promise.resolve({
    type: 'ok',
    donnees: { serverTime: maintenant(), changes: {}, nextSince: null },
  });
}
