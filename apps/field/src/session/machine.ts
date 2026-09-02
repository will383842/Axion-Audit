// =============================================================================
// MACHINE À ÉTATS D'UNE SESSION DE COLLECTE — 03 §19.1 (règle V2.10)
//
// ── LA RÈGLE QUE CETTE TABLE EXISTE POUR RENDRE INCONTOURNABLE ───────────────
// 03 §19.1, V2.10 : « **TERMINER ≠ VALIDER** (deux gestes, deux moments — jamais
// fusionnés) ». « Terminer » est le geste À CHAUD de fin de rencontre ; l'entretien
// reste **ROUVRABLE LIBREMENT par son auteur** tant qu'il n'est pas validé — « la
// note de couloir dix minutes après a sa place, sans révision ni paperasse ».
// « Valider » est le geste QUALITÉ qui VERROUILLE : après lui, toute modification
// est une révision tracée (invariant 7).
//
// Les fusionner serait la simplification la plus tentante de tout le lot L5, et
// elle coûterait exactement ce que la V2.10 est venue corriger : soit l'auditeur
// verrouille trop tôt et perd la note de couloir, soit il ne verrouille jamais.
//
// ── LA MACHINE EST UNE DONNÉE, PAS UNE SUITE DE `if` ────────────────────────
// Même parti que `packages/shared/src/missions.ts` pour la mission : la table est
// lisible, testable exhaustivement (4 états × toutes les actions × 2 profils —
// `LOT_L5.md` §4) et se compare LIGNE À LIGNE au pack. Une transition interdite
// est refusée AVEC UN MOTIF en français, jamais par un booléen muet.
//
// ── L'ÉCART ASSUMÉ AVEC LE 04, ET COMMENT IL EST TENU ───────────────────────
// `interviews.status` (04) ne connaît que TROIS valeurs : `non_demarre`,
// `en_cours`, `termine`. Le quatrième état de cette machine, `valide`, n'a pas de
// colonne : la validation d'étape vit dans `step_validations` (04, 03 §19.1).
// Localement, `valide` = `status='termine'` ET `valideeLe` non nul dans la charge
// (`formes.ts`). `etatSession` / `versStatutPersiste` portent cette conversion à
// UN seul endroit. Le point est remonté dans le rapport d'auto-revue A24 : le pack
// ne dit pas comment une VALIDATION D'ENTRETIEN se synchronise.
//
// ── CE QUE CETTE MACHINE NE FAIT PAS ────────────────────────────────────────
// Elle ne bloque JAMAIS la saisie. 03 §19.1, dernier point : « Aucun verrou ne
// peut jamais bloquer la SAISIE de données […] les verrous portent sur la
// PROGRESSION d'étapes, pas sur la collecte. » Les transitions ci-dessous
// concernent le cycle de vie de la session, jamais l'écriture d'une réponse.
//
// Traçabilité : E24 (validation obligatoire de chaque étape), E12 (entretiens par
// interlocuteur, à-revoir).
// =============================================================================
import type { StatutSessionPersiste } from '../local/formes.js';

/** Les quatre états du terrain. `valide` n'existe pas dans le 04 — voir l'en-tête. */
export type EtatSession = 'non_demarre' | 'en_cours' | 'termine' | 'valide';

/**
 * Les gestes de l'auditeur.
 *
 * `rouvrir` est la V2.10 elle-même : il ramène `termine` vers `en_cours` SANS
 * révision ni motif. `deverrouiller` est son équivalent APRÈS validation, et lui
 * exige un motif — c'est le point exact où la traçabilité commence.
 */
export type ActionSession = 'demarrer' | 'terminer' | 'rouvrir' | 'valider' | 'deverrouiller';

/** 03 §19.1 : deux profils d'usage par utilisateur, réglés par l'admin. */
export type ProfilAuditeur = 'guide_strict' | 'expert';

export interface TransitionSession {
  readonly depuis: EtatSession;
  readonly action: ActionSession;
  readonly vers: EtatSession;
  /** Les profils autorisés. `guide_strict` n'a « aucune dérogation » (03 §19.1). */
  readonly profils: readonly ProfilAuditeur[];
  /** Un motif est-il OBLIGATOIRE ? (journalisé — 03 §19.1). */
  readonly motifRequis: boolean;
}

/**
 * La table, transcrite du 03 §19.1.
 *
 * Note sur `deverrouiller` : le pack donne ce pouvoir à l'ADMIN (« déverrouillage
 * admin […] avec motif ») et, en profil `expert`, fait des verrous « des garde-fous
 * contournables avec motif obligatoire, journalisé ». Le déverrouillage par un
 * ADMIN passe par la console (côté siège) et n'est donc pas dans cette table
 * terrain : ici, seul l'`expert` peut rouvrir un entretien validé, et jamais sans
 * motif.
 */
export const TRANSITIONS_SESSION: readonly TransitionSession[] = [
  {
    depuis: 'non_demarre',
    action: 'demarrer',
    vers: 'en_cours',
    profils: ['guide_strict', 'expert'],
    motifRequis: false,
  },
  {
    depuis: 'en_cours',
    action: 'terminer',
    vers: 'termine',
    profils: ['guide_strict', 'expert'],
    motifRequis: false,
  },
  {
    // V2.10 : « rouvrable LIBREMENT par son auteur tant qu'il n'est pas validé ».
    // Aucun motif, aucun profil particulier — c'est le cœur de la règle.
    depuis: 'termine',
    action: 'rouvrir',
    vers: 'en_cours',
    profils: ['guide_strict', 'expert'],
    motifRequis: false,
  },
  {
    depuis: 'termine',
    action: 'valider',
    vers: 'valide',
    profils: ['guide_strict', 'expert'],
    motifRequis: false,
  },
  {
    depuis: 'valide',
    action: 'deverrouiller',
    vers: 'en_cours',
    profils: ['expert'],
    motifRequis: true,
  },
];

export type Autorisation =
  | { readonly autorise: true; readonly vers: EtatSession; readonly motifRequis: boolean }
  | { readonly autorise: false; readonly motif: string };

/** Libellés français des états — jamais de jargon technique à l'écran (03 §17.4). */
const LIBELLE_ETAT: Record<EtatSession, string> = {
  non_demarre: 'non démarrée',
  en_cours: 'en cours',
  termine: 'terminée',
  valide: 'validée',
};

const LIBELLE_ACTION: Record<ActionSession, string> = {
  demarrer: 'démarrer',
  terminer: 'terminer',
  rouvrir: 'rouvrir',
  valider: 'valider',
  deverrouiller: 'déverrouiller',
};

/**
 * Cette action est-elle permise depuis cet état, pour ce profil ?
 *
 * Trois refus distincts, et la distinction compte : « l'action n'existe pas
 * depuis cet état » n'appelle pas le même écran que « votre profil ne le permet
 * pas ». 03 §19.1 : « chaque étape verrouillée affiche PRÉCISÉMENT ce qui manque
 * […], jamais un simple cadenas muet. »
 */
export function peutTransiter(
  etat: EtatSession,
  action: ActionSession,
  profil: ProfilAuditeur,
): Autorisation {
  const candidates = TRANSITIONS_SESSION.filter((t) => t.action === action);
  if (candidates.length === 0) {
    return { autorise: false, motif: `Action inconnue : « ${LIBELLE_ACTION[action]} ».` };
  }

  const depuisCetEtat = candidates.find((t) => t.depuis === etat);
  if (depuisCetEtat === undefined) {
    const origines = candidates.map((t) => LIBELLE_ETAT[t.depuis]).join(' ou ');
    return {
      autorise: false,
      motif: `Impossible de ${LIBELLE_ACTION[action]} une session ${LIBELLE_ETAT[etat]} : cette action n’est possible que depuis une session ${origines}.`,
    };
  }

  if (!depuisCetEtat.profils.includes(profil)) {
    return {
      autorise: false,
      motif: `Votre profil (guidé strict) ne permet pas de ${LIBELLE_ACTION[action]} une session ${LIBELLE_ETAT[etat]}. Demandez à un administrateur de la débloquer, avec motif.`,
    };
  }

  return {
    autorise: true,
    vers: depuisCetEtat.vers,
    motifRequis: depuisCetEtat.motifRequis,
  };
}

/**
 * L'état de terrain d'une session à partir de ce qui est réellement stocké.
 *
 * `valideeLe` vit dans la charge chiffrée (`formes.ts`) : la validation n'est pas
 * un champ d'index, elle n'a donc pas à figurer dans la liste fermée du §3.2.
 */
export function etatSession(entree: {
  readonly status: StatutSessionPersiste;
  readonly valideeLe: string | null;
}): EtatSession {
  if (entree.status === 'termine' && entree.valideeLe !== null) return 'valide';
  return entree.status;
}

/**
 * L'inverse : ce qu'il faut écrire en base pour un état de terrain donné.
 *
 * `valideeLe` doit être fourni par l'appelant — c'est un horodatage, et l'horloge
 * n'a qu'une source (`local/horloge.ts`). Cette fonction ne l'invente pas.
 */
export function versStatutPersiste(etat: EtatSession): StatutSessionPersiste {
  return etat === 'valide' ? 'termine' : etat;
}

/**
 * Une session validée est VERROUILLÉE en modification (03 §19.1) : toute
 * correction ultérieure passe par une révision tracée. La question est posée
 * assez souvent pour mériter un nom plutôt qu'une comparaison recopiée.
 */
export function estVerrouilleeEnModification(etat: EtatSession): boolean {
  return etat === 'valide';
}
