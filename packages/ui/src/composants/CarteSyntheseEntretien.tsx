// =============================================================================
// CARTE DE SYNTHÈSE D'ENTRETIEN — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA).
//
// §33.3, FIN D'ENTRETIEN : « l'écran de validation (§19.1) présente la synthèse en
// UNE CARTE LISIBLE : répondu / à revoir / N/A / notes / pièces — puis les
// contrôles bloquants. » Les cinq mesures sont donc REQUISES par le type : une
// synthèse à laquelle il manque « à revoir » est exactement celle qui laisse un
// à-revoir non levé filer vers la validation d'unité (§19.1).
//
// `nonCommunique` s'y ajoute (§27.4) parce que « non communiqué » est distinct de
// « N/A » et distinct de « à revoir », et qu'il conditionne l'indice de complétude
// d'un bloc. Il est optionnel : toutes les missions n'en rencontrent pas.
//
// La carte NE VALIDE RIEN. §19.1 V2.10 sépare « Terminer » (geste à chaud) de
// « Valider » (geste qualité, verrouillant) : ces deux boutons arrivent par
// `actions`, avec les contrôles bloquants que l'écran, lui, sait évaluer.
// =============================================================================
import type { ReactNode } from 'react';
import { AnneauProgression } from './AnneauProgression.js';
import { classes } from './utilitaires.js';

export interface ProprietesCarteSyntheseEntretien {
  /** Intitulé de la session (« Responsable logistique — site de Lyon »). */
  titre: string;
  /** Précision d'une ligne : unité, type de session, mode. Facultative. */
  sousTitre?: string;
  /** Questions répondues, toutes natures de réponse confondues. */
  repondu: number;
  /** Questions du parcours de cet entretien. Sert de dénominateur à l'anneau. */
  total: number;
  aRevoir: number;
  na: number;
  notes: number;
  pieces: number;
  /** §27.4 — refus de communiquer, sorti du calcul de score, jamais une pénalité. */
  nonCommunique?: number;
  /** Durée DÉJÀ formatée (« 47 min ») : le format d'affichage n'est pas d'ici. */
  duree?: string;
  /** « Terminer l'entretien », « Valider l'entretien » (§19.1 V2.10). */
  actions?: ReactNode;
  className?: string;
}

export function CarteSyntheseEntretien(proprietes: ProprietesCarteSyntheseEntretien) {
  const {
    titre,
    sousTitre,
    repondu,
    total,
    aRevoir,
    na,
    notes,
    pieces,
    nonCommunique,
    duree,
    actions,
    className,
  } = proprietes;

  const pourcentage = total > 0 ? (repondu / total) * 100 : 0;

  const mesures: readonly { libelle: string; valeur: number }[] = [
    { libelle: 'Répondu', valeur: repondu },
    { libelle: 'À revoir', valeur: aRevoir },
    { libelle: 'Sans objet', valeur: na },
    ...(nonCommunique === undefined ? [] : [{ libelle: 'Non communiqué', valeur: nonCommunique }]),
    { libelle: 'Notes', valeur: notes },
    { libelle: 'Pièces jointes', valeur: pieces },
  ];

  return (
    <section className={classes('axn-carte', className)} aria-label={`Synthèse — ${titre}`}>
      <div className="axn-carte__tete">
        <AnneauProgression
          valeur={pourcentage}
          libelle="Répondu"
          taille="grand"
          libelleAccessible={`${String(repondu)} question${repondu > 1 ? 's' : ''} répondue${repondu > 1 ? 's' : ''} sur ${String(total)}`}
        />
        <div>
          <h2 className="axn-carte__titre">{titre}</h2>
          {sousTitre !== undefined && <p className="axn-carte__sous-titre">{sousTitre}</p>}
          {duree !== undefined && <p className="axn-carte__sous-titre">Durée : {duree}</p>}
        </div>
      </div>

      <dl className="axn-carte__mesures">
        {mesures.map((mesure) => (
          <div key={mesure.libelle} className="axn-carte__mesure">
            <dt className="axn-carte__mesure-libelle">{mesure.libelle}</dt>
            <dd className="axn-carte__mesure-valeur axn-chiffres">{mesure.valeur}</dd>
          </div>
        ))}
      </dl>

      {actions !== undefined && <div className="axn-carte__actions">{actions}</div>}
    </section>
  );
}
