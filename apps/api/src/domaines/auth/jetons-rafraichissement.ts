// =============================================================================
// LE JETON DE RAFRAÎCHISSEMENT — OPAQUE, jamais un JWT. Lot L2, tâche T2.
//
// Note de conception L2 §2.3, tableau « Mécanique retenue ». Trois décisions y sont
// prises et ce fichier les applique sans les rediscuter :
//
//   1. **Opaque, 256 bits d'aléa.** La colonne s'appelle `token_hash` : un secret
//      opaque se recherche PAR EMPREINTE. Un JWT, lui, invite à faire confiance à
//      ses claims — donc à sauter la lecture en base. Or CETTE LECTURE EST LA
//      DÉTECTION de réutilisation. Un JWT autoporteur rendrait la détection
//      impossible en la rendant inutile en apparence.
//
//   2. **HMAC-SHA256, pas Argon2id.** Le jeton porte 256 bits d'entropie : il n'y a
//      pas de dictionnaire à ralentir. Argon2 n'ajouterait rien contre une attaque
//      hors ligne (l'espace est déjà hors de portée) et rendrait la recherche
//      IMPOSSIBLE À INDEXER — chaque sel étant différent, il faudrait recalculer une
//      empreinte coûteuse par ligne candidate. Argon2id reste pour `password_hash`
//      (entropie faible, sel par ligne) : deux problèmes, deux primitives.
//      Le HMAC — et non un SHA-256 nu — parce qu'une base volée sans le poivre ne
//      permet toujours pas de reconnaître un jeton intercepté.
//
//   3. **Le poivre est `JWT_REFRESH_SECRET`.** La note §6.5 laissait le choix ouvert
//      entre ce secret et une variable dédiée, « sans préférence forte — A01 tranche
//      en une ligne ». En l'absence d'arbitrage écrit, on retient celui qui NE TOUCHE
//      PAS `.env.example` : le secret existe, il est déjà distinct de
//      `JWT_ACCESS_SECRET` (env.ts : « les confondre annulerait la détection de
//      réutilisation »), et il n'a aucun autre usage dans le dépôt. Le jour où A01
//      tranche pour une variable dédiée, seule la ligne `POIVRE` change.
//      ⚠ CONSÉQUENCE À CONNAÎTRE : changer `JWT_REFRESH_SECRET` invalide TOUTES les
//      empreintes stockées, donc déconnecte tous les appareils. C'est un levier
//      d'exploitation utile, pas un effet de bord — mais il doit être voulu.
//
// Traçabilité : E33 (sécurité : 06 §10.1).
// =============================================================================
import { createHmac, randomBytes } from 'node:crypto';
import { config } from '../../config.js';

/**
 * 32 octets = 256 bits. En base64url, 43 caractères sans remplissage — transportable
 * dans un corps JSON, stockable chiffré dans Dexie (11 §3), sans échappement.
 */
const OCTETS_JETON = 32;

/** Poivre du HMAC — voir la décision 3 en tête de fichier. */
const POIVRE = config.JWT_REFRESH_SECRET;

/** Frappe un jeton de rafraîchissement neuf. Le SEUL producteur du dépôt. */
export function creerJetonRafraichissement(): string {
  return randomBytes(OCTETS_JETON).toString('base64url');
}

/**
 * Empreinte destinée à la colonne `refresh_tokens.token_hash`.
 *
 * DÉTERMINISTE, donc recherchable par égalité : c'est toute la raison du HMAC plutôt
 * que d'une fonction à sel. Aucune comparaison en temps constant n'est nécessaire
 * ici — on ne COMPARE pas deux empreintes, on cherche une ligne par égalité SQL, et
 * le temps d'une recherche en base ne révèle pas le secret présenté (l'attaquant
 * devrait deviner 256 bits pour observer quoi que ce soit).
 */
export function empreinteJetonRafraichissement(jeton: string): string {
  return createHmac('sha256', POIVRE).update(jeton, 'utf8').digest('hex');
}

// -----------------------------------------------------------------------------
// DURÉE DE VIE — lue dans l'environnement, jamais écrite en dur (11 §3 : 30 j)
// -----------------------------------------------------------------------------

const MULTIPLICATEURS_MS: Readonly<Record<string, number>> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Traduit `JWT_REFRESH_TTL` (« 30d », « 12h », « 900s ») en millisecondes.
 *
 * POURQUOI UN ANALYSEUR MAISON DE QUINZE LIGNES plutôt qu'une dépendance : ajouter
 * une bibliothèque hors de la liste 11 §1 est une escalade (CLAUDE.md §3-1), et
 * emprunter celle qu'embarque `@fastify/rate-limit` reviendrait à dépendre d'un
 * paquet transitif que rien ne nous garantit de conserver.
 *
 * Il LÈVE au chargement du module plutôt que de retomber sur une valeur par défaut :
 * une durée de session mal orthographiée qui vaudrait silencieusement « 30 jours »
 * — ou « 30 millisecondes » — est exactement le genre de panne qu'on ne découvre
 * qu'en clientèle. Le processus refuse de démarrer, comme pour toute la
 * configuration (config.ts).
 */
export function analyserDureeMs(valeur: string, nomVariable: string): number {
  const correspondance = /^(\d+)(s|m|h|d)$/.exec(valeur.trim());
  if (correspondance === null) {
    throw new Error(
      `${nomVariable} = « ${valeur} » : durée illisible. Format attendu : ` +
        `<entier><s|m|h|d> (par exemple « 30d »). Le processus refuse de démarrer ` +
        `plutôt que de deviner une durée de session.`,
    );
  }
  const [, quantite, unite] = correspondance;
  // Les deux groupes existent dès que l'expression a correspondu ; le typage ne le
  // sait pas, et une assertion serait un mensonge — on refuse donc explicitement.
  if (quantite === undefined || unite === undefined) {
    throw new Error(`${nomVariable} = « ${valeur} » : durée illisible.`);
  }
  const multiplicateur = MULTIPLICATEURS_MS[unite];
  if (multiplicateur === undefined) {
    throw new Error(`${nomVariable} = « ${valeur} » : unité de durée non reconnue.`);
  }
  const millisecondes = Number(quantite) * multiplicateur;
  if (millisecondes <= 0) {
    throw new Error(
      `${nomVariable} = « ${valeur} » : une durée de session nulle rendrait tout ` +
        `jeton expiré à l'instant de sa frappe.`,
    );
  }
  return millisecondes;
}

/** Durée de vie d'un jeton de rafraîchissement, en millisecondes (11 §3 : 30 j). */
export const DUREE_RAFRAICHISSEMENT_MS = analyserDureeMs(config.JWT_REFRESH_TTL, 'JWT_REFRESH_TTL');

/** Instant d'expiration d'un jeton frappé maintenant. */
export function expirationRafraichissement(maintenant: Date): Date {
  return new Date(maintenant.getTime() + DUREE_RAFRAICHISSEMENT_MS);
}
