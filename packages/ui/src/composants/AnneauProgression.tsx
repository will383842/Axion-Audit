// =============================================================================
// ANNEAU DE PROGRESSION — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// §19.2 : « anneaux de progression (mission, unité, entretien) » — le terracotta
// est « réservé à l'action ET à l'ACCOMPLISSEMENT », c'est donc lui qui remplit
// l'anneau, sur une piste en terracotta tendre.
//
// ── LA GÉOMÉTRIE EST EN UNITÉS DE `viewBox`, PAS EN PIXELS ────────────────────
// Les nombres ci-dessous (rayon 44, trait 10, boîte 100 × 100) sont des unités
// SANS DIMENSION : le SVG est mis à l'échelle par sa largeur CSS, qui vient d'un
// jeton (`--taille-anneau-diametre-*`). Ils ne sont donc pas des « tailles en
// dur » au sens de l'invariant 4 — ils décrivent une PROPORTION, et cette
// proportion ne change pas avec le zoom du navigateur ni avec la taille de police
// système, ce qui est précisément ce que l'invariant protège.
//
// ── L'ANNEAU N'EST PAS LE SEUL PORTEUR DU CHIFFRE ─────────────────────────────
// §33.6 : aucune information portée par la couleur seule. Le pourcentage est
// écrit AU CENTRE, en chiffres tabulaires, et l'élément porte `role="img"` avec
// un `aria-label` en français — un arc de cercle n'est lisible ni par un lecteur
// d'écran, ni en photocopie, ni par un daltonien qui compare deux anneaux.
// =============================================================================
import { borner, classes } from './utilitaires.js';

const BOITE = 100;
const CENTRE = BOITE / 2;
const RAYON = 44;
const TRAIT = 10;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export interface ProprietesAnneauProgression {
  /** Progression en POURCENTAGE (0 à 100). Bornée : 104 % dessine un anneau plein. */
  valeur: number;
  /** Ce que l'anneau mesure, en français (« Entretien », « Unité Logistique »). */
  libelle: string;
  taille?: 'petit' | 'grand';
  /**
   * Description lue par les lecteurs d'écran. Par défaut « <libelle> : N % ».
   * À préciser quand le pourcentage seul ne dit pas assez (« 12 questions sur 40 »).
   */
  libelleAccessible?: string;
  className?: string;
}

export function AnneauProgression(proprietes: ProprietesAnneauProgression) {
  const { valeur, libelle, taille = 'petit', libelleAccessible, className } = proprietes;

  const pourcentage = Math.round(borner(valeur, 0, 100));
  const reste = CIRCONFERENCE * (1 - pourcentage / 100);

  return (
    <span
      className={classes('axn-anneau', taille === 'grand' && 'axn-anneau--grand', className)}
      role="img"
      aria-label={libelleAccessible ?? `${libelle} : ${String(pourcentage)} %`}
    >
      <svg
        className="axn-anneau__dessin"
        viewBox={`0 0 ${String(BOITE)} ${String(BOITE)}`}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="axn-anneau__piste"
          cx={CENTRE}
          cy={CENTRE}
          r={RAYON}
          strokeWidth={TRAIT}
        />
        <circle
          className="axn-anneau__part"
          cx={CENTRE}
          cy={CENTRE}
          r={RAYON}
          strokeWidth={TRAIT}
          strokeDasharray={CIRCONFERENCE}
          strokeDashoffset={reste}
        />
      </svg>
      <span className="axn-anneau__valeur axn-chiffres" aria-hidden="true">
        {pourcentage} %
      </span>
      <span className="axn-anneau__libelle" aria-hidden="true">
        {libelle}
      </span>
    </span>
  );
}
