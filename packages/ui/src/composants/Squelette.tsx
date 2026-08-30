// =============================================================================
// SQUELETTE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027,
// tokens, police locale).
//
// §33.2 : « chargement : skeletons AUX DIMENSIONS FINALES — JAMAIS de spinner
// plein écran ». Les deux moitiés comptent. Un squelette de la mauvaise taille
// fait sauter la page à l'arrivée des données, et c'est ce saut, pas l'attente,
// qui donne l'impression d'un outil lent. D'où des FORMES nommées plutôt qu'une
// largeur libre : les dimensions viennent des jetons typographiques, c'est-à-dire
// des mêmes valeurs que le contenu réel.
//
// Le groupe porte `role="status"` avec un texte lu (« Chargement en cours ») et
// masque ses barres à `aria-hidden` : sans cela, un lecteur d'écran annonce une
// liste d'éléments vides et laisse croire que l'écran est vide, pas en attente.
// =============================================================================
import type { ComponentPropsWithoutRef } from 'react';
import { classes } from './utilitaires.js';

export type FormeSquelette = 'titre' | 'ligne' | 'pastille' | 'carte';

export interface ProprietesSquelette extends ComponentPropsWithoutRef<'div'> {
  forme?: FormeSquelette;
  /** Nombre de barres. Le régler sur la longueur RÉELLE du contenu attendu. */
  lignes?: number;
  /** Texte lu pendant l'attente. En français, et il dit ce qui charge. */
  libelle?: string;
}

export function Squelette(proprietes: ProprietesSquelette) {
  const {
    forme = 'ligne',
    lignes = 3,
    libelle = 'Chargement en cours',
    className,
    ...reste
  } = proprietes;

  return (
    <div
      role="status"
      aria-busy="true"
      className={classes('axn-squelette-groupe', className)}
      {...reste}
    >
      <span className="axn-visuellement-masque">{libelle}</span>
      {Array.from({ length: Math.max(1, lignes) }, (_, rang) => (
        <span
          key={rang}
          aria-hidden="true"
          className={classes('axn-squelette', `axn-squelette--${forme}`)}
        />
      ))}
    </div>
  );
}
