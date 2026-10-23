// =============================================================================
// BANC E2E — SEMIS CÔTÉ SERVEUR : fabrication d'ÉTAT, jamais de RÉSULTAT
//
// Le banc partage UNE base entre les fichiers qui tournent en parallèle (2 workers).
// L'isolement tient donc à un PRÉFIXE PAR FICHIER : chaque fichier sème ses propres
// comptes, entreprise et mission (UUID v7 frais, courriels et titres préfixés) et ne
// touche jamais à ceux d'un autre. Aucun fichier ne compte les lignes de toute la
// base ; il compte celles de SES missions.
//
// Les mots de passe sont hachés par LE CODE DE L'API (`hacherMotDePasse`, Argon2id) :
// la connexion réelle vérifie donc une empreinte qu'elle a elle-même la forme de lire.
// Les jetons d'accès sont frappés ici avec le secret factice du banc (HS256, comme
// `@fastify/jwt`) pour les appels directs à l'API — `/v1/auth/*` est limité à
// 10 req/min/IP (11 §3) et tout le banc vient de 127.0.0.1 : on n'ouvre une
// connexion RÉELLE que là où le scénario l'exige.
//
// Invariant 2 : aucune référence client, entreprises FICTIVES. Secrets factices.
// =============================================================================
import { createHmac } from 'node:crypto';
// `pg` et `uuidv7` ne sont pas des dépendances de la racine : on passe par l'aide
// d'apps/api, qui les résout depuis SON répertoire (même motif que les fixtures).
import { connecter, uuidv7 } from '../../apps/api/tests/aide/base-l1.js';
import { hacherMotDePasse } from '../../apps/api/src/domaines/users/mots-de-passe.js';

export { uuidv7 };

type ConnexionBanc = Awaited<ReturnType<typeof connecter>>;

export type RoleUtilisateur = 'admin' | 'consultant' | 'analyste' | 'lecteur';
export type RoleSurMission = 'lead' | 'consultant' | 'analyste' | 'lecteur';

function variable(nom: string): string {
  const valeur = process.env[nom];
  if (valeur === undefined || valeur === '') {
    throw new Error(
      `${nom} absente : le globalSetup du banc (e2e/banc/global-setup.ts) n'a pas tourné.`,
    );
  }
  return valeur;
}

/** Ouvre une connexion SQL sur la base du banc. À fermer par l'appelant. */
export async function connecterBanc(): Promise<ConnexionBanc> {
  return connecter(variable('AXION_BANC_DATABASE_URL'));
}

/** Exécute `travail` sur une connexion fraîche, toujours refermée. */
export async function avecBase<T>(travail: (bd: ConnexionBanc) => Promise<T>): Promise<T> {
  const bd = await connecterBanc();
  try {
    return await travail(bd);
  } finally {
    await bd.end();
  }
}

export interface Auditeur {
  readonly id: string;
  readonly courriel: string;
  readonly motDePasse: string;
}

export interface MissionSemee {
  readonly missionId: string;
  readonly entrepriseId: string;
  readonly titre: string;
}

/** Un préfixe sûr pour un nom de fichier (courriel, titre). */
function nettoyer(prefixe: string): string {
  return prefixe.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

let compteur = 0;

export async function creerAuditeur(
  prefixe: string,
  options: { readonly role?: RoleUtilisateur; readonly motDePasse?: string } = {},
): Promise<Auditeur> {
  compteur += 1;
  const id = uuidv7();
  const motDePasse = options.motDePasse ?? `banc-${id.slice(-12)}-factice`;
  const courriel = `${nettoyer(prefixe)}.${String(compteur)}.${id.slice(-8)}@exemple.test`;
  const empreinte = await hacherMotDePasse(motDePasse);
  await avecBase((bd) =>
    bd.query(
      `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                          habilitated_at, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'guide_strict', now(), true, now(), now())`,
      [
        id,
        `Auditeur ${nettoyer(prefixe)} ${String(compteur)}`,
        courriel,
        empreinte,
        options.role ?? 'consultant',
      ],
    ),
  );
  return { id, courriel, motDePasse };
}

/**
 * Une mission fictive dont `auditeur` est membre. `missionId` peut être imposé : le
 * front de test plante parfois des lignes locales à identifiant connu.
 */
export async function creerMission(
  prefixe: string,
  auditeur: Auditeur,
  options: { readonly missionId?: string; readonly roleSurMission?: RoleSurMission } = {},
): Promise<MissionSemee> {
  compteur += 1;
  const entrepriseId = uuidv7();
  const missionId = options.missionId ?? uuidv7();
  const titre = `Mission fictive ${nettoyer(prefixe)} ${String(compteur)}`;
  await avecBase(async (bd) => {
    await bd.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
      entrepriseId,
      `Entreprise fictive ${nettoyer(prefixe)} ${String(compteur)}`,
    ]);
    await bd.query(
      `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'france', 'operationnel', 'en_cours', now(), now())`,
      [missionId, entrepriseId, titre],
    );
    await bd.query(
      'INSERT INTO mission_users (mission_id, user_id, role_on_mission) VALUES ($1, $2, $3)',
      [missionId, auditeur.id, options.roleSurMission ?? 'lead'],
    );
  });
  return { missionId, entrepriseId, titre };
}

/**
 * VIEILLIR : recule `updated_at` de TOUTES les lignes d'une mission de test.
 *
 * Le pull borne son curseur à `now() - 60 s` (05 §9.5 : une transaction serveur encore
 * ouverte ne doit pas faire sauter une ligne). Une ligne que le test vient d'écrire est
 * donc invisible du pull suivant ; sans ce recul, un scénario devrait attendre une
 * minute réelle. On ne touche QUE `updated_at`, QUE pour la mission de test donnée,
 * et jamais autre chose que ce que le delta lit.
 */
export async function vieillir(missionId: string, secondes = 120): Promise<void> {
  await avecBase(async (bd) => {
    const recul = `${String(secondes)} seconds`;
    await bd.query(`UPDATE missions SET updated_at = updated_at - $1::interval WHERE id = $2`, [
      recul,
      missionId,
    ]);
    await bd.query(
      `UPDATE org_units SET updated_at = updated_at - $1::interval WHERE mission_id = $2`,
      [recul, missionId],
    );
    await bd.query(
      `UPDATE interviews SET updated_at = updated_at - $1::interval WHERE mission_id = $2`,
      [recul, missionId],
    );
    await bd.query(
      `UPDATE answers SET updated_at = updated_at - $1::interval
        WHERE interview_id IN (SELECT id FROM interviews WHERE mission_id = $2)`,
      [recul, missionId],
    );
    await bd.query(
      `UPDATE attachments SET updated_at = updated_at - $1::interval WHERE mission_id = $2`,
      [recul, missionId],
    );
  });
}

function base64Url(octets: Buffer | string): string {
  return Buffer.from(octets).toString('base64url');
}

/**
 * Un jeton d'accès valide (HS256, 15 min) pour `utilisateurId`, frappé avec le secret
 * factice du banc — même forme que `app.jwt.sign({ sub })`. Sert aux appels directs à
 * l'API ; le rôle est relu EN BASE par l'API (06 §10.1), le jeton n'en porte aucun.
 */
export function jetonAcces(utilisateurId: string, dureeSecondes = 900): string {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const charge = base64Url(
    JSON.stringify({ sub: utilisateurId, iat: maintenant, exp: maintenant + dureeSecondes }),
  );
  const signature = createHmac('sha256', variable('AXION_BANC_SECRET_ACCES'))
    .update(`${entete}.${charge}`)
    .digest('base64url');
  return `${entete}.${charge}.${signature}`;
}

/**
 * Une adresse PUBLIQUE factice (plage de documentation RFC 5737) propre au fichier.
 *
 * L'API ne fait confiance à `X-Forwarded-For` que pour les adresses privées/loopback
 * (app.ts) : un client dont l'en-tête porte une adresse publique est identifié par
 * elle. Chaque fichier pose la sienne sur son contexte navigateur — aucun code de
 * production touché — et son quota `/v1/auth/*` (10 req/min/IP) ne se mélange pas à
 * celui des autres.
 */
export function ipDuFichier(prefixe: string): string {
  let h = 0;
  for (const c of prefixe) h = (h * 31 + c.charCodeAt(0)) % 250;
  return `203.0.113.${String(h + 1)}`;
}

export function urlApi(): string {
  return variable('AXION_BANC_API');
}
