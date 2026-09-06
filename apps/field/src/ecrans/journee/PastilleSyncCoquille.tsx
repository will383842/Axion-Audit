// =============================================================================
// PASTILLE DE SYNCHRONISATION DE LA COQUILLE — décision A01 du 2026-09-05
//
// « L'état de synchronisation est visible sur TOUS les écrans. » 03 §19.2 :
// « état réseau/sync toujours visible mais discret (pastille, jamais de bannière
// anxiogène) ». Posée UNE fois dans l'en-tête commun (`App.tsx`), pas dans
// chaque écran.
//
// ── B6 (recette novice A54, 2026-09-06) : DEUX PASTILLES, DEUX MENSONGES ────
// Celle-ci était pilotée par `navigator.onLine` SEUL et annonçait « En attente
// de synchronisation » alors que le port est inerte et qu'il n'y avait, le plus
// souvent, rien à remonter. Trois centimètres plus bas, celle de l'accueil disait
// « Hors ligne », déduite du COMPTE D'OUTBOX — donc « hors ligne » dès que la
// file est vide, quel que soit le réseau. A54 a relevé les deux, sur le même
// écran, se contredisant.
//
// Deux gestes, dans le même commit : la pastille de l'accueil est retirée
// (l'en-tête la porte déjà, pour les onze écrans), et celle-ci ne déduit plus son
// état d'un fait qui n'est pas le sien. Sa source est le PORT DE SYNC — le seul
// qui sache ce que l'application peut réellement faire — via la traduction
// unique de `app/etat-sync-affiche.ts`, partagée avec le cockpit.
//
// Le compte d'opérations, lui, reste affiché : c'est un nombre VRAI, lu dans
// l'outbox, et c'est celui qui dit à l'auditeur ce qui ne vit encore que sur sa
// tablette.
//
// **`navigator.onLine` ne pilote plus rien ici, et c'est délibéré** : tant que
// L6a n'a pas livré, être en ligne ne change rien à la réponse — rien ne sort de
// l'appareil. Le réseau reste dit là où il est actionnable : le cockpit rend son
// état hors ligne complet, avec les capacités locales, quand la connexion tombe.
// L6a REMPLACERA la source de cette pastille, pas la pastille.
//
// Traçabilité : E7 (remontée continue dès qu'il y a du réseau), E6 (hors ligne
// total), E38 (sauvegarde terrain).
// =============================================================================
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PastilleSync } from '@axion/ui';
import { useTerrain } from '../../app/contexte.js';
import {
  MENTION_SYNC_INDISPONIBLE,
  statutSyncAppareil,
  versEtatPastille,
} from '../../app/etat-sync-affiche.js';
import { portSyncInerte } from '../../local/port-sync.js';

export function PastilleSyncCoquille(): ReactNode {
  const { base } = useTerrain();
  // Lecture d'INDEX (`id`, `statut`), aucun déchiffrement : posée à chaque rendu
  // de l'en-tête, elle doit rester gratuite. C'est précisément ce que la liste
  // fermée du `LOT_L5.md` §3.2 rend possible. `null` = base fermée.
  const lecture = useLiveQuery(
    async () => {
      if (base === null) return null;
      const missions = await base.missions.toArray();
      return {
        statut: statutSyncAppareil(
          missions.map((mission) => portSyncInerte.etat(mission.id).statut),
        ),
        enAttente: await base.outbox.where('statut').equals('en_attente').count(),
      };
    },
    [base],
    null,
  );

  const statut = lecture?.statut ?? 'indisponible';
  return (
    <PastilleSync
      etat={versEtatPastille(statut)}
      {...(statut === 'indisponible' ? { title: MENTION_SYNC_INDISPONIBLE } : {})}
      {...(lecture === null ? {} : { enAttente: lecture.enAttente })}
    />
  );
}
