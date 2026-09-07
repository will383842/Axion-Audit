// =============================================================================
// L'INVENTAIRE §33.5, EN TYPES — la liste de la spécification confrontée au paquet
//
// ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────────────────
// 03 §33.5 énumère 25 composants et se termine par sept mots : « Chacun : états
// complets (§19.2) + exemple sur /design ». La page existe désormais
// (`apps/hq/src/ecrans/design/`), et elle a besoin de DEUX choses qu'aucun
// commentaire ne sait tenir :
//   · la liste de ce que §33.5 demande, pour dire ce qui MANQUE et pourquoi ;
//   · la liste de ce que le paquet EXPORTE, pour qu'aucune galerie écrite à la
//     main ne puisse taire un composant.
//
// Les deux vivaient jusqu'ici en prose — l'en-tête de `composants/index.ts` et le
// README. De la prose ne rougit pas. Ce fichier les rend mécaniques.
//
// ── LE COMPTE DES COMPOSANTS N'EST PAS RECOPIÉ, IL EST DÉRIVÉ ───────────────
// `NomComposantUI` se lit sur les exports RÉELS de `composants/index.ts` : les
// exportations de valeur dont le nom commence par une majuscule, c'est-à-dire
// exactement la convention que React impose déjà aux composants. Un composant
// ajouté au paquet entre dans ce type SANS QUE PERSONNE NE L'Y METTE, et la
// galerie qui s'y confronte cesse de compiler tant qu'elle l'ignore.
//
// C'est la méthode de `apps/field/src/app/capacites-hors-ligne.ts`, une couche
// plus haut : là-bas le registre des vues était écrit, ici il est LU.
//
// ── CE QUE CE FICHIER NE PROMET PAS ────────────────────────────────────────
// Il ne dit pas qu'un composant livré est BON, ni que le motif d'une absence est
// juste. Il dit qu'une absence est DÉCLARÉE et qu'un ajout est JUSTIFIÉ. Le
// jugement reste à la revue croisée — un garde honnête sur sa portée vaut mieux
// qu'un garde qui rassure.
//
// Traçabilité : E27 (design moderne, charte, WCAG AA), E44 (UX/UI 2026-2027 —
// tokens, police locale).
// =============================================================================

/**
 * Le type du module d'exports — en position de TYPE uniquement.
 *
 * `consistent-type-imports` est désactivée sur la ligne suivante, et la raison
 * est que la règle demande ici ce que le code fait DÉJÀ, en plus strict :
 * `typeof import(…)` n'émet aucun `import` à l'exécution, jamais, sans dépendre
 * de l'élision du compilateur. Un `import * as composants` classique, lui, en
 * émettrait un vrai — et ce fichier de DONNÉES tirerait alors tout le JSX du
 * paquet dans chaque consommateur des jetons.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- voir ci-dessus
type ExportsDesComposants = typeof import('./composants/index.js');

/**
 * Le nom de chaque COMPOSANT exporté par `@axion/ui`.
 *
 * La discrimination est la majuscule initiale, et ce n'est pas une astuce : React
 * refuse de rendre `<bouton />` comme un composant. Les exportations utilitaires
 * (`classes`, `decritPar`, `borner`, `fourchetteIncoherente`, `useSuperposition`)
 * commencent par une minuscule et sortent d'elles-mêmes ; les exportations de
 * TYPE ne sont pas des propriétés de valeur et n'y entrent jamais.
 */
export type NomComposantUI = {
  [Clef in keyof ExportsDesComposants]: Clef extends Capitalize<Clef & string> ? Clef : never;
}[keyof ExportsDesComposants];

/** Les icônes, sous-ensemble reconnaissable à son préfixe. Inventaire fermé. */
export type NomIconeUI = Extract<NomComposantUI, `Icone${string}`>;

/** Ce que §33.5 demande, et ce que le paquet en a fait. */
export type StatutInventaire =
  /** Le composant existe : `composant` est un export RÉEL, le type le vérifie. */
  | { readonly etat: 'livre'; readonly composant: NomComposantUI }
  /**
   * Le composant N'EXISTE PAS, et c'est délibéré. `motif` dit pourquoi, `ou` dit
   * où il est attendu. Une absence sans motif ne compile pas, et c'est tout
   * l'intérêt : une galerie qui tait ses trous est une galerie qui ment.
   */
  | { readonly etat: 'absent'; readonly motif: string; readonly ou: string };

export interface EntreeInventaire {
  /** Les deux moitiés de la phrase de §33.5 : « base shadcn », puis « métier ». */
  readonly famille: 'base' | 'metier';
  readonly statut: StatutInventaire;
}

const CONSOLE_HORS_L5 =
  'Composant de la CONSOLE (§33.4, desktop-first, pas de console mobile en V1). ' +
  'Le construire pendant L5 en aurait fait du code orphelin — rattaché à aucun ' +
  'critère du lot ouvert, et refusé à ce titre par l’étape 6 du pipeline.';

const DATAVIZ_SCORING =
  'Dataviz de scoring (§19.2) : elle n’a de données à montrer qu’une fois le ' +
  'barème §32.1 calculé. Construire la figure avant le calcul reviendrait à ' +
  'la dessiner sur des nombres inventés.';

/**
 * L'énumération de 03 §33.5, dans SON ordre, avec SES noms.
 *
 * Les clés sont les noms cités par la spécification, y compris ceux d'origine
 * anglaise du socle shadcn : ce sont des CITATIONS, pas des libellés d'interface
 * — la page les rend dans un élément `lang="en"`, ce que l'invariant 5 permet et
 * que les lecteurs d'écran demandent. Les traduire ici rendrait la confrontation
 * avec le pack impossible à relire.
 */
export const INVENTAIRE_33_5 = {
  // --- « Base shadcn (…) » ---------------------------------------------------
  Button: { famille: 'base', statut: { etat: 'livre', composant: 'Bouton' } },
  Input: { famille: 'base', statut: { etat: 'livre', composant: 'ChampTexte' } },
  Select: { famille: 'base', statut: { etat: 'livre', composant: 'Selection' } },
  Checkbox: { famille: 'base', statut: { etat: 'livre', composant: 'CaseACocher' } },
  Toggle: { famille: 'base', statut: { etat: 'livre', composant: 'Bascule' } },
  Tabs: {
    famille: 'base',
    statut: { etat: 'absent', motif: CONSOLE_HORS_L5, ou: 'Console — L7 et Phase 2' },
  },
  Sheet: { famille: 'base', statut: { etat: 'livre', composant: 'Panneau' } },
  Dialog: { famille: 'base', statut: { etat: 'livre', composant: 'Dialogue' } },
  Toast: {
    famille: 'base',
    statut: {
      etat: 'absent',
      motif:
        'Une notification FUGITIVE est le mauvais support pour de la collecte : ce ' +
        'qui disparaît tout seul n’est pas lu par un auditeur qui écoute son ' +
        'interlocuteur. Le paquet livre `Message`, qui reste à l’écran, et ' +
        '`IndicateurEnregistrement` pour le micro-retour de §33.3.',
      ou: 'Non prévu en V1 — écart tracé au README du paquet',
    },
  },
  Tooltip: {
    famille: 'base',
    statut: {
      etat: 'absent',
      motif:
        'Une infobulle au survol n’existe pas au doigt, et §33.5 vise d’abord le ' +
        'terrain tactile. L’aide PERMANENTE sous le champ (propriété `aide` de ' +
        '`ChampTexte`) la remplace partout où elle était prévue.',
      ou: 'Console — dataviz §19.2 (« avec infobulles »), L8',
    },
  },
  Badge: { famille: 'base', statut: { etat: 'livre', composant: 'Badge' } },
  Table: {
    famille: 'base',
    statut: {
      etat: 'absent',
      motif:
        'Refus délibéré côté terrain : §33.3 (V2.10) impose « jamais de grille ' +
        'type tableur au doigt », et le rendu V1 d’un type `table` est une LISTE ' +
        'de lignes. Côté console, les tableaux denses sont posés par la coquille.',
      ou: 'Console — `apps/hq/src/app/coquille.css`, L7a',
    },
  },
  Skeleton: { famille: 'base', statut: { etat: 'livre', composant: 'Squelette' } },

  // --- « + composants MÉTIER à construire » ---------------------------------
  ÉchelleAncrée: { famille: 'metier', statut: { etat: 'livre', composant: 'EchelleAncree' } },
  SegmenteONA: { famille: 'metier', statut: { etat: 'livre', composant: 'SegmenteONA' } },
  SaisieFourchette: { famille: 'metier', statut: { etat: 'livre', composant: 'SaisieFourchette' } },
  PastilleSync: { famille: 'metier', statut: { etat: 'livre', composant: 'PastilleSync' } },
  BandeauPartage: { famille: 'metier', statut: { etat: 'livre', composant: 'BandeauPartage' } },
  AnneauProgression: {
    famille: 'metier',
    statut: { etat: 'livre', composant: 'AnneauProgression' },
  },
  TimelinePilote: {
    famille: 'metier',
    statut: { etat: 'absent', motif: CONSOLE_HORS_L5, ou: 'Console — pilotage de mission, L7' },
  },
  CarteSynthèseEntretien: {
    famille: 'metier',
    statut: { etat: 'livre', composant: 'CarteSyntheseEntretien' },
  },
  Radar: {
    famille: 'metier',
    statut: { etat: 'absent', motif: DATAVIZ_SCORING, ou: 'Console — scoring, L8' },
  },
  Heatmap: {
    famille: 'metier',
    statut: { etat: 'absent', motif: DATAVIZ_SCORING, ou: 'Console — scoring, L8' },
  },
  CourbePrévuRéel: {
    famille: 'metier',
    statut: { etat: 'absent', motif: DATAVIZ_SCORING, ou: 'Console — scoring, L8' },
  },
  ÉtatVide: { famille: 'metier', statut: { etat: 'livre', composant: 'EtatVide' } },
} as const satisfies Record<string, EntreeInventaire>;

/** Un nom tel que 03 §33.5 l'écrit. */
export type NomSpec33_5 = keyof typeof INVENTAIRE_33_5;

/** Une absence DÉCLARÉE : la forme que la page rend dans son tableau des trous. */
export interface AbsenceDeclaree {
  readonly nom: NomSpec33_5;
  readonly famille: 'base' | 'metier';
  readonly motif: string;
  readonly ou: string;
}

/** Les noms de §33.5, dans l'ordre de la spécification (celui de l'objet ci-dessus). */
export const NOMS_33_5 = Object.keys(INVENTAIRE_33_5) as readonly NomSpec33_5[];

/** Les composants que §33.5 nomme et que le paquet NE livre PAS, avec leur motif. */
export function absencesDe33_5(): readonly AbsenceDeclaree[] {
  const absences: AbsenceDeclaree[] = [];
  for (const nom of NOMS_33_5) {
    const { famille, statut } = INVENTAIRE_33_5[nom];
    if (statut.etat === 'absent') {
      absences.push({ nom, famille, motif: statut.motif, ou: statut.ou });
    }
  }
  return absences;
}

/**
 * Le nom §33.5 d'un composant livré, ou `null` s'il n'est nommé nulle part dans
 * l'énumération. Le second cas n'est pas une faute : `ZoneEtat`, `EtatErreur`,
 * `RappelHorsLigne` et `IndicateurEnregistrement` naissent de §33.2 et §33.3, que
 * §33.5 ne réénumère pas. La galerie exige alors une justification écrite.
 */
export function nomSpecDe(composant: NomComposantUI): NomSpec33_5 | null {
  for (const nom of NOMS_33_5) {
    const { statut } = INVENTAIRE_33_5[nom];
    if (statut.etat === 'livre' && statut.composant === composant) return nom;
  }
  return null;
}
