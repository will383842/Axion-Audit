// =============================================================================
// LE CADRE D'UN TABLEAU DENSE — et la seule raison pour laquelle il est un
// composant plutôt qu'une classe CSS. Lot L7, incrément L7b (correctif D3).
//
// ── LE DÉFAUT QU'IL FERME, ET IL EST DE NIVEAU A ────────────────────────────
// `.axn-tableau-cadre` porte `overflow-x: auto` : sur la grille large que le
// §33.4 veut dense, la souris fait défiler ce que le clavier NE PEUT PAS
// atteindre. Une zone défilante sans contenu focusable est INATTEINTE au clavier
// — **WCAG 2.1.1, niveau A**, pas AA — et le 03 §22.1 dit « navigation clavier
// intégrale » mot pour mot. Mesuré par A36 (axe-core) sur les deux écrans de
// L7b ; le portefeuille de L7a portait exactement le même défaut sans que
// personne ne l'ait vu, parce qu'il n'avait pas encore été balayé.
//
// ── POURQUOI UN COMPOSANT, ET PAS TROIS `div` CORRIGÉES ────────────────────
// Le cadre n'est PAS dans `packages/ui` (vérifié : ce paquet est borné aux
// écrans de L5, et la console n'y a rien poussé) : c'est une classe de
// `app/coquille.css`, recopiée à la main par trois écrans — le portefeuille
// (L7a), la couverture et l'agrégation (L7b). Corriger trois `div` laisserait la
// QUATRIÈME à écrire redevenir inaccessible, en silence. Un composant rend
// l'oubli impossible : on ne peut pas écrire le cadre sans passer par lui, et
// `libelle` est OBLIGATOIRE — une région sans nom accessible est une région que
// personne ne sait quoi faire de.
//
// ── LES TROIS ATTRIBUTS, ET POURQUOI CES TROIS-LÀ ──────────────────────────
// `tabIndex={0}` rend la zone atteignable ; `role="region"` dit CE QUI est
// atteint (sans lui, le focus tomberait sur un `div` muet que rien n'annonce) ;
// `aria-label` la nomme. C'est le motif ARIA canonique d'une région défilante, et
// c'est l'arbitrage rendu par A01 le 2026-09-05. Les colonnes figées, proposées
// en variante, sont un chantier bien plus lourd **et ne résolvent pas le
// défilement au clavier** : elles ont été écartées pour cette raison, pas pour
// leur coût.
//
// Traçabilité : E22 (console de pilotage 7 espaces) · E27 (design moderne,
// charte, WCAG AA) · E23 (hyper intuitif, novice en moins de 30 minutes).
// =============================================================================
import type { ReactNode } from 'react';

export interface ProprietesCadreTableau {
  /**
   * Le NOM ACCESSIBLE de la région, en français. Obligatoire : c'est ce qu'un
   * lecteur d'écran annonce quand le focus arrive sur la zone, et « région »
   * tout court n'aide personne à décider s'il faut y entrer.
   */
  readonly libelle: string;
  readonly children: ReactNode;
}

/**
 * Le cadre d'un tableau dense (§33.4), atteignable au clavier.
 *
 * `tabIndex={0}` est posé SANS CONDITION, y compris quand le tableau tient dans
 * la largeur disponible. C'est délibéré : savoir s'il déborde exige de mesurer le
 * rendu, donc de faire dépendre l'accessibilité d'une largeur de fenêtre — un
 * utilisateur au clavier perdrait l'accès en agrandissant sa police. Le coût est
 * une tabulation de plus sur un tableau court ; le bénéfice est que la garantie
 * ne dépend d'aucune mesure.
 */
export function CadreTableau({ libelle, children }: ProprietesCadreTableau): ReactNode {
  return (
    <div className="axn-tableau-cadre" tabIndex={0} role="region" aria-label={libelle}>
      {children}
    </div>
  );
}
