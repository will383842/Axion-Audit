// =============================================================================
// ZONE D'ÉTAT — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027,
// tokens, police locale).
//
// ── POURQUOI CE COMPOSANT EXISTE, ALORS QU'IL N'EST PAS DANS L'INVENTAIRE §33.5 ──
// §33.2 impose que « CHAQUE écran et CHAQUE liste livre ses QUATRE états », et en
// fait un critère de revue croisée (A29), de recette (A54) et de la DoD transverse
// (« tout écran livré avec ses 4 états »). L'inventaire §33.5 ne nomme pourtant
// que `ÉtatVide` : les trois autres états y sont une CONSIGNE, c'est-à-dire une
// chose qu'on oublie écran par écran et qu'on découvre à la porte P-C.
//
// `ZoneEtat` transforme la consigne en TYPE. L'union discriminée ci-dessous rend
// l'écran qui n'a pas décidé de ses états INCOMPILABLE — on ne peut pas passer
// `etat` sans choisir laquelle des cinq natures on rend, ni rendre `erreur` sans
// fournir sa cause ET son action. C'est le seul moyen que la règle survive à
// quarante écrans écrits en huit jours par plusieurs mains.
//
// Ce n'est PAS un ajout de périmètre : aucun état nouveau n'est inventé, les cinq
// natures sont exactement celles de §33.2 (les quatre états + le nominal), et le
// rendu délègue aux composants de l'inventaire.
// =============================================================================
import type { ReactNode } from 'react';
import { EtatErreur } from './EtatErreur.js';
import { EtatHorsLigne } from './EtatHorsLigne.js';
import { EtatVide } from './EtatVide.js';
import { Squelette, type FormeSquelette } from './Squelette.js';

export type EtatZone =
  /** Les données sont là : `children` est rendu tel quel. */
  | { nature: 'nominal' }
  /** §33.2 — squelettes aux dimensions finales, jamais de spinner plein écran. */
  | { nature: 'chargement'; libelle?: string; forme?: FormeSquelette; lignes?: number }
  /** §17.6 — dit QUOI FAIRE, pas seulement qu'il n'y a rien. */
  | { nature: 'vide'; titre: string; description: string; actions?: ReactNode }
  /** §33.2 — cause + action en français, code technique replié. */
  | {
      nature: 'erreur';
      titre?: string;
      cause: string;
      action: string;
      details?: string;
      actions?: ReactNode;
    }
  /** §33.2 — pastille discrète + rappel des capacités locales. Mode NOMINAL (inv. 1). */
  | {
      nature: 'hors-ligne';
      titre?: string;
      capacites: readonly string[];
      enAttente?: number;
      actions?: ReactNode;
    };

export interface ProprietesZoneEtat {
  etat: EtatZone;
  /** Le contenu réel de l'écran ou de la liste — rendu quand `nature` est nominal. */
  children: ReactNode;
}

export function ZoneEtat({ etat, children }: ProprietesZoneEtat) {
  switch (etat.nature) {
    case 'nominal':
      return <>{children}</>;

    case 'chargement':
      return (
        <Squelette
          {...(etat.libelle === undefined ? {} : { libelle: etat.libelle })}
          {...(etat.forme === undefined ? {} : { forme: etat.forme })}
          {...(etat.lignes === undefined ? {} : { lignes: etat.lignes })}
        />
      );

    case 'vide':
      return (
        <EtatVide
          titre={etat.titre}
          description={etat.description}
          {...(etat.actions === undefined ? {} : { actions: etat.actions })}
        />
      );

    case 'erreur':
      return (
        <EtatErreur
          cause={etat.cause}
          action={etat.action}
          {...(etat.titre === undefined ? {} : { titre: etat.titre })}
          {...(etat.details === undefined ? {} : { details: etat.details })}
          {...(etat.actions === undefined ? {} : { actions: etat.actions })}
        />
      );

    case 'hors-ligne':
      return (
        <EtatHorsLigne
          capacites={etat.capacites}
          {...(etat.titre === undefined ? {} : { titre: etat.titre })}
          {...(etat.enAttente === undefined ? {} : { enAttente: etat.enAttente })}
          {...(etat.actions === undefined ? {} : { actions: etat.actions })}
        />
      );
  }
}
