// =============================================================================
// ICÔNES — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// POURQUOI DES SVG ÉCRITS ICI ET NON LUCIDE. Le §19.2 nomme « iconographie
// Lucide » et le contrat 11 §1 ne l'épingle PAS : `lucide-react` n'est installé
// nulle part, et l'installer est une escalade §3-1. Ces neuf icônes sont
// exactement celles dont les composants de ce paquet ont besoin — pas un jeu
// d'icônes, un inventaire fermé. Le jour où Lucide est arbitré, ce fichier
// devient un ré-export : aucun composant ne dessine de SVG lui-même.
//
// TOUTES sont `aria-hidden` et `focusable="false"` SANS EXCEPTION. Une icône de
// ce paquet n'est JAMAIS le porteur d'une information : §33.6 (« aucune
// information portée par la couleur seule », « libellés explicites sur toute
// icône seule ») et l'invariant 4 exigent qu'un mot l'accompagne toujours. Le
// mot vit dans le composant appelant, en français ; l'icône n'est que le
// deuxième signal — celui qui rend le premier plus rapide à lire.
// La couleur vient de `currentColor` : une icône hérite de la couleur du texte
// qu'elle accompagne, donc de son jeton, donc jamais d'une couleur en dur.
// =============================================================================
import type { SVGProps } from 'react';

/** Attributs partagés : le trait suit la couleur du texte, jamais un jeton figé. */
function Trait(props: SVGProps<SVGSVGElement>) {
  const { children, ...reste } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...reste}
    >
      {children}
    </svg>
  );
}

export type ProprietesIcone = SVGProps<SVGSVGElement>;

/** Coche — réponse retenue, entretien validé, « Enregistré ». */
export function IconeCoche(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Trait>
  );
}

/** Croix — fermer une superposition, refus. */
export function IconeCroix(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Trait>
  );
}

/** Triangle d'avertissement — alerte et erreur. */
export function IconeAlerte(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Trait>
  );
}

/** Cercle « i » — information, aide, capacités locales. */
export function IconeInfo(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </Trait>
  );
}

/** Nuage — synchronisation en cours ou faite. */
export function IconeNuage(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M17.5 19H7a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.75 4.75 0 0 1-.5 9.5Z" />
    </Trait>
  );
}

/** Nuage barré — hors ligne. Mode NOMINAL de l'invariant 1, jamais une panne. */
export function IconeNuageBarre(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M17.5 19H7a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.75 4.75 0 0 1-.5 9.5Z" />
      <path d="M3 3l18 18" />
    </Trait>
  );
}

/** Œil — mode écran partagé ACTIF (l'interlocuteur voit l'écran). */
export function IconeOeil(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Trait>
  );
}

/** Œil barré — mode écran partagé INACTIF (les éléments internes sont visibles). */
export function IconeOeilBarre(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 6.5 10 6.5a9.9 9.9 0 0 0 3.9-.8" />
      <path d="M3 3l18 18" />
    </Trait>
  );
}

/** Boîte vide — état vide (§17.6). */
export function IconeCorbeilleVide(props: ProprietesIcone) {
  return (
    <Trait {...props}>
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" />
      <path d="M3 8.5 12 13l9-4.5M12 13v7" />
    </Trait>
  );
}

/** Rotor d'attente — le SEUL mouvement continu, et toujours EN LIGNE (§33.2). */
export function IconeRotor(props: ProprietesIcone) {
  const { className, ...reste } = props;
  return (
    <Trait className={className ?? 'axn-rotor'} {...reste}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Trait>
  );
}
