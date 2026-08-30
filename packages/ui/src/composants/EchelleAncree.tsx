// =============================================================================
// ÉCHELLE ANCRÉE — @axion/ui
// Traçabilité : E13 (écran 3 zones, enregistrement continu), E27 (design moderne,
// charte, WCAG AA), E44 (UX/UI 2026-2027, tokens, police locale).
//
// §33.3 : « ANCRES DE COTATION VISIBLES — sur toute échelle 1-5, les ancres
// (§32.4, dans guidance) s'affichent SOUS le curseur : la cotation homogène ne
// dépend pas de la mémoire du consultant. » C'est la raison d'être du composant,
// et c'est pourquoi `ancres` n'est pas optionnel : §32.4 fait des ancres un
// critère d'ADMISSION en banque (M1.1), donc toute question à échelle en a.
//
// ── POURQUOI DES BOUTONS RADIO ET NON UN `<input type="range">` ────────────────
// §33.5 dit « slider 1-5 ». Un curseur glissant est pourtant le pire contrôle
// possible ici, et sur les trois plans qui comptent : au doigt il faut viser puis
// glisser (deux gestes pour une cotation qu'on pose des centaines de fois par
// jour) ; il n'a pas d'état « pas encore répondu » distinct de « 1 » — il commence
// SOMEWHERE, donc il fabrique une réponse que personne n'a donnée ; et il ne peut
// pas afficher l'ancre de chaque cran, seulement celle de la valeur courante.
// Cinq boutons radio règlent les trois : un tap, `null` tant qu'on n'a pas coté,
// et les flèches ↑↓ du §33.3 offertes par le navigateur.
// Écart assumé, à porter dans DECISIONS.md.
//
// Les raccourcis 1-5 du §33.3 ne sont PAS ici : ils appartiennent à l'écran, qui
// seul sait quelle question a le focus. Le composant expose ce qu'il faut pour
// les afficher (`afficherRaccourcis`) et reste pilotable de l'extérieur.
// =============================================================================
import { useId, useState } from 'react';
import { classes } from './utilitaires.js';
import { IconeCoche } from './icones.js';

export interface AncreCotation {
  /** Le cran coté (1 à 5). */
  note: number;
  /** L'ancre §32.4 (« 3 = documenté mais non appliqué »). */
  texte: string;
}

export interface ProprietesEchelleAncree {
  /** L'intitulé de la question, en français. */
  libelle: string;
  /** `null` = pas encore coté. L'absence de réponse est une information. */
  valeur: number | null;
  onChangement: (note: number) => void;
  /** Ancres §32.4. Toutes les notes n'en ont pas forcément une. */
  ancres: readonly AncreCotation[];
  noteMin?: number;
  noteMax?: number;
  /** Nom du groupe radio. Défaut : engendré — à fixer si le DOM en porte plusieurs. */
  nom?: string;
  /** Affiche « 1 »…« 5 » comme rappels des raccourcis clavier (§33.3, PC). */
  afficherRaccourcis?: boolean;
  desactive?: boolean;
  className?: string;
}

export function EchelleAncree(proprietes: ProprietesEchelleAncree) {
  const {
    libelle,
    valeur,
    onChangement,
    ancres,
    noteMin = 1,
    noteMax = 5,
    nom,
    afficherRaccourcis = false,
    desactive = false,
    className,
  } = proprietes;

  const genere = useId();
  const nomGroupe = nom ?? `axn-echelle-${genere}`;
  const idAncre = `${genere}-ancre`;

  // Ce que l'auditeur SURVOLE prime sur ce qu'il a coté : il compare les ancres
  // avant de trancher, et c'est précisément le geste que §33.3 veut soutenir.
  const [survolee, setSurvolee] = useState<number | null>(null);
  const affichee = survolee ?? valeur;

  const notes = Array.from({ length: noteMax - noteMin + 1 }, (_, rang) => noteMin + rang);
  const texteAncre = ancres.find((ancre) => ancre.note === affichee)?.texte;

  return (
    <fieldset
      className={classes('axn-choix', className)}
      onMouseLeave={() => {
        setSurvolee(null);
      }}
    >
      <legend className="axn-choix__intitule">{libelle}</legend>

      <div className="axn-choix__pistes">
        {notes.map((note) => (
          <label
            key={note}
            className="axn-choix__option"
            onMouseEnter={() => {
              setSurvolee(note);
            }}
          >
            <input
              className="axn-visuellement-masque"
              type="radio"
              name={nomGroupe}
              value={note}
              checked={valeur === note}
              disabled={desactive}
              onChange={() => {
                onChangement(note);
              }}
              onFocus={() => {
                setSurvolee(note);
              }}
              onBlur={() => {
                setSurvolee(null);
              }}
            />
            <span className="axn-chiffres">{note}</span>
            {valeur === note ? (
              <IconeCoche className="axn-choix__marque" />
            ) : (
              afficherRaccourcis && <span className="axn-choix__raccourci">touche {note}</span>
            )}
          </label>
        ))}
      </div>

      {/* Hauteur réservée en CSS : l'ancre apparaît et disparaît sans faire sauter
          la question au-dessus d'elle. `aria-live` la lit au clavier, où le survol
          n'existe pas — c'est le focus qui déclenche l'affichage. */}
      <p id={idAncre} className="axn-choix__ancre" aria-live="polite">
        {texteAncre ?? (affichee === null ? 'Sélectionnez une note pour voir son ancre.' : '')}
      </p>

      {ancres.length > 0 && (
        <details className="axn-choix__toutes-ancres">
          <summary>Voir toutes les ancres de cotation</summary>
          <dl className="axn-choix__liste-ancres">
            {ancres.map((ancre) => (
              <div key={ancre.note} className="axn-choix__paire">
                <dt className="axn-chiffres">{ancre.note}</dt>
                <dd>{ancre.texte}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </fieldset>
  );
}
