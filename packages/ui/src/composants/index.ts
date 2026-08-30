// =============================================================================
// INVENTAIRE DES COMPOSANTS — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027,
// tokens, police locale), E13 (écran 3 zones, enregistrement continu).
//
// PÉRIMÈTRE : les écrans du lot L5 (PWA terrain), et EUX SEULS. L'inventaire
// §33.5 liste aussi TimelinePilote, Radar, Heatmap, CourbePrévuRéel, Table et
// Tabs : tous appartiennent à la CONSOLE (§33.4 « desktop-first, PAS de console
// mobile en V1 ») ou à la dataviz de scoring (L7-L8). Les construire ici serait
// du code orphelin au sens de l'étape 6 du pipeline — rattaché à aucun critère du
// lot ouvert — et le gardien A02 le refuserait à juste titre.
//
// Ce paquet ne rend AUCUN écran. Les composants sont pilotés de bout en bout par
// leurs propriétés : aucun n'appelle le réseau, ne lit Dexie, ne connaît une
// mission ni ne formate une date. Deux conséquences voulues : ils se testent sans
// monter d'application (09 §5.6 — les tests sont écrits par un autre agent), et
// aucun ne peut violer l'invariant 2 (aucune référence client dans le code).
// =============================================================================

// --- Socle -------------------------------------------------------------------
export { Bouton } from './Bouton.js';
export type { ProprietesBouton, VarianteBouton, TailleBouton } from './Bouton.js';

export { ChampTexte } from './ChampTexte.js';
export type { ProprietesChampTexte, NatureChamp } from './ChampTexte.js';

export { ZoneNotes } from './ZoneNotes.js';
export type { ProprietesZoneNotes } from './ZoneNotes.js';

export { Selection } from './Selection.js';
export type { ProprietesSelection, OptionSelection } from './Selection.js';

export { CaseACocher } from './CaseACocher.js';
export type { ProprietesCaseACocher } from './CaseACocher.js';

export { Bascule } from './Bascule.js';
export type { ProprietesBascule } from './Bascule.js';

export { Badge } from './Badge.js';
export type { ProprietesBadge, TonBadge } from './Badge.js';

export { Message } from './Message.js';
export type { ProprietesMessage, TonMessage } from './Message.js';

export { Dialogue } from './Dialogue.js';
export type { ProprietesDialogue } from './Dialogue.js';

export { Panneau } from './Panneau.js';
export type { ProprietesPanneau, PositionPanneau } from './Panneau.js';

// --- Les quatre états de §33.2 (exigence de la DoD transverse) ----------------
export { Squelette } from './Squelette.js';
export type { ProprietesSquelette, FormeSquelette } from './Squelette.js';

export { EtatVide } from './EtatVide.js';
export type { ProprietesEtatVide } from './EtatVide.js';

export { EtatErreur } from './EtatErreur.js';
export type { ProprietesEtatErreur } from './EtatErreur.js';

export { EtatHorsLigne } from './EtatHorsLigne.js';
export type { ProprietesEtatHorsLigne } from './EtatHorsLigne.js';

export { ZoneEtat } from './ZoneEtat.js';
export type { ProprietesZoneEtat, EtatZone } from './ZoneEtat.js';

// --- Composants MÉTIER terrain (§33.5) ---------------------------------------
export { EchelleAncree } from './EchelleAncree.js';
export type { ProprietesEchelleAncree, AncreCotation } from './EchelleAncree.js';

export { SegmenteONA } from './SegmenteONA.js';
export type { ProprietesSegmenteONA, ReponseONA } from './SegmenteONA.js';

export { SaisieFourchette, fourchetteIncoherente } from './SaisieFourchette.js';
export type { ProprietesSaisieFourchette } from './SaisieFourchette.js';

export { PastilleSync } from './PastilleSync.js';
export type { ProprietesPastilleSync, EtatSync } from './PastilleSync.js';

export { IndicateurEnregistrement } from './IndicateurEnregistrement.js';
export type {
  ProprietesIndicateurEnregistrement,
  EtatEnregistrement,
} from './IndicateurEnregistrement.js';

export { BandeauPartage } from './BandeauPartage.js';
export type { ProprietesBandeauPartage } from './BandeauPartage.js';

export { AnneauProgression } from './AnneauProgression.js';
export type { ProprietesAnneauProgression } from './AnneauProgression.js';

export { CarteSyntheseEntretien } from './CarteSyntheseEntretien.js';
export type { ProprietesCarteSyntheseEntretien } from './CarteSyntheseEntretien.js';

// --- Icônes (inventaire fermé — voir l'en-tête de `icones.tsx`) ---------------
export {
  IconeAlerte,
  IconeCoche,
  IconeCorbeilleVide,
  IconeCroix,
  IconeInfo,
  IconeNuage,
  IconeNuageBarre,
  IconeOeil,
  IconeOeilBarre,
  IconeRotor,
} from './icones.js';
export type { ProprietesIcone } from './icones.js';

// --- Outillage exposé --------------------------------------------------------
// `classes` et `decritPar` sont publiques parce que les écrans de L5 composeront
// leurs propres blocs avec les mêmes conventions ; `useSuperposition` l'est parce
// qu'un écran peut avoir besoin d'une surface modale que ce paquet ne fournit pas,
// et qu'il vaut mieux qu'il réutilise le piège à focus que d'en réécrire un.
export { classes, decritPar, borner } from './utilitaires.js';
export { useSuperposition } from './superposition.js';
export type { OptionsSuperposition } from './superposition.js';
