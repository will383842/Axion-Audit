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
}

export function RappelHorsLigne(proprietes: ProprietesRappelHorsLigne) {
  const {
    enLigne,
    capacites,
    enAttente,
    introduction = 'Sans réseau, cet appareil sait encore :',
    className,
    ...reste
  } = proprietes;

  if (enLigne) return null;

  return (
    <div className={classes('axn-rappel-hors-ligne', className)} {...reste}>
      <PastilleSync etat="hors-ligne" {...(enAttente === undefined ? {} : { enAttente })} />
      <p className="axn-rappel-hors-ligne__intro">{introduction}</p>
      <ul className="axn-rappel-hors-ligne__capacites">
        {capacites.map((capacite) => (
          <li key={capacite}>{capacite}</li>
        ))}
      </ul>
    </div>
  );
}
