// =============================================================================
// SAISIE EN FOURCHETTE — @axion/ui
// Traçabilité : E27 (design moderne, charte, WCAG AA).
//
// §27.4 : quand un chiffre exact est REFUSÉ (CA, marges, salaires), l'auditeur
// propose « une FOURCHETTE plutôt qu'un chiffre exact — souvent accepté quand
// l'exact est refusé ». §32.4 en fait la forme normale des estimations
// (`gain_low` / `gain_high`). Le mode fourchette est nommé au brief du lot L5.
//
// DEUX CHAMPS, JAMAIS UN. « Entre 200 et 300 k€ » est une donnée qu'on peut
// agréger et dont on peut dire l'incertitude ; « environ 250 » est une invention
// dont personne ne saura, six mois plus tard, si elle valait ± 10 ou ± 100.
//
// Les valeurs restent des CHAÎNES, pas des nombres. L'auditeur saisit « 1 200 »,
// « 1,5 » ou « 1.5 » selon son clavier et son réflexe ; convertir ici obligerait
// ce composant à connaître le format de saisie français, à décider ce qu'est un
// séparateur de milliers, et à jeter silencieusement ce qu'il ne comprend pas —
// c'est-à-dire à perdre de la donnée d'entretien. La conversion appartient au
// schéma Zod de `packages/shared`, un seul endroit, testé.
// =============================================================================
import { useId } from 'react';
import { ChampTexte } from './ChampTexte.js';
import { classes } from './utilitaires.js';
import { IconeAlerte } from './icones.js';

export interface ProprietesSaisieFourchette {
  libelle: string;
  bas: string;
  haut: string;
  onChangement: (bornes: { bas: string; haut: string }) => void;
  /** Unité affichée à droite des deux champs (« k€ », « %», « ETP »). */
  unite?: string;
  aide?: string;
  /** Erreur venue de l'extérieur (validation Zod). S'ajoute au contrôle local. */
  erreur?: string;
  desactive?: boolean;
  className?: string;
}

/**
 * Vrai quand les deux bornes sont lisibles comme des nombres ET dans le désordre.
 * Exportée : c'est la seule règle métier du composant, et un test doit pouvoir
 * la viser sans monter le DOM (« pas de logique cachée »).
 */
export function fourchetteIncoherente(bas: string, haut: string): boolean {
  const nombreBas = Number(bas.replace(',', '.').replace(/\s/g, ''));
  const nombreHaut = Number(haut.replace(',', '.').replace(/\s/g, ''));
  if (bas.trim() === '' || haut.trim() === '') return false;
  if (Number.isNaN(nombreBas) || Number.isNaN(nombreHaut)) return false;
  return nombreBas > nombreHaut;
}

export function SaisieFourchette(proprietes: ProprietesSaisieFourchette) {
  const { libelle, bas, haut, onChangement, unite, aide, erreur, desactive, className } =
    proprietes;

  const genere = useId();
  const idErreur = `axn-fourchette-${genere}-erreur`;

  const incoherente = fourchetteIncoherente(bas, haut);
  const messageErreur =
    erreur ?? (incoherente ? 'La borne basse doit être inférieure à la borne haute.' : undefined);

  return (
    <fieldset className={classes('axn-choix', className)}>
      <legend className="axn-choix__intitule">{libelle}</legend>

      <div className="axn-fourchette__bornes">
        <ChampTexte
          className="axn-fourchette__borne"
          libelle="Borne basse"
          nature="nombre"
          value={bas}
          disabled={desactive ?? false}
          aria-invalid={messageErreur !== undefined}
          {...(messageErreur === undefined ? {} : { 'aria-describedby': idErreur })}
          onChange={(evenement) => {
            onChangement({ bas: evenement.target.value, haut });
          }}
        />
        <span className="axn-fourchette__jointure" aria-hidden="true">
          à
        </span>
        <ChampTexte
          className="axn-fourchette__borne"
          libelle="Borne haute"
          nature="nombre"
          value={haut}
          disabled={desactive ?? false}
          aria-invalid={messageErreur !== undefined}
          {...(messageErreur === undefined ? {} : { 'aria-describedby': idErreur })}
          onChange={(evenement) => {
            onChangement({ bas, haut: evenement.target.value });
          }}
        />
        {unite !== undefined && <span className="axn-fourchette__unite">{unite}</span>}
      </div>

      {aide !== undefined && <p className="axn-champ__aide">{aide}</p>}

      {messageErreur !== undefined && (
        <p id={idErreur} className="axn-champ__erreur">
          <IconeAlerte />
          <span>{messageErreur}</span>
        </p>
      )}
    </fieldset>
  );
}
