// =============================================================================
// PASTILLE DE SYNCHRONISATION DE LA COQUILLE — décision A01 du 2026-09-05
//
// « L'état de synchronisation est visible sur TOUS les écrans. » 03 §19.2 :
// « état réseau/sync toujours visible mais discret (pastille, jamais de bannière
// anxiogène) ». Posée UNE fois dans l'en-tête commun (`App.tsx`), pas dans
// chaque écran.
//
// ── CE QU'ELLE NE DIT JAMAIS ────────────────────────────────────────────────
// `synchronise`. Tant que L6a n'a pas livré, le port est inerte : rien n'est
// jamais synchronisé, et une pastille verte serait « le garde-fou qui annonce
// plus qu'il ne fait » (LOT_L5.md §3.6). Hors réseau → `hors-ligne` ; en ligne →
// `en-attente`, avec le compte RÉEL d'opérations lu dans l'outbox. L6a
// remplacera la source, pas la pastille.
//
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau), E6 (hors ligne
// total).
// =============================================================================
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PastilleSync } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import { useEnLigne } from '../../session/media.js';

export function PastilleSyncCoquille(): ReactNode {
  const { base } = useTerrain();
  const enLigne = useEnLigne();
  // Lecture d'INDEX (`statut`), aucun déchiffrement : posée à chaque rendu de
  // l'en-tête, elle doit rester gratuite. `null` = base fermée, on ne compte pas.
  const enAttente = useLiveQuery(
    async () => (base === null ? null : base.outbox.where('statut').equals('en_attente').count()),
    [base],
    null,
  );
  return (
    <PastilleSync
      etat={enLigne ? 'en-attente' : 'hors-ligne'}
      {...(enAttente === null ? {} : { enAttente })}
    />
  );
}
