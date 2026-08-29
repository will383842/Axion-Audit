// =============================================================================
// LOT L2 / T6 — LES MÉTA-TESTS DU SOCLE D'AUTORISATION.
//
// Écrits par A16, qui n'a produit aucune des lignes testées (09 §5.6), depuis la
// note `docs/conception/LOT_L2.md` §2.1 et §5.
//
// ── CE FICHIER EXISTE PARCE QUE LE FILET N'EXISTAIT PAS ──────────────────────
// La note affirmait qu'une route sans politique ferait « virer au rouge la suite
// d'intégration, qui construit l'app ». A13 l'a mesuré et démenti : AUCUN test ne
// construisait l'app. Le garde-fou de totalité fonctionnait — et rien ne le
// protégeait. Une route ajoutée sans politique aurait cassé le démarrage EN
// PRODUCTION sans casser la CI : le pire des deux mondes, un garde-fou dont la
// violation n'est découverte qu'au déploiement.
//
// Ces tests testent LE GARDE-FOU, pas la fonctionnalité. C'est pour cela qu'ils
// passent avant les tests de fonctionnalité et qu'ils vivent dans le projet `unit` :
// ils ne touchent aucune base et doivent rester exécutables sur un poste nu.
//
// ── UN POINT DE VOCABULAIRE QUE LA NOTE AVAIT APPROXIMÉ ──────────────────────
// La note dit « `app.ready()` doit lever ». MESURÉ : Fastify 5 exécute ses crochets
// `onRoute` IMMÉDIATEMENT quand la route est déclarée sur une instance déjà amorcée
// — le refus tombe donc dès `app.get(…)`, avant tout `ready()`. Il ne retombe à
// `ready()` que pour une route déclarée dans un greffon ENCAPSULÉ, dont le
// chargement est différé. Les deux chemins sont éprouvés ici : n'en tester qu'un
// laisserait la moitié du produit hors garde-fou, puisque toutes les routes métier
// vivront dans des greffons.
//
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E33 (sécurité).
// =============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// -----------------------------------------------------------------------------
// Environnement AVANT tout chargement de module applicatif.
//
// `apps/api/src/config.ts` valide `process.env` À L'IMPORT et refuse de se charger
// s'il manque une variable. Les imports de ce fichier sont donc DYNAMIQUES et faits
// dans les tests : un `import` statique serait hissé au-dessus de ces lignes.
// Secrets FACTICES (11 §2) : 64 caractères hexadécimaux = les 32 octets exigés.
// -----------------------------------------------------------------------------
process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_meta';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

// Le PREMIER chargement des modules applicatifs coûte ~3 s (Fastify, helmet, quota,
// Drizzle, Zod). Le laisser dans le premier test lui fait dépasser la limite de 5 s du
// projet `unit` DÈS QUE LA MACHINE EST CHARGÉE — mesuré : 3,6 s en fichier isolé,
// 5,3 s dans la suite complète. Un test qui échoue une fois sur deux selon la charge
// n'est pas un test : il apprend à l'équipe à relancer au lieu de lire. Le coût est
// payé ici, une fois, hors chronomètre.
beforeAll(async () => {
  await import('../app.js');
  await import('./politique.js');
});

/** Le message d'une valeur levée, quelle que soit sa nature. */
function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Exécute `action` et rend le message de ce qu'elle lève — ou `null` si elle ne
 * lève pas. Volontairement plus explicite que `rejects.toThrow` : un garde-fou de
 * démarrage doit être jugé sur CE QU'IL DIT, pas seulement sur le fait qu'il crie.
 * Un message sans le nom de la route fautive laisse le développeur suivant chercher
 * dans cinquante fichiers.
 */
async function messageLeve(action: () => Promise<void>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (erreur: unknown) {
    return messageDe(erreur);
  }
}

/** Ferme sans jamais masquer l'échec du test par une erreur de fermeture. */
async function fermer(app: FastifyInstance | undefined): Promise<void> {
  if (app === undefined) return;
  try {
    await app.close();
  } catch {
    // Une app qui n'a pas démarré n'a rien à fermer : ce n'est pas le sujet du test.
  }
}

// =============================================================================
// MÉTA-TEST 1 — UNE ROUTE SANS POLITIQUE EMPÊCHE L'API DE DÉMARRER
// =============================================================================
describe('méta-test 1 — totalité : aucune route sans politique', () => {
  it('route déclarée à la racine SANS `config.acces` → refus, EN NOMMANT méthode et URL', async () => {
    const { construireApp } = await import('../app.js');
    let app: FastifyInstance | undefined;

    const message = await messageLeve(async () => {
      app = await construireApp();
      app.get('/route-sans-politique', () => ({ ok: true }));
      await app.ready();
    });
    await fermer(app);

    expect(
      message,
      'Invariant 3 : « le RBAC serveur est SYSTÉMATIQUE ». Systématique ne se tient pas\n' +
        'par la discipline mais par un refus de démarrer. Si ce test passe au vert sans\n' +
        'levée, une route sans politique est redevenue une route SILENCIEUSEMENT OUVERTE.',
    ).not.toBeNull();
    expect(message).toContain('GET');
    expect(
      message,
      "Le message doit NOMMER la route fautive : c'est ce qui sépare un refus de\n" +
        'démarrer exploitable d’une panne à chercher dans tout le dépôt.',
    ).toContain('/route-sans-politique');
    expect(message).toContain('config.acces');
  });

  it('route déclarée dans un greffon ENCAPSULÉ sans politique → refus à `ready()`', async () => {
    // Toutes les routes métier vivront dans des greffons (`app.register(routes, {
    // prefix })`). Leur chargement est DIFFÉRÉ : le refus ne tombe plus à la
    // déclaration mais au démarrage. Ne tester que la forme racine laisserait la
    // totalité du produit hors du garde-fou éprouvé.
    const { construireApp } = await import('../app.js');
    let app: FastifyInstance | undefined;

    const message = await messageLeve(async () => {
      app = await construireApp();
      const instance = app;
      await instance.register(
        async (fille) => {
          fille.get('/orpheline', () => ({ ok: true }));
          await Promise.resolve();
        },
        { prefix: '/v1/greffon' },
      );
      await instance.ready();
    });
    await fermer(app);

    expect(message).not.toBeNull();
    expect(message).toContain('/v1/greffon/orpheline');
  });

  it('contre-épreuve : la MÊME route AVEC une politique démarre', async () => {
    // Sans cette contre-épreuve, un garde-fou qui lèverait sur TOUTE route passerait
    // les deux tests ci-dessus. Un test qui ne peut pas distinguer le bon cas du
    // mauvais ne prouve rien.
    const { construireApp } = await import('../app.js');
    const app = await construireApp();
    app.get('/route-avec-politique', { config: { acces: { type: 'public' } } }, () => ({
      ok: true,
    }));
    await expect(app.ready()).resolves.toBeDefined();
    await fermer(app);
  });
});

// =============================================================================
// MÉTA-TEST 2 — UNE POLITIQUE QUI NOMME UN PARAMÈTRE ABSENT DE L'URL
// =============================================================================
describe('méta-test 2 — le paramètre nommé par la politique existe dans l’URL', () => {
  it('`parametreMission` absent de l’URL → refus de démarrer', async () => {
    const { construireApp } = await import('../app.js');
    let app: FastifyInstance | undefined;

    const message = await messageLeve(async () => {
      app = await construireApp();
      app.get(
        '/v1/missions/:id',
        { config: { acces: { type: 'mission', parametreMission: 'missionId' } } },
        () => ({ ok: true }),
      );
      await app.ready();
    });
    await fermer(app);

    expect(
      message,
      'Une faute de frappe dans le nom du paramètre désactiverait SILENCIEUSEMENT le\n' +
        'cadrage par mission : la route continuerait de répondre, sans plus jamais\n' +
        'savoir de quelle mission elle parle.',
    ).not.toBeNull();
    expect(message).toContain(':missionId');
    expect(message).toContain('/v1/missions/:id');
  });

  it('`parametreSession` absent de l’URL → refus de démarrer', async () => {
    const { construireApp } = await import('../app.js');
    let app: FastifyInstance | undefined;

    const message = await messageLeve(async () => {
      app = await construireApp();
      app.get(
        '/v1/sessions/:identifiant',
        { config: { acces: { type: 'proprietaire_session', parametreSession: 'sessionId' } } },
        () => ({ ok: true }),
      );
      await app.ready();
    });
    await fermer(app);

    expect(message).not.toBeNull();
    expect(message).toContain(':sessionId');
  });

  it('contre-épreuve : le paramètre PRÉSENT démarre, y compris avec une contrainte', async () => {
    const { construireApp } = await import('../app.js');
    const app = await construireApp();
    app.get(
      '/v1/missions/:missionId',
      { config: { acces: { type: 'mission', parametreMission: 'missionId' } } },
      () => ({ ok: true }),
    );
    app.get(
      '/v1/sessions/:sessionId(^[0-9a-fA-F-]+$)',
      { config: { acces: { type: 'proprietaire_session', parametreSession: 'sessionId' } } },
      () => ({ ok: true }),
    );
    await expect(app.ready()).resolves.toBeDefined();
    await fermer(app);
  });
});

// =============================================================================
// MÉTA-TEST 3 — UNE ROUTE ENREGISTRÉE AVANT LE SOCLE
// =============================================================================
describe('méta-test 3 — la fenêtre d’avant le socle est fermée', () => {
  it('route déclarée AVANT `enregistrerSocleAutorisation` → refus', async () => {
    // Un `onRoute` ne voit que ce qui est déclaré APRÈS lui. Une route posée avant le
    // socle n'aurait ni politique exigée, ni crochet d'autorisation — un trou
    // TOTALEMENT SILENCIEUX, le pire genre.
    const { enregistrerSocleAutorisation } = await import('./politique.js');
    const app = Fastify();
    app.get('/posee-trop-tot', { config: { acces: { type: 'public' } } }, () => ({ ok: true }));

    const message = await messageLeve(async () => {
      await enregistrerSocleAutorisation(app, async () => {
        await Promise.resolve();
      });
    });
    await fermer(app);

    expect(
      message,
      'Noter que la route porte ICI une politique VALIDE : le refus ne vient pas de la\n' +
        'politique manquante mais de la POSITION. Une route posée avant le socle passe\n' +
        'entre les mailles même bien annotée — c’est précisément ce qu’il faut fermer.',
    ).not.toBeNull();
    expect(message).toContain('AVANT');
    expect(message).toContain('posee-trop-tot');
  });

  it('contre-épreuve : une app vierge accepte le socle', async () => {
    const { enregistrerSocleAutorisation } = await import('./politique.js');
    const app = Fastify();
    await expect(
      enregistrerSocleAutorisation(app, async () => {
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
    await fermer(app);
  });
});

// =============================================================================
// MÉTA-TEST 4 — TOUTE ENTRÉE DU REGISTRE A REÇU LE CROCHET D'AUTORISATION
// =============================================================================
describe('méta-test 4 — aucune route n’échappe au crochet d’autorisation', () => {
  it('une route déclarée ENTRE les deux crochets du socle → refus au démarrage', async () => {
    // C'est la seule fenêtre où une route pourrait être INSCRITE au registre sans
    // recevoir le crochet ③ : entre le `onRoute` de totalité et celui qui pose
    // l'autorisation. Elle passerait la vérification de politique et servirait
    // pourtant sans aucun contrôle de droits — un faux vert parfait.
    const { enregistrerSocleAutorisation } = await import('./politique.js');
    const app = Fastify();

    const message = await messageLeve(async () => {
      await enregistrerSocleAutorisation(app, async (instance) => {
        instance.get('/glissee-dans-la-faille', { config: { acces: { type: 'public' } } }, () => ({
          ok: true,
        }));
        await Promise.resolve();
      });
      await app.ready();
    });
    await fermer(app);

    expect(message).not.toBeNull();
    expect(message).toContain('/glissee-dans-la-faille');
  });

  it('le registre énumère les routes RÉELLES de l’app, méthode par méthode', async () => {
    // Le registre est le périmètre du balayage sentinelle financier et de la matrice
    // rôle × route (note L2 §2.2-4). S'il était incomplet, ces deux tests
    // n'énumèreraient qu'une partie de la surface — en se croyant exhaustifs.
    const { construireApp } = await import('../app.js');
    const app = await construireApp();
    app.get('/v1/essai-registre', { config: { acces: { type: 'authentifie' } } }, () => ({
      ok: true,
    }));
    await app.ready();

    const inscrites = app.registreAcces.map((e) => `${e.methodes.join(',')} ${e.url}`);
    expect(inscrites).toContain('GET /v1/essai-registre');
    expect(
      inscrites,
      'Fastify engendre une route HEAD pour chaque GET. Si elle n’était pas inscrite,\n' +
        'toute énumération fondée sur le registre laisserait la moitié des lectures\n' +
        'hors de son périmètre.',
    ).toContain('HEAD /v1/essai-registre');

    // Toute route de l'app apparaît dans l'arbre de routage ET dans le registre :
    // deux vues du même ensemble, comparées l'une à l'autre.
    //
    // ── `commonPrefix: false` N'EST PAS UN CONFORT — 2026-08-29, T2 ────────────
    // Par défaut, `printRoutes()` imprime l'arbre RADIX COMPRESSÉ : deux routes qui
    // partagent un préfixe sont fusionnées en un nœud commun. Dès l'arrivée de
    // `/v1/auth/login` et `/v1/auth/logout`, l'arbre affichait
    // `log ├── in └── out` — et la chaîne « login » n'y figurait PLUS NULLE PART.
    // Ce test échouait donc en annonçant « au registre mais pas dans l'arbre » alors
    // que les deux vues concordaient : c'était l'ASSERTION qui était fausse, pas le
    // code. Le défaut n'était pas propre à l'auth — il se serait déclenché pour
    // n'importe quelle paire de routes à préfixe commun (`/missions`,
    // `/missions-archivees`…), donc à peu près sûrement en L3.
    // `commonPrefix: false` imprime les chemins ENTIERS : la comparaison redevient
    // vraie, et elle est plus stricte qu'avant, pas plus laxiste.
    const arbre = app.printRoutes({ commonPrefix: false });
    for (const entree of app.registreAcces) {
      const dernierSegment =
        entree.url
          .split('/')
          .filter((s) => s !== '')
          .pop() ?? '';
      expect(arbre, `« ${entree.url} » est au registre mais pas dans l’arbre`).toContain(
        dernierSegment,
      );
    }
    await fermer(app);
  });
});

// =============================================================================
// MÉTA-TEST 5 — INSTANTANÉ DES ROUTES PUBLIQUES
// =============================================================================
describe('méta-test 5 — instantané des routes publiques', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LISTE COMMITÉE DES ROUTES OUVERTES À TOUS. À TENIR À JOUR, PAS À CONTOURNER.
   * ═══════════════════════════════════════════════════════════════════════════
   * Ce test rougira le jour où T2 livrera `POST /v1/auth/login` et
   * `POST /v1/auth/refresh` : c'est VOULU, et son échec est alors un rappel, pas une
   * gêne. La correction tient en deux lignes ajoutées ci-dessous — et cette
   * modification est exactement la trace qu'on veut : ouvrir une route au public
   * devient un geste écrit, relu en revue croisée, et jamais un effet de bord.
   *
   * L'échec à ne PAS corriger de cette façon est l'inverse : une route qui apparaît
   * ici sans que personne n'ait décidé de l'ouvrir. Le message ci-dessous le dit.
   *
   * ── 2026-08-29, T2 : les deux lignes annoncées sont ajoutées, et SEULEMENT elles.
   * `POST /v1/auth/logout` N'Y EST PAS, et c'est le point à relire : elle est
   * déclarée `{ type: 'authentifie' }`. C'est ce qui permet de vérifier que le jeton
   * de rafraîchissement présenté APPARTIENT à l'appelant (la propriété est portée par
   * la clause `WHERE` du dépôt). Publique, elle aurait laissé n'importe qui révoquer
   * le jeton de n'importe qui — un déni de service anonyme sur la synchronisation
   * d'un auditeur. Le prix, à connaître : un client dont le jeton d'ACCÈS a expiré ne
   * peut plus se déconnecter côté serveur ; il efface localement, et le
   * rafraîchissement s'éteint à sa date d'expiration.
   */
  const ROUTES_PUBLIQUES_ATTENDUES = [
    'GET /v1/health',
    'GET /v1/health/ready',
    'HEAD /v1/health',
    'HEAD /v1/health/ready',
    'POST /v1/auth/login',
    'POST /v1/auth/refresh',
  ] as const;

  it('l’ensemble des routes `public` est EXACTEMENT la liste commitée', async () => {
    const { construireApp } = await import('../app.js');
    const app = await construireApp();
    await app.ready();

    const publiques = app.registreAcces
      .filter((entree) => entree.acces.type === 'public')
      .map((entree) => `${entree.methodes.join(',')} ${entree.url}`)
      .sort((a, b) => a.localeCompare(b, 'fr'));

    expect(
      publiques,
      'DEUX LECTURES POSSIBLES DE CET ÉCHEC, ET UNE SEULE EST BÉNIGNE.\n' +
        '  · Il MANQUE une route attendue, ou une route d’authentification vient d’être\n' +
        '    livrée : mettez la liste à jour, en une ligne. C’est le cas prévu.\n' +
        '  · Une route apparaît ici SANS que personne ait décidé de l’ouvrir : c’est une\n' +
        '    ouverture au public par inadvertance. `type: "public"` dispense de TOUT —\n' +
        '    identité, rôle, compte actif. Ne mettez pas la liste à jour : corrigez la\n' +
        '    politique de la route.',
    ).toStrictEqual([...ROUTES_PUBLIQUES_ATTENDUES]);

    await fermer(app);
  });

  it('aucune route publique ne porte la marque financière', async () => {
    // `financier: true` n'existe que sur `type: 'roles'` — le type l'interdit déjà
    // ailleurs. Ce test garde la propriété si l'union venait à être élargie : une
    // route financière publique serait la fuite la plus directe possible (E21).
    const { construireApp } = await import('../app.js');
    const app = await construireApp();
    await app.ready();

    const financieresOuvertes = app.registreAcces.filter(
      (entree) =>
        entree.acces.type !== 'roles' && JSON.stringify(entree.acces).includes('"financier":true'),
    );
    expect(financieresOuvertes).toStrictEqual([]);
    await fermer(app);
  });
});
