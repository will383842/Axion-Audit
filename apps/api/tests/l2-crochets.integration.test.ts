// =============================================================================
// LOT L2 / T6 — LES CROCHETS D'AUTORISATION, ÉPROUVÉS SUR UNE BASE RÉELLE.
//
// Écrit par A16, qui n'a produit AUCUNE des lignes testées (09 §5.6). Ces tests
// sont dérivés de la note `docs/conception/LOT_L2.md` (§2.1, §2.2, §5) et des
// invariants du CLAUDE.md — jamais de la lecture du code d'A13 comme spécification.
//
// ── POURQUOI CE FICHIER EST UNIQUE, ET POURQUOI IL DOIT LE RESTER ─────────────
// `apps/api/src/db.ts` construit son pool AU CHARGEMENT DU MODULE, depuis
// `config.DATABASE_URL`. Le projet `integration` tourne en `singleFork` : tous les
// fichiers partagent le MÊME registre de modules. Un second fichier qui importerait
// `../src/app.js` obtiendrait le module DÉJÀ CHARGÉ, donc le pool de la base
// éphémère du PREMIER fichier — et écrirait ses assertions contre la mauvaise base
// sans qu'aucune erreur ne le signale. Tant que `db.ts` n'expose pas de fabrique,
// TOUT test d'intégration qui construit l'app vit ICI.
//
// Conséquence directe : les imports de l'application sont DYNAMIQUES et faits après
// la pose de `process.env` — un import statique serait hissé avant, et `config.ts`
// échouerait au chargement.
//
// Traçabilité : E5 (RBAC serveur systématique), E27 (étanchéité financière).
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { RoleUtilisateur } from '../src/db/schema.js';
import type { PolitiqueAcces } from '../src/auth/politique.js';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// 64 caractères hexadécimaux = les 32 octets qu'exige `envApiSchema`.
// -----------------------------------------------------------------------------
const SECRET_ACCES = '11'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '22'.repeat(32);

let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
let signer: (instance: FastifyInstance, utilisateurId: string) => string;

/** Comptes semés une fois pour toute la suite, un par usage. */
const comptes = {
  admin: uuidv7(),
  consultant: uuidv7(),
  analyste: uuidv7(),
  lecteur: uuidv7(),
  aDesactiver: uuidv7(),
  aSupprimer: uuidv7(),
};

const jetons: Record<keyof typeof comptes, string> = {
  admin: '',
  consultant: '',
  analyste: '',
  lecteur: '',
  aDesactiver: '',
  aSupprimer: '',
};

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

/**
 * Chaque appel part d'une IP DIFFÉRENTE.
 *
 * Le quota global (300 req/min) est indexé sur le sujet du jeton, avec repli sur
 * l'IP : les appels ANONYMES de cette suite partageraient donc un seul compteur.
 * Ce n'est pas une commodité — sans cela, l'ordre des `it` déciderait du verdict, et
 * une suite dont le résultat dépend de son ordre ne prouve rien. Le quota lui-même
 * est éprouvé ailleurs, sur trois scénarios dédiés (`src/auth/quota.test.ts`).
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.${String(Math.floor(compteurIp / 62_500) % 250)}.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly corps: string;
}

async function appeler(
  url: string,
  jeton?: string,
  methode: 'GET' | 'HEAD' = 'GET',
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(jeton === undefined ? {} : { authorization: `Bearer ${jeton}` }),
    },
  });
  let code: string | null = null;
  if (reponse.body !== '') {
    const analyse: unknown = JSON.parse(reponse.body);
    if (
      typeof analyse === 'object' &&
      analyse !== null &&
      'error' in analyse &&
      typeof analyse.error === 'object' &&
      analyse.error !== null &&
      'code' in analyse.error &&
      typeof analyse.error.code === 'string'
    ) {
      code = analyse.error.code;
    }
  }
  return { statut: reponse.statusCode, code, corps: reponse.body };
}

async function semerUtilisateur(
  id: string,
  role: RoleUtilisateur,
  marqueur: string,
): Promise<void> {
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 'argon2-factice', $4, 'guide_strict', now(), true, now(), now())`,
    [id, `Compte ${marqueur}`, `compte.${marqueur}@exemple.test`, role],
  );
}

beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l2_crochets');
  nomBase = base.nom;
  await appliquerMontee(base.url);
  client = await connecter(base.url);

  await semerUtilisateur(comptes.admin, 'admin', 'admin');
  await semerUtilisateur(comptes.consultant, 'consultant', 'consultant');
  await semerUtilisateur(comptes.analyste, 'analyste', 'analyste');
  await semerUtilisateur(comptes.lecteur, 'lecteur', 'lecteur');
  await semerUtilisateur(comptes.aDesactiver, 'consultant', 'a-desactiver');
  await semerUtilisateur(comptes.aSupprimer, 'consultant', 'a-supprimer');

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit être
  // posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';

  const { construireApp } = await import('../src/app.js');
  const { signerJetonAcces } = await import('../src/auth/jetons.js');
  signer = signerJetonAcces;

  const instance = await construireApp();
  app = instance;

  // --- Routes d'épreuve : une par variante de la politique ---------------------
  // Elles n'existent que pour cette suite et ne sont JAMAIS montées par `app.ts` :
  // ce ne sont pas des routes du produit, ce sont des BANCS pour le crochet ③.
  instance.get('/essai/public', { config: { acces: { type: 'public' } } }, (requete) => ({
    identite: requete.identite?.utilisateurId ?? null,
    echec: requete.echecIdentification?.code ?? null,
  }));

  instance.get('/essai/authentifie', { config: { acces: { type: 'authentifie' } } }, (requete) => ({
    role: requete.utilisateur?.role ?? null,
    contexteAdmin: requete.contexteAdmin !== null,
  }));

  instance.get(
    '/essai/admin',
    { config: { acces: { type: 'roles', roles: ['admin'] } } },
    (requete) => ({ role: requete.utilisateur?.role ?? null }),
  );

  // `financier: true` avec DEUX rôles autorisés : c'est le seul montage qui prouve
  // que la marque `ContexteAdmin` ne dépend pas de la liste déclarée par la route
  // mais du rôle RELU EN BASE (note L2 §2.2-2, « deux clés pour un même coffre »).
  instance.get(
    '/essai/financier',
    { config: { acces: { type: 'roles', roles: ['admin', 'consultant'], financier: true } } },
    (requete) => ({
      contexteAdmin: requete.contexteAdmin !== null,
      porteur: requete.contexteAdmin?.utilisateurId ?? null,
    }),
  );

  instance.get(
    '/essai/missions/:missionId',
    { config: { acces: { type: 'mission', parametreMission: 'missionId' } } },
    (requete) => ({ role: requete.utilisateur?.role ?? null }),
  );

  instance.get(
    '/essai/sessions/:sessionId',
    { config: { acces: { type: 'proprietaire_session', parametreSession: 'sessionId' } } },
    (requete) => ({ role: requete.utilisateur?.role ?? null }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // UNE POLITIQUE HORS DE L'UNION — le banc de l'ÉCHEC FERMÉ (`default`).
  // ═══════════════════════════════════════════════════════════════════════════
  // Ajouté par A17. Le compilateur interdit cette valeur, et il a raison : c'est
  // pourquoi elle est FABRIQUÉE ici, dans un test, et nulle part ailleurs. Le code
  // testé, lui, doit y survivre — sa propre branche `default` dit exactement d'où
  // elle viendra : « un `config` venu d'un `.mjs`, d'un JSON de configuration ou
  // d'une assertion » franchit la vérification d'exhaustivité de TypeScript sans
  // rien déclencher. L'assertion du test REPRODUIT ce chemin ; elle ne le simule
  // pas.
  instance.get(
    '/essai/politique-inconnue',
    { config: { acces: { type: 'politique_inventee' } as unknown as PolitiqueAcces } },
    () => ({ atteint: true }),
  );

  // Une route dans un greffon ENCAPSULÉ : c'est la forme qu'auront toutes les routes
  // métier (`app.register(routesX, { prefix })`). Si le crochet ③ ne descendait pas
  // dans les instances filles, tout le produit serait hors garde-fou et les tests
  // ci-dessus, posés à la racine, ne le verraient pas.
  await instance.register(
    async (fille) => {
      fille.get('/encapsule', { config: { acces: { type: 'authentifie' } } }, (requete) => ({
        role: requete.utilisateur?.role ?? null,
      }));
      await Promise.resolve();
    },
    { prefix: '/essai/greffon' },
  );

  await instance.ready();

  for (const cle of Object.keys(comptes) as (keyof typeof comptes)[]) {
    jetons[cle] = signer(instance, comptes[cle]);
  }
}, 180_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// ① IDENTIFICATION — LE CROCHET QUI NE REFUSE JAMAIS
// =============================================================================
describe("crochet ① — l'identification ne refuse jamais", () => {
  it('route publique + jeton illisible → 200, et le refus est seulement MÉMORISÉ', async () => {
    const reponse = await appeler('/essai/public', 'ceci-nest-pas-un-jeton');
    expect(
      reponse.statut,
      "Le crochet ① doit poser l'identité ou rien, jamais refuser (note L2 §2.1).\n" +
        "S'il refusait, un flot de jetons bidons serait rejeté AVANT le compteur de\n" +
        'quota : le plafond disparaîtrait exactement pour le trafic qu’il doit borner.',
    ).toBe(200);
    expect(JSON.parse(reponse.corps)).toStrictEqual({
      identite: null,
      echec: 'UNAUTHENTICATED',
    });
  });

  it('route publique + jeton EXPIRÉ → 200, sans verrou qui s’auto-alimente', async () => {
    const instance = api();
    const expire = instance.jwt.sign({ sub: comptes.consultant }, { expiresIn: -60 });
    const reponse = await appeler('/essai/public', expire);
    expect(reponse.statut).toBe(200);
    expect(JSON.parse(reponse.corps)).toStrictEqual({ identite: null, echec: 'TOKEN_EXPIRED' });
  });

  it('route publique + jeton VALIDE → identité posée, sans aucune lecture de droits', async () => {
    const reponse = await appeler('/essai/public', jetons.consultant);
    expect(reponse.statut).toBe(200);
    expect(JSON.parse(reponse.corps)).toStrictEqual({
      identite: comptes.consultant,
      echec: null,
    });
  });

  it('un `Authorization` porteur de DEUX valeurs → refusé, jamais découpé', async () => {
    // CE QUE CE TEST DIT, ET CE QU'IL NE DIT PAS. Node ne conserve PAS les en-têtes
    // `Authorization` répétés — il garde le premier et jette les suivants ; ce n'est
    // donc pas la duplication HTTP qui est en jeu ici. En revanche, une valeur UNIQUE
    // portant deux jetons séparés par une virgule arrive bel et bien : client naïf,
    // intermédiaire qui concatène, couche de compatibilité.
    //
    // Ce qui compte n'est pas laquelle des deux serait « la bonne », c'est la
    // DIRECTION de l'échec : une implémentation qui découperait sur la virgule pour
    // garder le premier ferait passer un jeton pour valide alors qu'un autre a été
    // injecté à côté. Le refus doit être entier — on ne négocie pas un en-tête
    // d'authentification, on le rejette.
    const reponse = await appeler('/essai/authentifie', `${jetons.consultant}, Bearer forge`);
    expect(reponse.statut).toBe(401);
  });
});

// =============================================================================
// ③ AUTORISATION — LE SEUL CROCHET QUI REFUSE
// =============================================================================
describe('crochet ③ — autorisation', () => {
  it('route authentifiée, anonyme → 401 UNAUTHENTICATED', async () => {
    const reponse = await appeler('/essai/authentifie');
    expect(reponse.statut).toBe(401);
    expect(reponse.code).toBe('UNAUTHENTICATED');
  });

  it('route authentifiée, jeton valide → 200 et le RÔLE vient de la base', async () => {
    const reponse = await appeler('/essai/authentifie', jetons.lecteur);
    expect(reponse.statut).toBe(200);
    expect(JSON.parse(reponse.corps)).toStrictEqual({ role: 'lecteur', contexteAdmin: false });
  });

  it('rôle hors de la liste → 403 FORBIDDEN (et non 401 : l’identité est établie)', async () => {
    const reponse = await appeler('/essai/admin', jetons.consultant);
    expect(reponse.statut).toBe(403);
    expect(reponse.code).toBe('FORBIDDEN');
  });

  it('rôle listé → 200', async () => {
    const reponse = await appeler('/essai/admin', jetons.admin);
    expect(reponse.statut).toBe(200);
  });

  it('jeton expiré sur route protégée → 401 TOKEN_EXPIRED, pas un 401 générique', async () => {
    const expire = api().jwt.sign({ sub: comptes.admin }, { expiresIn: -60 });
    const reponse = await appeler('/essai/admin', expire);
    expect(
      reponse.code,
      "Le terrain doit savoir qu'il faut RAFRAÎCHIR, pas faire ressaisir un mot de\n" +
        "passe en clientèle. C'est le seul détail que 06 §10.2 autorise à concéder.",
    ).toBe('TOKEN_EXPIRED');
    expect(reponse.statut).toBe(401);
  });

  it('`sub` UUID valide mais INEXISTANT en base → 401, sans dire qu’il est inconnu', async () => {
    const fantome = signer(api(), uuidv7());
    const reponse = await appeler('/essai/authentifie', fantome);
    expect(reponse.statut).toBe(401);
    expect(
      reponse.code,
      'Compte inconnu et compte désactivé doivent rendre la MÊME chose : distinguer\n' +
        "les deux transformerait la route en oracle d'existence de comptes (06 §10.2).",
    ).toBe('UNAUTHENTICATED');
  });

  it('la politique descend dans un greffon ENCAPSULÉ', async () => {
    expect((await appeler('/essai/greffon/encapsule')).statut).toBe(401);
    expect((await appeler('/essai/greffon/encapsule', jetons.analyste)).statut).toBe(200);
  });

  it('la route HEAD engendrée automatiquement hérite de la politique', async () => {
    // Fastify fabrique une route HEAD pour chaque GET. Si elle n'héritait pas de
    // `config`, le démarrage échouerait — mais rien ne garantirait qu'elle hérite du
    // CROCHET. Une lecture par HEAD est une lecture.
    expect((await appeler('/essai/admin', undefined, 'HEAD')).statut).toBe(401);
    expect((await appeler('/essai/admin', jetons.consultant, 'HEAD')).statut).toBe(403);
  });

  it('les politiques `mission` et `proprietaire_session` exigent une identité', async () => {
    expect((await appeler('/essai/missions/018f0000-0000-7000-8000-00000000ffff')).statut).toBe(
      401,
    );
    expect((await appeler('/essai/sessions/018f0000-0000-7000-8000-00000000ffff')).statut).toBe(
      401,
    );
    expect(
      (await appeler('/essai/missions/018f0000-0000-7000-8000-00000000ffff', jetons.consultant))
        .statut,
      "Ces politiques garantissent l'identité, PAS la propriété de la ligne : le\n" +
        'filtrage par `mission_users` est porté par le dépôt (note L2 §2.1). Un test\n' +
        'qui attendrait 403 ici confondrait les deux garde-fous.',
    ).toBe(200);
  });
});

// =============================================================================
// RÉVOCATION INSTANTANÉE — LA PREUVE, C'EST LA REQUÊTE SUIVANTE
// =============================================================================
// =============================================================================
// L'ÉCHEC FERMÉ — LA BRANCHE QUI A BOUCHÉ UN TROU RÉEL, ET QUI N'AVAIT PAS DE TEST
// =============================================================================
// Ajouté par A17 le 2026-08-29, après mesure de couverture : `politique.ts`
// l.205 et 222-228 — la branche `default` du crochet ③ — n'était exercée par AUCUN
// test, alors qu'elle est LE correctif d'un défaut grave constaté douze heures
// plus tôt : un `type` hors de l'union ne correspondait à aucun `case`, la
// fonction se terminait normalement, ET LA REQUÊTE PASSAIT — 200 sur un compte
// actif muni d'un jeton valide.
//
// Ce qui rend ce trou vicieux, et ce que ce test doit donc prouver EXPLICITEMENT :
// le contrôle d'identité en amont masquait le défaut pour un ANONYME (401), ce qui
// le rendait invisible en revue rapide comme au méta-test du registre. La seule
// épreuve qui le voie est celle qui présente un compte ACTIF et un jeton VALIDE.
// C'est pour cela que la contre-épreuve ci-dessous n'est pas décorative : sans
// elle, un 403 obtenu parce que le compte est cassé se lirait comme un succès.
// =============================================================================
describe('crochet ③ — échec fermé : une politique hors de l’union', () => {
  it('@critique compte ACTIF + jeton VALIDE + politique inconnue → 403, jamais 200', async () => {
    const reponse = await appeler('/essai/politique-inconnue', jetons.consultant);

    expect(
      reponse.statut,
      'CECI EST LE TEST DU CORRECTIF. Un 200 signifie que la branche `default` a été\n' +
        'retirée ou neutralisée, et qu’une politique non reconnue laisse de nouveau\n' +
        'PASSER la requête. Le défaut est silencieux : rien d’autre ne le signale.',
    ).toBe(403);
    expect(
      reponse.code,
      'Le refus doit être FORBIDDEN : l’identité est établie et le compte est bon —\n' +
        'c’est la POLITIQUE qui n’est pas reconnue. Un UNAUTHENTICATED ici voudrait\n' +
        'dire que le refus vient de l’identité, donc que le vrai trou est ailleurs.',
    ).toBe('FORBIDDEN');
  });

  it('contre-épreuve : le MÊME jeton, sur une politique reconnue, est servi', async () => {
    // Sans ce cas, un compte désactivé ou un jeton périmé produirait aussi un refus
    // au-dessus, et le test passerait au vert sans rien prouver de la branche visée.
    const reponse = await appeler('/essai/authentifie', jetons.consultant);
    expect(reponse.statut).toBe(200);
  });

  it('le refus ne dépend pas du rôle : même un ADMIN est refusé', async () => {
    // La politique inconnue ne se « rattrape » pas par un rôle élevé. Si un admin
    // passait là où un consultant est refusé, c’est que le refus vient d’une
    // comparaison de rôles et non de l’échec fermé.
    const reponse = await appeler('/essai/politique-inconnue', jetons.admin);
    expect(reponse.statut).toBe(403);
  });
});

describe('révocation instantanée (06 §10.1)', () => {
  it('compte désactivé → 401 sur la requête qui suit IMMÉDIATEMENT la désactivation', async () => {
    const avant = await appeler('/essai/authentifie', jetons.aDesactiver);
    expect(avant.statut, 'le compte doit être servi tant qu’il est actif').toBe(200);

    await bd().query('UPDATE users SET is_active = false WHERE id = $1', [comptes.aDesactiver]);

    const apres = await appeler('/essai/authentifie', jetons.aDesactiver);
    expect(
      apres.statut,
      'Le MÊME jeton, toujours valide cryptographiquement, doit être refusé DÈS la\n' +
        "requête suivante. C'est la seule preuve de « désactivable instantanément » :\n" +
        'un jeton de 15 min qui porterait les droits laisserait un quart d’heure de\n' +
        'sursis à un compte révoqué. Vérifier la requête SQL ne prouverait pas cela.',
    ).toBe(401);
    expect(apres.code).toBe('UNAUTHENTICATED');
  });

  it('compte supprimé → 401 sur route protégée ; la route publique, elle, sert encore', async () => {
    const avant = await appeler('/essai/authentifie', jetons.aSupprimer);
    expect(avant.statut).toBe(200);

    await bd().query('DELETE FROM users WHERE id = $1', [comptes.aSupprimer]);

    expect((await appeler('/essai/authentifie', jetons.aSupprimer)).statut).toBe(401);
    // Une route publique n'interroge pas la base : elle continue de servir, et c'est
    // correct — elle ne rend rien qui appartienne à ce compte.
    expect((await appeler('/essai/public', jetons.aSupprimer)).statut).toBe(200);
  });
});

// =============================================================================
// ÉTANCHÉITÉ FINANCIÈRE — LA MARQUE `ContexteAdmin`
// =============================================================================
describe('marque `ContexteAdmin` (note L2 §2.2-2)', () => {
  it('posée pour un admin sur une route financière', async () => {
    const reponse = await appeler('/essai/financier', jetons.admin);
    expect(reponse.statut).toBe(200);
    expect(JSON.parse(reponse.corps)).toStrictEqual({
      contexteAdmin: true,
      porteur: comptes.admin,
    });
  });

  it('NULLE pour un non-admin, même quand la route l’autorise à entrer', async () => {
    const reponse = await appeler('/essai/financier', jetons.consultant);
    expect(reponse.statut, 'la route liste `consultant` : il entre').toBe(200);
    expect(
      JSON.parse(reponse.corps),
      'La marque ne suit PAS la liste de rôles de la route : elle suit le rôle relu en\n' +
        "base. Si elle suivait la liste, il suffirait d'ajouter un rôle à une route\n" +
        'financière pour ouvrir la table — exactement ce que la marque doit rendre\n' +
        'impossible.',
    ).toStrictEqual({ contexteAdmin: false, porteur: null });
  });

  it('NULLE sur une route non financière, même pour un admin', async () => {
    const reponse = await appeler('/essai/authentifie', jetons.admin);
    expect(JSON.parse(reponse.corps)).toStrictEqual({ role: 'admin', contexteAdmin: false });
  });
});

// =============================================================================
// MÉTA-TEST — TOUTE ENTRÉE DU REGISTRE A REÇU LE CROCHET ③
// =============================================================================
describe('méta-test — le registre est le périmètre, pas une liste écrite à la main', () => {
  it('chaque route NON publique du registre refuse l’anonyme ; chaque publique le sert', async () => {
    const registre = api().registreAcces;
    expect(registre.length, 'le registre doit être peuplé').toBeGreaterThan(0);

    const anomalies: string[] = [];
    for (const entree of registre) {
      for (const methode of entree.methodes) {
        if (methode !== 'GET' && methode !== 'HEAD') continue;
        // `/health/ready` interroge Redis et MinIO : son statut dépend de
        // l'environnement, pas de l'autorisation. On vérifie qu'elle n'est pas
        // REFUSÉE, ce qui est la seule propriété d'autorisation qui la concerne.
        const url = entree.url.replace(/:[^/]+/g, '018f0000-0000-7000-8000-00000000ffff');
        const reponse = await appeler(url, undefined, methode);
        const refusee = reponse.statut === 401 || reponse.statut === 403;
        if (entree.acces.type === 'public' && refusee) {
          anomalies.push(
            `${methode} ${entree.url} : publique mais REFUSÉE (${reponse.code ?? ''})`,
          );
        }
        if (entree.acces.type !== 'public' && !refusee) {
          anomalies.push(
            `${methode} ${entree.url} (${entree.acces.type}) : atteinte SANS identité, statut ${String(reponse.statut)}`,
          );
        }
      }
    }

    expect(
      anomalies,
      "Ce test n'énumère pas les routes auxquelles on a pensé : il énumère CELLES QUI\n" +
        "EXISTENT (registre `onRoute`). Une route ajoutée demain y entre d'elle-même.\n" +
        'Une anomalie ici signifie que le crochet ③ n’a pas été posé sur une route —\n' +
        'le cas exact que le contrôle `onReady` du socle prétend rendre impossible.',
    ).toStrictEqual([]);
  });
});
