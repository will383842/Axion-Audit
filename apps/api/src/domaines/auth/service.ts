// =============================================================================
// SERVICE D'AUTHENTIFICATION — connexion, rotation, déconnexion. Lot L2, tâche T2.
//
// 05 §8.1 · 06 §10.1 (« access 15 min + refresh 30 j rotatif avec détection de
// réutilisation ; vol de token → révocation de toute la famille ») · 11 §3.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LA RÈGLE QUI GOUVERNE TOUT CE FICHIER : AUCUN ORACLE (06 §10.2)
// ═══════════════════════════════════════════════════════════════════════════════
// Un compte inexistant, un mot de passe faux et un compte désactivé rendent LE MÊME
// code, LE MÊME message, et un temps de réponse du MÊME ordre de grandeur (le
// travail Argon2id est consommé dans les trois cas — voir `mots-de-passe.ts`).
// Un jeton de rafraîchissement inconnu et un jeton qui a existé rendent le même
// `UNAUTHENTICATED`. Rien, dans une réponse de ce fichier, ne permet d'énumérer les
// comptes.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI LES DÉCISIONS SORTENT DE LA TRANSACTION AVANT D'ÊTRE LEVÉES
// ═══════════════════════════════════════════════════════════════════════════════
// Lever une `AppError` depuis l'intérieur d'un `db.transaction` ANNULE la
// transaction. Or la détection de réutilisation doit faire exactement l'inverse :
// la révocation de la famille doit être VALIDÉE, et l'erreur rendue APRÈS. Une
// détection dont l'effet est annulé par sa propre annonce ne protège personne.
// D'où le type `ResultatRotation` : la transaction rend un VERDICT, l'appelant le
// traduit en `AppError` une fois la validation acquise.
// Traçabilité : E5 (RBAC serveur systématique), E33.
// =============================================================================
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { AppError } from '@axion/shared';
import { db } from '../../db.js';
import { lireUtilisateurAuthentifie } from '../../auth/depot.js';
import { MESSAGE_AUTH_REQUISE, MESSAGE_JETON_EXPIRE } from '../../auth/erreurs-jeton.js';
import {
  FENETRE_GRACE_ROTATION_MS,
  signerJetonAcces,
  verifierJetonAcces,
} from '../../auth/jetons.js';
import {
  creerJetonRafraichissement,
  empreinteJetonRafraichissement,
  expirationRafraichissement,
} from './jetons-rafraichissement.js';
import { consommerLeTempsDUneVerification, verifierMotDePasse } from './mots-de-passe.js';
import {
  horodaterConnexion,
  insererJeton,
  lireIdentifiantsParEmail,
  lireJetonPourRotation,
  revoquerFamille,
  revoquerJeton,
  revoquerJetonDeLUtilisateur,
  type ExecuteurSql,
} from './depot.js';

/** Message unique de refus de connexion — voir la règle « aucun oracle » ci-dessus. */
export const MESSAGE_IDENTIFIANTS_REFUSES = 'Adresse e-mail ou mot de passe incorrect.';

/** Message du seul cas où le client doit REFAIRE une connexion complète. */
export const MESSAGE_SESSION_REVOQUEE =
  'Votre session a été révoquée pour raison de sécurité. Reconnectez-vous.';

/** Le couple de jetons émis, en types internes (les `Date` deviennent ISO au bord). */
export interface SessionEmise {
  readonly utilisateurId: string;
  readonly jetonAcces: string;
  readonly jetonRafraichissement: string;
  readonly accesExpireLe: Date;
  readonly rafraichissementExpireLe: Date;
}

// =============================================================================
// ÉMISSION D'UN COUPLE DE JETONS — le seul endroit qui en frappe
// =============================================================================

/**
 * Frappe l'accès + le rafraîchissement et ENREGISTRE ce dernier.
 *
 * L'`id` de la ligne est un **UUID v7 applicatif** (`uuidv7`, 11 §2) : PostgreSQL 16
 * n'a pas de `uuidv7()` native, et une clé ordonnable garde la table de jetons
 * insérable en fin d'index plutôt qu'éparpillée.
 *
 * L'expiration de l'accès est LUE DANS LE JETON qu'on vient de signer plutôt que
 * recalculée depuis `JWT_ACCESS_TTL`. Deux calculs indépendants de la même échéance
 * finissent toujours par diverger d'une seconde, et c'est le client qui paierait la
 * divergence en rafraîchissant trop tard.
 */
async function emettreSession(
  app: FastifyInstance,
  executeur: ExecuteurSql,
  utilisateurId: string,
  maintenant: Date,
): Promise<SessionEmise> {
  const jetonAcces = signerJetonAcces(app, utilisateurId);
  const charge = verifierJetonAcces(app, jetonAcces);

  const jetonRafraichissement = creerJetonRafraichissement();
  const rafraichissementExpireLe = expirationRafraichissement(maintenant);

  await insererJeton(executeur, {
    id: uuidv7(),
    utilisateurId,
    empreinte: empreinteJetonRafraichissement(jetonRafraichissement),
    expireLe: rafraichissementExpireLe,
  });

  return {
    utilisateurId,
    jetonAcces,
    jetonRafraichissement,
    // `exp` est en SECONDES UNIX (RFC 7519), pas en millisecondes.
    accesExpireLe: new Date(charge.exp * 1000),
    rafraichissementExpireLe,
  };
}

// =============================================================================
// CONNEXION
// =============================================================================

/**
 * `POST /v1/auth/login`.
 *
 * L'ORDRE DES CONTRÔLES EST UN CHOIX DE SÉCURITÉ, PAS UNE HABITUDE :
 *   1. lecture du compte ;
 *   2. **vérification Argon2id dans TOUS les cas** — y compris compte inconnu
 *      (empreinte-leurre) et compte désactivé ;
 *   3. seulement ensuite, la décision.
 * Court-circuiter l'étape 2 pour un compte inconnu répondrait en une milliseconde
 * là où un mot de passe faux prend plusieurs dizaines : l'énumération des comptes
 * redeviendrait triviale, sans qu'aucun message ne l'ait dite.
 *
 * `is_active` compte ici ET dans le crochet d'autorisation (qui relit `users` à
 * chaque requête) : la désactivation doit couper la porte d'entrée ET les jetons
 * déjà en circulation.
 */
export async function connecter(
  app: FastifyInstance,
  identifiants: { readonly email: string; readonly motDePasse: string },
): Promise<SessionEmise> {
  const compte = await lireIdentifiantsParEmail(identifiants.email);

  if (compte === null) {
    await consommerLeTempsDUneVerification(identifiants.motDePasse);
    throw new AppError('INVALID_CREDENTIALS', MESSAGE_IDENTIFIANTS_REFUSES);
  }

  const motDePasseValide = await verifierMotDePasse(
    identifiants.motDePasse,
    compte.empreinteMotDePasse,
  );

  if (!motDePasseValide || !compte.estActif) {
    // UNE SEULE branche pour deux causes, délibérément : un compte désactivé dont
    // le mot de passe est juste ne doit pas se distinguer d'un mot de passe faux.
    // Distinguer les deux confirmerait à un ancien salarié — ou à qui a acheté sa
    // liste de mots de passe — que le compte existe bel et bien.
    throw new AppError('INVALID_CREDENTIALS', MESSAGE_IDENTIFIANTS_REFUSES);
  }

  const maintenant = new Date();

  // Transaction : sans elle, un échec d'insertion du jeton laisserait une connexion
  // horodatée qui n'a rendu aucun jeton — une trace qui ment.
  return db.transaction(async (tx) => {
    await horodaterConnexion(tx, compte.id, maintenant);
    return emettreSession(app, tx, compte.id, maintenant);
  });
}

// =============================================================================
// ROTATION
// =============================================================================

/** Verdict de la transaction de rotation. Traduit en `AppError` par l'appelant. */
type ResultatRotation =
  | { readonly issue: 'succes'; readonly session: SessionEmise }
  /** Aucune ligne ne porte cette empreinte. On ne dit pas si elle a existé. */
  | { readonly issue: 'inconnu' }
  /** Jeton vivant mais périmé — la mission a duré plus de 30 jours hors ligne. */
  | { readonly issue: 'expire' }
  /** Révoqué il y a moins de 60 s : concurrence, pas vol. Voir la fenêtre de grâce. */
  | { readonly issue: 'grace' }
  /** Révoqué depuis longtemps et rejoué : vol présumé, famille révoquée. */
  | {
      readonly issue: 'reutilisation';
      readonly utilisateurId: string;
      readonly jetonsRevoques: number;
    };

/**
 * `POST /v1/auth/refresh` — rotation avec détection de réutilisation.
 *
 * ── LES SIX ISSUES, ET CE QUI LES SÉPARE ──────────────────────────────────────
 * empreinte inconnue · jeton périmé · jeton révoqué récemment (grâce) · jeton
 * révoqué anciennement (réutilisation) · compte devenu inaccessible · succès.
 * Les cinq premières rendent un 401 ; seules DEUX d'entre elles se distinguent dans
 * la réponse, et pour une raison fonctionnelle précise : `TOKEN_EXPIRED` dit au
 * terrain « rafraîchis/reconnecte-toi », `TOKEN_REUSE_DETECTED` dit « ta session a
 * été coupée volontairement ». Sans cette distinction, la PWA ne saurait pas quoi
 * afficher à un auditeur en clientèle.
 */
export async function rafraichir(
  app: FastifyInstance,
  journal: FastifyBaseLogger,
  jetonPresente: string,
): Promise<SessionEmise> {
  const empreinte = empreinteJetonRafraichissement(jetonPresente);
  const maintenant = new Date();

  const resultat: ResultatRotation = await db.transaction(async (tx) => {
    // `FOR UPDATE` : les rotations concurrentes s'exécutent l'une APRÈS l'autre.
    // Voir `lireJetonPourRotation` — c'est la moitié de la détection.
    const stocke = await lireJetonPourRotation(tx, empreinte);

    if (stocke === null) return { issue: 'inconnu' } as const;

    if (stocke.revoqueLe !== null) {
      const ageDeLaRevocation = maintenant.getTime() - stocke.revoqueLe.getTime();

      // ═══════════════════════════════════════════════════════════════════════
      // FENÊTRE DE GRÂCE — arbitrage A01 du 2026-08-29, porté par
      // `FENETRE_GRACE_ROTATION_MS` (apps/api/src/auth/jetons.ts, 60 s).
      // ═══════════════════════════════════════════════════════════════════════
      // CE QU'ELLE ÉVITE : deux rafraîchissements concurrents avec le même jeton —
      // onglet dupliqué, ou réponse HTTP perdue puis rejouée par un réseau de
      // chantier — feraient passer le second pour une réutilisation, et
      // DÉCONNECTERAIENT L'AUDITEUR DE TOUS SES APPAREILS pour une perte de paquet.
      //
      // CE QU'ELLE COÛTE, ET IL FAUT LE DIRE SANS L'ADOUCIR : pendant ces 60
      // secondes, un jeton RÉELLEMENT VOLÉ peut être présenté UNE FOIS sans être
      // détecté. La détection n'intervient qu'à la rotation suivante. C'est un
      // affaiblissement délibéré de 06 §10.1.
      //
      // CE QU'ELLE COUVRE AUSSI, PARCE QUE LE SCHÉMA NE PERMET PAS DE FAIRE LE TRI :
      // `revoked_at` ne dit pas QUI a révoqué. Une déconnexion volontaire et une
      // révocation de famille horodatent la même colonne. Un jeton rejoué dans les
      // 60 s qui suivent un `logout` bénéficie donc lui aussi de la grâce — il reste
      // REFUSÉ, mais il ne déclenche pas la détection. Distinguer les deux exigerait
      // une colonne de lignée (`replaced_by`), c'est-à-dire une modification du
      // fichier 04, donc une escalade. La constante disparaîtra le jour où cette
      // colonne existera : ce n'est pas un réglage, c'est un pansement daté.
      //
      // `ageDeLaRevocation >= 0` : une horloge serveur qui recule (NTP) ne doit pas
      // faire tomber un âge négatif dans la fenêtre par accident arithmétique.
      if (ageDeLaRevocation >= 0 && ageDeLaRevocation <= FENETRE_GRACE_ROTATION_MS) {
        return { issue: 'grace' } as const;
      }

      const jetonsRevoques = await revoquerFamille(tx, stocke.utilisateurId, maintenant);
      return {
        issue: 'reutilisation',
        utilisateurId: stocke.utilisateurId,
        jetonsRevoques,
      } as const;
    }

    if (stocke.expireLe.getTime() <= maintenant.getTime()) {
      // On révoque au passage : une ligne périmée mais vivante resterait
      // éternellement candidate à une « réutilisation » qui n'en serait pas une.
      await revoquerJeton(tx, stocke.id, maintenant);
      return { issue: 'expire' } as const;
    }

    // Rotation proprement dite : révoquer PUIS insérer, dans LA MÊME transaction.
    // La clause `revoked_at IS NULL` du dépôt ne peut plus échouer ici (la ligne est
    // verrouillée depuis la lecture) ; on vérifie quand même — un garde-fou qui ne
    // se déclenche jamais coûte une comparaison, un garde-fou absent coûte un vol
    // indétecté le jour où le verrou change.
    const revoques = await revoquerJeton(tx, stocke.id, maintenant);
    if (revoques !== 1) return { issue: 'grace' } as const;

    const session = await emettreSession(app, tx, stocke.utilisateurId, maintenant);
    return { issue: 'succes', session } as const;
  });

  switch (resultat.issue) {
    case 'inconnu':
      // 06 §10.2 : on ne dit JAMAIS si l'empreinte a existé. Un `TOKEN_EXPIRED` ici
      // apprendrait à un attaquant que son jeton volé a bien été émis un jour.
      throw new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);

    case 'expire':
    case 'grace':
      throw new AppError('TOKEN_EXPIRED', MESSAGE_JETON_EXPIRE);

    case 'reutilisation':
      // Journal d'EXPLOITATION (pino) : ni jeton, ni empreinte, ni adresse — un
      // identifiant de compte et un décompte, c'est-à-dire de quoi enquêter sans
      // rien divulguer. La trace MÉTIER (`activity_log`, `auth.reuse_detected`,
      // note L2 §2.4) appartient à la porte d'écriture unique du journal, livrée
      // par la tâche T4 : ce service l'appellera ici quand elle existera, et il
      // n'écrit surtout pas sa propre variante dans la table d'audit.
      journal.warn(
        {
          utilisateurId: resultat.utilisateurId,
          jetonsRevoques: resultat.jetonsRevoques,
        },
        'Réutilisation de jeton de rafraîchissement détectée — famille révoquée',
      );
      throw new AppError('TOKEN_REUSE_DETECTED', MESSAGE_SESSION_REVOQUEE);

    case 'succes':
      break;
  }

  // ── RELECTURE DU COMPTE, APRÈS LA TRANSACTION ET NON DEDANS ─────────────────
  // On réutilise la lecture du socle (`lireUtilisateurAuthentifie`) plutôt que d'en
  // écrire une seconde. Elle emploie le pool GLOBAL : l'appeler DANS la transaction
  // demanderait une deuxième connexion pendant qu'on en tient déjà une — sur un pool
  // de 10, dix rotations simultanées se bloqueraient mutuellement, sans issue.
  //
  // Faire le contrôle APRÈS est sans danger : le couple n'est rendu à l'appelant
  // qu'une fois ce contrôle passé, et si le compte est inaccessible on révoque tout,
  // le jeton fraîchement émis compris. Le jeton d'accès qui vient d'être signé serait
  // de toute façon refusé par le crochet d'autorisation, qui relit `users`.
  const utilisateur = await lireUtilisateurAuthentifie(resultat.session.utilisateurId);
  if (utilisateur?.estActif !== true) {
    await revoquerFamille(db, resultat.session.utilisateurId, new Date());
    throw new AppError('UNAUTHENTICATED', MESSAGE_AUTH_REQUISE);
  }

  return resultat.session;
}

// =============================================================================
// DÉCONNEXION
// =============================================================================

/**
 * `POST /v1/auth/logout` — « révoque le refresh » (05 §8.1), et LUI SEUL.
 *
 * Ce n'est PAS un incident (note L2 §2.3) : aucune famille n'est touchée, l'auditeur
 * qui se déconnecte de sa tablette reste connecté sur son portable.
 *
 * IDEMPOTENTE ET MUETTE : un jeton déjà révoqué, inconnu, ou appartenant à quelqu'un
 * d'autre rend exactement la même chose qu'une révocation réussie. La route est
 * authentifiée (elle exige un jeton d'ACCÈS valide) ; la propriété du jeton de
 * rafraîchissement est vérifiée dans la clause `WHERE` du dépôt, ce qui rend
 * impossible de fabriquer un chemin de code capable de la divulguer.
 */
export async function deconnecter(utilisateurId: string, jetonPresente: string): Promise<void> {
  await revoquerJetonDeLUtilisateur(
    empreinteJetonRafraichissement(jetonPresente),
    utilisateurId,
    new Date(),
  );
}
