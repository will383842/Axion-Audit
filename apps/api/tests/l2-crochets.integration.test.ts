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
// Traçabilité : E21 (auditeurs jamais d'accès aux montants), E33 (sécurité).
// =============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { RoleUtilisateur } from '../src/db/schema.js';
import type { PolitiqueAcces } from '../src/auth/politique.js';
// Import de TYPE uniquement : entièrement effacé à la compilation, donc il ne
// charge PAS `db.ts` — la contrainte d'en-tête de ce fichier (imports applicatifs
// dynamiques, après la pose de `process.env`) reste intacte.
import type * as DepotFinancier from '../src/domaines/scoping/financiers.depot.js';
import { balayerSources, decrireInfractions } from './aide/etancheite-sources.js';
import {
  balayerSentinellesFinancieres,
  decrireRapport,
  detecterSentinelles,
  natureDuSilence,
  SENTINELLES_FINANCIERES,
  VALEURS_SENTINELLES,
} from './aide/sentinelle-financiere.js';
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
  /** Un SECOND administrateur, désactivé par le test de la route financière. */
  adminADesactiver: uuidv7(),
};

const jetons: Record<keyof typeof comptes, string> = {
  admin: '',
  consultant: '',
  analyste: '',
  lecteur: '',
  aDesactiver: '',
  aSupprimer: '',
  adminADesactiver: '',
};

// -----------------------------------------------------------------------------
// Cadrages semés pour la route financière (T5)
// -----------------------------------------------------------------------------
/**
 * L'entreprise porteuse des cadrages.
 *
 * HISSÉE au module (elle vivait dans `beforeAll`) parce que le balayage sentinelle
 * en a besoin : depuis que la cartographie des paramètres est indexée par (gabarit,
 * paramètre), `/v1/companies/:id` réclame un identifiant d'ENTREPRISE réellement
 * semé, et n'hérite plus — c'est tout l'objet du correctif — de l'identifiant de
 * cadrage déclaré pour `/v1/scoping/:id/financials`.
 */
const entrepriseSemee = uuidv7();
/**
 * Une MISSION réellement semée, pour les gabarits `/v1/missions/:id` et
 * `/v1/missions/:id/status` livrés par L3b.
 *
 * Elle n'existe que pour la cartographie du balayage : aucun test de ce fichier ne
 * l'interroge. C'est pourtant une LIGNE EN BASE et pas un UUID fabriqué, parce que
 * l'inverse est précisément le défaut que le mécanisme ① existe pour fermer — une
 * valeur qui ne désigne rien fait tomber la route en 404 avant qu'elle n'ait pu
 * fuiter quoi que ce soit, et le balayage est alors vert pour n'avoir rien traversé.
 * Titre fictif : invariant 2, aucune référence client, fixture comprise.
 */
const missionSemee = uuidv7();
/** Un cadrage AVEC volet financier — celui que l'administrateur a le droit de lire. */
const cadrageAvecFinancier = uuidv7();
/** Un cadrage SANS volet financier — il doit rendre la MÊME chose qu'un inconnu. */
const cadrageSansFinancier = uuidv7();
/** Un identifiant bien formé qui ne désigne AUCUN cadrage. */
const cadrageInexistant = uuidv7();
/**
 * Un cadrage dont le volet financier existe mais n'a AUCUN taux journalier
 * (`daily_rates` est `NULL` — la colonne est nullable au fichier 04). C'est l'état
 * d'un devis en cours de saisie : les frais sont posés, la grille tarifaire non.
 */
const cadrageSansTaux = uuidv7();
/**
 * Un cadrage dont `daily_rates` porte une forme que le contrat ne reconnaît PAS —
 * ici le taux écrit en CHAÎNE, ce qu'un import ou une saisie non validée produit.
 * Le JSONB accepte n'importe quelle forme ; le contrat d'API, non.
 */
const cadrageTauxInformes = uuidv7();

/**
 * L'erreur que le banc « socle cassé » a vue passer, capturée par son crochet
 * `onError`. Vue du réseau, la route rend 500 dans les deux cas ; seule la NATURE de
 * l'erreur dit si elle a refusé ou si elle est tombée.
 */
let erreurDuBancSocleCasse: unknown = null;

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
  await semerUtilisateur(comptes.adminADesactiver, 'admin', 'admin-a-desactiver');

  // --- Cadrages et volet financier (T5) ---------------------------------------
  // Les montants semés sont les SENTINELLES : des valeurs improbables et
  // textuellement reconnaissables, dont le balayage prouvera qu'aucune route
  // non-administrateur ne les laisse sortir. Ce sont des leurres de test, jamais
  // un secret (11 §2). Le nom d'entreprise est générique — invariant 2 : aucune
  // référence client dans le code, fixture comprise.
  await bd().query(`INSERT INTO companies (id, name) VALUES ($1, 'Entreprise de démonstration')`, [
    entrepriseSemee,
  ]);
  // La mission des gabarits `/v1/missions/:id` et `/v1/missions/:id/status` (L3b).
  // Les routes sont `admin` seul : les porteurs du balayage seront tous refusés
  // (403) et n'atteindront jamais le gestionnaire. La ligne est semée quand même —
  // « valeur RÉELLEMENT semée » est une propriété de la cartographie, pas une
  // propriété du seul chemin qu'on croit qu'elle empruntera.
  await bd().query(
    `INSERT INTO missions (id, company_id, title, geo_scope, audit_level, status, created_by)
     VALUES ($1, $2, 'Mission fictive de balayage', 'france', 'diagnostic_cadrage',
             'preparation', $3)`,
    [missionSemee, entrepriseSemee, comptes.admin],
  );
  for (const cadrageId of [
    cadrageAvecFinancier,
    cadrageSansFinancier,
    cadrageSansTaux,
    cadrageTauxInformes,
  ]) {
    await bd().query(
      `INSERT INTO scoping_estimates
         (id, company_id, workload_days, team_size, calendar_days, status)
       VALUES ($1, $2, 12, 2, 30, 'brouillon')`,
      [cadrageId, entrepriseSemee],
    );
  }
  await bd().query(
    `INSERT INTO scoping_financials
       (scoping_estimate_id, daily_rates, travel_costs, total_amount, currency, updated_by)
     VALUES ($1, $2::jsonb, $3, $4, 'EUR', $5)`,
    [
      cadrageAvecFinancier,
      JSON.stringify({
        [SENTINELLES_FINANCIERES.profilTauxJournalier]: Number(
          SENTINELLES_FINANCIERES.tauxJournalier,
        ),
      }),
      SENTINELLES_FINANCIERES.travelCosts,
      SENTINELLES_FINANCIERES.totalAmount,
      comptes.admin,
    ],
  );

  // `daily_rates` ABSENT — et les frais, eux, bien présents : la réponse doit
  // porter `dailyRates: null` sans amputer le reste du volet.
  await bd().query(
    `INSERT INTO scoping_financials
       (scoping_estimate_id, daily_rates, travel_costs, total_amount, currency, updated_by)
     VALUES ($1, NULL, $2, $3, 'EUR', $4)`,
    [
      cadrageSansTaux,
      SENTINELLES_FINANCIERES.travelCosts,
      SENTINELLES_FINANCIERES.totalAmount,
      comptes.admin,
    ],
  );

  // `daily_rates` de FORME INATTENDUE : le taux en chaîne au lieu d'un nombre. Le
  // JSONB l'accepte, `tauxJournaliersSchema` non — et la valeur est une SENTINELLE,
  // pour que le balayage la voie si elle sortait quand même.
  await bd().query(
    `INSERT INTO scoping_financials
       (scoping_estimate_id, daily_rates, travel_costs, total_amount, currency, updated_by)
     VALUES ($1, $2::jsonb, $3, $4, 'EUR', $5)`,
    [
      cadrageTauxInformes,
      JSON.stringify({
        [SENTINELLES_FINANCIERES.profilTauxJournalier]: SENTINELLES_FINANCIERES.tauxJournalier,
      }),
      SENTINELLES_FINANCIERES.travelCosts,
      SENTINELLES_FINANCIERES.totalAmount,
      comptes.admin,
    ],
  );

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

  // ═══════════════════════════════════════════════════════════════════════════
  // BANC « SOCLE CASSÉ » — la ceinture d'EXÉCUTION de la route financière.
  // ═══════════════════════════════════════════════════════════════════════════
  // La route du produit porte un `if (contexteAdmin === null)` que le socle rend
  // aujourd'hui INATTEIGNABLE : sa politique est `roles: ['admin'], financier: true`,
  // donc le crochet ③ pose la marque pour quiconque franchit la porte. Ce `if` n'est
  // pourtant pas du code mort — son commentaire nomme lui-même le jour où il servira :
  // « un remaniement du socle ». Non exercé, il serait une intention non vérifiée, et
  // l'intention non vérifiée est exactement ce qui s'ouvre en silence.
  //
  // On REPRODUIT ce jour-là, du même geste que `/essai/politique-inconnue` reproduit
  // un `config` venu d'un JSON : c'est `routesScoping` LUI-MÊME — la route du produit,
  // pas une imitation — qui est montée dans un greffon encapsulé dont un crochet
  // `preHandler` efface la marque APRÈS que le crochet ③ (`onRequest`) l'a posée.
  // L'encapsulation confine ce crochet à ce greffon : la route de `/v1` n'en sait rien.
  const { routesScoping } = await import('../src/routes/scoping.js');
  await instance.register(
    async (fille) => {
      fille.addHook('preHandler', async (requete) => {
        requete.contexteAdmin = null;
        await Promise.resolve();
      });
      // Le crochet `onError` OBSERVE sans rien changer (Fastify ne lui permet pas de
      // substituer l'erreur). Il est indispensable, et la raison tient en une phrase :
      // vu du réseau, un REFUS DÉLIBÉRÉ et un PLANTAGE FORTUIT rendent le même 500. La
      // seule chose qui les sépare est la nature de l'erreur levée.
      fille.addHook('onError', async (_requete, _reponse, erreur) => {
        erreurDuBancSocleCasse = erreur;
        await Promise.resolve();
      });
      await fille.register(routesScoping);
    },
    { prefix: '/essai/socle-casse' },
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

// =============================================================================
// T5 — LA ROUTE FINANCIÈRE. Ajouté par A17 le 2026-08-29.
//
// La ceinture 2 de la CI a réclamé le seuil sur `domaines/scoping/**` dès que T5 a
// atterri ; le glob a été basculé, ET ÉLARGI À LA ROUTE — l'auteur de T5 avait
// signalé qu'un seuil laissant la route dehors ne mesure pas ce qu'il prétend.
// Ces tests sont écrits par un agent qui n'a produit aucune de ces lignes (09 §5.6).
//
// LA PHRASE QUI GOUVERNE (03 §18.3, verbatim) : « L'auditeur voit son avance/retard,
// son plan, ses dates — il ne voit JAMAIS le TJM, les montants, ni le devis. »
// =============================================================================

/** Ce que la route rend à un administrateur. */
interface ReponseFinanciere {
  readonly scopingEstimateId: string;
  readonly dailyRates: Record<string, number> | null;
  readonly travelCosts: string | null;
  readonly totalAmount: string | null;
  readonly currency: string;
  readonly updatedBy: string | null;
  readonly updatedAt: string;
}

function financiers(corps: string): ReponseFinanciere {
  const analyse: unknown = JSON.parse(corps);
  if (typeof analyse !== 'object' || analyse === null || !('currency' in analyse)) {
    throw new Error(`réponse financière inattendue : ${corps}`);
  }
  return analyse as ReponseFinanciere;
}

function urlFinanciere(cadrageId: string): string {
  return `/v1/scoping/${cadrageId}/financials`;
}

// -----------------------------------------------------------------------------
// CEINTURE 2 — LA MARQUE, VÉRIFIÉE PAR LE COMPILATEUR ET PAR LUI SEUL
// -----------------------------------------------------------------------------
/**
 * CETTE FONCTION N'EST JAMAIS APPELÉE. Elle n'existe que pour être TYPÉE.
 *
 * `@ts-expect-error` est ici une ASSERTION AU SENS PLEIN : `tsc` échoue si l'erreur
 * attendue ne se produit PAS. Le jour où `lireFinanciersDuCadrage` cesserait
 * d'exiger un `ContexteAdmin` — un `boolean`, un `string`, un paramètre optionnel —
 * cette ligne compilerait, et `pnpm typecheck` virerait au ROUGE en disant que
 * l'erreur attendue a disparu. Le garde-fou est donc porté par le job `typecheck`
 * de la CI, pas par vitest : une garantie de COMPILATION ne se prouve pas à
 * l'exécution, et un test qui prétendrait le faire mentirait sur sa nature.
 *
 * L'objet passé imite EXACTEMENT la forme visible de `ContexteAdmin`
 * (`{ utilisateurId }`) : c'est le geste qu'un développeur pressé ferait de bonne
 * foi. Ce qu'il ne peut pas fabriquer, c'est la marque `unique symbol`, dont la clé
 * n'est pas nommable hors de `auth/contexte.ts`.
 */
export async function marqueExigeeALaCompilation(
  depot: typeof DepotFinancier,
  cadrageId: string,
): Promise<void> {
  // @ts-expect-error — invariant 3 : sans la marque `ContexteAdmin`, l'appel au
  // dépôt financier NE DOIT PAS COMPILER. Si cette ligne cesse d'être une erreur,
  // la ceinture 2 a disparu et `tsc` doit le dire.
  await depot.lireFinanciersDuCadrage({ utilisateurId: 'pas-une-marque' }, cadrageId);
}

describe('T5 — route financière : qui entre', () => {
  it('@critique un ADMINISTRATEUR obtient les montants', async () => {
    const reponse = await appeler(urlFinanciere(cadrageAvecFinancier), jetons.admin);

    expect(reponse.statut, '03 §34.1 : « Chiffrage & devis : admin SEUL »').toBe(200);
    const corps = financiers(reponse.corps);
    expect(corps.scopingEstimateId).toBe(cadrageAvecFinancier);
    expect(corps.totalAmount).toBe(SENTINELLES_FINANCIERES.totalAmount);
    expect(corps.travelCosts).toBe(SENTINELLES_FINANCIERES.travelCosts);
    expect(corps.currency).toBe('EUR');
    expect(corps.dailyRates).toEqual({
      [SENTINELLES_FINANCIERES.profilTauxJournalier]: Number(
        SENTINELLES_FINANCIERES.tauxJournalier,
      ),
    });
  });

  it('@critique les montants restent des CHAÎNES — un `NUMERIC` converti perd le devis', async () => {
    // Le dépôt le dit : `travel_costs` et `total_amount` sont des `NUMERIC` rendus
    // en décimal exact par `node-postgres`. Les convertir en `number` perdrait de la
    // précision sur un devis SIGNÉ, et le ferait silencieusement. Un test qui se
    // contenterait d'une égalité numérique ne verrait jamais la bascule.
    const reponse = await appeler(urlFinanciere(cadrageAvecFinancier), jetons.admin);
    const corps = financiers(reponse.corps);
    expect(typeof corps.totalAmount).toBe('string');
    expect(typeof corps.travelCosts).toBe('string');
  });

  it('@critique consultant, analyste et lecteur sont refusés en 403 — jamais 401', async () => {
    // 403 et non 401, et la nuance n'est pas cosmétique : l'identité EST établie et
    // le compte est bon. Un 401 ici enverrait le terrain se reconnecter en boucle
    // pour un droit qu'il n'aura jamais, et masquerait un refus d'AUTORISATION
    // derrière une panne d'AUTHENTIFICATION.
    for (const role of ['consultant', 'analyste', 'lecteur'] as const) {
      const reponse = await appeler(urlFinanciere(cadrageAvecFinancier), jetons[role]);
      expect(reponse.statut, `${role} doit être refusé`).toBe(403);
      expect(reponse.code, `${role} : le refus doit être une AUTORISATION`).toBe('FORBIDDEN');
      expect(
        detecterSentinelles(reponse.corps),
        `Le corps du refus servi à ${role} contient un montant.`,
      ).toStrictEqual([]);
    }
  });

  it('@critique un ANONYME est refusé en 401', async () => {
    const reponse = await appeler(urlFinanciere(cadrageAvecFinancier));
    expect(reponse.statut).toBe(401);
    expect(reponse.code).toBe('UNAUTHENTICATED');
  });

  it('@critique un admin DÉSACTIVÉ entre deux requêtes perd l’accès IMMÉDIATEMENT', async () => {
    // 06 §10.1 : « comptes désactivables INSTANTANÉMENT ». Le jeton reste
    // cryptographiquement valide pendant 15 minutes : sans la relecture de `users`
    // à chaque requête, un administrateur révoqué continuerait de lire les montants
    // pendant tout ce quart d'heure. On prouve donc les DEUX temps.
    const avant = await appeler(urlFinanciere(cadrageAvecFinancier), jetons.adminADesactiver);
    expect(avant.statut, 'témoin : l’accès doit exister AVANT la désactivation').toBe(200);

    await bd().query(`UPDATE users SET is_active = false WHERE id = $1`, [
      comptes.adminADesactiver,
    ]);

    const apres = await appeler(urlFinanciere(cadrageAvecFinancier), jetons.adminADesactiver);
    expect(
      apres.statut,
      'Le MÊME jeton, non expiré, doit être refusé dès la requête suivante.',
    ).toBe(401);
    expect(
      detecterSentinelles(apres.corps),
      'La réponse de refus ne doit contenir aucun montant.',
    ).toStrictEqual([]);
  });
});

describe('T5 — route financière : ce qu’elle répond quand il n’y a rien', () => {
  it('@critique cadrage SANS volet financier et cadrage INEXISTANT : réponse identique', async () => {
    // Distinguer les deux dirait « ce cadrage existe », c'est-à-dire un oracle
    // d'existence sur le portefeuille commercial. La route étant déjà réservée aux
    // administrateurs, l'enjeu n'est pas le secret : c'est qu'une distinction sans
    // valeur pour l'appelant finit toujours par être exploitée par quelqu'un.
    const sansVolet = await appeler(urlFinanciere(cadrageSansFinancier), jetons.admin);
    const inexistant = await appeler(urlFinanciere(cadrageInexistant), jetons.admin);

    expect(sansVolet.statut).toBe(404);
    expect(inexistant.statut).toBe(404);
    expect(
      sansVolet.corps,
      'Les deux réponses doivent être RIGOUREUSEMENT identiques — même code, même\n' +
        'message. Ce test ne juge pas de l’intention : il constate que les deux\n' +
        'situations sont devenues DISTINGUABLES de l’extérieur. Selon ce qui les\n' +
        'distingue, c’est un oracle d’existence de cadrage, ou seulement un écho de\n' +
        'l’entrée — dans les deux cas la propriété tenue jusqu’ici a été perdue, et\n' +
        'c’est à la revue de dire laquelle des deux vient d’arriver.',
    ).toBe(inexistant.corps);
  });

  it('@critique un `:id` qui n’est pas un UUID rend 400, jamais 500', async () => {
    // Un 500 signifierait que la valeur a atteint la couche base. Le schéma Zod de
    // paramètres doit trancher AVANT — et un 500 sur entrée invalide est aussi une
    // fuite d'information sur la pile technique.
    for (const mauvais of ['pas-un-uuid', '12345', 'NULL']) {
      const reponse = await appeler(urlFinanciere(mauvais), jetons.admin);
      expect(reponse.statut, `« ${mauvais} » doit être refusé par la validation`).toBe(400);
    }
  });
});

describe('T5 — `daily_rates` : ce que le dépôt accepte de laisser sortir', () => {
  it('@critique volet financier SANS taux : `dailyRates` vaut `null`, jamais `{}`', async () => {
    // `daily_rates` est nullable au fichier 04, et le contrat d'API le déclare
    // `nullable()` : l'absence de grille tarifaire est un ÉTAT NORMAL d'un devis en
    // cours. La distinction compte pour la console : `null` se rend « non renseigné »,
    // un objet vide se rend « aucun profil facturé », et ce n'est pas la même phrase
    // devant un client. Le reste du volet, lui, doit sortir intact — un devis amputé
    // de ses frais parce qu'il manque une grille serait un faux, pas une prudence.
    const reponse = await appeler(urlFinanciere(cadrageSansTaux), jetons.admin);

    expect(reponse.statut).toBe(200);
    const corps = financiers(reponse.corps);
    expect(corps.dailyRates, '`null` en base doit rester `null` sur le réseau.').toBeNull();
    expect(corps.totalAmount).toBe(SENTINELLES_FINANCIERES.totalAmount);
    expect(corps.travelCosts).toBe(SENTINELLES_FINANCIERES.travelCosts);
  });

  it('@critique `daily_rates` de forme INATTENDUE : `null`, jamais une forme non validée', async () => {
    // Le JSONB n'a pas de forme : `{"profil": "1234.56"}` y entre aussi bien que
    // `{"profil": 1234.56}`. C'est la seule colonne du volet dont la base ne garantit
    // rien, donc la seule par laquelle une forme surprise peut atteindre la console —
    // et sur cette table-ci, une forme surprise est un montant qui voyage sans contrat.
    // Le dépôt la fait REVALIDER par le schéma partagé, celui-là même que la route
    // impose en sortie ; ce test constate que la revalidation existe et qu'elle
    // dégrade en `null` plutôt que de laisser passer ou de rompre la réponse.
    const reponse = await appeler(urlFinanciere(cadrageTauxInformes), jetons.admin);

    expect(
      reponse.statut,
      'Une valeur informe ne doit ni sortir telle quelle, ni faire tomber la route :\n' +
        'un 500 ici priverait l’administrateur de TOUT le volet à cause d’une seule\n' +
        'colonne, et un 200 portant la forme brute la servirait hors contrat.',
    ).toBe(200);
    const corps = financiers(reponse.corps);
    expect(corps.dailyRates).toBeNull();
    expect(
      detecterSentinelles(reponse.corps, [
        SENTINELLES_FINANCIERES.profilTauxJournalier,
        SENTINELLES_FINANCIERES.tauxJournalier,
      ]),
      'Le profil et le taux informes sont des SENTINELLES : les retrouver dans la\n' +
        'réponse prouverait que la forme brute est sortie. Les frais et le total, eux,\n' +
        'sont légitimement là — l’administrateur a le droit de les voir.',
    ).toStrictEqual([]);
  });
});

describe('T5 — ceinture d’EXÉCUTION : la marque effacée fait ÉCHOUER, jamais servir', () => {
  it('@critique socle cassé — la route rend 500 et AUCUN montant', async () => {
    // Le banc `/essai/socle-casse` monte la route DU PRODUIT sous un crochet qui
    // efface `contexteAdmin` après le crochet ③ : c'est, à la ligne près, ce que
    // produirait un remaniement du socle qui cesserait de poser la marque.
    //
    // Ce que ce test tranche est une ALTERNATIVE, pas un détail de statut : sans le
    // `if`, l'appel au dépôt passerait quand même — `lireFinanciersDuCadrage` ne LIT
    // pas son contexte, il l'EXIGE à la compilation — et la route servirait les
    // montants à une requête dont plus personne n'a vérifié qu'elle vient d'un
    // administrateur. Le 500 n'est donc pas une dégradation : c'est le refus.
    // Le banc est aussi traversé par le méta-test du registre et par le balayage
    // sentinelle, qui y récoltent des refus 401/403. On repart donc de zéro : ce test
    // doit juger de SON appel, jamais d'une erreur laissée par un autre.
    erreurDuBancSocleCasse = null;

    const reponse = await appeler(
      `/essai/socle-casse/scoping/${cadrageAvecFinancier}/financials`,
      jetons.admin,
    );

    expect(
      reponse.statut,
      'Un 200 ici signifierait que la route a servi les montants SANS marque ; un 404\n' +
        'ou un 401 signifierait que le banc n’a pas atteint le gestionnaire, et que ce\n' +
        'test ne prouve rien.',
    ).toBe(500);
    expect(reponse.code).toBe('INTERNAL_ERROR');
    expect(
      detecterSentinelles(reponse.corps),
      'La réponse d’échec ne doit contenir aucun montant.',
    ).toStrictEqual([]);

    // ── ET C'EST ICI QUE LE TEST DEVIENT MORDANT ─────────────────────────────
    // Le statut seul ne prouve RIEN, et il faut le dire franchement : sans la
    // ceinture, l'appel au dépôt passerait, la ligne financière serait LUE, puis
    // `contexteAdmin.utilisateurId` déréférencerait `null` au moment de journaliser
    // — ce qui rend AUSSI un 500. Deux mondes, un même statut. Le seul témoin qui
    // les sépare est la NATURE de l'erreur : un refus délibéré (`AppError`, code du
    // catalogue, message français) contre une chute fortuite (`TypeError`).
    //
    // La différence n'est pas théorique. La chute fortuite dépend d'une ligne qui
    // n'a rien à voir avec la sécurité : le jour où la journalisation change de
    // forme, disparaît, ou passe en `?.`, elle cesse de protéger — et la route
    // servirait les montants sans marque. La ceinture, elle, refuse AVANT de lire.
    expect(
      erreurDuBancSocleCasse,
      'Aucune erreur observée : le banc n’a pas atteint le gestionnaire.',
    ).not.toBeNull();
    expect(
      erreurDuBancSocleCasse,
      'La route est TOMBÉE au lieu de REFUSER : le 500 vient d’un déréférencement de\n' +
        '`null` plus bas dans le gestionnaire, pas de la ceinture d’exécution. Les\n' +
        'montants ont donc été lus en base avant la chute, et la seule chose qui les a\n' +
        'retenus est un accident de rédaction.',
    ).not.toBeInstanceOf(TypeError);
    expect(
      (erreurDuBancSocleCasse as { code?: unknown }).code,
      'Le refus doit porter un code du catalogue partagé (11 §3), pas être une erreur\n' +
        'anonyme.',
    ).toBe('INTERNAL_ERROR');
  });
});

describe('T5 — « qui a vu l’argent », et rien de plus (06 §10.5)', () => {
  it('@critique une lecture admin écrit EXACTEMENT une ligne, sans montant', async () => {
    const avant = await bd().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM activity_log WHERE action = 'financier.consultation'`,
    );

    const reponse = await appeler(urlFinanciere(cadrageAvecFinancier), jetons.admin);
    expect(reponse.statut).toBe(200);

    const apres = await bd().query<{
      user_id: string | null;
      entity_type: string | null;
      entity_id: string | null;
      meta: unknown;
    }>(
      `SELECT user_id, entity_type, entity_id, meta FROM activity_log
        WHERE action = 'financier.consultation' ORDER BY id`,
    );

    expect(
      apres.rows.length - Number(avant.rows[0]?.n ?? '0'),
      'Une consultation = UNE ligne. Zéro signifierait que « qui a vu l’argent » n’est\n' +
        'pas tracé ; deux signifieraient un double appel, et un journal qui compte faux\n' +
        'ne sert à rien le jour où quelqu’un conteste une consultation.',
    ).toBe(1);

    const derniere = apres.rows[apres.rows.length - 1];
    expect(derniere?.user_id, 'la ligne doit nommer l’ADMINISTRATEUR qui a consulté').toBe(
      comptes.admin,
    );
    expect(derniere?.entity_id).toBe(cadrageAvecFinancier);
    expect(
      derniere?.meta,
      'On trace QUI a vu l’argent, JAMAIS COMBIEN : la variante du catalogue ne porte\n' +
        'aucun champ de montant, et `meta` doit rester nul.',
    ).toBeNull();
  });

  it('@critique aucune ligne de TOUTE la table ne porte de montant', async () => {
    // On relit la table ENTIÈRE, pas la dernière ligne : le balayage doit voir les
    // lignes qu'il n'a pas vu passer — celles écrites par les refus, par les 404,
    // par les tentatives non-admin de ce fichier.
    const toutes = await bd().query<Record<string, unknown>>(`SELECT * FROM activity_log`);
    expect(toutes.rows.length, 'le balayage doit avoir de la matière').toBeGreaterThan(0);

    const trouvees = detecterSentinelles(JSON.stringify(toutes.rows));
    expect(
      trouvees,
      'Un montant a été retrouvé dans `activity_log`. La table est lisible par les\n' +
        'administrateurs (§34.1) mais elle n’a PAS le régime du financier : y écrire un\n' +
        'montant, c’est en créer une seconde copie que personne ne surveille.',
    ).toStrictEqual([]);
  });
});

describe('T5 — les ceintures 3 et 4 : sources et exécution', () => {
  it('@critique CEINTURE 3 — aucun fichier hors liste blanche ne nomme la table financière', () => {
    const infractions = balayerSources();
    expect(
      infractions,
      `Étanchéité des sources ROMPUE :\n${decrireInfractions(infractions)}\n` +
        'Un second fichier qui nomme la table, et la garantie « une seule porte » vaut\n' +
        'ce que vaut le chemin le plus laxiste. Élargir la liste blanche est un ACTE DE\n' +
        'CONCEPTION, jamais un moyen de faire passer ce test.',
    ).toStrictEqual([]);
  });

  it('@critique CEINTURE 3 — le balayage TROUVE quand on lui retire ses œillères', () => {
    // Sans cette contre-épreuve, un balayage cassé (mauvaise racine, motif qui ne
    // correspond plus, extension oubliée) rendrait « aucune infraction » et le test
    // ci-dessus serait vert par vacuité. On lui retire la liste blanche : il DOIT
    // alors dénoncer le dépôt financier lui-même.
    const sansOeilleres = balayerSources([]);
    const fichiers = new Set(sansOeilleres.map((infraction) => infraction.fichier));
    expect(
      fichiers.has('apps/api/src/domaines/scoping/financiers.depot.ts'),
      'Le balayage ne retrouve même pas le dépôt financier : il ne cherche rien, et\n' +
        'son silence dans le test précédent ne prouvait donc rien.',
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LA CARTOGRAPHIE DES PARAMÈTRES D'URL — UNE LIGNE PAR (GABARIT, PARAMÈTRE).
  // ═══════════════════════════════════════════════════════════════════════════
  // Elle était PLATE (`{ id, missionId, sessionId }`), et c'était le défaut :
  // la valeur déclarée pour `:id` — un `scoping_estimate` — servait de repli à TOUT
  // `:id` du dépôt. `/v1/companies/:id`, arrivée en L3, recevait donc un id de
  // cadrage, rendait 404, et `parametresNonCartographies` restait VIDE : le balayage
  // était vert sur une route qu'il n'avait jamais traversée.
  //
  // Désormais chaque gabarit sème LE SIEN. Écrire une route à paramètre sans
  // ajouter sa ligne ici fait rougir ce test — c'est l'effet recherché, et c'est
  // l'auteur de la route qui le voit, pas le lot suivant.
  //
  // ⚠ CETTE TABLE EST FERMÉE DANS LES DEUX SENS. Un gabarit manquant est remonté
  // dans `parametresNonCartographies` ; une ligne qui ne correspond à aucun gabarit
  // du registre (route renommée, supprimée) est remontée dans
  // `declarationsInutiles`. Les deux sont assérés plus bas.
  //
  // POURQUOI LES DEUX BANCS ONT UNE VALEUR SANS RÉFÉRENT EN BASE, ET POURQUOI CE
  // N'EST PLUS LE DÉFAUT D'AVANT : `/essai/missions/:missionId` et
  // `/essai/sessions/:sessionId` sont des bancs de POLITIQUE. Les variantes
  // `mission` et `proprietaire_session` du crochet ③ vérifient l'identité et le
  // compte, RIEN D'AUTRE — la propriété de la ligne est portée par le dépôt et par
  // le service de sync (auth/politique.ts le dit noir sur blanc). Ces gestionnaires
  // ne déréférencent donc jamais l'identifiant. Deux choses ont changé : (1) la
  // valeur ne DÉBORDE plus — le jour où `/v1/missions/:missionId` existera, elle
  // n'en héritera pas et son auteur devra semer une mission réelle ; (2) elle n'est
  // plus une promesse mais une propriété MESURÉE : une valeur morte rendrait ces
  // gabarits muets pour tous les porteurs, et `gabaritsMuets` — asséré vide plus
  // bas — les dénoncerait.
  const cartographieDesParametres = {
    '/v1/scoping/:id/financials': { id: cadrageAvecFinancier },
    '/v1/companies/:id': { id: entrepriseSemee },
    // ── LES MISSIONS (L3b) ────────────────────────────────────────────────────
    // Une mission RÉELLEMENT semée en `beforeAll`. Les deux gabarits sont deux
    // lignes : `/v1/missions/:id/status` n'hérite RIEN de `/v1/missions/:id`, et
    // c'est tout l'objet du mécanisme ①.
    '/v1/missions/:id': { id: missionSemee },
    '/v1/missions/:id/status': { id: missionSemee },
    // ── LES COMPTES (L2/T3) ───────────────────────────────────────────────────
    // Ces cinq gabarits existent depuis L2 et n'avaient JAMAIS été cartographiés.
    // Ce n'est pas un oubli de rédaction, c'est un angle mort de fusion, et il vaut
    // d'être écrit ici : la branche qui a MONTÉ ces routes dans `construireApp` et
    // celle qui a remplacé la cartographie PLATE par la cartographie par (gabarit,
    // paramètre) sont deux branches sœurs, dont aucune ne voyait l'autre. Sur la
    // première, `:id` avait encore une valeur de repli universelle et les comptes
    // étaient donc silencieusement « couverts » ; sur la seconde, les routes
    // n'étaient pas montées, donc absentes du registre. Ni l'une ni l'autre ne
    // rougissait — leur FUSION, si. Un défaut qu'aucun des deux parents ne porte
    // seul est exactement ce qu'une suite qui ne tourne qu'avant la fusion ne peut
    // pas voir.
    //
    // La valeur est un compte réellement semé (`comptes.lecteur`), jamais supprimé
    // ni désactivé par ce fichier — les tests de cycle de vie ont leurs propres
    // comptes (`aDesactiver`, `aSupprimer`) pour cette raison précise.
    '/v1/users/:id': { id: comptes.lecteur },
    '/v1/users/:id/role': { id: comptes.lecteur },
    '/v1/users/:id/deactivate': { id: comptes.lecteur },
    '/v1/users/:id/habilitate': { id: comptes.lecteur },
    '/v1/users/:id/password-reset': { id: comptes.lecteur },
    // La route du produit RE-montée sous le préfixe du banc « socle cassé » : c'est
    // un gabarit distinct, donc une ligne distincte. La verbosité est le prix de la
    // propriété qu'on achète — rien ne déborde d'un gabarit à l'autre.
    '/essai/socle-casse/scoping/:id/financials': { id: cadrageAvecFinancier },
    '/essai/missions/:missionId': { missionId: uuidv7() },
    '/essai/sessions/:sessionId': { sessionId: uuidv7() },
  };

  it('@critique CEINTURE 4 — balayage sentinelle : aucune route ne laisse sortir un montant', async () => {
    const rapport = await balayerSentinellesFinancieres({
      app: api(),
      // L'ADMINISTRATEUR est délibérément ABSENT : il a le droit de voir les
      // montants (03 §34.1). L'inclure produirait une fausse fuite, et un garde-fou
      // qui crie à tort finit désarmé.
      porteurs: {
        consultant: jetons.consultant,
        analyste: jetons.analyste,
        lecteur: jetons.lecteur,
        anonyme: null,
      },
      cartographieDeParametres: cartographieDesParametres,
    });

    expect(
      rapport.fuites,
      `Une route a laissé sortir un montant :\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    expect(
      rapport.parametresNonCartographies,
      'Un gabarit à paramètre n’a AUCUNE valeur déclarée pour lui : le balayage a tapé\n' +
        'dans le vide sur cette route, et son silence ne vaut rien pour elle. Ajouter la\n' +
        'ligne manquante à `cartographieDesParametres` — avec une valeur RÉELLEMENT\n' +
        `semée, jamais un UUID de complaisance.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    expect(
      rapport.declarationsInutiles,
      'La cartographie sème un gabarit qui n’existe plus au registre : on croit couvrir\n' +
        'une route, on ne couvre rien. C’est la dérive silencieuse que l’autre moitié du\n' +
        `mécanisme ① ferme.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    expect(
      rapport.routesFinancieres.includes('/v1/scoping/:id/financials'),
      'Le balayage n’a pas vu la route financière du PRODUIT dans le registre : il\n' +
        'n’a pas d’objet, et son vert ne prouve rien.',
    ).toBe(true);

    expect(
      rapport.couverture.exerces,
      'Aucun appel n’a rendu 2xx : le balayage n’a lu aucun corps, il est vert par\n' + 'vacuité.',
    ).toBeGreaterThan(0);

    // ── AUCUNE ROUTE NE DOIT ÊTRE ANORMALEMENT MUETTE ─────────────────────────
    // `non_exerce` n'est plus un compteur : un couple (gabarit, méthode) qu'aucun
    // porteur n'a fait refuser (401/403) ni servir (2xx) n'a RIEN prouvé, et le
    // moteur le nomme. Cette liste-ci est assérée EN BLOC, contrairement aux
    // anomalies — elle ne porte aucun cas délibéré : les silences légitimes (un
    // `POST` auquel le balayage n'envoie qu'un corps vide, une méthode non servie)
    // partent dans `gabaritsNonTraversables`, qui est rapporté sans être compté.
    expect(
      rapport.gabaritsMuets,
      'Une route n’a été ni refusée ni servie par AUCUN porteur : 404 pour tous (la\n' +
        'valeur cartographiée ne désigne rien), 429 (le balayage a été étranglé par le\n' +
        'quota) ou 5xx (la route tombe). Dans les trois cas le vert du balayage sur cette\n' +
        `route ne vaut rien.\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);

    // ── LA ROUTE DU PRODUIT DOIT REFUSER TOUT LE MONDE, SANS EXCEPTION ─────────
    // On n'assère PAS `anomaliesDeCouverture` en bloc, et il faut dire pourquoi
    // plutôt que de le taire : le banc d'essai `/essai/financier` est déclaré
    // `financier: true` TOUT EN autorisant le consultant à entrer — c'est
    // délibéré, c'est ce qui permet au test « marque NULLE pour un non-admin » de
    // prouver que la marque ne dépend pas de la liste de rôles déclarée par la
    // route. Le balayage, qui ne sait pas distinguer un banc d'une route de
    // produit, le compte donc comme une anomalie. Assérer la liste entière
    // rendrait ce test rouge en permanence ; l'ignorer le rendrait aveugle. On
    // assère donc exactement ce que le balayage doit prouver DU PRODUIT.
    const surLaRouteDuProduit = rapport.anomaliesDeCouverture.filter((anomalie) =>
      anomalie.includes('/v1/scoping/:id/financials'),
    );
    expect(
      surLaRouteDuProduit,
      `La route financière du produit a été ATTEINTE sans refus :\n${decrireRapport(rapport)}`,
    ).toStrictEqual([]);
  });

  it('@critique CEINTURE 4 — la cartographie NE DÉBORDE PAS d’un gabarit à l’autre', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // LA CONTRE-ÉPREUVE DU MÉCANISME ① — sans elle, le test précédent est vert
    // par vacuité, exactement comme il l'a été jusqu'au 2026-08-31.
    // ═════════════════════════════════════════════════════════════════════════
    // On relance le balayage avec des ŒILLÈRES : `:id` n'est déclaré que pour LA
    // route financière, et une ligne périmée désigne un gabarit qui n'existe pas.
    // Le rapport DOIT alors dénoncer les deux — les autres porteurs de `:id`
    // (dont `/v1/companies/:id`) comme NON cartographiés, et la ligne périmée
    // comme inutile.
    //
    // Si `parametresNonCartographies` revenait VIDE, cela signifierait que la
    // valeur du cadrage a de nouveau servi de repli aux autres gabarits : le
    // repli global serait revenu par une porte dérobée, et l'assertion « liste
    // vide » du test précédent ne pourrait plus jamais rougir. C'est LE défaut
    // qu'A02 a mesuré ; il ne se referme que par cette épreuve.
    const aOeilleres = await balayerSentinellesFinancieres({
      app: api(),
      porteurs: { lecteur: jetons.lecteur },
      cartographieDeParametres: {
        '/v1/scoping/:id/financials': { id: cadrageAvecFinancier },
        // ═══════════════════════════════════════════════════════════════════════
        // LE GABARIT FAUTIF DOIT ÊTRE INCAPABLE DE DEVENIR VRAI. LEÇON DATÉE.
        // ═══════════════════════════════════════════════════════════════════════
        // Cette ligne portait `/v1/missions/:id`, commentée « la route rêvée, ou
        // renommée ». L3b a livré cette route le jour même : la contre-épreuve
        // déclarait alors un gabarit BIEN RÉEL, `declarationsInutiles` revenait vide
        // — à juste titre — et le test rougissait sans qu'aucun défaut n'existe.
        // C'est la SECONDE fois dans la même journée qu'un test se casse pour avoir
        // visé un chemin que le produit a fini par servir (un méta-test de L2
        // greffait `/v1/missions/:missionId` sur l'app réelle), d'où la règle,
        // écrite ici une fois pour toutes :
        //
        //   UN CAS-TÉMOIN NÉGATIF NE SE CONSTRUIT JAMAIS SUR UN CHEMIN PLAUSIBLE.
        //   Une route « qui n'existe pas encore » n'est pas une absence : c'est un
        //   délai. Le témoin doit être hors de tout espace de nommage que le produit
        //   puisse atteindre, sans quoi le test a une date de péremption que
        //   personne n'a écrite.
        //
        // Pourquoi CE gabarit-ci est sûr : il ne vit ni sous `/v1` (le seul préfixe
        // que `construireApp` monte) ni sous `/essai` (celui des bancs de ce
        // fichier) ; il ne nomme aucun domaine métier, donc aucun lot ne peut le
        // livrer par hasard ; et son segment `__temoin-negatif__` est RÉSERVÉ par le
        // présent commentaire — l'y voir apparaître ailleurs serait déjà l'anomalie.
        '/__temoin-negatif__/aucune-route-ici/:id': { id: uuidv7() },
      },
    });

    expect(
      aOeilleres.parametresNonCartographies,
      'Le balayage n’a dénoncé AUCUN gabarit non cartographié alors qu’il en reste\n' +
        'plusieurs porteurs de `:id`. La valeur déclarée pour la route financière a donc\n' +
        'servi de repli aux autres : le mécanisme ① est mort, et l’assertion « liste\n' +
        'vide » du test précédent ne peut plus rougir.',
    ).toContain('/v1/companies/:id → :id');

    expect(
      aOeilleres.parametresNonCartographies,
      'Le gabarit EXPLICITEMENT cartographié ne doit évidemment pas être dénoncé :\n' +
        'un mécanisme qui crie sur tout est débranché sous quinze jours.',
    ).not.toContain('/v1/scoping/:id/financials → :id');

    expect(
      aOeilleres.declarationsInutiles,
      'Une ligne de cartographie désignant un gabarit ABSENT du registre doit être\n' +
        'dénoncée : sans quoi la table dérive et l’on croit semer une route disparue.',
    ).toContain('/__temoin-negatif__/aucune-route-ici/:id → :id');
  });

  it('@critique CEINTURE 4 — la frontière du silence est éprouvée PAR SES DEUX CÔTÉS', () => {
    // `natureDuSilence` est exportée pour la même raison que `detecterSentinelles` :
    // prouver la sensibilité du classificateur sans dépendre d'une route. Un
    // classificateur qui dirait « anormal » à tout rendrait le test rouge en
    // permanence, donc débranché ; un qui dirait « structurel » à tout ramènerait
    // le compteur muet d'avant. Les deux côtés, donc, pas l'un ou l'autre.
    expect(
      natureDuSilence('GET', [404, 404, 404]),
      'Un 404 pour TOUS les porteurs est le défaut historique : la valeur substituée\n' +
        'ne désigne rien, et le balayage n’a traversé aucune route.',
    ).toBe('anormal');
    expect(
      natureDuSilence('GET', [400]),
      'Un 400 sur une méthode SANS corps ne peut venir que d’un paramètre malformé —\n' +
        'donc d’une cartographie fausse, pas d’un refus du produit.',
    ).toBe('anormal');
    expect(
      natureDuSilence('GET', [429]),
      'Un balayage étranglé par le quota est vert par étranglement.',
    ).toBe('anormal');
    expect(natureDuSilence('GET', [500])).toBe('anormal');
    expect(
      natureDuSilence('GET', []),
      'Aucun appel = aucune preuve. Le silence total est le pire des silences.',
    ).toBe('anormal');

    expect(
      natureDuSilence('POST', [400, 400]),
      'Le balayage envoie un corps VIDE : une route à schéma le refuse légitimement et\n' +
        'son gestionnaire n’a jamais tourné. Compter cela comme une anomalie rendrait le\n' +
        'garde-fou rouge en permanence — donc inutile.',
    ).toBe('structurel');
    expect(natureDuSilence('GET', [405])).toBe('structurel');
    expect(
      natureDuSilence('POST', [400, 404]),
      'Un seul statut inexplicable suffit : la frontière est conjonctive, sinon un 404\n' +
        'se cacherait derrière un 400 légitime.',
    ).toBe('anormal');
  });

  it('@critique le détecteur de sentinelles est SENSIBLE, y compris au format français', () => {
    // Un détecteur aveugle rendrait tous les tests ci-dessus verts. On prouve qu'il
    // voit — et qu'il voit la variante `987654,21`, celle qu'une couche
    // d'affichage produirait.
    for (const valeur of VALEURS_SENTINELLES) {
      expect(detecterSentinelles(`bruit ${valeur} bruit`)).toContain(valeur);
    }
    const francais = SENTINELLES_FINANCIERES.totalAmount.replace('.', ',');
    expect(
      detecterSentinelles(`total : ${francais} EUR`),
      'La variante à virgule décimale doit être détectée : sinon toute fuite passée\n' +
        'par une couche de formatage serait invisible au balayage.',
    ).toContain(SENTINELLES_FINANCIERES.totalAmount);
    expect(detecterSentinelles('aucun montant ici')).toStrictEqual([]);
  });
});
