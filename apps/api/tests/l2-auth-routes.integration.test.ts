// =============================================================================
// LOT L2 / T6 — LES TROIS ROUTES D'AUTHENTIFICATION, ÉPROUVÉES SUR UNE BASE RÉELLE.
//
// `POST /v1/auth/login` · `POST /v1/auth/refresh` · `POST /v1/auth/logout`.
//
// Écrit par A16, qui n'a produit AUCUNE des lignes testées (09 §5.6). Les attentes
// viennent de la SPÉCIFICATION — 05 §8.1, 06 §10.1/§10.2, 11 §3, et la note
// `docs/conception/LOT_L2.md` §2.3 — jamais de la lecture du code d'A14 pris pour
// énoncé. Un test qui décalque les branches de son sujet ne teste que lui-même.
//
// ── CE QUE CE FICHIER MESURE, ET QUI NE SE VOIT PAS EN RELISANT LE CODE ───────
//   · la rotation LAISSE VIVRE l'ancienne ligne, révoquée (invariant 7) ;
//   · la détection de réutilisation a un COÛT chiffré — elle déconnecte un
//     appareil innocent, et le test le compte au lieu de se contenter du code
//     d'erreur ;
//   · la fenêtre de grâce et la détection ne diffèrent QUE par le délai ;
//   · les quatre causes de refus de connexion rendent la même réponse à l'octet
//     près ET consomment le MÊME travail Argon2id ;
//   · rien de tout cela n'apparaît dans les journaux pino.
//
// ── DEUX SONDES, ET POURQUOI ELLES SONT LÉGITIMES ────────────────────────────
// `hash-wasm` et `pino` sont interceptés (`vi.mock`) en gardant l'implémentation
// RÉELLE dessous : la première compte le travail de dérivation effectivement
// consommé, la seconde détourne la destination du journal vers un tableau. Aucune
// des deux ne remplace un comportement — elles observent. C'est la seule façon
// d'éprouver deux propriétés qui n'ont aucune trace dans la réponse HTTP.
//
// ── CE QUI N'EST PAS TESTÉ ICI, ET POURQUOI (dit plutôt que bâclé) ────────────
// LA CHRONOMÉTRIE. Un test qui exigerait « le rapport entre la cause la plus lente
// et la plus rapide reste sous X » est intermittent par nature : la mesure faite
// sur cette base (cinq passes de 21 échantillons entrelacés) donne des rapports de
// 1,05 à 1,25 et le cas le plus lent PERMUTE à chaque passe. Une suite
// intermittente finit ignorée, et c'est ainsi qu'un vrai échec passe pour du bruit.
// La propriété est donc éprouvée par sa CAUSE — le nombre d'unités de travail
// Argon2id — qui est déterministe, et non par son symptôme, qui ne l'est pas.
//
// Traçabilité : E5 (RBAC serveur systématique), E33, E43.
// =============================================================================
import { randomBytes } from 'node:crypto';
import type * as ModuleHashWasm from 'hash-wasm';
import type * as ModulePino from 'pino';
import { argon2id } from 'hash-wasm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
// LES DEUX SONDES — déclarées avant tout import applicatif (`vi.hoisted`).
// -----------------------------------------------------------------------------
const sondes = vi.hoisted(() => ({
  /**
   * Unités de travail Argon2id RÉELLEMENT consommées, c'est-à-dire les appels qui
   * SE TERMINENT. Un appel qui lève (empreinte illisible : l'analyse de la chaîne
   * échoue avant toute dérivation) n'a coûté aucun calcul et ne compte pas — sinon
   * la sonde mesurerait des appels, pas du temps.
   */
  travauxArgon2: 0,
  /** Toutes les lignes écrites par pino pendant l'exécution. */
  lignesJournal: [] as string[],
}));

vi.mock('hash-wasm', async (importOriginal) => {
  const reel = await importOriginal<typeof ModuleHashWasm>();
  return {
    ...reel,
    argon2id: async (options: Parameters<typeof reel.argon2id>[0]) => {
      const resultat = await reel.argon2id(options);
      sondes.travauxArgon2 += 1;
      return resultat;
    },
    argon2Verify: async (options: Parameters<typeof reel.argon2Verify>[0]) => {
      const resultat = await reel.argon2Verify(options);
      sondes.travauxArgon2 += 1;
      return resultat;
    },
  };
});

vi.mock('pino', async (importOriginal) => {
  const reel = await importOriginal<typeof ModulePino>();
  const destination = {
    write(ligne: string): void {
      sondes.lignesJournal.push(ligne);
    },
  };
  // La fabrique garde les OPTIONS de l'appelant — donc la redaction RGPD réelle —
  // et ne remplace que la destination. On teste la politique du dépôt, pas la nôtre.
  const fabrique = (options?: Parameters<typeof reel.pino>[0]): unknown =>
    reel.pino(options ?? {}, destination);
  const exporte = Object.assign(fabrique, reel.pino);
  return { ...reel, pino: exporte, default: exporte };
});

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// 64 caractères hexadécimaux = les 32 octets qu'exige `envApiSchema`.
// -----------------------------------------------------------------------------
const SECRET_ACCES = '5a'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '7c'.repeat(32);

/**
 * Durées de vie POSÉES EXPLICITEMENT aux valeurs du contrat (11 §3 : « Access
 * 15 min / refresh 30 j »). Les lire de l'environnement ambiant ferait dépendre le
 * verdict d'un `.env` non versionné : le test affirmerait alors la configuration de
 * la machine, pas celle du contrat.
 */
const TTL_ACCES = '15m';
const TTL_RAFRAICHISSEMENT = '30d';
const MINUTE_MS = 60_000;
const JOUR_MS = 24 * 60 * MINUTE_MS;

/**
 * Paramètres Argon2id des empreintes SEMÉES. Délibérément DIFFÉRENTS de ceux du
 * code livré (itérations 2 au lieu de 3) : la vérification doit lire les paramètres
 * ENCODÉS dans l'empreinte, jamais les redéclarer de son côté. Une implémentation
 * qui imposerait ses propres paramètres échouerait ici — et échouerait surtout le
 * jour où l'on durcira le coût sans re-hacher les comptes existants.
 */
const PARAMETRES_SEMENCE = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19_456,
  hashLength: 32,
} as const;

let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// -----------------------------------------------------------------------------
// Une IP par appel — le quota ne doit JAMAIS décider du verdict d'un autre test
// -----------------------------------------------------------------------------
/**
 * Le plafond `/v1/auth/*` est de 10 req/min PAR IP. Sans adresse distincte par
 * appel, l'ORDRE des `it` déciderait des verdicts, et une suite dont le résultat
 * dépend de son ordre ne prouve rien. Les tests qui éprouvent le quota lui-même
 * demandent explicitement une adresse FIXE.
 *
 * `request.ip` étant EXPURGÉ des journaux par la politique RGPD, c'est aussi la
 * seule façon d'observer la clé de quota : par injection, jamais par lecture d'un
 * journal.
 */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  const a = Math.floor(compteurIp / 62_500) % 250;
  const b = Math.floor(compteurIp / 250) % 250;
  const c = compteurIp % 250;
  return `10.${String(a)}.${String(b)}.${String(c)}`;
}

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly corps: string;
  readonly entetes: Readonly<Record<string, string>>;
}

const erreurSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

/** Le contrat de session, réécrit depuis 05 §8.1 et 11 §3 — pas importé du code. */
const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  accessExpiresAt: z.string(),
  refreshExpiresAt: z.string(),
  userId: z.uuid(),
});
type Session = z.infer<typeof sessionSchema>;

async function poster(
  url: string,
  charge: Readonly<Record<string, unknown>>,
  options: { readonly jeton?: string; readonly ip?: string } = {},
): Promise<Reponse> {
  const reponse = await api().inject({
    method: 'POST',
    url,
    payload: charge,
    headers: {
      'x-forwarded-for': options.ip ?? ipUnique(),
      ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }),
    },
  });
  let code: string | null = null;
  if (reponse.body !== '') {
    const analyse = erreurSchema.safeParse(JSON.parse(reponse.body));
    if (analyse.success) code = analyse.data.error.code;
  }
  const entetes: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(reponse.headers)) {
    if (typeof valeur === 'string') entetes[cle] = valeur;
    else if (typeof valeur === 'number') entetes[cle] = String(valeur);
  }
  return { statut: reponse.statusCode, code, corps: reponse.body, entetes };
}

function session(reponse: Reponse): Session {
  return sessionSchema.parse(JSON.parse(reponse.corps));
}

// -----------------------------------------------------------------------------
// Comptes — un jeu FRAIS par test, jamais un compte partagé
// -----------------------------------------------------------------------------
interface Compte {
  readonly id: string;
  readonly email: string;
  readonly motDePasse: string;
}

let compteurCompte = 0;

/**
 * Sème un compte. Le mot de passe porte « factice » : c'est un secret de test, et
 * il doit se lire comme tel (11 §2, 30.4-5).
 */
async function creerCompte(
  marqueur: string,
  options: { readonly actif?: boolean; readonly empreinteIllisible?: boolean } = {},
): Promise<Compte> {
  compteurCompte += 1;
  const suffixe = `${marqueur}-${String(compteurCompte)}`;
  const id = uuidv7();
  const email = `compte.${suffixe}@exemple.test`;
  const motDePasse = `mot-de-passe-factice-${suffixe}`;

  const empreinte =
    options.empreinteIllisible === true
      ? 'empreinte-tronquee-a-la-restauration'
      : await argon2id({
          password: motDePasse,
          salt: randomBytes(16),
          ...PARAMETRES_SEMENCE,
          outputType: 'encoded',
        });

  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'consultant', 'guide_strict', now(), $5, now(), now())`,
    [id, `Compte ${suffixe}`, email, empreinte, options.actif ?? true],
  );

  return { id, email, motDePasse };
}

// -----------------------------------------------------------------------------
// Lecture directe de `refresh_tokens` — la seule vérité sur ce qui a été révoqué
// -----------------------------------------------------------------------------
interface LigneJeton {
  readonly id: string;
  readonly token_hash: string;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

async function lignesJeton(utilisateurId: string): Promise<LigneJeton[]> {
  const resultat = await bd().query<LigneJeton>(
    `SELECT id, token_hash, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1 ORDER BY id`,
    [utilisateurId],
  );
  return resultat.rows;
}

async function lignesVivantes(utilisateurId: string): Promise<LigneJeton[]> {
  return (await lignesJeton(utilisateurId)).filter((l) => l.revoked_at === null);
}

/** Connexion nominale — le point de départ de presque tous les scénarios. */
async function seConnecter(compte: Compte): Promise<Session> {
  const reponse = await poster('/v1/auth/login', {
    email: compte.email,
    password: compte.motDePasse,
  });
  expect(reponse.statut, `la connexion de ${compte.email} devait réussir`).toBe(200);
  return session(reponse);
}

/**
 * Antidate la révocation d'une ligne pour SORTIR de la fenêtre de grâce.
 *
 * On ne dort pas 60 secondes : une suite qui attend est une suite qu'on finit par
 * ne plus lancer. On déplace l'HORODATAGE, qui est exactement la variable dont
 * dépend la décision — le reste du scénario est identique au cas de grâce.
 */
async function antidaterRevocation(jetonId: string, minutes: number): Promise<void> {
  await bd().query(
    `UPDATE refresh_tokens SET revoked_at = now() - ($2 || ' minutes')::interval WHERE id = $1`,
    [jetonId, String(minutes)],
  );
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l2_auth_routes');
  nomBase = base.nom;
  await appliquerMontee(base.url);
  client = await connecter(base.url);

  // La configuration est lue AU CHARGEMENT des modules applicatifs : elle doit être
  // posée avant le premier `import()` dynamique, jamais après.
  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = TTL_ACCES;
  process.env.JWT_REFRESH_TTL = TTL_RAFRAICHISSEMENT;
  // `trace` : on veut TOUT ce que le service écrit, sinon la preuve « rien ne fuit »
  // ne vaudrait que pour les niveaux qu'on aurait bien voulu regarder.
  process.env.LOG_LEVEL = 'trace';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;
}, 180_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// POST /v1/auth/login — L'ABSENCE D'ORACLE EST LA PROPRIÉTÉ, PAS UN DÉTAIL
// =============================================================================
describe('POST /v1/auth/login — absence d’oracle', () => {
  it('@critique les QUATRE causes de refus rendent la même réponse, à l’octet près', async () => {
    const actif = await creerCompte('oracle-actif');
    const desactive = await creerCompte('oracle-desactive', { actif: false });
    const corrompu = await creerCompte('oracle-corrompu', { empreinteIllisible: true });

    const causes = [
      {
        nom: 'mot de passe faux sur un compte existant et actif',
        charge: { email: actif.email, password: 'mot-de-passe-factice-qui-nest-pas-le-bon' },
      },
      {
        nom: 'compte inexistant',
        charge: {
          email: 'compte.jamais-cree@exemple.test',
          password: 'mot-de-passe-factice-quelconque',
        },
      },
      {
        nom: 'compte DÉSACTIVÉ avec le BON mot de passe',
        charge: { email: desactive.email, password: desactive.motDePasse },
      },
      {
        nom: 'empreinte illisible en base',
        charge: { email: corrompu.email, password: corrompu.motDePasse },
      },
    ] as const;

    const reponses: { readonly nom: string; readonly reponse: Reponse }[] = [];
    for (const cause of causes) {
      reponses.push({ nom: cause.nom, reponse: await poster('/v1/auth/login', cause.charge) });
    }

    const reference = reponses[0];
    if (reference === undefined) throw new Error('aucune réponse collectée');

    const divergences = reponses
      .filter(
        ({ reponse }) =>
          reponse.statut !== reference.reponse.statut || reponse.corps !== reference.reponse.corps,
      )
      .map(
        ({ nom, reponse }) =>
          `« ${nom} » → ${String(reponse.statut)} ${reponse.corps} ` +
          `(référence : ${String(reference.reponse.statut)} ${reference.reponse.corps})`,
      );

    expect(
      divergences,
      'Quatre causes, une seule réponse. La moindre différence — un code, un mot du\n' +
        'message, un champ `details` en plus — transforme la route en ORACLE : on\n' +
        'énumère alors les comptes qui existent, et l’on apprend qu’un ancien salarié\n' +
        'a bien gardé son mot de passe. Le cas « compte désactivé avec le BON mot de\n' +
        'passe » est le plus tentant à distinguer par gentillesse : c’est celui qui\n' +
        'divulgue le plus.',
    ).toStrictEqual([]);

    expect(reference.reponse.statut).toBe(401);
    expect(reference.reponse.code).toBe('INVALID_CREDENTIALS');
    expect(
      reference.reponse.corps,
      'Le corps ne doit pas répéter l’adresse tentée : une réponse d’erreur qui cite\n' +
        'l’adresse la rend visible dans les traces d’un proxy comme dans un rapport de bug.',
    ).not.toContain(actif.email);
  });

  it('@critique les quatre causes consomment le MÊME travail Argon2id', async () => {
    // POURQUOI CE TEST EXISTE, ET POURQUOI IL NE CHRONOMÈTRE RIEN.
    // Le temps de réponse est un oracle aussi sûr qu’un message d’erreur, mais un
    // seuil de durée est intermittent en CI. On mesure donc la CAUSE : le nombre de
    // dérivations Argon2id effectivement calculées. Elle est déterministe, et c’est
    // exactement la grandeur qui a trahi le défaut réel du 2026-08-29 — un leurre
    // construit paresseusement faisait payer DEUX dérivations à la première tentative
    // sur un compte inexistant (450 ms contre 203 ms sur une API fraîchement démarrée).
    const actif = await creerCompte('cout-actif');
    const desactive = await creerCompte('cout-desactive', { actif: false });
    const corrompu = await creerCompte('cout-corrompu', { empreinteIllisible: true });

    const scenarios = [
      {
        nom: 'mot de passe faux',
        charge: { email: actif.email, password: 'mot-de-passe-factice-errone' },
      },
      {
        nom: 'compte inexistant',
        charge: {
          email: 'compte.absent-du-registre@exemple.test',
          password: 'mot-de-passe-factice-quelconque',
        },
      },
      {
        nom: 'compte désactivé, bon mot de passe',
        charge: { email: desactive.email, password: desactive.motDePasse },
      },
      {
        nom: 'empreinte illisible',
        charge: { email: corrompu.email, password: corrompu.motDePasse },
      },
      {
        nom: 'connexion RÉUSSIE',
        charge: { email: actif.email, password: actif.motDePasse },
      },
    ] as const;

    const couts: { readonly nom: string; readonly unites: number }[] = [];
    for (const scenario of scenarios) {
      sondes.travauxArgon2 = 0;
      await poster('/v1/auth/login', scenario.charge);
      couts.push({ nom: scenario.nom, unites: sondes.travauxArgon2 });
    }

    const anormaux = couts.filter((c) => c.unites !== 1);
    expect(
      anormaux.map((c) => `« ${c.nom} » : ${String(c.unites)} dérivation(s)`),
      'Chaque issue de la connexion doit coûter EXACTEMENT UNE dérivation Argon2id.\n' +
        'Zéro trahit un court-circuit (le compte inconnu répondrait en une milliseconde\n' +
        'là où un mot de passe faux en prend cinquante) ; deux trahit un leurre\n' +
        'fabriqué à la demande, qui rend la PREMIÈRE tentative sur un compte\n' +
        'inexistant deux fois plus lente que toutes les suivantes — et donc\n' +
        'reconnaissable sur une API fraîchement démarrée.',
    ).toStrictEqual([]);
  });

  it('un mot de passe hors gabarit est refusé SANS payer la moindre dérivation', async () => {
    const compte = await creerCompte('gabarit');
    sondes.travauxArgon2 = 0;

    const reponse = await poster('/v1/auth/login', {
      email: compte.email,
      password: 'x'.repeat(4096),
    });

    expect(reponse.statut).toBe(400);
    expect(reponse.code).toBe('VALIDATION_FAILED');
    expect(
      sondes.travauxArgon2,
      'La borne de longueur n’est pas cosmétique : sans elle, un mot de passe d’un\n' +
        'mégaoctet ferait travailler Argon2id gratuitement, dix fois par minute et par\n' +
        'adresse. Le refus doit intervenir AVANT la dérivation.',
    ).toBe(0);
  });
});

describe('POST /v1/auth/login — le couple émis', () => {
  it('rend un couple conforme au contrat, et enregistre le rafraîchissement', async () => {
    const compte = await creerCompte('couple');
    const avant = Date.now();
    const emise = await seConnecter(compte);

    expect(emise.userId).toBe(compte.id);
    expect(emise.tokenType).toBe('Bearer');

    const expirationAcces = Date.parse(emise.accessExpiresAt);
    const expirationRafraichissement = Date.parse(emise.refreshExpiresAt);
    expect(emise.accessExpiresAt.endsWith('Z'), 'ISO 8601 UTC (11 §3)').toBe(true);
    expect(emise.refreshExpiresAt.endsWith('Z'), 'ISO 8601 UTC (11 §3)').toBe(true);
    expect(Math.abs(expirationAcces - (avant + 15 * MINUTE_MS))).toBeLessThan(30_000);
    expect(Math.abs(expirationRafraichissement - (avant + 30 * JOUR_MS))).toBeLessThan(5 * MINUTE_MS);

    const lignes = await lignesJeton(compte.id);
    expect(lignes).toHaveLength(1);
    const ligne = lignes[0];
    if (ligne === undefined) throw new Error('ligne absente');
    expect(ligne.revoked_at).toBeNull();
    expect(
      ligne.token_hash,
      'La colonne s’appelle `token_hash` : elle porte une EMPREINTE. Y trouver le\n' +
        'jeton en clair rendrait un vol de sauvegarde équivalent à un vol de session.',
    ).not.toBe(emise.refreshToken);
    expect(ligne.token_hash).not.toContain(emise.refreshToken);
  });

  it('le jeton de rafraîchissement est OPAQUE — jamais un JWT', async () => {
    const compte = await creerCompte('opacite');
    const emise = await seConnecter(compte);

    expect(
      emise.refreshToken.includes('.'),
      'Un JWT invite à faire confiance à ses revendications, donc à sauter la lecture\n' +
        'en base — or CETTE LECTURE EST LA DÉTECTION de réutilisation (note L2 §2.3).\n' +
        'Le jeton de rafraîchissement doit être un secret opaque, sans structure à lire.',
    ).toBe(false);
    expect(emise.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(() => api().jwt.verify(emise.refreshToken)).toThrow();

    // Le jeton d'ACCÈS, lui, est bien un JWT porteur de la seule identité.
    const charge: unknown = api().jwt.verify(emise.accessToken);
    const analyse = z.object({ sub: z.uuid(), exp: z.number() }).safeParse(charge);
    expect(analyse.success).toBe(true);
    expect(analyse.success ? analyse.data.sub : null).toBe(compte.id);
    expect(
      JSON.stringify(charge),
      'Le jeton porte l’identité, JAMAIS les droits (note L2 §2.1) : un rôle embarqué\n' +
        'survivrait quinze minutes à une révocation.',
    ).not.toContain('role');
  });

  it('pose `last_login_at` SANS toucher `updated_at`', async () => {
    const compte = await creerCompte('horodatage');

    const avant = await bd().query<{ last_login_at: Date | null; updated_at: Date }>(
      'SELECT last_login_at, updated_at FROM users WHERE id = $1',
      [compte.id],
    );
    const ligneAvant = avant.rows[0];
    if (ligneAvant === undefined) throw new Error('compte absent');
    expect(ligneAvant.last_login_at).toBeNull();

    await seConnecter(compte);

    const apres = await bd().query<{ last_login_at: Date | null; updated_at: Date }>(
      'SELECT last_login_at, updated_at FROM users WHERE id = $1',
      [compte.id],
    );
    const ligneApres = apres.rows[0];
    if (ligneApres === undefined) throw new Error('compte absent');

    expect(ligneApres.last_login_at).not.toBeNull();
    expect(
      ligneApres.updated_at.getTime(),
      '`updated_at` date la dernière modification MÉTIER de la fiche. Une connexion\n' +
        'n’en est pas une : la faire bouger ferait remonter tous les comptes actifs en\n' +
        'tête d’un tri « modifiés récemment » et rendrait la colonne inutilisable pour\n' +
        'un delta de synchronisation.',
    ).toBe(ligneAvant.updated_at.getTime());
  });
});

describe('POST /v1/auth/login — validation et normalisation', () => {
  it('refuse une adresse invalide, un mot de passe vide, un corps incomplet', async () => {
    const cas = [
      { email: 'pas-une-adresse', password: 'mot-de-passe-factice-valide' },
      { email: 'compte.forme@exemple.test', password: '' },
      { email: 'compte.forme@exemple.test' },
      {},
    ];
    for (const charge of cas) {
      const reponse = await poster('/v1/auth/login', charge);
      expect(reponse.statut, `charge refusée : ${JSON.stringify(charge)}`).toBe(400);
      expect(reponse.code).toBe('VALIDATION_FAILED');
    }
  });

  it('les espaces autour de l’adresse sont retirés, pas refusés', async () => {
    const compte = await creerCompte('espaces');
    const reponse = await poster('/v1/auth/login', {
      email: `  ${compte.email}  `,
      password: compte.motDePasse,
    });
    expect(
      reponse.statut,
      'Un copier-coller depuis un client de messagerie amène presque toujours une\n' +
        'espace : la refuser produirait un « mot de passe incorrect » incompréhensible.',
    ).toBe(200);
  });

  it('COMPORTEMENT CONSTATÉ — une adresse dont seule la CASSE diffère n’est pas reconnue', async () => {
    // QUESTION OUVERTE, à trancher dans `DECISIONS.md` — le pack ne dit rien de la
    // casse des adresses, et `users.email` est un TEXT avec un UNIQUE SENSIBLE À LA
    // CASSE (04, `users_email_key`). Deux conséquences, aucune n’est neutre :
    //   · l’auditeur qui saisit « Prenom.Nom@… » sur un clavier de tablette (majuscule
    //     automatique en début de champ) reçoit « identifiants incorrects » ;
    //   · rien n’empêche de créer DEUX comptes qui ne diffèrent que par la casse.
    // Ce test fige le comportement d’aujourd’hui pour qu’un changement soit VOULU :
    // s’il rougit, c’est que quelqu’un a normalisé la casse — qu’il l’écrive alors
    // dans `DECISIONS.md` plutôt que de le découvrir en clientèle.
    const compte = await creerCompte('casse');
    const enMajuscules = compte.email.toUpperCase();
    expect(enMajuscules).not.toBe(compte.email);

    const reponse = await poster('/v1/auth/login', {
      email: enMajuscules,
      password: compte.motDePasse,
    });
    expect(reponse.statut).toBe(401);
    expect(
      reponse.code,
      'Quel que soit l’arbitrage sur la casse, une chose ne se négocie pas : le refus\n' +
        'doit être INDISCERNABLE de celui d’un compte inexistant (06 §10.2). Sinon la\n' +
        'variation de casse devient elle-même un oracle d’existence.',
    ).toBe('INVALID_CREDENTIALS');
  });
});

// =============================================================================
// POST /v1/auth/refresh — ROTATION, GRÂCE, RÉUTILISATION
// =============================================================================
describe('POST /v1/auth/refresh — rotation', () => {
  it('@critique le jeton change ET l’ancienne ligne SURVIT, révoquée', async () => {
    const compte = await creerCompte('rotation');
    const premiere = await seConnecter(compte);

    const reponse = await poster('/v1/auth/refresh', { refreshToken: premiere.refreshToken });
    expect(reponse.statut).toBe(200);
    const seconde = session(reponse);

    expect(seconde.refreshToken).not.toBe(premiere.refreshToken);
    expect(seconde.userId).toBe(compte.id);

    // CE QUE JE N'AFFIRME PAS, ET POURQUOI. J'avais d'abord exigé que le jeton
    // d'ACCÈS change aussi ; il ne change pas quand la rotation tombe dans la même
    // seconde que la connexion — `iat` et `exp` d'un JWT sont en SECONDES entières
    // (RFC 7519) et la charge utile ne porte rien d'autre que `sub`. Deux chaînes
    // identiques sont alors le MÊME jeton, ce qui est correct : l'accès n'est ni
    // révocable ni corrélé à une ligne. C'est la ROTATION DU RAFRAÎCHISSEMENT qui
    // est la garantie de 06 §10.1 — exiger davantage aurait produit un test
    // intermittent, vert ou rouge selon la milliseconde de son exécution.
    expect(api().jwt.verify<{ sub: string }>(seconde.accessToken).sub).toBe(compte.id);

    const lignes = await lignesJeton(compte.id);
    expect(
      lignes,
      'Invariant 7 : rien n’est silencieusement supprimé. Si la rotation EFFAÇAIT\n' +
        'l’ancienne ligne, « jeton rejoué » et « jeton jamais émis » deviendraient\n' +
        'indiscernables — et la détection de réutilisation, qui repose entièrement sur\n' +
        'la présence d’une ligne révoquée, ne détecterait plus rien du tout.',
    ).toHaveLength(2);

    const revoquees = lignes.filter((l) => l.revoked_at !== null);
    const vivantes = lignes.filter((l) => l.revoked_at === null);
    expect(revoquees).toHaveLength(1);
    expect(vivantes).toHaveLength(1);
  });

  it('un jeton INCONNU rend UNAUTHENTICATED, jamais TOKEN_EXPIRED', async () => {
    const reponse = await poster('/v1/auth/refresh', {
      refreshToken: randomBytes(32).toString('base64url'),
    });
    expect(reponse.statut).toBe(401);
    expect(
      reponse.code,
      'Répondre TOKEN_EXPIRED ici apprendrait à qui présente un jeton volé qu’il a\n' +
        'BIEN été émis un jour : c’est un oracle sur l’existence d’une session.',
    ).toBe('UNAUTHENTICATED');
  });

  it('un jeton PÉRIMÉ rend TOKEN_EXPIRED et sa ligne devient révoquée', async () => {
    const compte = await creerCompte('perime');
    const emise = await seConnecter(compte);
    await bd().query(
      `UPDATE refresh_tokens SET expires_at = now() - interval '1 day' WHERE user_id = $1`,
      [compte.id],
    );

    const reponse = await poster('/v1/auth/refresh', { refreshToken: emise.refreshToken });
    expect(reponse.statut).toBe(401);
    expect(reponse.code).toBe('TOKEN_EXPIRED');

    expect(
      await lignesVivantes(compte.id),
      'Une ligne périmée mais NON révoquée resterait éternellement candidate à une\n' +
        '« réutilisation » qui n’en est pas une : le premier rejeu tardif d’un auditeur\n' +
        'rentré de mission déconnecterait tous ses appareils.',
    ).toHaveLength(0);
  });

  it('refuse un jeton vide ou un corps sans jeton (400, pas 401)', async () => {
    for (const charge of [{ refreshToken: '' }, {}, { refreshToken: 'x'.repeat(4096) }]) {
      const reponse = await poster('/v1/auth/refresh', charge);
      expect(reponse.statut, JSON.stringify(charge)).toBe(400);
      expect(reponse.code).toBe('VALIDATION_FAILED');
    }
  });

  it('un compte désactivé entre deux rotations perd TOUS ses jetons', async () => {
    const compte = await creerCompte('desactive-en-vol');
    const emise = await seConnecter(compte);
    await bd().query('UPDATE users SET is_active = false WHERE id = $1', [compte.id]);

    const reponse = await poster('/v1/auth/refresh', { refreshToken: emise.refreshToken });
    expect(reponse.statut).toBe(401);
    expect(
      reponse.code,
      'On ne dit pas « votre compte est désactivé » : ce serait confirmer son existence.',
    ).toBe('UNAUTHENTICATED');
    expect(
      await lignesVivantes(compte.id),
      'Sinon la désactivation ne durerait que jusqu’au prochain rafraîchissement.',
    ).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// LA DISTINCTION QUI COMPTE : MÊME JETON, MÊME REQUÊTE, SEUL LE DÉLAI CHANGE
// -----------------------------------------------------------------------------
interface DeuxAppareils {
  readonly compte: Compte;
  /** Appareil A : celui qui fait tourner son jeton, puis rejoue l'ancien. */
  readonly ancienA: string;
  readonly nouveauA: string;
  readonly idLigneAncienneA: string;
  /** Appareil B : le collègue innocent, qui n'a rien fait. */
  readonly jetonB: string;
}

/**
 * Deux appareils du MÊME auditeur (l'iPad et le portable), puis une rotation sur A.
 * C'est la situation réelle : personne n'audite avec un seul appareil.
 */
async function preparerDeuxAppareils(marqueur: string): Promise<DeuxAppareils> {
  const compte = await creerCompte(marqueur);
  const a = await seConnecter(compte);
  const b = await seConnecter(compte);
  expect(await lignesVivantes(compte.id)).toHaveLength(2);

  const rotation = await poster('/v1/auth/refresh', { refreshToken: a.refreshToken });
  expect(rotation.statut).toBe(200);
  const a2 = session(rotation);

  const revoquees = (await lignesJeton(compte.id)).filter((l) => l.revoked_at !== null);
  expect(revoquees).toHaveLength(1);
  const ancienne = revoquees[0];
  if (ancienne === undefined) throw new Error('ligne révoquée introuvable');

  return {
    compte,
    ancienA: a.refreshToken,
    nouveauA: a2.refreshToken,
    idLigneAncienneA: ancienne.id,
    jetonB: b.refreshToken,
  };
}

describe('POST /v1/auth/refresh — grâce contre réutilisation : seul le délai change', () => {
  it('@critique rejoué DANS la fenêtre (< 60 s) → TOKEN_EXPIRED et la famille reste INTACTE', async () => {
    const scene = await preparerDeuxAppareils('grace');

    const reponse = await poster('/v1/auth/refresh', { refreshToken: scene.ancienA });
    expect(reponse.statut).toBe(401);
    expect(
      reponse.code,
      'Une réponse HTTP perdue puis rejouée par un réseau de chantier, ou un onglet\n' +
        'dupliqué, ne sont pas des vols. Sans fenêtre de grâce, cet incident banal\n' +
        'déconnecterait l’auditeur de TOUS ses appareils en pleine collecte.',
    ).toBe('TOKEN_EXPIRED');

    const vivantes = await lignesVivantes(scene.compte.id);
    expect(
      vivantes,
      'La famille doit être INTACTE : le jeton frais de l’appareil A et celui de\n' +
        'l’appareil B, soit deux lignes vivantes. Une seule ligne perdue ici et la\n' +
        'grâce ne servirait à rien.',
    ).toHaveLength(2);

    // La preuve d'usage, pas seulement la preuve en base : B rafraîchit toujours.
    const rotationB = await poster('/v1/auth/refresh', { refreshToken: scene.jetonB });
    expect(rotationB.statut, 'l’appareil B n’a rien fait : il doit continuer').toBe(200);
  });

  it('@critique rejoué HORS fenêtre → TOKEN_REUSE_DETECTED, et la famille entière tombe', async () => {
    const scene = await preparerDeuxAppareils('reutilisation');
    // Le SEUL changement par rapport au test précédent : l'âge de la révocation.
    await antidaterRevocation(scene.idLigneAncienneA, 5);

    const vivantesAvant = await lignesVivantes(scene.compte.id);
    expect(vivantesAvant).toHaveLength(2);

    const reponse = await poster('/v1/auth/refresh', { refreshToken: scene.ancienA });
    expect(reponse.statut).toBe(401);
    expect(reponse.code).toBe('TOKEN_REUSE_DETECTED');

    // ── LE COÛT, CHIFFRÉ — c'est l'objet de ce test, pas le code d'erreur ───────
    const apres = await lignesJeton(scene.compte.id);
    const vivantesApres = apres.filter((l) => l.revoked_at === null);
    expect(
      vivantesApres,
      'La révocation « de famille » est, faute de colonne de lignée dans le 04, la\n' +
        'révocation de TOUS les jetons vivants de l’utilisateur (note L2 §2.3).',
    ).toHaveLength(0);

    const innocentsRevoques = vivantesAvant.length;
    expect(
      innocentsRevoques,
      'DEUX sessions parfaitement légitimes viennent d’être coupées : le jeton frais\n' +
        'de l’appareil A, et surtout celui de l’appareil B — un collègue, ou le\n' +
        'portable resté au bureau, qui n’a strictement rien fait. C’est le prix\n' +
        'ASSUMÉ de 06 §10.1, et ce test existe pour qu’il reste visible et chiffré\n' +
        'plutôt que théorique.',
    ).toBe(2);

    const rotationB = await poster('/v1/auth/refresh', { refreshToken: scene.jetonB });
    expect(
      rotationB.statut,
      'L’appareil innocent est bien déconnecté : il ne peut plus rafraîchir.',
    ).toBe(401);
    expect(
      rotationB.code,
      'ET IL NE COMPREND PAS POURQUOI. Sa ligne vient d’être révoquée à l’instant :\n' +
        'il tombe donc dans la fenêtre de grâce et reçoit TOKEN_EXPIRED — « rafraîchis-\n' +
        'toi » — alors que la vraie raison est une révocation de sécurité. S’il\n' +
        'réessaie plus de 60 s plus tard, il recevra TOKEN_REUSE_DETECTED et déclenchera\n' +
        'une SECONDE détection sur un jeton qu’il n’a jamais volé. Le message affiché à\n' +
        'l’auditeur dépend donc de la seconde à laquelle son appareil réessaie.',
    ).toBe('TOKEN_EXPIRED');
  });

  it('@critique deux rotations CONCURRENTES : un 200, un TOKEN_EXPIRED, jamais une détection', async () => {
    const compte = await creerCompte('concurrence');
    const emise = await seConnecter(compte);

    const [premiere, seconde] = await Promise.all([
      poster('/v1/auth/refresh', { refreshToken: emise.refreshToken }),
      poster('/v1/auth/refresh', { refreshToken: emise.refreshToken }),
    ]);

    const statuts = [premiere.statut, seconde.statut].sort((x, y) => x - y);
    expect(
      statuts,
      'Un onglet dupliqué, ou une PWA qui relance sa requête après un timeout,\n' +
        'produit exactement cette course. L’une des deux gagne, l’autre est refusée —\n' +
        'mais aucune ne doit être prise pour un vol.',
    ).toStrictEqual([200, 401]);

    const perdante = premiere.statut === 401 ? premiere : seconde;
    expect(
      perdante.code,
      'TOKEN_REUSE_DETECTED ici couperait la synchronisation de tous les appareils\n' +
        'd’un auditeur pour une simple concurrence locale.',
    ).toBe('TOKEN_EXPIRED');

    const gagnante = premiere.statut === 200 ? premiere : seconde;
    const vivantes = await lignesVivantes(compte.id);
    expect(vivantes, 'exactement le jeton fraîchement émis, et lui seul').toHaveLength(1);

    const suite = await poster('/v1/auth/refresh', { refreshToken: session(gagnante).refreshToken });
    expect(suite.statut, 'le jeton gagnant reste utilisable').toBe(200);
  });
});

// =============================================================================
// POST /v1/auth/logout
// =============================================================================
describe('POST /v1/auth/logout', () => {
  it('@critique le jeton d’AUTRUI : 200 muet, et le jeton n’est PAS révoqué', async () => {
    const proprietaire = await creerCompte('logout-proprietaire');
    const tiers = await creerCompte('logout-tiers');

    const sessionProprietaire = await seConnecter(proprietaire);
    const sessionTiers = await seConnecter(tiers);

    const reponse = await poster(
      '/v1/auth/logout',
      { refreshToken: sessionProprietaire.refreshToken },
      { jeton: sessionTiers.accessToken },
    );

    expect(
      reponse.statut,
      'Répondre « ce jeton n’est pas le vôtre » serait un oracle : on apprendrait\n' +
        'qu’un jeton observé sur le réseau appartient bien à quelqu’un.',
    ).toBe(200);
    expect(JSON.parse(reponse.corps)).toStrictEqual({ loggedOut: true });

    const vivantes = await lignesVivantes(proprietaire.id);
    expect(
      vivantes,
      'Un logout capable de révoquer le jeton d’un autre serait un DÉNI DE SERVICE :\n' +
        'n’importe quel compte, avec n’importe quel jeton observé, couperait la\n' +
        'synchronisation d’un auditeur en clientèle. La clause de propriété doit être\n' +
        'DANS le WHERE — pas dans une vérification qu’on peut oublier d’appeler.',
    ).toHaveLength(1);

    const rotation = await poster('/v1/auth/refresh', {
      refreshToken: sessionProprietaire.refreshToken,
    });
    expect(rotation.statut, 'le propriétaire rafraîchit toujours normalement').toBe(200);
  });

  it('le sien : 200 et la ligne devient révoquée (sans disparaître)', async () => {
    const compte = await creerCompte('logout-sien');
    const emise = await seConnecter(compte);

    const reponse = await poster(
      '/v1/auth/logout',
      { refreshToken: emise.refreshToken },
      { jeton: emise.accessToken },
    );
    expect(reponse.statut).toBe(200);

    const lignes = await lignesJeton(compte.id);
    expect(lignes, 'invariant 7 : la ligne est révoquée, jamais supprimée').toHaveLength(1);
    expect(lignes[0]?.revoked_at).not.toBeNull();
  });

  it('est idempotent, et ne réécrit pas l’horodatage de révocation', async () => {
    const compte = await creerCompte('logout-idempotent');
    const emise = await seConnecter(compte);

    const premier = await poster(
      '/v1/auth/logout',
      { refreshToken: emise.refreshToken },
      { jeton: emise.accessToken },
    );
    const revoqueeApresPremier = (await lignesJeton(compte.id))[0]?.revoked_at ?? null;

    const second = await poster(
      '/v1/auth/logout',
      { refreshToken: emise.refreshToken },
      { jeton: emise.accessToken },
    );

    expect(second.statut).toBe(premier.statut);
    expect(second.corps, 'la réponse est CONSTANTE — elle ne dit pas ce qui a changé').toBe(
      premier.corps,
    );
    expect(
      (await lignesJeton(compte.id))[0]?.revoked_at?.getTime(),
      'Réécrire `revoked_at` au second appel repousserait la fenêtre de grâce et\n' +
        'permettrait de retarder indéfiniment la détection de réutilisation.',
    ).toBe(revoqueeApresPremier?.getTime());
  });

  it('un jeton de rafraîchissement inconnu rend la MÊME réponse qu’une révocation réussie', async () => {
    const compte = await creerCompte('logout-inconnu');
    const emise = await seConnecter(compte);

    const inconnu = await poster(
      '/v1/auth/logout',
      { refreshToken: randomBytes(32).toString('base64url') },
      { jeton: emise.accessToken },
    );
    expect(inconnu.statut).toBe(200);
    expect(JSON.parse(inconnu.corps)).toStrictEqual({ loggedOut: true });
    expect(await lignesVivantes(compte.id), 'et rien n’a été révoqué au passage').toHaveLength(1);
  });

  it('sans jeton d’accès → 401, et le jeton de rafraîchissement reste vivant', async () => {
    const compte = await creerCompte('logout-anonyme');
    const emise = await seConnecter(compte);

    const reponse = await poster('/v1/auth/logout', { refreshToken: emise.refreshToken });
    expect(reponse.statut).toBe(401);
    expect(reponse.code).toBe('UNAUTHENTICATED');
    expect(await lignesVivantes(compte.id)).toHaveLength(1);
  });

  it('avec un jeton d’accès EXPIRÉ → 401 TOKEN_EXPIRED (le terrain doit savoir quoi faire)', async () => {
    const compte = await creerCompte('logout-acces-perime');
    const emise = await seConnecter(compte);
    const expire = api().jwt.sign({ sub: compte.id }, { expiresIn: -60 });

    const reponse = await poster(
      '/v1/auth/logout',
      { refreshToken: emise.refreshToken },
      { jeton: expire },
    );
    expect(reponse.statut).toBe(401);
    expect(reponse.code).toBe('TOKEN_EXPIRED');
    expect(
      await lignesVivantes(compte.id),
      'PRIX ASSUMÉ, écrit ici pour qu’il soit visible : un client dont le jeton\n' +
        'd’accès a expiré NE PEUT PLUS se déconnecter côté serveur. Son jeton de\n' +
        'rafraîchissement reste vivant jusqu’à son échéance.',
    ).toHaveLength(1);
  });
});

// =============================================================================
// QUOTA — 10 req/min sur `/v1/auth/*`, PAR IP ET PAR ROUTE
// =============================================================================
describe('quota des routes d’authentification (11 §3)', () => {
  it('la 11e connexion depuis la MÊME adresse est refusée en 429', async () => {
    const compte = await creerCompte('quota');
    const ip = '10.200.0.11';

    const statuts: number[] = [];
    for (let n = 0; n < 11; n += 1) {
      const reponse = await poster(
        '/v1/auth/login',
        { email: compte.email, password: 'mot-de-passe-factice-errone' },
        { ip },
      );
      statuts.push(reponse.statut);
    }

    expect(statuts.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(
      statuts[10],
      'Le bourrage d’identifiants est la première attaque contre une API d’audit :\n' +
        'dix tentatives par minute et par adresse, pas onze.',
    ).toBe(429);

    const refus = await poster(
      '/v1/auth/login',
      { email: compte.email, password: compte.motDePasse },
      { ip },
    );
    expect(refus.statut, 'même le BON mot de passe est refusé une fois le seau vide').toBe(429);
    expect(refus.code).toBe('RATE_LIMITED');
    expect(
      refus.entetes['x-ratelimit-limit'],
      'Les en-têtes `x-ratelimit-*` sont la SEULE façon d’observer la clé de quota :\n' +
        '`request.ip` est expurgé des journaux par la politique RGPD.',
    ).toBe('10');
  });

  it('une AUTRE adresse n’est pas affectée — le seau n’est pas global', async () => {
    const compte = await creerCompte('quota-autre-ip');
    const ipSaturee = '10.200.0.12';
    for (let n = 0; n < 11; n += 1) {
      await poster(
        '/v1/auth/login',
        { email: compte.email, password: 'mot-de-passe-factice-errone' },
        { ip: ipSaturee },
      );
    }
    expect((await poster('/v1/auth/login', { email: compte.email, password: 'x' }, { ip: ipSaturee })).statut).toBe(429);

    const ailleurs = await poster(
      '/v1/auth/login',
      { email: compte.email, password: compte.motDePasse },
      { ip: '10.200.0.13' },
    );
    expect(
      ailleurs.statut,
      'Un seau GLOBAL rendrait 429 à toute la planète pour dix requêtes — déni de\n' +
        'service à coût nul sur la route même que le plafond est censé protéger.\n' +
        'Ce test est la seule chose qui empêche la régression silencieuse vers l’IP\n' +
        'du proxy (défaut réel du 2026-08-29).',
    ).toBe(200);
  });

  it('`/v1/health` n’est PAS affectée par le seau d’authentification', async () => {
    const ip = '10.200.0.14';
    const compte = await creerCompte('quota-sonde');
    for (let n = 0; n < 11; n += 1) {
      await poster('/v1/auth/login', { email: compte.email, password: 'x' }, { ip });
    }
    const sonde = await api().inject({
      method: 'GET',
      url: '/v1/health',
      headers: { 'x-forwarded-for': ip },
    });
    expect(
      sonde.statusCode,
      'Une sonde de vivacité prise dans le plafond anti-bourrage ferait redémarrer le\n' +
        'conteneur pendant l’attaque — exactement au pire moment.',
    ).toBe(200);
  });

  it('CONSTAT — chaque route d’auth a son PROPRE compteur (le préfixe tolère 3 × 10)', async () => {
    // Ce n'est pas un défaut, c'est une conséquence de `@fastify/rate-limit` qui
    // donne un compteur par route. Le budget qui compte — les tentatives de mot de
    // passe — reste bien à 10. Le test existe pour qu'aucun agent n'écrive un jour un
    // contrôle qui SUPPOSE un seau partagé sur `/v1/auth/*`, et ne conclue à un bug.
    const compte = await creerCompte('quota-par-route');
    const ip = '10.200.0.15';
    for (let n = 0; n < 11; n += 1) {
      await poster('/v1/auth/login', { email: compte.email, password: 'x' }, { ip });
    }
    expect((await poster('/v1/auth/login', { email: compte.email, password: 'x' }, { ip })).statut).toBe(429);

    const surRefresh = await poster('/v1/auth/refresh', { refreshToken: 'jeton-inexistant' }, { ip });
    expect(
      surRefresh.statut,
      '`refresh` garde son propre budget de 10 : le plafond du préfixe `/v1/auth/*`\n' +
        'vaut donc 30 requêtes par minute et par adresse, réparties sur trois chemins.',
    ).not.toBe(429);
  });
});

// =============================================================================
// JOURNAUX — CE QUI N'ENTRE PAS DANS PINO
// =============================================================================
describe('journaux pino', () => {
  it('@critique aucun secret ni identifiant nominatif ne sort dans les journaux', async () => {
    const compte = await creerCompte('journal');
    const tiers = await creerCompte('journal-tiers');
    const sessionTiers = await seConnecter(tiers);

    sondes.lignesJournal.length = 0;

    // Un scénario COMPLET : c'est la seule façon de couvrir aussi les chemins
    // d'erreur, où les fuites se logent (un message de bibliothèque, une pile).
    const ouverte = await seConnecter(compte);
    const secondAppareil = await seConnecter(compte);
    await poster('/v1/auth/login', { email: compte.email, password: 'mot-de-passe-factice-faux' });
    await poster('/v1/auth/login', { email: 'compte.absent@exemple.test', password: 'quelconque' });
    await poster('/v1/auth/login', { email: 'pas-une-adresse', password: 'quelconque' });

    const rotation = await poster('/v1/auth/refresh', { refreshToken: ouverte.refreshToken });
    const apresRotation = session(rotation);
    await poster('/v1/auth/refresh', { refreshToken: 'jeton-de-rafraichissement-inconnu' });

    // Réutilisation avérée : le chemin qui journalise le plus.
    const revoquee = (await lignesJeton(compte.id)).find((l) => l.revoked_at !== null);
    if (revoquee === undefined) throw new Error('aucune ligne révoquée');
    await antidaterRevocation(revoquee.id, 5);
    const detection = await poster('/v1/auth/refresh', { refreshToken: ouverte.refreshToken });
    expect(detection.code).toBe('TOKEN_REUSE_DETECTED');

    await poster('/v1/auth/logout', { refreshToken: 'x'.repeat(10) }, { jeton: 'jeton-illisible' });
    await poster(
      '/v1/auth/logout',
      { refreshToken: secondAppareil.refreshToken },
      { jeton: sessionTiers.accessToken },
    );

    const journal = sondes.lignesJournal.join('\n');
    expect(
      sondes.lignesJournal.length,
      'Une capture VIDE rendrait ce test vert sans rien prouver : c’est le mode\n' +
        'd’échec le plus dangereux d’un contrôle de journalisation.',
    ).toBeGreaterThan(0);

    const empreintes = await bd().query<{ token_hash: string }>(
      'SELECT token_hash FROM refresh_tokens WHERE user_id = ANY($1::uuid[])',
      [[compte.id, tiers.id]],
    );
    const motsDePasseEnBase = await bd().query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = ANY($1::uuid[])',
      [[compte.id, tiers.id]],
    );

    const interdits: { readonly quoi: string; readonly valeur: string }[] = [
      { quoi: 'adresse e-mail du compte', valeur: compte.email },
      { quoi: 'adresse e-mail du tiers', valeur: tiers.email },
      { quoi: 'mot de passe en clair', valeur: compte.motDePasse },
      { quoi: 'jeton d’accès', valeur: ouverte.accessToken },
      { quoi: 'jeton de rafraîchissement initial', valeur: ouverte.refreshToken },
      { quoi: 'jeton de rafraîchissement après rotation', valeur: apresRotation.refreshToken },
      { quoi: 'jeton d’accès du tiers', valeur: sessionTiers.accessToken },
      { quoi: 'jeton de rafraîchissement du tiers', valeur: sessionTiers.refreshToken },
      ...empreintes.rows.map((r) => ({ quoi: 'empreinte `token_hash`', valeur: r.token_hash })),
      ...motsDePasseEnBase.rows.map((r) => ({
        quoi: 'empreinte `password_hash`',
        valeur: r.password_hash,
      })),
    ].filter((i) => i.valeur !== '');

    const fuites = interdits
      .filter((i) => journal.includes(i.valeur))
      .map((i) => `${i.quoi} (« ${i.valeur.slice(0, 12)}… »)`);

    expect(
      fuites,
      'Les journaux pino SORTENT de la machine (11 §2, 06 §10.4) : ce qui y entre est\n' +
        'exporté, conservé, et lu par des gens qui n’ont pas les droits sur les\n' +
        'données. Un jeton de rafraîchissement y est le pire cas : il est OPAQUE,\n' +
        'donc AUCUN motif ne saura jamais le masquer après coup — la seule protection\n' +
        'possible est de ne pas l’écrire.',
    ).toStrictEqual([]);
  });
});
