// =============================================================================
// PASTILLE DE SYNCHRONISATION — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027,
// tokens, police locale).
//
// §19.2 : « état réseau/sync TOUJOURS VISIBLE mais DISCRET (pastille, JAMAIS de
// bannière anxiogène) ». Les deux moitiés sont des contraintes de conception :
//   · toujours visible → la pastille occupe sa place même quand tout va bien ;
//   · jamais anxiogène → « hors ligne » est rendu en NEUTRE, pas en rouge.
//     L'invariant 1 dit que l'app fonctionne à 100 % sans réseau : hors ligne est
//     le mode NOMINAL. Seul `echec` — une sync qui a réellement échoué, donc un
//     geste à poser — porte le rouge d'alerte.
//
// L'horodatage arrive DÉJÀ FORMATÉ. Le fuseau d'affichage est celui de la MISSION
// (§22.2, invariant 5), une donnée que ce composant n'a pas et ne doit pas aller
// chercher ; et `date-fns` n'est pas une dépendance de ce paquet.
// =============================================================================
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { classes } from './utilitaires.js';
import { IconeAlerte, IconeCoche, IconeNuage, IconeNuageBarre, IconeRotor } from './icones.js';

export type EtatSync = 'synchronise' | 'en-cours' | 'en-attente' | 'hors-ligne' | 'echec';

/**
 * Le mot ET l'icône de chaque état. Le mot n'est pas facultatif : §33.6 interdit
 * qu'une information soit portée par la couleur seule, et l'état de sync est
 * précisément celui qu'on serait tenté de réduire à une pastille verte ou rouge.
 */
const ETATS: Record<EtatSync, { mot: string; icone: ReactNode }> = {
  synchronise: { mot: 'Synchronisé', icone: <IconeCoche /> },
  'en-cours': { mot: 'Synchronisation…', icone: <IconeRotor /> },
  'en-attente': { mot: 'En attente de synchronisation', icone: <IconeNuage /> },
  'hors-ligne': { mot: 'Hors ligne', icone: <IconeNuageBarre /> },
  echec: { mot: 'Synchronisation en échec', icone: <IconeAlerte /> },
};

export interface ProprietesPastilleSync extends ComponentPropsWithoutRef<'div'> {
  etat: EtatSync;
  /** Nombre d'éléments locaux non remontés. Affiché dès qu'il est supérieur à zéro. */
  enAttente?: number;
  /** Dernière synchronisation, DÉJÀ formatée au fuseau de la mission (§22.2). */
  derniereSync?: string;
}

export function PastilleSync(proprietes: ProprietesPastilleSync) {
  const { etat, enAttente, derniereSync, className, ...reste } = proprietes;
  const { mot, icone } = ETATS[etat];

  return (
    <div
      // `status` et non `alert` : §17.3 interdit toute notification intrusive en
      // entretien, et `alert` coupe la parole au lecteur d'écran.
      role="status"
      aria-live="polite"
      className={classes('axn-pastille-sync', `axn-pastille-sync--${etat}`, className)}
      {...reste}
    >
      {icone}
      <span>{mot}</span>
      {enAttente !== undefined && enAttente > 0 && (
        <span className="axn-pastille-sync__compte axn-chiffres">{enAttente} en attente</span>
      )}
      {derniereSync !== undefined && <span>· {derniereSync}</span>}
    </div>
  );
}
