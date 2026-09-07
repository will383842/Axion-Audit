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
//
// ── LES ANCRES SE LISENT AVANT LA COTATION, PAS APRÈS ─────────────────────────
// R1 de la recette du 2026-09-07, arbitrage A01 du même jour (DECISIONS.md,
// option b). Trois défauts tenaient ensemble : l'ancre n'apparaissait qu'au
// survol, au focus ou après cotation — or AU DOIGT il n'y a NI survol NI focus,
// donc l'auditeur cotait d'abord et comprenait ensuite, exactement l'inverse de
// ce que §33.3 demande (« la cotation homogène ne dépend pas de la mémoire du
// consultant ») ; les crans 2 et 4, facultatifs à l'import (`ANCRES_REQUISES =
// [1, 3, 5]`), rendaient une CHAÎNE VIDE dans un bloc à hauteur réservée, soit
// une ligne blanche ; et les cinq ancres dormaient derrière un `<details>` fermé
// alors que §33.5 est littéral : « slider 1-5 + ancres DÉPLIÉES ».
//
// D'où : le dépliant est ouvert par défaut (`ancresDepliees`), il liste les CINQ
// crans et non les seules ancres reçues, et la ligne d'ancre ne rend JAMAIS `''`.
// Les crans 2 et 4 sans ancre de banque reçoivent le libellé DÉRIVÉ de la
// doctrine 3 du §32.4 (amendement du 2026-09-02) — aucun texte inventé ici, et
// marqué « Ancre dérivée » PAR DES MOTS, jamais par une teinte seule (§33.6).
// La dérivation vit ICI, et non dans l'écran de saisie : le terrain, la console
// et /design doivent en avoir UNE seule implémentation. Elle est bornée à
// l'échelle 1-5, seule échelle dont le pack décrive les paliers.
//
// Et la ligne ne MENT pas davantage qu'elle ne blanchit : sans aucune ancre,
// elle le dit, au lieu d'inviter à en découvrir une (A01, second tour).
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

/**
 * Les crans que la banque n'est PAS tenue de documenter (`ANCRES_REQUISES =
 * [1, 3, 5]`, `@axion/shared`), et l'ancre contre laquelle ils se lisent : la
 * note 2 se juge contre l'ancre 3, la note 4 contre l'ancre 5.
 */
const ANCRE_VOISINE_DU_CRAN: ReadonlyMap<number, number> = new Map([
  [2, 3],
  [4, 5],
]);

/**
 * Libellés DÉRIVÉS des crans intermédiaires. Ce ne sont pas des ancres de
 * banque : c'est la doctrine 3 du §32.4 (amendement du 2026-09-02) rendue mot
 * pour mot. Volontairement NON exporté : le test doit redire cette phrase de
 * son côté, sinon il ne comparerait le composant qu'à lui-même.
 */
const LIBELLES_ANCRES_DERIVEES: Readonly<Record<number, string>> = {
  2: '2 — palier intermédiaire : au moins un élément de l’ancre 3 est établi, sans qu’elle soit atteinte (doctrine §32.4).',
  4: '4 — palier intermédiaire : au moins un élément de l’ancre 5 est établi, sans qu’elle soit atteinte (doctrine §32.4).',
};

/** Ce qu'on affiche pour un cran, et d'où ça vient (banque ou dérivation). */
interface LigneAncre {
  texte: string;
  /** Vrai quand le texte est dérivé de la doctrine, pas lu dans la banque. */
  derivee: boolean;
}

/**
 * Textes de repli. Ils NOMMENT la source du manque — « la banque ne fournit
 * pas » —, et ce choix de mots n'est pas cosmétique : « aucune ancre n'est
 * fournie » laisse l'auditeur se demander si son écran a échoué, quand la seule
 * chose à faire est de remonter une question incomplète à la banque (M1.1).
 * Trois copies et non une : « comparez avec les ancres voisines » n'a de sens
 * que sur la ligne de cotation, et « ci-dessous » n'aurait désigné rien du tout
 * pour un lecteur DÉJÀ dans le dépliant.
 */
const REPLI_SANS_AUCUNE_ANCRE = 'Aucune ancre de cotation n’est fournie pour cette question.';
const REPLI_DEPLIANT = 'La banque ne fournit pas d’ancre pour ce niveau.';
const repliDeLaLigne = (note: number): string =>
  `La banque ne fournit pas d’ancre pour la note ${String(note)} : comparez avec les ancres voisines.`;

/** L'invitation, tant qu'aucune note n'est posée ET qu'il y a bien des ancres. */
const INVITATION_A_COTER = 'Sélectionnez une note pour voir son ancre.';

/**
 * Ancre de banque du cran, sinon libellé dérivé si le cran est intermédiaire ET
 * que son ancre voisine existe, sinon `null` — au dernier cas, l'appelant décide
 * du texte de repli, mais il n'a JAMAIS le droit de ne rien dire.
 *
 * `derivationAutorisee` borne la dérivation à l'échelle 1-5 (A01, 2026-09-07).
 * Sur une échelle 0-10 ou 1-4, « au moins un élément de l'ancre 3 est établi »
 * énoncerait une règle de cotation que le pack n'a jamais écrite, et l'énoncerait
 * sous la forme même d'une ancre — donc invisible comme invention.
 */
function resoudreAncre(
  note: number,
  ancres: readonly AncreCotation[],
  derivationAutorisee: boolean,
): LigneAncre | null {
  const deBanque = ancres.find((ancre) => ancre.note === note)?.texte;
  if (deBanque !== undefined) return { texte: deBanque, derivee: false };
  if (!derivationAutorisee) return null;

  const voisine = ANCRE_VOISINE_DU_CRAN.get(note);
  const derive = LIBELLES_ANCRES_DERIVEES[note];
  if (voisine !== undefined && derive !== undefined && ancres.some((a) => a.note === voisine)) {
    return { texte: derive, derivee: true };
  }
  return null;
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
  /**
   * Ouvre le dépliant des cinq ancres. Défaut `true` : §33.5 demande des ancres
   * DÉPLIÉES, et l'auditeur qui veut de la place replie lui-même. Le repli n'est
   * volontairement PAS mémorisé d'une question à l'autre — il faudrait le
   * décider ailleurs qu'ici (fiche AMELIORATIONS), et un repli persistant
   * recréerait le défaut R1 dès la question suivante.
   */
  ancresDepliees?: boolean;
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
    ancresDepliees = true,
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

  // La doctrine 3 du §32.4 parle des notes 2 et 4 D'UNE ÉCHELLE 1-5. Hors de cet
  // intervalle, dériver reviendrait à inventer une règle de cotation — et à
  // l'afficher sous la forme d'une ancre, donc sans que rien ne la signale.
  const derivationAutorisee = noteMin === 1 && noteMax === 5;

  // Ordre imposé (arbitrage A01, second tour) : aucune ancre du tout → ancre de
  // banque → libellé dérivé → invitation tant que rien n'est coté → repli qui
  // nomme la source du manque. La ligne ne reste jamais vide, et ne promet
  // jamais une ancre qui n'existe pas.
  const ligneAncre = ((): LigneAncre => {
    // Sans AUCUNE ancre, « sélectionnez une note pour voir son ancre » invite à
    // découvrir ce qui n'existe pas : c'est le défaut R1 sous une autre forme.
    if (ancres.length === 0) return { texte: REPLI_SANS_AUCUNE_ANCRE, derivee: false };

    if (affichee !== null) {
      const resolue = resoudreAncre(affichee, ancres, derivationAutorisee);
      if (resolue !== null) return resolue;
    }
    if (valeur === null) return { texte: INVITATION_A_COTER, derivee: false };
    // `valeur` est posée, donc `affichee` aussi (`survolee ?? valeur`).
    return { texte: repliDeLaLigne(affichee ?? valeur), derivee: false };
  })();

  // Tous les crans de l'échelle, et non les seules ancres reçues : un cran absent
  // de la banque doit se voir comme un cran, pas disparaître de la liste.
  const lignesDepliant = notes.map((note) => ({
    note,
    ...(resoudreAncre(note, ancres, derivationAutorisee) ?? {
      texte: REPLI_DEPLIANT,
      derivee: false,
    }),
  }));

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

      {/* Hauteur réservée en CSS : la ligne change sans faire sauter la question
          au-dessus d'elle. `aria-live` la lit au clavier, où le survol n'existe
          pas — c'est le focus qui déclenche le changement. Elle n'est jamais
          vide : sans cela, le bloc réservé devient une ligne blanche.
          Le texte y est rendu SEUL, sans la marque « Ancre dérivée » : la ligne est
          annoncée par `aria-live` à chaque changement de cran, et la marque s'y
          répéterait à voix haute sans rien ajouter — le libellé dérivé se
          nomme lui-même (« palier intermédiaire… doctrine §32.4 »), et la
          provenance se lit dans le dépliant, où les cinq crans se comparent. */}
      <p id={idAncre} className="axn-choix__ancre" aria-live="polite">
        {ligneAncre.texte}
      </p>

      {/* Ouvert par défaut (§33.5, « ancres DÉPLIÉES »). `<details>` est conservé
          pour l'auditeur qui veut récupérer la place sur un petit écran : c'est
          le seul repli accessible que le navigateur donne gratuitement. */}
      {ancres.length > 0 && (
        <details className="axn-choix__toutes-ancres" open={ancresDepliees}>
          <summary>Toutes les ancres de cotation</summary>
          <dl className="axn-choix__liste-ancres">
            {lignesDepliant.map((ligne) => (
              <div key={ligne.note} className="axn-choix__paire">
                <dt className="axn-chiffres">{ligne.note}</dt>
                <dd>
                  {/* Un GROUPE NOMINAL, pas une teinte ni un participe seul :
                      §33.6 interdit l'information portée par la seule couleur,
                      et un lecteur d'écran qui parcourt la liste annonce cette
                      marque HORS de tout contexte visuel — « dérivé » y
                      flotterait, « ancre dérivée » se comprend. */}
                  {ligne.derivee && <span className="axn-choix__derivee">Ancre dérivée</span>}
                  <span>{ligne.texte}</span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </fieldset>
  );
}
