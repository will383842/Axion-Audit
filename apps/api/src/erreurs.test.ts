// =============================================================================
// LOT L2 / T6 — LE GESTIONNAIRE D'ERREURS UNIQUE.
//
// Écrits par A16, qui n'a produit aucune des lignes testées (09 §5.6).
//
// ── LE DÉFAUT QUE CE FICHIER EMPÊCHE DE REVENIR ──────────────────────────────
// Une seule branche traitait tout le 4xx inconnu et le rendait `400 INVALID_PAYLOAD`.
// Conséquence : un refus d'authentification (401) et un refus de droits (403)
// sortaient en 400. Le front ne pouvait plus distinguer « reconnecte-toi » de
// « requête malformée », et le critère d'acceptation « → forbidden » devenait
// INFALSIFIABLE — tout sortant en 400, aucun test n'aurait pu le contredire.
//
// La correction est une TABLE. Une table se teste ligne à ligne, et son repli aussi :
// ce qui n'y figure pas doit continuer de retomber sur 400, sinon le correctif
// s'élargit au lieu de corriger.
//
// ── ET UNE PROPRIÉTÉ QUI NE SE VOIT PAS DANS LE CORPS DE LA RÉPONSE ──────────
// Sur 401/403, la ligne de journal ne doit contenir NI l'objet d'erreur, NI le jeton :
// le message d'une bibliothèque de jetons peut recopier l'en-tête reçu (11 §2 —
// aucune donnée personnelle dans les journaux). Le corps de la réponse est muet, mais
// c'est le JOURNAL qui part en clair dans les fichiers exportés.
//
// Traçabilité : E43 (conventions d'API), E33.
// =============================================================================
import { describe, expect, it } from 'vitest';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { z } from 'zod';

process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_erreurs';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

/** Sentinelle : elle joue le rôle du jeton porteur recopié par une bibliothèque. */
const SENTINELLE_JETON = 'eyJhbGciOiJIUzI1NiJ9.SENTINELLE_PORTEUR.zzz';

interface Banc {
  readonly app: FastifyInstance;
  readonly lignes: readonly Record<string, unknown>[];
}

/**
 * Une instance NUE avec le seul gestionnaire d'erreurs, et un journal capturé.
 * Nue à dessein : on éprouve le gestionnaire, pas l'assemblage de `app.ts`.
 *
 * ── POURQUOI LE JOURNAL EST ANNOTÉ `FastifyBaseLogger`, ET PAS SEULEMENT PASSÉ ──
 * Sans cette annotation, `Fastify()` infère le type CONCRET de pino
 * (`Logger<never, boolean>`) comme paramètre de journal de l'instance. Sous
 * `exactOptionalPropertyTypes` (11 §1), cette instance n'est alors PAS assignable au
 * `FastifyInstance` que réclame `enregistrerGestionErreurs` : le typage refuse, et
 * il a raison de refuser — deux instances paramétrées différemment ne sont pas la
 * même chose.
 *
 * L'annotation est la même que celle de `logger.ts` en production
 * (`export const loggerFastify: FastifyBaseLogger = logger`) : on élargit le type au
 * point d'entrée, une fois, plutôt que de forcer par une assertion à l'appel. C'est
 * une contrainte réelle du gestionnaire d'erreurs, pas un artefact de test — voir le
 * rapport A16, défaut D8.
 */
async function banc(): Promise<Banc> {
  const { default: pino } = await import('pino');
  const { enregistrerGestionErreurs } = await import('./erreurs.js');
  const lignes: Record<string, unknown>[] = [];
  const journal: FastifyBaseLogger = pino(
    { level: 'trace' },
    {
      write(morceau: string): void {
        lignes.push(JSON.parse(morceau) as Record<string, unknown>);
      },
    },
  );
  const app = Fastify({ loggerInstance: journal });
  enregistrerGestionErreurs(app);
  return { app, lignes };
}

interface Enveloppe {
  readonly statut: number;
  readonly code: string;
  readonly message: string;
  readonly details: { path: string; message: string }[] | undefined;
}

function lireEnveloppe(statut: number, corps: string): Enveloppe {
  const analyse: unknown = JSON.parse(corps);
  const schema = z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  });
  const resultat = schema.safeParse(analyse);
  if (!resultat.success) {
    throw new Error(
      `Le corps ne respecte pas l'enveloppe unique du 11 §3\n` +
        `{ error: { code, message, details? } } : ${corps}`,
    );
  }
  return {
    statut,
    code: resultat.data.error.code,
    message: resultat.data.error.message,
    details: resultat.data.error.details,
  };
}

/** Erreur de bibliothèque : un statut posé sur une `Error` ordinaire. */
function erreurDeBibliotheque(statut: number): Error {
  const erreur = new Error(`Format is Authorization: Bearer ${SENTINELLE_JETON}`);
  Object.assign(erreur, { statusCode: statut });
  return erreur;
}

// =============================================================================
// LA TABLE DES STATUTS CLIENT
// =============================================================================
describe('table des statuts client — le statut ne se perd plus en chemin', () => {
  const attendus: [number, number, string][] = [
    [400, 400, 'INVALID_PAYLOAD'],
    [401, 401, 'UNAUTHENTICATED'],
    [403, 403, 'FORBIDDEN'],
    [413, 413, 'PAYLOAD_TOO_LARGE'],
    [415, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [429, 429, 'RATE_LIMITED'],
    // Le repli est CONSERVÉ, et c'est délibéré : « ce défaut se corrige, il ne
    // s'élargit pas ». Un 4xx qu'aucune route n'a voulu reste un 400.
    [418, 400, 'INVALID_PAYLOAD'],
    [451, 400, 'INVALID_PAYLOAD'],
  ];

  it('chaque statut levé par un greffon rend le statut ET le code attendus', async () => {
    const { app } = await banc();
    for (const [leve] of attendus) {
      app.get(`/leve/${String(leve)}`, () => {
        throw erreurDeBibliotheque(leve);
      });
    }
    await app.ready();

    const observes: [number, number, string][] = [];
    for (const [leve] of attendus) {
      const reponse = await app.inject({ method: 'GET', url: `/leve/${String(leve)}` });
      const enveloppe = lireEnveloppe(reponse.statusCode, reponse.body);
      observes.push([leve, enveloppe.statut, enveloppe.code]);
    }

    expect(
      observes,
      'Chaque ligne est « statut levé → statut rendu, code rendu ». Un 401 ou un 403\n' +
        'qui redeviendrait 400 rendrait le critère d’acceptation « → forbidden »\n' +
        'INFALSIFIABLE, et la PWA afficherait « données invalides » à un auditeur dont\n' +
        'le jeton a simplement expiré.',
    ).toStrictEqual(attendus);

    await app.close();
  });

  it('le message rendu est en FRANÇAIS et ne recopie jamais celui de la bibliothèque', async () => {
    const { app } = await banc();
    app.get('/leve', () => {
      throw erreurDeBibliotheque(401);
    });
    await app.ready();
    const reponse = await app.inject({ method: 'GET', url: '/leve' });
    const enveloppe = lireEnveloppe(reponse.statusCode, reponse.body);
    expect(enveloppe.message, 'invariant 5 : interface 100 % en français').toBe(
      'Authentification requise.',
    );
    expect(
      reponse.body,
      'Le corps ne doit JAMAIS relayer le message de la bibliothèque : il peut contenir\n' +
        'l’en-tête reçu, donc le jeton porteur.',
    ).not.toContain('SENTINELLE_PORTEUR');
    await app.close();
  });
});

// =============================================================================
// AUCUNE ERREUR D'AUTHENTIFICATION NE SORT EN 400
// =============================================================================
describe('aucune erreur d’authentification ne sort en 400', () => {
  it('les six codes d’identité et de droits rendent 401 ou 403, jamais 400', async () => {
    const { AppError } = await import('@axion/shared');
    const { app } = await banc();
    const codes = [
      'UNAUTHENTICATED',
      'INVALID_CREDENTIALS',
      'TOKEN_EXPIRED',
      'TOKEN_REUSE_DETECTED',
      'FORBIDDEN',
      'NOT_HABILITATED',
    ] as const;

    for (const code of codes) {
      app.get(`/app/${code}`, () => {
        throw new AppError(code, 'Message français de refus.');
      });
    }
    await app.ready();

    const observes: [string, number][] = [];
    for (const code of codes) {
      const reponse = await app.inject({ method: 'GET', url: `/app/${code}` });
      const enveloppe = lireEnveloppe(reponse.statusCode, reponse.body);
      expect(enveloppe.code, 'le code du produit doit traverser intact').toBe(code);
      observes.push([code, enveloppe.statut]);
    }

    expect(observes).toStrictEqual([
      ['UNAUTHENTICATED', 401],
      ['INVALID_CREDENTIALS', 401],
      ['TOKEN_EXPIRED', 401],
      ['TOKEN_REUSE_DETECTED', 401],
      ['FORBIDDEN', 403],
      ['NOT_HABILITATED', 403],
    ]);

    await app.close();
  });
});

// =============================================================================
// LE JOURNAL — CE QUI N'A PAS LE DROIT D'Y ENTRER
// =============================================================================
describe('journal des refus', () => {
  it('sur 401 et 403, la ligne ne porte NI l’objet d’erreur NI le jeton', async () => {
    const { app, lignes } = await banc();
    app.get('/refus/401', () => {
      throw erreurDeBibliotheque(401);
    });
    app.get('/refus/403', () => {
      throw erreurDeBibliotheque(403);
    });
    await app.ready();
    await app.inject({ method: 'GET', url: '/refus/401' });
    await app.inject({ method: 'GET', url: '/refus/403' });

    const refus = lignes.filter((l) => l.msg === 'Accès refusé');
    expect(refus, 'un refus reste un signal de sécurité : il doit être tracé').toHaveLength(2);

    for (const ligne of refus) {
      expect(
        ligne.err,
        'A13 a écarté `err` DÉLIBÉRÉMENT : le message d’une bibliothèque de jetons peut\n' +
          'recopier l’en-tête reçu, donc le jeton porteur. Le rétablir « pour déboguer »\n' +
          'ferait sortir un secret d’authentification vers les fichiers de journal\n' +
          'exportés (11 §2, 06 §10.4).',
      ).toBeUndefined();
      expect(JSON.stringify(ligne)).not.toContain('SENTINELLE_PORTEUR');
      expect(ligne.code).toBeDefined();
      expect(ligne.url).toBeDefined();
    }

    await app.close();
  });

  it('413 et 429 restent muets — le quota est déjà tracé à sa source', async () => {
    const { app, lignes } = await banc();
    app.get('/muet/413', () => {
      throw erreurDeBibliotheque(413);
    });
    app.get('/muet/429', () => {
      throw erreurDeBibliotheque(429);
    });
    await app.ready();
    await app.inject({ method: 'GET', url: '/muet/413' });
    await app.inject({ method: 'GET', url: '/muet/429' });

    const bruit = lignes.filter((l) => l.msg === 'Accès refusé' || l.msg === 'Requête refusée');
    expect(
      bruit,
      'Journaliser deux fois le même événement de quota noierait le journal réel sous\n' +
        'le bruit d’exploitation — et c’est un événement à FORT volume par définition.',
    ).toStrictEqual([]);
    await app.close();
  });

  it('une erreur SERVEUR est journalisée en entier, et le client n’en voit rien', async () => {
    const { app, lignes } = await banc();
    app.get('/panne', () => {
      throw new Error(`détail interne ${SENTINELLE_JETON}`);
    });
    await app.ready();
    const reponse = await app.inject({ method: 'GET', url: '/panne' });
    const enveloppe = lireEnveloppe(reponse.statusCode, reponse.body);

    expect(enveloppe.statut).toBe(500);
    expect(enveloppe.code).toBe('INTERNAL_ERROR');
    expect(
      reponse.body,
      'Un message d’erreur bavard est une aide à l’attaquant (06 §10.2).',
    ).not.toContain('détail interne');

    const journal = lignes.filter((l) => l.msg === 'Erreur interne non gérée');
    expect(journal, 'le détail doit aller au journal, sinon la panne est indébogable').toHaveLength(
      1,
    );
    await app.close();
  });
});

// =============================================================================
// VALIDATION ET 404
// =============================================================================
describe('validation et ressource inconnue', () => {
  it('un échec Zod rend 400 VALIDATION_FAILED, le CHEMIN fautif, jamais la VALEUR', async () => {
    const { app } = await banc();
    app.get('/valide', () => {
      // La valeur est une donnée personnelle plausible : elle ne doit pas ressortir.
      z.object({ email: z.email() }).parse({ email: 'donnee.personnelle_SANS_ARROBASE' });
      return { ok: true };
    });
    await app.ready();
    const reponse = await app.inject({ method: 'GET', url: '/valide' });
    const enveloppe = lireEnveloppe(reponse.statusCode, reponse.body);

    expect(enveloppe.statut).toBe(400);
    expect(enveloppe.code).toBe('VALIDATION_FAILED');
    expect(enveloppe.details?.[0]?.path).toBe('email');
    expect(
      reponse.body,
      'Le chemin fautif suffit au front ; la VALEUR fautive peut être une donnée\n' +
        'personnelle (11 §2).',
    ).not.toContain('donnee.personnelle_SANS_ARROBASE');

    const messages = enveloppe.details?.map((d) => d.message) ?? [];
    for (const message of messages) {
      expect(
        /^(Invalid|Too small|Too big|Expected|Required)/.test(message),
        `invariant 5 : « ${message} » est affiché TEL QUEL par la PWA terrain.`,
      ).toBe(false);
    }
    await app.close();
  });

  it('une URL inconnue rend 404 NOT_FOUND, pas le repli 400', async () => {
    const { app } = await banc();
    await app.ready();
    const reponse = await app.inject({ method: 'GET', url: '/nulle-part' });
    const enveloppe = lireEnveloppe(reponse.statusCode, reponse.body);
    expect(enveloppe.statut).toBe(404);
    expect(enveloppe.code).toBe('NOT_FOUND');
    await app.close();
  });

  it('les 413 et 415 réels de Fastify passent par la table, pas par le repli', async () => {
    // Les deux tests ci-dessus lèvent des erreurs FABRIQUÉES. Ceux-ci font lever
    // FASTIFY lui-même : c'est la seule façon de savoir que les statuts que le cadre
    // produit vraiment sont ceux que la table connaît.
    const { app } = await banc();
    app.post('/etroite', { bodyLimit: 32 }, () => ({ ok: true }));
    await app.ready();

    const gros = await app.inject({
      method: 'POST',
      url: '/etroite',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ champ: 'x'.repeat(200) }),
    });
    expect(lireEnveloppe(gros.statusCode, gros.body)).toMatchObject({
      statut: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });

    const media = await app.inject({
      method: 'POST',
      url: '/etroite',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });
    expect(
      lireEnveloppe(media.statusCode, media.body),
      '`UNSUPPORTED_MEDIA_TYPE` était déclaré dans ERROR_CODES et STRICTEMENT\n' +
        'inatteignable : le repli le réécrivait en 400.',
    ).toMatchObject({ statut: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });

    await app.close();
  });
});
