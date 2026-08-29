// =============================================================================
// LOT L2 / T6 — FRAPPE ET VÉRIFICATION DES JETONS D'ACCÈS.
//
// Écrits par A16, qui n'a produit aucune des lignes testées (09 §5.6).
//
// ── CE QUE CE FICHIER GARDE, ET QUI NE SE VOIT PAS EN LECTURE ────────────────
// 06 §10.2 : la réponse ne dit JAMAIS ce qui a échoué. Un message qui distinguerait
// « signature invalide » de « utilisateur inconnu » est un ORACLE offert à
// l'attaquant : il transforme une route en outil d'énumération de comptes.
// La propriété n'est donc pas « chaque cas rend une erreur » — elle est
// « TOUS LES CAS RENDENT LA MÊME ». Un test cas par cas la manquerait : c'est
// l'ensemble des réponses, réduit à un seul élément, qui la prouve.
//
// `TOKEN_EXPIRED` est la SEULE exception concédée, parce qu'elle est déductible sans
// risque (le client connaît l'`exp` de son propre jeton) et qu'elle évite de faire
// ressaisir un mot de passe à un auditeur en clientèle.
//
// Traçabilité : E5, E43.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';

const SECRET_ACCES = '11'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '22'.repeat(32);

process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_jetons';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= SECRET_ACCES;
process.env.JWT_REFRESH_SECRET ??= SECRET_RAFRAICHISSEMENT;
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

const SUJET = '018f7a3c-0000-7000-8000-0000000000a1';

/** Instance nue portant seulement le greffon de jetons — aucune route, aucune base. */
async function instanceJetons(): Promise<FastifyInstance> {
  const { enregistrerJetons } = await import('./jetons.js');
  const app = Fastify();
  await enregistrerJetons(app);
  await app.ready();
  return app;
}

function base64url(valeur: object): string {
  return Buffer.from(JSON.stringify(valeur)).toString('base64url');
}

/**
 * Frappe un JWT À LA MAIN. Indispensable : la bibliothèque REFUSE de produire les
 * jetons qu'il faut éprouver (algorithme `none`, `sub` absent, mauvais secret).
 * Sa fidélité est prouvée par la contre-épreuve du premier test — sans quoi tous les
 * refus attendus plus bas pourraient venir d'un outil de test cassé plutôt que du
 * code testé, et le fichier entier serait un faux vert.
 */
function frapperBrut(
  charge: Record<string, unknown>,
  secret: string,
  algorithme: 'HS256' | 'HS512' | 'none' = 'HS256',
): string {
  const entete = base64url({ alg: algorithme, typ: 'JWT' });
  const corps = base64url(charge);
  if (algorithme === 'none') return `${entete}.${corps}.`;
  const signature = createHmac(algorithme === 'HS512' ? 'sha512' : 'sha256', secret)
    .update(`${entete}.${corps}`)
    .digest('base64url');
  return `${entete}.${corps}.${signature}`;
}

function maintenant(): number {
  return Math.floor(Date.now() / 1000);
}

/** Charge utile bien formée, valide dix minutes. */
function chargeValide(sujet: string = SUJET): Record<string, unknown> {
  return { sub: sujet, iat: maintenant(), exp: maintenant() + 600 };
}

interface Refus {
  readonly code: string;
  readonly message: string;
}

/** Vérifie et rend le refus. Lève si le jeton est ACCEPTÉ — c'est alors le défaut. */
async function refusDe(app: FastifyInstance, jeton: string, cas: string): Promise<Refus> {
  const { verifierJetonAcces } = await import('./jetons.js');
  const { AppError } = await import('@axion/shared');
  try {
    verifierJetonAcces(app, jeton);
  } catch (erreur: unknown) {
    if (erreur instanceof AppError) return { code: erreur.code, message: erreur.message };
    throw new Error(
      `Cas « ${cas} » : la vérification a levé autre chose qu'une AppError.\n` +
        `Le gestionnaire d'erreurs ne doit JAMAIS avoir à connaître fast-jwt : une\n` +
        `erreur de bibliothèque qui remonte telle quelle sort en 400 INVALID_PAYLOAD\n` +
        `et peut recopier l'en-tête reçu — donc le jeton — dans les journaux.`,
    );
  }
  throw new Error(
    `Cas « ${cas} » : jeton ACCEPTÉ alors qu'il devait être refusé.\n` +
      `Ce cas est l'un des chemins par lesquels une identité se forge.`,
  );
}

// =============================================================================
// ALLER-RETOUR
// =============================================================================
describe('aller-retour', () => {
  it('un jeton frappé par l’application se relit, et ne porte QUE l’identité', async () => {
    const { signerJetonAcces, verifierJetonAcces } = await import('./jetons.js');
    const app = await instanceJetons();

    const jeton = signerJetonAcces(app, SUJET);
    const charge = verifierJetonAcces(app, jeton);

    expect(charge.sub).toBe(SUJET);
    expect(
      Object.keys(charge).sort(),
      'Note L2 §2.1 : « le jeton porte l’identité, JAMAIS les droits ». Un `role` ou\n' +
        'un `is_active` dans le jeton, c’est une révocation qui arrive un quart d’heure\n' +
        'trop tard — exactement ce que la relecture de `users` a coûté à supprimer.',
    ).toStrictEqual(['exp', 'iat', 'sub']);
    expect(charge.exp - charge.iat, '11 §3 : jeton d’accès de 15 minutes').toBe(15 * 60);

    await app.close();
  });

  it('contre-épreuve de l’outillage : un jeton frappé À LA MAIN est accepté', async () => {
    // Si ce test échouait, TOUS les refus attendus plus bas seraient des faux verts :
    // ils prouveraient que mon frappeur est cassé, pas que le code refuse.
    const { verifierJetonAcces } = await import('./jetons.js');
    const app = await instanceJetons();
    const charge = verifierJetonAcces(app, frapperBrut(chargeValide(), SECRET_ACCES));
    expect(charge.sub).toBe(SUJET);
    await app.close();
  });
});

// =============================================================================
// LE SEUL DÉTAIL CONCÉDÉ : L'EXPIRATION
// =============================================================================
describe('expiration', () => {
  it('jeton expiré → TOKEN_EXPIRED, et non le refus générique', async () => {
    const app = await instanceJetons();
    const expire = frapperBrut(
      { sub: SUJET, iat: maintenant() - 3600, exp: maintenant() - 60 },
      SECRET_ACCES,
    );
    const refus = await refusDe(app, expire, 'jeton expiré');
    expect(
      refus.code,
      'Sans ce code distinct, la PWA terrain ferait ressaisir un mot de passe à un\n' +
        'auditeur en clientèle alors qu’un simple rafraîchissement suffisait.',
    ).toBe('TOKEN_EXPIRED');
    await app.close();
  });
});

// =============================================================================
// TOUT LE RESTE : UN SEUL ET MÊME REFUS
// =============================================================================
describe('les refus ne renseignent jamais sur leur cause', () => {
  it('huit jetons invalides pour huit raisons différentes rendent UN SEUL refus', async () => {
    const app = await instanceJetons();
    const { signerJetonAcces } = await import('./jetons.js');
    const valide = signerJetonAcces(app, SUJET);
    const [entete, corps] = valide.split('.');

    const cas: [string, string][] = [
      // Signature falsifiée : la charge utile est réécrite, la signature ne suit pas.
      [
        'signature falsifiée',
        `${entete ?? ''}.${base64url(chargeValide('018f7a3c-0000-7000-8000-0000000000ff'))}.${(corps ?? '').slice(0, 43)}`,
      ],
      // Algorithme `none` : la confusion d'algorithme, l'attaque que la liste blanche
      // `algorithms: ['HS256']` existe pour fermer. Sans elle, le jeton choisirait
      // lui-même comment on le vérifie.
      ['algorithme none', frapperBrut(chargeValide(), '', 'none')],
      // Algorithme CHANGÉ mais signature authentique (HS512 avec le bon secret).
      // C'est le seul cas qui distingue la liste blanche `algorithms: ['HS256']` du
      // comportement par défaut de la bibliothèque : sans elle, le jeton choisit
      // lui-même comment on le vérifie, et le jour où la clé cesse d'être symétrique
      // ce choix devient l'attaque. Mesuré : ce cas est ACCEPTÉ si la liste tombe.
      [
        'algorithme HS512 authentiquement signé',
        frapperBrut(chargeValide(), SECRET_ACCES, 'HS512'),
      ],
      ['jeton tronqué', valide.slice(0, valide.length - 6)],
      ['jeton vide de segments', 'a.b.c'],
      // `sub` authentique mais non conforme : la signature passe, la FORME doit
      // arrêter le jeton avant qu'il n'aille chercher un utilisateur avec une clé
      // absurde.
      ['sub non conforme', frapperBrut(chargeValide('pas-un-uuid'), SECRET_ACCES)],
      ['sub absent', frapperBrut({ iat: maintenant(), exp: maintenant() + 600 }, SECRET_ACCES)],
      // Le secret de rafraîchissement est DISTINCT (11 §3). Un jeton signé avec lui
      // ne doit pas ouvrir la porte de l'accès : confondre les deux annulerait la
      // détection de réutilisation (06 §10.1).
      [
        'signé avec le secret de rafraîchissement',
        frapperBrut(chargeValide(), SECRET_RAFRAICHISSEMENT),
      ],
    ];

    const refus: Refus[] = [];
    for (const [nom, jeton] of cas) refus.push(await refusDe(app, jeton, nom));

    const distincts = [...new Set(refus.map((r) => `${r.code} | ${r.message}`))];
    expect(
      distincts,
      'UN SEUL refus distinct est attendu. Chaque variante supplémentaire est un bit\n' +
        'd’information rendu à l’attaquant : « la signature était bonne mais pas le\n' +
        'compte » lui dit que le compte n’existe pas ; « forme invalide » lui dit que sa\n' +
        'clé est la bonne. Le refus doit être MUET sur sa cause.\n' +
        `Refus observés : ${JSON.stringify(refus)}`,
    ).toStrictEqual(['UNAUTHENTICATED | Authentification requise.']);

    await app.close();
  });

  it('une erreur qui n’est pas une erreur de jeton retombe sur le refus générique', async () => {
    const { traduireErreurJeton } = await import('./jetons.js');
    // Le filet du crochet ① : si une bibliothèque venait à lever autre chose, on ne
    // veut ni fuite de message, ni erreur non traduite qui sortirait en 400.
    for (const valeur of [null, 'texte', new Error('sans code'), { code: 42 }]) {
      const traduite = traduireErreurJeton(valeur);
      expect(traduite.code).toBe('UNAUTHENTICATED');
      expect(traduite.message).toBe('Authentification requise.');
    }
  });
});

// =============================================================================
// LE SECRET EST FIGÉ AU DÉMARRAGE — CE QUE ÇA VEUT DIRE, ÉCRIT UNE FOIS
// =============================================================================
describe('secret de signature', () => {
  it('changer `JWT_ACCESS_SECRET` après le démarrage ne change RIEN pour l’instance vivante', async () => {
    // Question posée à la revue : « et si le secret change pendant l’exécution ? »
    // Réponse mesurée : il est capturé à l’enregistrement du greffon. Une rotation de
    // secret exige donc un REDÉMARRAGE — et pendant ce temps, les jetons frappés avec
    // l’ancien secret restent valides jusqu’à leur `exp`. Ce n’est pas un défaut, mais
    // ça doit être SU : une rotation d’urgence après fuite de secret n’invalide rien
    // par elle-même, seule la désactivation des comptes le fait (06 §10.1).
    const { signerJetonAcces, verifierJetonAcces } = await import('./jetons.js');
    const app = await instanceJetons();
    const jeton = signerJetonAcces(app, SUJET);

    const ancien = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = '33'.repeat(32);
    try {
      expect(verifierJetonAcces(app, jeton).sub).toBe(SUJET);
    } finally {
      process.env.JWT_ACCESS_SECRET = ancien;
    }
    await app.close();
  });
});
