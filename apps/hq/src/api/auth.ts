// =============================================================================
// POINT D'ENTRÉE D'AUTHENTIFICATION DE LA CONSOLE — CÔTÉ CLIENT SEUL (L7a).
//
// Contrat 11 §3 : console = **cookies httpOnly SameSite=Lax + en-tête anti-CSRF
// custom**. Le terrain, lui, est en Bearer ; la console ne l'est JAMAIS — un
// jeton lisible par du JavaScript sur un poste de siège est exactement ce que le
// cookie httpOnly empêche. Corollaire tenu par construction : **la console
// n'écrit AUCUN jeton nulle part** (ni `localStorage`, ni `sessionStorage`, ni
// mémoire). La réponse de `login` est validée par le contrat puis oubliée.
//
// ── LES DEUX EN-TÊTES ───────────────────────────────────────────────────────
//   1. `X-Axion-Client: console` — sur TOUTE requête. C'est l'en-tête custom
//      anti-CSRF : un formulaire HTML cross-site ne peut pas le poser, donc un
//      cookie qui part SANS lui n'a pas été envoyé par la console. Il dit aussi
//      au serveur QUI parle — c'est ce que la fiche A-006 appelle « émission du
//      cookie à `/v1/auth/login` quand le client est la console ».
//   2. `X-Axion-Csrf: <jeton>` — sur les écritures, SI le serveur a déposé un
//      cookie lisible `axion_csrf` (double-soumission). Absent tant que A-006
//      n'est pas livrée ; le client ne s'en plaint pas, c'est au serveur de
//      refuser une écriture qu'il juge nue.
//
// Ce fichier n'ÉMET rien côté API : A-006 constate que `@fastify/cookie` est
// installé mais jamais enregistré ; c'est le chantier C1 qui la prend après la
// PR L3. Rien ici n'est un contrôle de sécurité : **la sécurité est serveur**
// (invariant 3). Ce fichier ne fait que parler la langue que le serveur attendra.
//
// ⚠ DOUTE DE SPEC (DECISIONS.md) : le NOM de l'en-tête anti-CSRF n'est fixé
// nulle part dans le pack. `X-Axion-Client` est proposé ici et à ratifier avec
// A-006 ; les tests de A36 n'exigent qu'un en-tête custom `X-…`, pas son nom.
//
// Traçabilité : E33 (sécurité / RGPD), E43 (exécutabilité autopilote —
// conventions d'API).
// =============================================================================

/** L'en-tête custom qui identifie la console — et fait office d'anti-CSRF (11 §3). */
export const EN_TETE_CLIENT = 'X-Axion-Client';
export const VALEUR_CLIENT_CONSOLE = 'console';

/** L'en-tête du jeton anti-CSRF en double-soumission. Le serveur (A-006) lit le même. */
export const EN_TETE_ANTI_CSRF = 'X-Axion-Csrf';

/** Nom du cookie NON httpOnly qui porte le jeton anti-CSRF (double-soumission). */
export const COOKIE_ANTI_CSRF = 'axion_csrf';

/** Méthodes qui n'ÉCRIVENT pas : le jeton de double-soumission n'y est pas requis. */
const METHODES_SURES: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export function methodeExigeAntiCsrf(methode: string): boolean {
  return !METHODES_SURES.has(methode.toUpperCase());
}

/**
 * Lit le jeton anti-CSRF déposé par le serveur, ou `null` s'il n'existe pas.
 * Lecture pure de `document.cookie` — aucune dépendance, aucun état.
 */
export function lireJetonAntiCsrf(cookies: string = document.cookie): string | null {
  for (const morceau of cookies.split(';')) {
    const [nom, ...reste] = morceau.trim().split('=');
    if (nom === COOKIE_ANTI_CSRF) {
      const valeur = reste.join('=');
      return valeur === '' ? null : decodeURIComponent(valeur);
    }
  }
  return null;
}

/**
 * Les en-têtes d'authentification à joindre à une requête : l'identité de la
 * console toujours ; le jeton de double-soumission sur une écriture, s'il existe.
 *
 * Une écriture SANS jeton part quand même : c'est au serveur de la refuser
 * (`FORBIDDEN`), jamais au client de décider qu'elle passera. Un client qui se
 * censure masquerait un serveur mal configuré.
 */
export function enTetesAuth(methode: string, jeton: string | null): Record<string, string> {
  const enTetes: Record<string, string> = { [EN_TETE_CLIENT]: VALEUR_CLIENT_CONSOLE };
  if (methodeExigeAntiCsrf(methode) && jeton !== null) enTetes[EN_TETE_ANTI_CSRF] = jeton;
  return enTetes;
}
