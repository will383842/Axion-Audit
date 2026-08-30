// =============================================================================
// FRAPPE D'UNE EMPREINTE DE MOT DE PASSE, ET ENGENDREMENT D'UN MOT DE PASSE.
// Lot L2, tâche T3.
//
// ── POURQUOI CE MODULE N'EST PAS `domaines/auth/mots-de-passe.ts` ────────────
// Ce dernier VÉRIFIE : il porte le leurre d'Argon2id, le préchauffage et la
// doctrine anti-oracle de la connexion. Ce module-ci FRAPPE : il sert la création
// d'un compte et la réinitialisation admin, deux gestes qui n'ont ni oracle ni
// chemin chaud. Les deux finalités sont distinctes ; **les PARAMÈTRES, eux, ne le
// sont pas** — `PARAMETRES_ARGON2ID` est IMPORTÉ de là-bas, jamais recopié. Une
// empreinte frappée avec d'autres paramètres que ceux du reste du produit serait
// vérifiable (le format PHC les transporte) mais silencieusement plus faible, et
// rien ne le signalerait.
//
// ── LE FORMAT PHC, ET CE QU'IL DISPENSE DE STOCKER ──────────────────────────
// `outputType: 'encoded'` rend `$argon2id$v=19$m=19456,t=3,p=1$<sel>$<empreinte>` :
// le sel ET les paramètres voyagent AVEC l'empreinte. C'est ce qui fait qu'un
// durcissement futur des paramètres n'invalidera aucune empreinte existante — elles
// continueront de se vérifier avec les leurs.
// Traçabilité : E33 (sécurité : Argon2id 06 §10.1).
// =============================================================================
import { randomBytes, randomInt } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { PARAMETRES_ARGON2ID } from '../auth/mots-de-passe.js';

/**
 * Longueur du sel, en octets. 16 octets est la valeur du seed du lot L1
 * (`apps/api/scripts/seed.mjs`) et la recommandation d'Argon2 : la reprendre garde
 * les empreintes du produit homogènes, quelle que soit la porte par laquelle un
 * compte est né.
 */
const LONGUEUR_SEL = 16;

/**
 * L'ALPHABET DU MOT DE PASSE ENGENDRÉ — 32 signes, et pas un de plus.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CE QUI EN EST ABSENT COMPTE PLUS QUE CE QUI Y EST : `I`, `O`, `0` et `1`.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Ce mot de passe est affiché UNE SEULE FOIS et sera transmis à un auditeur —
 * lu à voix haute, recopié depuis un écran, parfois dicté au téléphone depuis une
 * salle de réunion en clientèle. Un `O` pris pour un `0` ne produit pas une erreur
 * lisible : il produit un « mot de passe invalide » que personne ne sait
 * diagnostiquer, sur un compte qu'on vient justement de débloquer, et il faut
 * refaire une réinitialisation. Les caractères ambigus sont donc RETIRÉS.
 *
 * Ni minuscules ni ponctuation : elles ajouteraient de l'ambiguïté (`l`/`1`, `-`
 * mangé par un retour à la ligne) pour un gain d'entropie qu'on obtient bien moins
 * cher en allongeant. 32 signes = exactement 5 bits par caractère.
 */
const ALPHABET_ENGENDRE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Longueur du mot de passe engendré. 20 × 5 bits = **100 bits d'entropie**, très
 * au-delà des 12 caractères qu'exige 06 §10.1 — un minimum de politique n'est pas
 * une cible de conception, et ce secret-ci n'est ni choisi ni mémorisé par un
 * humain : rien ne pousse à l'écourter.
 */
const LONGUEUR_ENGENDREE = 20;

/**
 * Engendre un mot de passe aléatoire, à afficher UNE SEULE FOIS.
 *
 * `randomInt` et non `randomBytes % n` : le modulo d'un octet par 32 serait ici
 * sans biais (256 est un multiple de 32), mais la propriété tiendrait à cette
 * coïncidence — changer un seul caractère de l'alphabet introduirait un biais
 * invisible. `randomInt` fait le rejet lui-même, quelle que soit la taille.
 *
 * ⚠ CE QUI EST RENDU NE DOIT JAMAIS ÊTRE JOURNALISÉ, ni par pino ni dans
 * `activity_log`. Le seul chemin autorisé est la réponse HTTP de la route de
 * réinitialisation (`passwordResetResponseSchema`) — voir son commentaire.
 */
export function engendrerMotDePasse(): string {
  let motDePasse = '';
  for (let i = 0; i < LONGUEUR_ENGENDREE; i += 1) {
    // `charAt` et non `[…]` : sous `noUncheckedIndexedAccess`, l'indexation rendrait
    // `string | undefined` et obligerait à une assertion — que la conception du lot
    // proscrit. `charAt` rend `string`, et l'indice est borné par construction.
    motDePasse += ALPHABET_ENGENDRE.charAt(randomInt(ALPHABET_ENGENDRE.length));
  }
  return motDePasse;
}

/**
 * Frappe l'empreinte Argon2id d'un mot de passe, au format PHC.
 *
 * Le sel est TIRÉ ICI, par ligne : deux comptes portant le même mot de passe ont
 * deux empreintes différentes, et une table arc-en-ciel n'a aucune prise.
 */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  return argon2id({
    password: motDePasse,
    salt: randomBytes(LONGUEUR_SEL),
    ...PARAMETRES_ARGON2ID,
    outputType: 'encoded',
  });
}
