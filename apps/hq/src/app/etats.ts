// =============================================================================
// LES QUATRE ÉTATS DE §33.2, DÉRIVÉS D'UNE REQUÊTE — lot L7a.
//
// « Chaque écran et chaque liste livre ses QUATRE états : vide, chargement,
// erreur, hors ligne. » `ZoneEtat` (packages/ui) rend cette règle INCOMPILABLE à
// oublier ; ce fichier rend son alimentation UNIFORME : un seul endroit décide
// comment une erreur de client devient une cause + une action en français, et
// aucun écran ne réinvente la traduction.
//
// Ce fichier ne connaît ni TanStack ni React : il prend un état de requête
// réduit à trois champs. C'est ce qui le rend testable par A36 sans monter un
// arbre.
//
// Traçabilité : E44 (UX/UI 2026-2027 — tokens, police locale), E27 (design
// moderne, charte, WCAG AA).
// =============================================================================
import type { ReactNode } from 'react';
import type { EtatZone } from '@axion/ui';
import { ErreurApi, ErreurContrat, ErreurReseau } from '../api/client.js';
import { ERROR_CODES } from '../api/contrats.js';

export interface EtatRequete {
  readonly enAttente: boolean;
  readonly erreur: unknown;
  /** `true` si la requête a abouti et que la liste ou l'objet est VIDE. */
  readonly vide: boolean;
}

export interface OptionsEtat {
  /** L'état vide dit QUOI FAIRE (§17.6), pas seulement qu'il n'y a rien. */
  readonly vide: { titre: string; description: string; actions?: ReactNode };
  /** Bouton « Réessayer » et consorts, pour l'erreur ET le hors-ligne. */
  readonly actions?: ReactNode;
  /** Ajouté aux actions pour un 404 seulement : « revenir au portefeuille ». */
  readonly actionsIntrouvable?: ReactNode;
  /** Squelettes : forme et nombre de lignes aux dimensions FINALES (§33.2). */
  readonly chargement?: { lignes?: number; libelle?: string };
}

/** Ce que l'utilisateur peut faire face à un code d'erreur — français, concret. */
function actionPourCode(code: string): string {
  switch (code) {
    case ERROR_CODES.UNAUTHENTICATED:
    case ERROR_CODES.TOKEN_EXPIRED:
    case ERROR_CODES.TOKEN_REUSE_DETECTED:
      return 'Reconnectez-vous à la console.';
    case ERROR_CODES.FORBIDDEN:
    case ERROR_CODES.NOT_HABILITATED:
      return 'Cet espace est réservé aux administrateurs. Vérifiez le compte avec lequel vous êtes entré.';
    case ERROR_CODES.NOT_FOUND:
      return 'Vérifiez le lien : la mission n’existe plus, ou n’a jamais existé. Revenez au portefeuille.';
    case ERROR_CODES.RATE_LIMITED:
      return 'Patientez une minute avant de réessayer.';
    default:
      return 'Réessayez. Si le problème persiste, transmettez le détail technique au support.';
  }
}

/**
 * La console ne travaille QU'en ligne (03 §22.3) : « hors ligne » n'y est pas un
 * mode de travail, c'est un constat — et §33.2 exige qu'il soit dit, avec ce qui
 * reste possible. Ici : rien à saisir, donc rien à perdre.
 */
const CAPACITES_HORS_LIGNE: readonly string[] = [
  'Rien n’est saisi dans la console : aucune donnée n’est en attente ici.',
  'Les écrans affichés sont les derniers reçus du serveur.',
  'La collecte terrain continue sur les appareils, avec ou sans réseau.',
];

export function etatDeRequete(requete: EtatRequete, options: OptionsEtat): EtatZone {
  if (requete.enAttente) {
    return {
      nature: 'chargement',
      forme: 'ligne',
      lignes: options.chargement?.lignes ?? 6,
      libelle: options.chargement?.libelle ?? 'Chargement en cours',
    };
  }

  const { erreur } = requete;
  if (erreur !== null && erreur !== undefined) {
    const horsLigne =
      erreur instanceof ErreurReseau || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (horsLigne) {
      return {
        nature: 'hors-ligne',
        titre: 'Hors ligne — le serveur est injoignable',
        capacites: CAPACITES_HORS_LIGNE,
        ...(options.actions === undefined ? {} : { actions: options.actions }),
      };
    }
    if (erreur instanceof ErreurApi) {
      const introuvable = erreur.code === ERROR_CODES.NOT_FOUND;
      const actions =
        introuvable && options.actionsIntrouvable !== undefined
          ? options.actionsIntrouvable
          : options.actions;
      return {
        nature: 'erreur',
        titre: introuvable ? 'Introuvable' : 'Une erreur est survenue',
        cause: erreur.message,
        action: actionPourCode(erreur.code),
        details: `${erreur.code} · HTTP ${String(erreur.statut)}`,
        ...(actions === undefined ? {} : { actions }),
      };
    }
    if (erreur instanceof ErreurContrat) {
      return {
        nature: 'erreur',
        titre: 'Réponse inattendue du serveur',
        cause: 'La réponse du serveur ne correspond pas au contrat de la console.',
        action: 'La console et l’API ne sont pas à la même version : signalez-le au support.',
        details: `${erreur.chemin}\n${erreur.problemes.join('\n')}`,
        ...(options.actions === undefined ? {} : { actions: options.actions }),
      };
    }
    return {
      nature: 'erreur',
      cause: erreur instanceof Error ? erreur.message : 'Erreur inconnue.',
      action:
        'Rechargez la page. Si le problème persiste, transmettez le détail technique au support.',
      ...(options.actions === undefined ? {} : { actions: options.actions }),
    };
  }

  if (requete.vide) {
    return { nature: 'vide', ...options.vide };
  }

  return { nature: 'nominal' };
}
