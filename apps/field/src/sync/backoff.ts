// =============================================================================
// LE BACKOFF — 05 §9.3 : « backoff exponentiel (max 1 min) » (L6b)
//
// Le backoff RYTHME les tentatives de la minuterie (`declencheurs.ts`) ; il ne
// compte PAS les échecs d'op. Le passage « à examiner » au 10e échec reste au
// moteur (`moteur.ts`, ECHECS_AVANT_EXAMEN réponses `error`) : deux compteurs
// pour deux faits — « le siège répond-il ? » et « cette op passe-t-elle ? ».
//
// Règle : premier délai DELAI_BACKOFF_INITIAL_MS, puis le double à chaque échec
// consécutif, borné à DELAI_BACKOFF_MAX_MS. Un succès remet à zéro. Le calcul ne
// passe jamais par une puissance de 2 non bornée : aucun débordement possible.
//
// Traçabilité : E7 (remontée continue) ; invariant 8.
// =============================================================================

/** Le premier délai après un échec. */
export const DELAI_BACKOFF_INITIAL_MS = 2_000;

/** 05 §9.3 : « max 1 min ». */
export const DELAI_BACKOFF_MAX_MS = 60_000;

/** Délai avant la prochaine tentative après `echecsConsecutifs` échecs (≥ 1). */
export function delaiBackoffMs(echecsConsecutifs: number): number {
  let delai = DELAI_BACKOFF_INITIAL_MS;
  for (let n = 1; n < echecsConsecutifs && delai < DELAI_BACKOFF_MAX_MS; n += 1) {
    delai *= 2;
  }
  return Math.min(delai, DELAI_BACKOFF_MAX_MS);
}

export interface Backoff {
  /** Enregistre un échec ; rend le délai à attendre avant la tentative suivante. */
  echec(): number;
  /** Un passage réussi : le compteur repart de zéro. */
  succes(): void;
  readonly echecsConsecutifs: number;
}

/** Un backoff indépendant : aucun état de module partagé. */
export function creerBackoff(): Backoff {
  let echecs = 0;
  return {
    echec(): number {
      echecs += 1;
      return delaiBackoffMs(echecs);
    },
    succes(): void {
      echecs = 0;
    },
    get echecsConsecutifs(): number {
      return echecs;
    },
  };
}
