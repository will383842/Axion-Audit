// =============================================================================
// RAPPEL HORS LIGNE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027,
// tokens, police locale), E6 (hors ligne total, PC ET tablette).
//
// ── CE QUE §33.2 DEMANDE, ET CE QUI MANQUAIT ─────────────────────────────────
// §33.2 : l'état hors ligne est « pastille discrète + RAPPEL DES CAPACITÉS
// LOCALES ». Le contrôle A02 de P-C mesure que la moitié droite de cette phrase
// n'est nulle part : quatre vues sur onze n'ont, hors ligne, que la pastille de
// la coquille. L'auditeur voit qu'il n'a pas de réseau ; rien ne lui dit que ça
// ne l'empêche de rien.
//
// ── POURQUOI CE COMPOSANT PLUTÔT QU'UN QUATRIÈME COPIER-COLLER ───────────────
// Le motif existe DÉJÀ trois fois dans l'app terrain, écrit trois fois
// différemment : `<ZoneEtat nature="hors-ligne">` avec un `<span />` d'enfant
// bidon (deux écrans, parce que `ZoneEtat` ignore ses enfants sur cette nature),
// et un `<Message ton="info">` avec une liste montée à la main (un écran). Trois
// rendus pour une seule règle, c'est une règle qui a déjà commencé à diverger.
//
// ── TROIS CHOSES QUE CE COMPOSANT IMPOSE PAR SON TYPE, PAS PAR UNE CONSIGNE ──
//   1. `enLigne` est une PROPRIÉTÉ, et le composant ne rend RIEN quand il vaut
//      `true`. La condition `{!enLigne && …}` cessait d'être écrite un écran sur
//      deux ; elle est ici dans le composant, donc impossible à oublier.
//   2. `capacites` est un tableau NON VIDE au sens du compilateur
//      (`[string, ...string[]]`). `EtatHorsLigne` l'exigeait « par contrat » dans
//      un commentaire — c'est-à-dire nulle part. Un écran qui n'énumère rien ne
//      compile pas.
//   3. Le composant ne lit NI `navigator.onLine`, NI le réseau, NI la base : la
//      règle du paquet (« pilotés de bout en bout par leurs propriétés ») tient,
//      et il se teste sans monter d'application.
//
// ── ACCESSIBILITÉ : UNE SEULE RÉGION VIVANTE, PAS DEUX ───────────────────────
// L'enveloppe n'a délibérément PAS de `role="status"` : `PastilleSync` en porte
// déjà un, et deux régions vivantes imbriquées font répéter — ou avaler — le
// message par le lecteur d'écran. La pastille annonce le changement d'état ; la
// liste est du texte statique, lu dans l'ordre du document.
//
// ── `avecPastille` : LA MÊME RAISON, D'UN CRAN PLUS HAUT (A21, 2026-09-06) ───
// Ce composant porte les DEUX moitiés de §33.2 pour l'application qui n'a rien
// d'autre. Mais §33.2 exige ces deux moitiés SUR L'ÉCRAN, pas dans un même
// composant — et une application peut déjà poser sa pastille ailleurs. C'est le
// cas de la PWA terrain : décision A01 du 2026-09-05, « l'état de synchronisation
// est visible sur TOUS les écrans », une pastille unique dans l'en-tête de la
// coquille, alimentée par le PORT DE SYNC.
//
// Rendre alors celle-ci en dessous ferait DEUX pastilles sur le même écran,
// nourries par deux sources différentes (le port d'un côté, `navigator.onLine`
// de l'autre) — c'est mot pour mot le bloquant B6 de la recette novice du
// 2026-09-06, fermé au prix d'un module de traduction unique
// (`app/etat-sync-affiche.ts`). Le drapeau existe pour ne pas le rouvrir.
//
// Il vaut `true` PAR DÉFAUT : un écran qui ne dit rien obtient les deux moitiés,
// et c'est le silence qui doit être sûr. Le mettre à `false` est une déclaration
// (« ma pastille est ailleurs »), pas une commodité.
// =============================================================================
import type { ComponentPropsWithoutRef } from 'react';
import { classes } from './utilitaires.js';
import { PastilleSync } from './PastilleSync.js';

/** Un tableau dont le compilateur sait qu'il a au moins un élément. */
export type ListeNonVide<T> = readonly [T, ...(readonly T[])];

export interface ProprietesRappelHorsLigne extends ComponentPropsWithoutRef<'div'> {
  /** Réseau présent ? Si oui, ce composant ne rend RIEN. */
  enLigne: boolean;
  /** Ce qui reste possible SANS réseau, en français, une capacité par entrée. */
  capacites: ListeNonVide<string>;
  /** Éléments locaux en attente de remontée. Rassure sans inquiéter (§19.2). */
  enAttente?: number;
  /** Phrase d'introduction de la liste. Toujours en français (invariant 5). */
  introduction?: string;
  /**
   * Ce composant rend-il lui-même la pastille de §19.2 ?
   *
   * `true` par défaut. Le passer à `false` déclare que l'écran porte SA pastille
   * ailleurs — typiquement dans un en-tête commun. En rendre une seconde ici
   * ferait deux pastilles nourries par deux sources sur le même écran (B6).
   */
  avecPastille?: boolean;
}

export function RappelHorsLigne(proprietes: ProprietesRappelHorsLigne) {
  const {
    enLigne,
    capacites,
    enAttente,
    introduction = 'Sans réseau, cet appareil sait encore :',
    avecPastille = true,
    className,
    ...reste
  } = proprietes;

  if (enLigne) return null;

  return (
    <div className={classes('axn-rappel-hors-ligne', className)} {...reste}>
      {avecPastille && (
        <PastilleSync etat="hors-ligne" {...(enAttente === undefined ? {} : { enAttente })} />
      )}
      <p className="axn-rappel-hors-ligne__intro">{introduction}</p>
      <ul className="axn-rappel-hors-ligne__capacites">
        {capacites.map((capacite) => (
          <li key={capacite}>{capacite}</li>
        ))}
      </ul>
    </div>
  );
}
