// =============================================================================
// BALAYAGE HORIZONTAL — 03 §33.3 : « iPad : swipe horizontal = question
// suivante / précédente »
//
// Détection minimale, sans dépendance : un doigt, un départ, une fin, un
// déplacement horizontal net (plus long que le seuil, et plus horizontal que
// vertical — sinon c'est un défilement). Un balayage qui COMMENCE dans un champ
// de saisie est ignoré : on y sélectionne du texte, on n'y change pas de
// question.
// =============================================================================
import { useMemo, useRef, type TouchEvent } from 'react';
import { estChampDeSaisie } from './raccourcis.js';

/** Déplacement minimal, en points CSS, pour qu'un geste compte comme un balayage. */
export const SEUIL_BALAYAGE = 64;

export interface GestesBalayage {
  readonly onTouchStart: (evenement: TouchEvent<HTMLElement>) => void;
  readonly onTouchEnd: (evenement: TouchEvent<HTMLElement>) => void;
}

export function useBalayageHorizontal(
  versLaGauche: () => void,
  versLaDroite: () => void,
  actif = true,
): GestesBalayage {
  const depart = useRef<{ x: number; y: number } | null>(null);

  return useMemo(
    () => ({
      onTouchStart: (evenement) => {
        const point = evenement.touches[0];
        if (
          point === undefined ||
          evenement.touches.length !== 1 ||
          estChampDeSaisie(evenement.target)
        ) {
          depart.current = null;
          return;
        }
        depart.current = { x: point.clientX, y: point.clientY };
      },
      onTouchEnd: (evenement) => {
        const origine = depart.current;
        depart.current = null;
        if (!actif || origine === null) return;
        const point = evenement.changedTouches[0];
        if (point === undefined) return;
        const dx = point.clientX - origine.x;
        const dy = point.clientY - origine.y;
        if (Math.abs(dx) < SEUIL_BALAYAGE || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) versLaGauche();
        else versLaDroite();
      },
    }),
    [actif, versLaGauche, versLaDroite],
  );
}
