// =============================================================================
// LOT L2 / T6 — LE QUOTA, DANS SES TROIS SENS.
//
// Écrits par A16, qui n'a produit aucune des lignes testées (09 §5.6).
//
// ── POURQUOI TROIS SENS ET PAS DEUX ──────────────────────────────────────────
// Le contrat 11 §3 dit « global 300 req/min/**token** ». La note de conception
// proposait deux scénarios pour le prouver — et TOUS DEUX présentent un jeton :
//   · 301 requêtes, 2 jetons, 1 IP → aucun refus   (attrape le retour à `r.ip`)
//   · 301 requêtes, 1 jeton, 2 IP  → refus         (attrape une clé composite)
// Un générateur de clé AMPUTÉ DE SON REPLI SUR L'IP les passerait tous les deux, et
// rendrait le flot ANONYME — login, jetons invalides, sondes — sans plafond. Or c'est
// exactement le flot que le quota existe pour borner. D'où le troisième sens, qui
// n'était dans aucune liste :
//   · 301 requêtes ANONYMES, 1 IP → refus
//
// ── ET UNE PROPRIÉTÉ D'ORDRE QUE LE QUOTA IMPOSE À TOUT LE SOCLE ─────────────
// La clé vient d'un sujet CRYPTOGRAPHIQUEMENT VÉRIFIÉ, posé par le crochet ①. Lire un
// `sub` non vérifié laisserait forger un quota illimité en changeant de jeton bidon à
// chaque requête. Le dernier test de ce fichier mesure cela : un flot de jetons
// INVALIDES doit rester compté sur une seule clé.
//
// Pourquoi `unit` et non `integration` : la route d'épreuve est PUBLIQUE, donc le
// crochet ③ ne lit jamais `users`. Aucune base n'est touchée — un test qui démarrerait
// un conteneur pour compter des refus serait un test d'intégration qui s'ignore.
//
// Traçabilité : E5, E43.
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';

process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_quota';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

/** 11 §3 : « global 300 req/min/token ». La 301ᵉ est celle qui doit tomber. */
const PLAFOND = 300;
const URL_EPREUVE = '/v1/essai-quota';

/**
 * Une app RÉELLE (`construireApp`) plus une seule route publique.
 * Réelle à dessein : c'est l'assemblage de `app.ts` — l'ordre des crochets et le
 * générateur de clé — qui est éprouvé, pas une reconstruction de circonstance qui
 * pourrait diverger de la production sans que rien ne le signale.
 */
async function appDEpreuve(): Promise<FastifyInstance> {
  const { construireApp } = await import('../app.js');
  const app = await construireApp();
  app.get(URL_EPREUVE, { config: { acces: { type: 'public' } } }, () => ({ ok: true }));
  await app.ready();
  return app;
}

interface Appel {
  readonly ip: string;
  readonly jeton?: string;
}

/** Envoie `nombre` requêtes et rend la liste des statuts, dans l'ordre. */
async function rafale(
  app: FastifyInstance,
  nombre: number,
  choisir: (index: number) => Appel,
): Promise<number[]> {
  const statuts: number[] = [];
  for (let index = 0; index < nombre; index += 1) {
    const appel = choisir(index);
    const reponse = await app.inject({
      method: 'GET',
      url: URL_EPREUVE,
      headers: {
        'x-forwarded-for': appel.ip,
        ...(appel.jeton === undefined ? {} : { authorization: `Bearer ${appel.jeton}` }),
      },
    });
    statuts.push(reponse.statusCode);
  }
  return statuts;
}

function compter(statuts: readonly number[], valeur: number): number {
  return statuts.filter((s) => s === valeur).length;
}

describe('quota global — la clé est le SUJET DU JETON, l’IP en repli', () => {
  // Le premier chargement des modules applicatifs coûte ~3 s. Le laisser DANS le
  // premier test lui ferait frôler la limite de 5 s du projet `unit` : le test
  // deviendrait intermittent sur une machine chargée, et une suite intermittente
  // finit par être ignorée. Le coût est payé ici, une fois, hors chronomètre.
  beforeAll(async () => {
    await import('../app.js');
    await import('./jetons.js');
  });

  it('301 requêtes · 2 jetons · 1 SEULE IP → AUCUN refus', async () => {
    const app = await appDEpreuve();
    const { signerJetonAcces } = await import('./jetons.js');
    const jetonA = signerJetonAcces(app, uuidv7());
    const jetonB = signerJetonAcces(app, uuidv7());

    const statuts = await rafale(app, PLAFOND + 1, (index) => ({
      ip: '203.0.113.7',
      jeton: index % 2 === 0 ? jetonA : jetonB,
    }));

    expect(
      compter(statuts, 429),
      'Derrière le NAT d’un client, une équipe entière partage UNE adresse. Une clé\n' +
        'indexée sur l’IP ferait qu’une synchronisation de fin de journée consomme le\n' +
        'quota de tout le monde : un auditeur étranglerait le collègue assis à côté de\n' +
        'lui, et personne ne comprendrait pourquoi.',
    ).toBe(0);
    expect(compter(statuts, 200)).toBe(PLAFOND + 1);

    await app.close();
  });

  it('301 requêtes · 1 jeton · 2 IP → refus, et exactement à la 301ᵉ', async () => {
    const app = await appDEpreuve();
    const { signerJetonAcces } = await import('./jetons.js');
    const jeton = signerJetonAcces(app, uuidv7());

    const statuts = await rafale(app, PLAFOND + 1, (index) => ({
      ip: index % 2 === 0 ? '203.0.113.7' : '198.51.100.9',
      jeton,
    }));

    expect(
      statuts.slice(0, PLAFOND).every((s) => s === 200),
      'Les 300 premières doivent passer : un plafond qui tombe trop tôt est aussi\n' +
        'faux qu’un plafond qui ne tombe jamais.',
    ).toBe(true);
    expect(
      statuts[PLAFOND],
      'Changer d’adresse ne doit RIEN offrir : le compteur suit le porteur du jeton,\n' +
        'pas le chemin réseau. Une clé composite (jeton + IP) rendrait le plafond\n' +
        'contournable par n’importe quel client multi-domicilié.',
    ).toBe(429);

    await app.close();
  });

  it('301 requêtes ANONYMES · 1 IP → refus : le repli sur l’IP tient', async () => {
    const app = await appDEpreuve();

    const statuts = await rafale(app, PLAFOND + 1, () => ({ ip: '203.0.113.7' }));

    expect(
      statuts[PLAFOND],
      'C’EST LE SEUL DES TROIS SENS QUI ATTRAPE LA SUPPRESSION DU REPLI.\n' +
        'Sans repli sur l’IP, les requêtes non authentifiées — login, jetons invalides,\n' +
        'sondes — n’ont plus aucune clé, donc plus aucun plafond : basculer « sur le\n' +
        'jeton » sans repli aurait rendu le flot anonyme ILLIMITÉ, c’est-à-dire aurait\n' +
        'ouvert exactement ce que le quota existe pour fermer.',
    ).toBe(429);
    expect(compter(statuts, 200)).toBe(PLAFOND);

    await app.close();
  });

  it('301 requêtes ANONYMES réparties sur 2 IP → AUCUN refus : le repli DISCRIMINE', async () => {
    // ═══════════════════════════════════════════════════════════════════════════
    // C'EST CE TEST, ET LUI SEUL, QUI ATTRAPE L'AMPUTATION DU REPLI.
    // ═══════════════════════════════════════════════════════════════════════════
    // MESURÉ, contre l'intuition — et contre ce que la note de conception et le
    // message de livraison affirmaient tous les deux. En remplaçant le générateur
    // par `(r) => r.identite?.utilisateurId`, SANS repli :
    //   · 301 anonymes · 1 IP  → refus au n°301   → le test « anonyme » reste VERT
    //   · les trois autres sens → verts également
    // Le troisième sens ne prouvait donc PAS ce qu'il annonçait. La raison est que
    // le greffon accepte une clé `undefined` : il ne cesse pas de compter, il
    // range TOUT LE TRAFIC ANONYME DE LA PLANÈTE DANS UN SEUL COMPTEUR.
    //
    // La conséquence réelle n'est donc pas « le flot anonyme devient illimité »,
    // c'est PIRE et dans l'autre sens : 300 requêtes par minute suffiraient à
    // épuiser le compteur commun et à REFUSER LE LOGIN À TOUT LE MONDE — un déni
    // de service à coût nul, ouvert à n'importe qui, sur la seule route par
    // laquelle un auditeur bloqué en clientèle peut revenir.
    //
    // Ce que ce test mesure est la seule propriété qui distingue les deux
    // implémentations : deux adresses anonymes DIFFÉRENTES ont des compteurs
    // SÉPARÉS. Deux postes derrière deux connexions ne se gênent pas.
    const app = await appDEpreuve();

    const statuts = await rafale(app, PLAFOND + 1, (index) => ({
      ip: index % 2 === 0 ? '203.0.113.7' : '198.51.100.9',
    }));

    expect(
      compter(statuts, 429),
      'Sans repli sur l’IP, ces 301 requêtes tombent dans UN SEUL compteur et la\n' +
        '301ᵉ est refusée. Avec le repli, chaque adresse a le sien : ~150 chacune,\n' +
        'aucun refus. C’est la seule mesure qui sépare les deux.',
    ).toBe(0);

    await app.close();
  });

  it('301 requêtes à JETONS BIDONS · 1 IP → refus : l’identification ne court-circuite pas le compteur', async () => {
    // La preuve de l'ORDRE des crochets, mesurée par ce qu'elle produit.
    // Si ① refusait au lieu de mémoriser, le rejet tomberait AVANT le compteur : la
    // rafale rendrait 301 refus d'authentification et JAMAIS de 429 — une attaque par
    // jetons bidons redeviendrait gratuite, illimitée et invisible dans les compteurs.
    const app = await appDEpreuve();

    const statuts = await rafale(app, PLAFOND + 1, (index) => ({
      ip: '203.0.113.7',
      // Un jeton DIFFÉRENT à chaque requête : c'est la forme exacte de l'attaque que
      // la note redoute — celle qui, avec un `sub` non vérifié, forgerait une clé
      // neuve à chaque coup et ne serait jamais comptée.
      jeton: `bidon-${String(index)}`,
    }));

    expect(
      statuts[PLAFOND],
      'La route est publique : un jeton illisible ne doit pas empêcher de servir, mais\n' +
        'il ne doit pas non plus faire disparaître la requête des compteurs.',
    ).toBe(429);
    expect(compter(statuts, 200)).toBe(PLAFOND);

    await app.close();
  });
});
