// =============================================================================
// LOT L2 — DEUX MÉCANIQUES DU SOCLE QUE LES MÉTA-TESTS NE COUVRAIENT PAS.
//
// Écrit par A17, réviseur croisé du lot, qui n'a produit AUCUNE des lignes testées
// (09 §5.6). Les attentes viennent de la note `docs/conception/LOT_L2.md` §2.1 et
// du contrat 11 §3 — jamais du décalque des branches de leur sujet.
//
// ── CE QUE `socle.test.ts` PROUVE DÉJÀ, ET QU'ON NE REFAIT PAS ───────────────
// Les cinq méta-tests d'A16 couvrent la totalité (aucune route sans politique), le
// paramètre d'URL, la fenêtre d'avant le socle, l'absence de route orpheline entre
// les deux `onRoute`, et l'instantané des routes publiques. Rien de cela n'est
// répété ici.
//
// ── LES DEUX TROUS MESURÉS LE 2026-08-29 (suite complète verte) ──────────────
//  1. `identite.ts` l.93-106 — un `Authorization` d'un AUTRE SCHÉMA que Bearer, et
//     un `Bearer` SANS jeton : aucun test. Or c'est la porte d'entrée de toute
//     requête authentifiée, et sa règle (« tout autre schéma est un jeton invalide,
//     pas une négociation ») ne tient qu'à un `startsWith`. Une refactorisation qui
//     le remplacerait par un `includes` accepterait
//     `Authorization: Basic Bearer …` sans qu'aucun test ne rougisse.
//  2. `politique.ts` l.258-259 — `ajouterCrochetOnRequest` face à un `onRequest`
//     DÉJÀ PRÉSENT sous forme de FONCTION UNIQUE. La forme TABLEAU est exercée en
//     permanence par `@fastify/rate-limit` ; la forme fonction, jamais. C'est la
//     branche qui décide si un crochet préexistant est CONSERVÉ ou ÉCRASÉ — et
//     l'ordre ①→②→③ que la note §2.1 impose repose entièrement sur elle.
//
// ── POURQUOI CES TESTS SONT UNITAIRES ET NON D'INTÉGRATION ───────────────────
// Aucun des deux ne lit la base : le crochet ① ne consulte jamais `users`, et une
// route PUBLIQUE comme une requête ANONYME sur une route protégée sont tranchées
// par ③ AVANT le `lireUtilisateurAuthentifie`. Un test qui démarrerait un conteneur
// Postgres pour éprouver un `startsWith` serait un test d'intégration qui s'ignore.
//
// Traçabilité : E5 (RBAC serveur systématique).
// =============================================================================
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// -----------------------------------------------------------------------------
// Environnement AVANT tout chargement de module applicatif (voir `socle.test.ts`).
// Secrets FACTICES (11 §2) : 64 caractères hexadécimaux = les 32 octets exigés.
// -----------------------------------------------------------------------------
process.env.DATABASE_URL ??= 'postgres://factice:factice@127.0.0.1:5432/axion_crochets';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET ??= '11'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= '22'.repeat(32);
process.env.LOG_LEVEL ??= 'fatal';
process.env.APP_ENV ??= 'dev';

let app: FastifyInstance | undefined;

/** Ce que les crochets préalables ont écrit, remis à zéro avant chaque scénario. */
const traces: string[] = [];

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

/**
 * Chaque appel part d'une IP DIFFÉRENTE — même raison qu'en intégration : le quota
 * global se replie sur l'IP pour un appelant anonyme, et une suite dont le verdict
 * dépend de l'ordre des `it` ne prouve rien.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.9.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

interface Reponse {
  readonly statut: number;
  readonly corps: string;
}

async function appeler(url: string, autorisation?: string): Promise<Reponse> {
  const reponse = await api().inject({
    method: 'GET',
    url,
    headers: {
      'x-forwarded-for': ipUnique(),
      ...(autorisation === undefined ? {} : { authorization: autorisation }),
    },
  });
  return { statut: reponse.statusCode, corps: reponse.body };
}

/** Ce que la route-banc publique rend : l'état laissé par le crochet ①. */
interface EtatIdentification {
  readonly identite: string | null;
  readonly echec: string | null;
}

function etat(reponse: Reponse): EtatIdentification {
  const analyse: unknown = JSON.parse(reponse.corps);
  if (
    typeof analyse !== 'object' ||
    analyse === null ||
    !('identite' in analyse) ||
    !('echec' in analyse)
  ) {
    throw new Error(`réponse inattendue de la route-banc : ${reponse.corps}`);
  }
  const { identite, echec } = analyse;
  return {
    identite: typeof identite === 'string' ? identite : null,
    echec: typeof echec === 'string' ? echec : null,
  };
}

beforeAll(async () => {
  const { construireApp } = await import('../app.js');
  const instance = await construireApp();
  app = instance;

  // --- Routes-bancs : elles n'existent que pour cette suite --------------------
  // Ce ne sont pas des routes du produit ; `app.ts` ne les monte jamais.

  // ① : une route PUBLIQUE rend visible ce que l'identification a MÉMORISÉ sans
  //     jamais refuser. C'est le seul moyen d'observer un crochet qui, par
  //     conception, ne produit aucun effet sur la réponse.
  instance.get('/essai/crochets/public', { config: { acces: { type: 'public' } } }, (requete) => ({
    identite: requete.identite?.utilisateurId ?? null,
    echec: requete.echecIdentification?.code ?? null,
  }));

  // ③ : un crochet préexistant sous forme de FONCTION UNIQUE.
  instance.get(
    '/essai/crochets/fonction',
    {
      config: { acces: { type: 'authentifie' } },
      onRequest: function prealable(
        _requete: FastifyRequest,
        _reponse: FastifyReply,
        suite: () => void,
      ): void {
        traces.push('prealable-fonction');
        suite();
      },
    },
    () => ({ atteint: true }),
  );

  // ③ : la même chose sous forme de TABLEAU — la contre-épreuve. Sans elle, une
  //     implémentation qui écraserait TOUT crochet préexistant passerait le test
  //     ci-dessus dès lors qu'elle refuserait quand même la requête.
  instance.get(
    '/essai/crochets/tableau',
    {
      config: { acces: { type: 'authentifie' } },
      onRequest: [
        (_requete: FastifyRequest, _reponse: FastifyReply, suite: () => void): void => {
          traces.push('prealable-tableau-1');
          suite();
        },
        (_requete: FastifyRequest, _reponse: FastifyReply, suite: () => void): void => {
          traces.push('prealable-tableau-2');
          suite();
        },
      ],
    },
    () => ({ atteint: true }),
  );

  // ③ : aucun crochet préexistant — le troisième cas de la même fonction.
  instance.get(
    '/essai/crochets/aucun',
    { config: { acces: { type: 'authentifie' } } },
    () => ({ atteint: true }),
  );

  await instance.ready();
}, 60_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
});

// =============================================================================
// ① IDENTIFICATION — « TOUT AUTRE SCHÉMA EST UN JETON INVALIDE, PAS UNE NÉGOCIATION »
// =============================================================================
describe('crochet ① — un en-tête `Authorization` qui n’est pas un Bearer', () => {
  it('@critique un schéma AUTRE que Bearer est un échec mémorisé, jamais une identité', async () => {
    // 11 §3 : « terrain (`apps/field`) = Bearer ». Un `Basic` correctement formé est
    // la tentative la plus banale (un client HTTP mal configuré, un proxy qui
    // réécrit) et la plus dangereuse à accepter : elle porte un couple
    // identifiant/mot de passe en base64 que rien ici ne saurait vérifier.
    const reponse = await appeler(
      '/essai/crochets/public',
      'Basic dXRpbGlzYXRldXI6bW90ZGVwYXNzZQ==',
    );

    expect(
      reponse.statut,
      "Le crochet ① NE REFUSE JAMAIS (note L2 §2.1) : sur une route publique, un\n" +
        "en-tête illisible doit rendre 200. Un 401 ici signifierait que ① s'est mis à\n" +
        'refuser — et que les jetons bidons échappent désormais au compteur de quota.',
    ).toBe(200);

    const { identite, echec } = etat(reponse);
    expect(
      identite,
      'Aucune identité ne doit être posée depuis un schéma non vérifié.',
    ).toBeNull();
    expect(
      echec,
      'Le refus doit être MÉMORISÉ : c’est lui que ③ lèvera sur une route protégée.',
    ).toBe('UNAUTHENTICATED');
  });

  it('le mot « Bearer » SANS espace ni jeton ne suffit pas', async () => {
    // Le préfixe attendu est `Bearer ` — espace compris. Un `startsWith` remplacé
    // par une comparaison plus lâche laisserait passer cette forme.
    const { identite, echec } = etat(await appeler('/essai/crochets/public', 'Bearer'));
    expect(identite).toBeNull();
    expect(echec).toBe('UNAUTHENTICATED');
  });

  it('@critique un `Bearer` au jeton VIDE est refusé, jamais traité comme un jeton', async () => {
    // Le cas que produit un client qui a effacé son jeton sans effacer l'en-tête.
    // Le laisser descendre dans la vérification reviendrait à demander à la
    // bibliothèque de jetons de trancher une chaîne vide — et à dépendre de ce
    // qu'elle en fait.
    for (const entete of ['Bearer ', 'Bearer    ', 'Bearer \t']) {
      const { identite, echec } = etat(await appeler('/essai/crochets/public', entete));
      expect(identite, `« ${entete} » ne doit poser aucune identité`).toBeNull();
      expect(echec, `« ${entete} » doit être mémorisé comme un échec`).toBe('UNAUTHENTICATED');
    }
  });

  it('contre-épreuve : SANS en-tête, il n’y a ni identité NI échec', async () => {
    // Sans ce cas, un crochet qui mémoriserait un échec pour TOUTE requête passerait
    // les trois tests ci-dessus. L'absence d'en-tête n'est pas une erreur : une
    // route publique s'en contente.
    const { identite, echec } = etat(await appeler('/essai/crochets/public'));
    expect(identite).toBeNull();
    expect(
      echec,
      "Une requête sans en-tête ne doit RIEN mémoriser : sinon toute route publique\n" +
        'servirait un échec fantôme, et le diagnostic deviendrait illisible.',
    ).toBeNull();
  });
});

// =============================================================================
// ③ LA POSE DU CROCHET — CONSERVER CE QUI EST DÉJÀ LÀ
// =============================================================================
describe('crochet ③ — pose sur une route qui a DÉJÀ un `onRequest`', () => {
  it('@critique forme FONCTION : le crochet préexistant survit ET l’autorisation s’applique', async () => {
    // LA PROPRIÉTÉ, EN UNE PHRASE : poser ③ ne doit rien écraser, et rien ne doit
    // empêcher ③ d'être posé. Les deux moitiés comptent — une implémentation qui
    // remplacerait `options.onRequest` par le seul `autorisation` refuserait bien
    // la requête (le test serait vert sur le statut) tout en ayant SUPPRIMÉ le
    // crochet du quota. C'est pourquoi on observe AUSSI la trace.
    traces.length = 0;
    const reponse = await appeler('/essai/crochets/fonction');

    expect(
      reponse.statut,
      'Le crochet ③ doit refuser l’anonyme sur une route `authentifie`. Un 200 ici\n' +
        'signifierait que la pose de ③ a été perdue au profit du crochet préexistant.',
    ).toBe(401);
    expect(
      traces,
      'Le crochet PRÉEXISTANT doit avoir tourné. S’il manque, `ajouterCrochetOnRequest`\n' +
        'a ÉCRASÉ ce qui était là — et le jour où ce « ce qui était là » est le\n' +
        'compteur de quota (@fastify/rate-limit), les jetons invalides cessent d’être\n' +
        'bornés : exactement l’inversion que la note L2 §2.1 interdit.',
    ).toContain('prealable-fonction');
  });

  it('forme TABLEAU : les crochets préexistants survivent TOUS, dans l’ordre', async () => {
    traces.length = 0;
    const reponse = await appeler('/essai/crochets/tableau');

    expect(reponse.statut).toBe(401);
    expect(traces).toEqual(['prealable-tableau-1', 'prealable-tableau-2']);
  });

  it('forme ABSENTE : l’autorisation s’applique quand même', async () => {
    traces.length = 0;
    const reponse = await appeler('/essai/crochets/aucun');

    expect(reponse.statut).toBe(401);
    expect(traces, 'aucun crochet préalable n’était déclaré').toEqual([]);
  });
});
