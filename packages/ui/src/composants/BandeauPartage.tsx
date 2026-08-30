// =============================================================================
// BANDEAU « ÉCRAN PARTAGÉ » — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA), E44 (UX/UI 2026-2027, tokens, police locale).
//
// §33.3, MODE ÉCRAN PARTAGÉ (« nouveau — différenciant métier ») : « un toggle
// (icône œil, raccourci E) masque INSTANTANÉMENT tout ce qui est interne — notes,
// notes volantes, flags à-revoir, motifs non-communiqué, navigation privée — pour
// montrer l'écran à l'interviewé sans rien faire fuiter. ÉTAT VISIBLE EN
// PERMANENCE (bandeau fin “écran partagé”). »
//
// ── CE QUE CE COMPOSANT FAIT, ET CE QU'IL NE FAIT SURTOUT PAS ─────────────────
// Il AFFICHE l'état et offre le geste. Il ne masque RIEN lui-même, et c'est
// délibéré : le masquage doit se produire à la SOURCE, dans l'écran qui décide de
// ne pas rendre les notes. Un composant qui masquerait par du CSS (`display:none`,
// un filtre, un flou) laisserait le contenu interne DANS LE DOM — donc dans une
// capture d'écran, dans un « inspecter », dans un lecteur d'écran, et dans la
// mémoire de la page. Ce serait une fuite déguisée en fonctionnalité, sur le seul
// composant dont la raison d'être est d'empêcher une fuite.
//
// ── POURQUOI LE BANDEAU RESTE VISIBLE QUAND LE MODE EST INACTIF ───────────────
// Parce que l'erreur dangereuse n'est pas d'oublier d'activer le mode : c'est de
// CROIRE qu'il est actif quand il ne l'est pas. Un bandeau qui n'apparaît qu'en
// mode partagé laisse son absence ambiguë (le mode est-il coupé, ou le bandeau
// a-t-il disparu ?). Le bandeau affirme donc TOUJOURS l'état en toutes lettres.
// =============================================================================
import { classes } from './utilitaires.js';
import { IconeOeil, IconeOeilBarre } from './icones.js';

export interface ProprietesBandeauPartage {
  /** Vrai quand l'écran est montré à l'interviewé (contenu interne non rendu). */
  actif: boolean;
  onBasculer: (actif: boolean) => void;
  /** Affiche le rappel « touche E » (§33.3, poste PC). */
  afficherRaccourci?: boolean;
  className?: string;
}

export function BandeauPartage(proprietes: ProprietesBandeauPartage) {
  const { actif, onBasculer, afficherRaccourci = false, className } = proprietes;

  return (
    <div role="status" aria-live="polite" className={classes('axn-bandeau-partage', className)}>
      <span className="axn-bandeau-partage__etat">
        {actif ? <IconeOeil /> : <IconeOeilBarre />}
        <span>
          {actif
            ? 'Écran partagé — les éléments internes sont masqués'
            : 'Écran privé — les éléments internes sont visibles'}
        </span>
      </span>
      <button
        type="button"
        className="axn-bandeau-partage__bouton"
        aria-pressed={actif}
        onClick={() => {
          onBasculer(!actif);
        }}
      >
        {actif ? 'Revenir en écran privé' : 'Passer en écran partagé'}
        {afficherRaccourci && <span className="axn-bandeau-partage__raccourci">(touche E)</span>}
      </button>
    </div>
  );
}
