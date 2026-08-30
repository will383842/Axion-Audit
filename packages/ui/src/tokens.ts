// =============================================================================
// TOKENS DU DESIGN SYSTEM AXION — invariant 4 du 00_INDEX
// « Aucune couleur/taille en dur : tokens du design system UNIQUEMENT
//   (charte : terracotta #c24a1b action, ivoire #faf8f3 fond, bleu #1a4dd9 info,
//   mocha #2a2520 texte ; l'alerte est un rouge distinct). »
//
// CE FICHIER EST LE SEUL ENDROIT DU DÉPÔT où une couleur littérale est légitime :
// `scripts/check-invariants.mjs` l'exclut nommément, tout le reste est une infraction.
//
// Les valeurs marquées « CHARTE » viennent du pack et sont INTOUCHABLES.
// Les valeurs marquées « DÉRIVÉE » sont calculées ou choisies par l'implémentation ;
// celles qui ont fait l'objet d'un arbitrage portent leur référence DECISIONS.md.
// Traçabilité : E27 (design moderne, WCAG AA), E44 (UX/UI 2026-2027, tokens chiffrés).
// =============================================================================

/** Couleurs de marque — la charte Axion-IA, telle qu'énoncée par l'invariant 4. */
export const COULEURS_CHARTE = {
  /** CHARTE — couleur d'ACTION (boutons primaires, liens actifs, focus). */
  terracotta: '#c24a1b',
  /** CHARTE — FOND de l'application. */
  ivoire: '#faf8f3',
  /** CHARTE — INFORMATION (bandeaux neutres, aides, états informatifs). */
  bleu: '#1a4dd9',
  /** CHARTE — TEXTE. */
  mocha: '#2a2520',
  /**
   * DÉRIVÉE — ALERTE. Le pack impose « un rouge DISTINCT » sans en fixer la valeur.
   * Voir DECISIONS.md 2026-08-27 « Valeur du rouge d'alerte (#8c0a33) », qui expose
   * les trois candidats mesurés et la raison du rejet des deux autres.
   * Distinct du terracotta sur DEUX axes, mesurés par `tokens.test.ts` :
   *   · teinte 341° contre 16,9° → 35,8° d'écart angulaire ;
   *   · luminance → contraste mutuel 1,94.
   * Les deux comptent : la teinte seule ne suffit pas pour un protanope, la luminance
   * seule ne suffit pas pour distinguer deux rouges. Un carmin (341°) a été préféré au
   * rouge pur (357°), qui n'offrait que 19,8° d'écart — trop proche du terracotta.
   * Conformément au §33, le rouge n'est de toute façon JAMAIS le seul porteur de sens :
   * une alerte porte toujours une icône et un libellé.
   */
  alerte: '#8c0a33',
} as const;

/**
 * Tokens SÉMANTIQUES — c'est ce que le code applicatif consomme.
 * Un composant ne dit jamais « terracotta » : il dit « action ». Le jour où la charte
 * bouge, seul ce fichier change.
 */
export const TOKENS_COULEUR = {
  // --- Surfaces --------------------------------------------------------------
  'surface-fond': COULEURS_CHARTE.ivoire,
  'surface-carte': '#ffffff',
  'surface-enfoncee': '#f2eee5',
  'surface-inverse': COULEURS_CHARTE.mocha,

  // --- Texte -----------------------------------------------------------------
  'texte-principal': COULEURS_CHARTE.mocha,
  'texte-secondaire': '#5c534b',
  'texte-tertiaire': '#756b62',
  'texte-sur-action': '#ffffff',
  'texte-sur-inverse': COULEURS_CHARTE.ivoire,

  // --- Action (terracotta) ---------------------------------------------------
  'action-fond': COULEURS_CHARTE.terracotta,
  'action-fond-survol': '#a83e16',
  'action-fond-actif': '#8d3412',
  /**
   * DÉRIVÉE — teinte tendre de terracotta. Fond d'un choix RETENU (échelle 1-5,
   * segmenté Oui/Non/N-A) et piste d'un anneau de progression. Le terracotta plein
   * reste réservé à l'ACTION ; une réponse cochée n'est pas une action, c'est un
   * état — la remplir de terracotta poserait cinq « boutons principaux » sur un
   * même écran, contre la règle « une seule action principale par écran » (§19.2).
   * Le texte principal s'y lit très au-delà de AA (fond quasi ivoire).
   */
  'action-fond-doux': '#f7e9e2',
  'action-texte': COULEURS_CHARTE.terracotta,
  'action-bordure': COULEURS_CHARTE.terracotta,

  // --- Information (bleu) ----------------------------------------------------
  'info-fond': '#e8eefc',
  'info-bordure': COULEURS_CHARTE.bleu,
  'info-texte': '#12369b',

  // --- Alerte (rouge distinct) -----------------------------------------------
  'alerte-fond': '#fdeaf0',
  'alerte-bordure': COULEURS_CHARTE.alerte,
  'alerte-texte': '#6d0728',

  // --- Succès et avertissement (DÉRIVÉS — hors charte, requis par la règle des
  //     4 états §33.2 et le centre d'alertes §20.4) ----------------------------
  'succes-fond': '#e7f4ec',
  'succes-bordure': '#1e7a45',
  'succes-texte': '#155c33',
  'avertissement-fond': '#fdf3e2',
  'avertissement-bordure': '#a8650a',
  'avertissement-texte': '#7a4a07',

  // --- Structure -------------------------------------------------------------
  'bordure-discrete': '#e4ded2',
  'bordure-nette': '#c9c0b1',
  /** Anneau de focus : visible, jamais supprimé (accessibilité A28). */
  'focus-anneau': COULEURS_CHARTE.terracotta,
  /**
   * DÉRIVÉE — voile posé DERRIÈRE une boîte de dialogue ou un panneau. Mocha à
   * ~55 % d'opacité (notation hexadécimale à 8 chiffres) : le voile assombrit
   * sans virer au noir, et laisse deviner l'écran d'entretien qu'on n'a pas quitté.
   */
  'voile-superposition': '#2a25208c',
} as const;

export type TokenCouleur = keyof typeof TOKENS_COULEUR;

/**
 * Échelle d'espacement (base 4 px). Invariant 4 : « aucune TAILLE en dur » non plus.
 */
export const TOKENS_ESPACEMENT = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
  '12': '3rem',
  '16': '4rem',
} as const;

/**
 * Cibles tactiles — A27 : « tactile ≥ 44 px ». La PWA terrain se pilote au doigt,
 * debout dans un entrepôt : une cible sous 44 px est un défaut, pas un détail.
 */
export const TOKENS_TAILLE = {
  'cible-tactile-min': '44px',
  'controle-hauteur': '2.75rem',
  /**
   * Hauteur d'un contrôle à FRAPPER — le Oui/Non/N-A et les crans 1-5 d'une échelle,
   * qui se touchent debout, à une main, parfois avec des gants (§33.1/§33.3 :
   * « gros boutons tactiles »). 44 px est le PLANCHER légal d'A27, pas un confort ;
   * ces trois contrôles-là sont frappés des centaines de fois par entretien.
   */
  'controle-hauteur-large': '3.5rem',
  /** Épaisseur d'un filet. Une bordure est une décision de charte, donc un jeton. */
  'bordure-epaisseur': '1px',
  /** Filet PORTEUR DE SENS (choix retenu, erreur) : il doit se voir sans la couleur. */
  'bordure-epaisseur-forte': '2px',
  'rayon-petit': '0.25rem',
  /** §33.1 — 8 px : les CONTRÔLES (boutons, champs, segments). */
  'rayon-moyen': '0.5rem',
  /** §33.1 — 12 px : les CARTES. */
  'rayon-grand': '0.75rem',
  /** §33.1 — 16 px : les SURFACES et les panneaux (sheets). */
  'rayon-surface': '1rem',
  /** Diamètre d'un anneau de progression en ligne (carte de synthèse, liste). */
  'anneau-diametre-petit': '2.5rem',
  /** Diamètre d'un anneau de progression en vedette (écran « Aujourd'hui »). */
  'anneau-diametre-grand': '5rem',
  /**
   * Plans d'empilement. Sans jetons, chaque écran réinvente son `z-index` et le
   * voile finit un jour AU-DESSUS de sa propre boîte de dialogue. Trois plans
   * suffisent, et l'ordre est le seul contrat : bandeau < voile < superposition.
   */
  'plan-bandeau': '80',
  'plan-voile': '90',
  'plan-superposition': '100',
  /**
   * Largeur maximale d'une colonne de texte. ~65 caractères : au-delà, l'œil perd
   * la ligne en revenant à la marge. Vaut autant pour un écran d'entretien que
   * pour un état vide.
   */
  'largeur-contenu-etroit': '32rem',
  'largeur-contenu-large': '64rem',
  /** Anneau de focus — épaisseur et décalage. Jamais supprimé (accessibilité A28). */
  'focus-epaisseur': '3px',
  'focus-decalage': '2px',
} as const;

/**
 * Typographie — Inter variable, AUTO-HÉBERGÉE (@fontsource-variable/inter, 11 §1).
 * Jamais un CDN : la police doit se rendre en mode avion (critère de la porte P-C).
 */
export const TOKENS_TYPOGRAPHIE = {
  'police-corps': "'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif",
  'police-mono': "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  'taille-xs': '0.75rem',
  'taille-sm': '0.875rem',
  'taille-base': '1rem',
  'taille-lg': '1.125rem',
  'taille-xl': '1.375rem',
  'taille-2xl': '1.75rem',
  'taille-3xl': '2.25rem',
  'graisse-normale': '400',
  'graisse-moyenne': '500',
  'graisse-semi': '600',
  'graisse-grasse': '700',
  'interligne-serre': '1.25',
  'interligne-normal': '1.5',
  'interligne-large': '1.7',
} as const;

/**
 * Durées d'animation. §33 impose le respect de `prefers-reduced-motion` :
 * ces durées passent à 0 dans ce mode (voir tokens.css).
 */
export const TOKENS_MOUVEMENT = {
  'duree-instant': '0ms',
  'duree-rapide': '120ms',
  'duree-normale': '200ms',
  'courbe-standard': 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

/**
 * Ombres — §33.1 : « 2 niveaux MAX (sm, md), élévation discrète ».
 * Le plafond fait partie du jeton : une bibliothèque qui offre cinq élévations en
 * voit apparaître cinq à l'écran, et l'interface calme promise devient un relief.
 *   · `sm` — une carte posée sur l'ivoire (repos) ;
 *   · `md` — une surface qui FLOTTE au-dessus du reste (dialogue, panneau).
 * La couleur de l'ombre est le mocha translucide et non un noir : un noir pur sur
 * fond ivoire donne un gris sale, visible dès le premier écran d'entretien.
 */
export const TOKENS_OMBRE = {
  sm: '0 1px 2px #2a25201a, 0 1px 3px #2a252014',
  md: '0 2px 4px #2a25201a, 0 8px 24px #2a252024',
} as const;

/** Nom de la variable CSS correspondant à un token de couleur. */
export function varCouleur(token: TokenCouleur): string {
  return `var(--couleur-${token})`;
}
