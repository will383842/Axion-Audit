// =============================================================================
// LE CONTEXTE LOCAL — la base ouverte ET le coffre ouvert, ou rien
//
// ── POURQUOI LES DEUX ENSEMBLE, ET JAMAIS SÉPARÉMENT ─────────────────────────
// Une base ouverte SANS coffre ne sert à rien : chaque ligne porte une
// `Enveloppe` (§3.2) et rien n'y est lisible. Les tenir dans un seul objet rend
// impossible l'état intermédiaire — « base prête, coffre verrouillé » — dans
// lequel un écran croirait pouvoir lire et n'obtiendrait que des exceptions.
//
// C'est aussi ce qui donne au verrou du 05 §9.7 son effet réel : `verrouiller()`
// retire le contexte, et toute lecture comme toute écriture LÈVE ensuite. Le
// verrou n'est pas une couche d'affichage posée devant des données accessibles.
//
// Traçabilité : E33 (sécurité / RGPD), E6 (hors ligne total, PC ET tablette).
// =============================================================================
import type { BaseLocale } from './base.js';
import type { Coffre } from './coffre.js';

export interface ContexteLocal {
  readonly base: BaseLocale;
  readonly coffre: Coffre;
}

let contexte: ContexteLocal | null = null;

/** Levée par tout accès local alors que l'application est verrouillée. */
export class ContexteLocalIndisponibleError extends Error {
  override readonly name = 'ContexteLocalIndisponibleError';
  constructor() {
    super(
      'L’application est verrouillée. Saisissez votre mot de passe pour reprendre — rien n’a été perdu.',
    );
  }
}

/** Installé au déverrouillage, une seule fois, par la coquille. */
export function installerContexteLocal(nouveau: ContexteLocal): void {
  contexte = nouveau;
}

/**
 * Retiré au verrouillage.
 *
 * **CETTE FONCTION VERROUILLE LE COFFRE QU'ELLE TENAIT.** Ce n'est pas un effet
 * de bord : laisser la DEK vivante pendant que le contexte disparaît donnerait un
 * verrou qui n'enferme rien, et 05 §9.7 exige que « la KEK ne soit tenue qu'en
 * mémoire de session ». Retirer, ici, VEUT DIRE verrouiller.
 *
 * **La conséquence, à connaître avant d'écrire du code qui la subit : un coffre
 * ne se partage pas entre deux contextes.** Le premier `retirerContexteLocal()`
 * le ferme pour tout le monde, et tout usage ultérieur de la même instance lève
 * `CoffreVerrouilleError` — y compris chez un détenteur qui, lui, n'a rien
 * demandé. Un appelant qui a besoin d'un coffre indépendant en ouvre un
 * (`ouvrirCoffre` / `creerCoffreNeuf`) au lieu de réutiliser celui du contexte.
 */
export function retirerContexteLocal(): void {
  contexte?.coffre.verrouiller();
  contexte = null;
}

export function contexteLocalInstalle(): boolean {
  return contexte !== null;
}

export function contexteLocal(): ContexteLocal {
  if (contexte === null) throw new ContexteLocalIndisponibleError();
  return contexte;
}
