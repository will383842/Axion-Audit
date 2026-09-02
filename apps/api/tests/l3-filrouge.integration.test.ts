// =============================================================================
// FIL ROUGE CUMULATIF — LOT L3 (09 §4bis, 07 §12 et §13)
//
// « Un test @filrouge rejoue à CHAQUE merge le parcours de bout en bout
// DISPONIBLE À DATE : création mission → import arbre → questionnaire figé (L3)
// → … — chaque lot ne fait qu'ALLONGER le scénario, jamais le réécrire. Toute
// porte exige @filrouge vert sur LES DEUX missions. »
//
// ── POURQUOI UN JUMEAU DE `l1-filrouge`, ET NON UNE RALLONGE DANS LE MÊME FICHIER
// Le fil rouge du L1 s'exécute SANS l'application : schéma seul, un client pg, ni
// seed ni routes (son en-tête le dit : « au lot L1, il n'existe ni route, ni
// écran »). Le parcours L3, lui, ne se joue que PAR LES ROUTES — il exige le seed
// des référentiels (`services`, `sectors`, `size_tiers`), une instance Fastify et
// des jetons. Greffer cela dans le `beforeAll` du L1 changerait les conditions
// sous lesquelles le verdict L1 est rendu (et une non-régression qui change de
// conditions n'en est plus une). Les deux fichiers sont le MÊME fil rouge — même
// tag `@filrouge`, mêmes fixtures `aide/fil-rouge.ts`, mêmes dimensions
// canoniques `FIL_TPE` / `FIL_GC` — à deux étapes de sa croissance. La bascule
// Playwright annoncée au L3 (`DECISIONS.md` 2026-08-31) reprendra ce fichier-ci.
//
// ── CE QUE CE PARCOURS PROUVE, ET QU'AUCUNE SUITE D'INCRÉMENT NE PROUVE ──────
// `l3b`, `l3c` et `l3d` éprouvent chacune SA route sur un état fabriqué par SQL.
// Ici, RIEN n'est fabriqué entre deux étapes : la mission que l'étape 2 reçoit
// est celle que l'étape 1 a rendue, l'arbre que l'étape 4 lit est celui que
// l'étape 2 a écrit. C'est la seule façon de voir que l'arbre DÉCIDE du
// questionnaire (03 §16.3 : « les paquets logistique ne sont générés que si
// l'arbre contient une unité logistique ») — et de le voir à 150 unités.
//
// Chaque étape assère EN BASE : la réponse HTTP dit ce que le serveur prétend, la
// base dit ce qu'il a fait.
//
// Marqué @filrouge : jamais skippable (09 §5.7, DoD transverse).
// =============================================================================
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';
import {
  csvArbre,
  csvArbreCorrompuEnFin,
  FIL_GC,
  FIL_TPE,
  PARCOURS_FIL_GC,
  PARCOURS_FIL_TPE,
  semerBanqueParcours,
  type BanqueSemee,
  type FixtureParcoursL3,
} from './aide/fil-rouge.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2 : « les tests utilisent des secrets factices »).
// -----------------------------------------------------------------------------
const SECRET_ACCES = '3f'.repeat(32);
const SECRET_RAFRAICHISSEMENT = 'd1'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.filrouge-l3@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;
let jetonAdmin = '';

function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

// -----------------------------------------------------------------------------
// APPELS HTTP — tout le parcours passe par là
// -----------------------------------------------------------------------------

interface Reponse {
  readonly statut: number;
  readonly code: string | null;
  readonly corps: string;
  readonly json: unknown;
}

/** L'enveloppe d'erreur du 11 §3, réécrite ici plutôt qu'importée du sujet. */
const erreurSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** Une adresse par appel : le quota global est clé sur le jeton, `request.ip` en repli. */
let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.63.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

function analyserJson(texte: string): unknown {
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    return undefined;
  }
}

async function appeler(
  methode: 'GET' | 'POST',
  url: string,
  charge?: Readonly<Record<string, unknown>>,
): Promise<Reponse> {
  const reponse = await api().inject({
    method: methode,
    url,
    headers: { 'x-forwarded-for': ipUnique(), authorization: `Bearer ${jetonAdmin}` },
    ...(charge === undefined ? {} : { payload: charge }),
  });
  const json = analyserJson(reponse.body);
  const erreur = erreurSchema.safeParse(json);
  return {
    statut: reponse.statusCode,
    code: erreur.success ? erreur.data.error.code : null,
    corps: reponse.body,
    json,
  };
}

// -----------------------------------------------------------------------------
// LES CONTRATS LUS — le noyau exigé de chaque réponse, transcrit, jamais importé
// -----------------------------------------------------------------------------

const creationEntrepriseSchema = z.object({
  company: z.object({ id: z.uuid(), name: z.string() }),
});

const creationMissionSchema = z.object({
  mission: z.object({
    id: z.uuid(),
    companyId: z.uuid(),
    status: z.string(),
    activeBlocks: z.array(z.string()),
  }),
  uniteRacineId: z.uuid(),
});

const rapportImportSchema = z.object({
  verification: z.boolean(),
  applique: z.boolean(),
  importReelRefuse: z.object({ code: z.string(), message: z.string() }).nullable(),
  separateur: z.string(),
  lignesLues: z.number().int(),
  lignesVidesIgnorees: z.number().int(),
  unites: z.number().int(),
  erreurs: z.array(z.object({ ligne: z.number(), code: z.string() }).loose()),
  totalErreurs: z.number().int(),
  erreursTronquees: z.boolean(),
});

const previsualisationSchema = z.object({
  total: z.number().int(),
  questions: z.array(
    z.object({
      position: z.number().int(),
      capture: z.object({ questionId: z.uuid(), textSnapshot: z.string() }).loose(),
      routage: z
        .object({ questionCode: z.string().nullable(), servicesCibles: z.array(z.string()) })
        .loose(),
    }),
  ),
  parBloc: z.array(z.object({ blocCode: z.string(), total: z.number().int() }).loose()),
  parInterlocuteur: z.array(z.object({ profilCode: z.string(), total: z.number().int() }).loose()),
  avertissements: z.array(z.object({ code: z.string(), message: z.string() })),
});

const figeageSchema = z.object({
  total: z.number().int(),
  parBloc: z.array(z.object({ blocCode: z.string(), total: z.number().int() }).loose()),
});

function lire<T>(schema: z.ZodType<T>, reponse: Reponse, etape: string): T {
  const analyse = schema.safeParse(reponse.json);
  if (!analyse.success) {
    throw new Error(
      `${etape} : la réponse ne porte pas le noyau attendu.\n` +
        `${z.prettifyError(analyse.error)}\nCorps : ${reponse.corps.slice(0, 800)}`,
    );
  }
  return analyse.data;
}

// -----------------------------------------------------------------------------
// LECTURES DIRECTES — la seule vérité sur ce que la base contient
// -----------------------------------------------------------------------------

async function compter(sql: string, parametres: readonly unknown[]): Promise<number> {
  const resultat = await bd().query<{ n: string }>(sql, [...parametres]);
  return Number(resultat.rows[0]?.n ?? '0');
}

async function compterUnites(missionId: string): Promise<number> {
  return compter('SELECT count(*)::text AS n FROM org_units WHERE mission_id = $1', [missionId]);
}

async function compterFigees(missionId: string): Promise<number> {
  return compter('SELECT count(*)::text AS n FROM mission_questions WHERE mission_id = $1', [
    missionId,
  ]);
}

/** L'arbre d'une mission, sérialisé et trié : une photographie comparable au bit près. */
async function photographierArbre(missionId: string): Promise<string> {
  const lignes = await bd().query(
    `SELECT id, parent_id, kind, name, country_code, timezone, headcount, service_ref_id,
            sector_id, in_scope, status, position, updated_at
       FROM org_units WHERE mission_id = $1 ORDER BY id`,
    [missionId],
  );
  return JSON.stringify(lignes.rows);
}

/**
 * Empreinte de TOUTE la base : par table du schéma `public`, le nombre de lignes et
 * un md5 du contenu ordonné — la technique du seed (`--empreinte`). Deux empreintes
 * identiques de part et d'autre d'un appel prouvent que cet appel n'a RIEN écrit,
 * nulle part : ni journal, ni horodatage, ni ligne figée « pour aller plus vite ».
 * Une relecture ciblée (« pas de `mission_questions` ») ne prouverait que ce qu'on
 * a pensé à regarder.
 */
async function empreinteBase(): Promise<string> {
  const tables = await bd().query<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const lignes: string[] = [];
  for (const { t } of tables.rows) {
    // Identifiant lu dans le catalogue et vérifié avant d'être placé dans la requête :
    // `FROM` n'accepte pas de paramètre lié.
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`nom de table inattendu : ${t}`);
    const r = await bd().query<{ n: string; md5: string }>(
      `SELECT count(*)::text AS n,
              coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') AS md5
         FROM ${t} x`,
    );
    lignes.push(`${t}:${r.rows[0]?.n ?? '?'}:${r.rows[0]?.md5 ?? '?'}`);
  }
  return lignes.join('\n');
}

async function idPalier(code: string): Promise<string> {
  const r = await bd().query<{ id: string }>('SELECT id FROM size_tiers WHERE code = $1', [code]);
  const id = r.rows[0]?.id;
  if (id === undefined) throw new Error(`palier « ${code} » absent du seed (11 §5)`);
  return id;
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('filrouge_l3');
  nomBase = base.nom;
  await appliquerMontee(base.url);

  // Le seed est indispensable : `service_code` et `sector_code` du CSV se résolvent
  // sur `services` / `sectors`, et le palier de la mission sur `size_tiers`.
  process.env.SEED_ADMIN_EMAIL ??= COURRIEL_FONDATEUR_FACTICE;
  process.env.SEED_ADMIN_PASSWORD ??= MOT_DE_PASSE_FONDATEUR_FACTICE;
  await executerSeed(base.url, base.nom);

  client = await connecter(base.url);

  process.env.DATABASE_URL = base.url;
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = SECRET_ACCES;
  process.env.JWT_REFRESH_SECRET = SECRET_RAFRAICHISSEMENT;
  process.env.JWT_ACCESS_TTL = '15m';
  process.env.JWT_REFRESH_TTL = '30d';
  process.env.LOG_LEVEL = 'fatal';
  process.env.APP_ENV = 'dev';
  delete process.env.PINO_PRETTY;

  const { construireApp } = await import('../src/app.js');
  const instance = await construireApp();
  await instance.ready();
  app = instance;

  // L'administrateur qui joue le parcours (§34.1 : la console est admin seul).
  // Jeton signé par la même clé que `/v1/auth/login` ; le crochet relit le rôle en
  // base, rien n'est court-circuité.
  const adminId = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, 'Administrateur du fil rouge', $2, 'empreinte-factice-non-verifiee', 'admin',
             'guide_strict', now(), true, now(), now())`,
    [adminId, `admin.filrouge.${adminId}@exemple.test`],
  );
  jetonAdmin = instance.jwt.sign({ sub: adminId });
}, 300_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// LE PARCOURS — joué à l'identique sur les deux échelles
// =============================================================================

/** Ce que les étapes se transmettent : rien d'autre que ce que l'API a rendu. */
interface EtatParcours {
  entrepriseId: string;
  missionId: string;
  uniteRacineId: string;
  banque: BanqueSemee | undefined;
  totalPrevisualise: number;
}

const etats = new Map<string, EtatParcours>();

function etat(fixture: FixtureParcoursL3): EtatParcours {
  const trouve = etats.get(fixture.nom);
  if (trouve === undefined) {
    throw new Error(`${fixture.nom} : l'étape 1 n'a pas eu lieu — le parcours est séquentiel.`);
  }
  return trouve;
}

function decrireParcours(fixture: FixtureParcoursL3): void {
  const { nom } = fixture;

  describe(`@filrouge ${nom} — parcours L3 par l'API`, () => {
    // ── ÉTAPE 1 — l'entreprise, puis la mission et sa racine d'office ─────────
    it(`@filrouge ${nom} · étape 1 : POST /v1/companies puis POST /v1/missions posent la mission en « preparation » avec sa racine d'office`, async () => {
      const entreprise = await appeler('POST', '/v1/companies', {
        name: fixture.entreprise.nom,
        headcount: fixture.entreprise.effectif,
        sitesCount: fixture.entreprise.sites,
        countries: [...fixture.entreprise.pays],
      });
      expect(entreprise.statut, `création de l'entreprise refusée : ${entreprise.corps}`).toBe(201);
      const { company } = lire(creationEntrepriseSchema, entreprise, `${nom} étape 1 (entreprise)`);

      // La banque de la fixture, semée AVANT la mission : `active_blocks` la nomme.
      const banque = await semerBanqueParcours(bd(), fixture);

      const mission = await appeler('POST', '/v1/missions', {
        companyId: company.id,
        title: fixture.mission.titre,
        geoScope: fixture.mission.geoScope,
        countryCode: fixture.mission.countryCode,
        sizeTierId: await idPalier(fixture.mission.palier),
        activeSectors: [...fixture.mission.secteursActifs],
        activeBlocks: [banque.blocCode],
        auditLevel: fixture.mission.auditLevel,
        commercialOffer: fixture.mission.commercialOffer,
      });
      expect(mission.statut, `création de la mission refusée : ${mission.corps}`).toBe(201);
      const creation = lire(creationMissionSchema, mission, `${nom} étape 1 (mission)`);

      expect(
        creation.mission.status,
        "Une mission naît en « preparation » : c'est le seul point d'entrée de la machine à états (03 §32.2).",
      ).toBe('preparation');
      expect(creation.mission.companyId).toBe(company.id);
      expect(creation.mission.activeBlocks).toEqual([banque.blocCode]);

      // EN BASE : la mission, et UNE racine — la racine d'office (03 §16.2).
      const ligneMission = await bd().query<{ status: string; company_id: string }>(
        'SELECT status, company_id FROM missions WHERE id = $1 AND deleted_at IS NULL',
        [creation.mission.id],
      );
      expect(ligneMission.rows[0], 'la mission rendue par l’API n’existe pas en base').toEqual({
        status: 'preparation',
        company_id: company.id,
      });

      const racines = await bd().query<{ id: string; parent_id: string | null; name: string }>(
        'SELECT id, parent_id, name FROM org_units WHERE mission_id = $1',
        [creation.mission.id],
      );
      expect(
        racines.rows,
        '03 §16.2 : « une racine est créée par défaut ». Une mission sans unité est une\n' +
          'mission sur laquelle rien du produit ne fonctionne (entretiens, M2, couverture).',
      ).toEqual([{ id: creation.uniteRacineId, parent_id: null, name: fixture.entreprise.nom }]);

      etats.set(nom, {
        entrepriseId: company.id,
        missionId: creation.mission.id,
        uniteRacineId: creation.uniteRacineId,
        banque,
        totalPrevisualise: 0,
      });
    });

    // ── ÉTAPE 2 — l'arbre §35.2 : à blanc, atomicité sur le vrai volume, puis réel
    it(`@filrouge ${nom} · étape 2 : l'arbre §35.2 (${String(fixture.arbre.unites)} unités, ${String(fixture.arbre.niveaux)} niveaux) s'importe — à blanc sans écrire, refusé sans écrire, puis pour de vrai`, async () => {
      const { missionId, uniteRacineId } = etat(fixture);
      const fichier = csvArbre(fixture.lignesArbre);
      const urlImport = `/v1/missions/${missionId}/org-units/import`;

      // (a) À BLANC — le rapport annonce exactement ce que l'import réel fera.
      const aBlanc = await appeler('POST', `${urlImport}?verification=true`, { csv: fichier });
      expect(aBlanc.statut, `mode à blanc refusé : ${aBlanc.corps.slice(0, 800)}`).toBe(200);
      const rapportBlanc = lire(rapportImportSchema, aBlanc, `${nom} étape 2 (à blanc)`);
      expect(rapportBlanc).toMatchObject({
        verification: true,
        applique: false,
        importReelRefuse: null,
        separateur: ';',
        lignesLues: fixture.arbre.unites,
        unites: fixture.arbre.unites,
        erreurs: [],
        totalErreurs: 0,
      });
      expect(await compterUnites(missionId), 'un mode à blanc qui écrit est le pire défaut').toBe(
        1,
      );

      // (b) ATOMICITÉ — même fichier, DERNIÈRE ligne corrompue : rien n'est écrit,
      // pas même les n−1 lignes valides qui la précèdent.
      const refuse = await appeler('POST', urlImport, {
        csv: csvArbreCorrompuEnFin(fixture.lignesArbre),
      });
      expect(refuse.statut, `un fichier à une erreur doit être refusé : ${refuse.corps}`).toBe(422);
      expect(refuse.code).toBe('IMPORT_REJECTED');
      expect(
        await compterUnites(missionId),
        `§35.2 : « import ATOMIQUE (une erreur = rien d'importé) ». La corruption est sur la\n` +
          `ligne ${String(fixture.arbre.unites + 1)} du tableur : une implémentation qui insère au fil\n` +
          `de l'eau aurait laissé ${String(fixture.arbre.unites - 1)} unités derrière elle.`,
      ).toBe(1);

      // (c) RÉEL — le rapport du mode à blanc, appliqué.
      const reel = await appeler('POST', urlImport, { csv: fichier });
      expect(reel.statut, `import réel refusé : ${reel.corps.slice(0, 800)}`).toBe(200);
      const rapport = lire(rapportImportSchema, reel, `${nom} étape 2 (réel)`);
      expect(rapport).toMatchObject({
        verification: false,
        applique: true,
        importReelRefuse: null,
        lignesLues: fixture.arbre.unites,
        unites: fixture.arbre.unites,
        erreurs: [],
        totalErreurs: 0,
        erreursTronquees: false,
      });

      // EN BASE : le compte exact, la racine d'office intacte, la forme de l'arbre.
      expect(
        await compterUnites(missionId),
        `${String(fixture.arbre.unites)} unités importées + la racine d'office (DECISIONS.md\n` +
          `2026-09-01 : elle n'est ni absorbée ni supprimée — invariant 7).`,
      ).toBe(fixture.arbre.unites + 1);

      const racine = await bd().query<{ parent_id: string | null; name: string }>(
        'SELECT parent_id, name FROM org_units WHERE id = $1',
        [uniteRacineId],
      );
      expect(racine.rows[0]).toEqual({ parent_id: null, name: fixture.entreprise.nom });

      const parKind = await bd().query<{ kind: string; n: string }>(
        `SELECT kind, count(*)::text AS n FROM org_units
          WHERE mission_id = $1 AND id <> $2 GROUP BY kind`,
        [missionId, uniteRacineId],
      );
      expect(Object.fromEntries(parKind.rows.map((l) => [l.kind, Number(l.n)]))).toEqual(
        fixture.arbre.parKind,
      );

      const profondeur = await compter(
        `WITH RECURSIVE arbre AS (
           SELECT id, 1 AS niveau FROM org_units
            WHERE mission_id = $1 AND parent_id IS NULL AND id <> $2
           UNION ALL
           SELECT u.id, a.niveau + 1 FROM org_units u JOIN arbre a ON u.parent_id = a.id
         )
         SELECT max(niveau)::text AS n FROM arbre`,
        [missionId, uniteRacineId],
      );
      expect(
        profondeur,
        `Le sous-arbre importé doit descendre sur ${String(fixture.arbre.niveaux)} niveaux (§26.3).`,
      ).toBe(fixture.arbre.niveaux);

      const actives = await compter(
        `SELECT count(*)::text AS n FROM org_units
          WHERE mission_id = $1 AND status = 'active' AND in_scope = true`,
        [missionId],
      );
      expect(actives, 'une unité importée par le siège est active et dans le périmètre').toBe(
        fixture.arbre.unites + 1,
      );

      const fonctions = await bd().query<{ code: string; n: string }>(
        `SELECT s.code, count(*)::text AS n FROM org_units u
           JOIN services s ON s.id = u.service_ref_id
          WHERE u.mission_id = $1 GROUP BY s.code ORDER BY s.code`,
        [missionId],
      );
      expect(
        fonctions.rows.reduce((somme, l) => somme + Number(l.n), 0),
        '`service_code` doit être résolu sur `services` (11 §5), pas recopié ni ignoré',
      ).toBe(fixture.arbre.avecFonction);
      expect(fonctions.rows.map((l) => l.code).sort()).toEqual(
        [...fixture.arbre.fonctionsPresentes].sort(),
      );
      expect(
        fonctions.rows.map((l) => l.code),
        `la fonction « ${fixture.banque.fonctionAbsente} » doit être ABSENTE de l'arbre : c'est\n` +
          `elle qui prouvera, à l'étape 3, que l'arbre décide du questionnaire`,
      ).not.toContain(fixture.banque.fonctionAbsente);
    });

    it(`@filrouge ${nom} · étape 2 bis : un ré-import sur l'arbre peuplé est refusé et l'arbre est inchangé au bit près`, async () => {
      const { missionId } = etat(fixture);
      const photoAvant = await photographierArbre(missionId);

      const reponse = await appeler('POST', `/v1/missions/${missionId}/org-units/import`, {
        csv: csvArbre(fixture.lignesArbre),
      });
      expect(reponse.statut, `ré-import accepté sur un arbre habité : ${reponse.corps}`).toBe(409);
      expect(reponse.code).toBe('CONFLICT');

      expect(
        await photographierArbre(missionId),
        'Invariant 7 : rien n’est jamais silencieusement écrasé ni supprimé — pas même\n' +
          'avant un refus.',
      ).toBe(photoAvant);
    });

    // ── ÉTAPE 3 — la prévisualisation §33.4 : total > 0, et ZÉRO écriture ─────
    it(`@filrouge ${nom} · étape 3 : la prévisualisation §33.4 rend ${String(fixture.questionsAttendues)} questions, écartées par l'arbre celles qui visent une fonction absente, et n'écrit rien`, async () => {
      const courant = etat(fixture);
      const { missionId, banque } = courant;
      if (banque === undefined) throw new Error('banque non semée');

      const avant = await empreinteBase();
      const reponse = await appeler('GET', `/v1/missions/${missionId}/questionnaire-preview`);
      expect(reponse.statut, `prévisualisation refusée : ${reponse.corps.slice(0, 800)}`).toBe(200);
      const apres = await empreinteBase();

      expect(
        apres,
        '§33.4 : la prévisualisation est un écran de CONFIRMATION. Une prévisualisation qui\n' +
          'écrit quoi que ce soit (ligne figée, journal, horodatage) rend la confirmation\n' +
          'décorative. L’empreinte de TOUTE la base a changé.',
      ).toBe(avant);

      const apercu = lire(previsualisationSchema, reponse, `${nom} étape 3`);
      expect(
        apercu.total,
        `${String(fixture.banque.transverses)} transverses + ${String(fixture.banque.cibleesPresentes)} ciblées\n` +
          `sur « ${fixture.banque.fonctionPresente} » (portée par l'arbre) ; les ${String(fixture.banque.cibleesAbsentes)}\n` +
          `ciblées sur « ${fixture.banque.fonctionAbsente} » (absente de l'arbre) sont écartées (03 §16.3).`,
      ).toBe(fixture.questionsAttendues);
      expect(apercu.questions).toHaveLength(apercu.total);
      expect(apercu.total).toBeGreaterThan(0);

      const codesRendus = apercu.questions.map((q) => q.routage.questionCode);
      for (const code of banque.codesHorsPerimetre) {
        expect(codesRendus, `« ${code} » vise une fonction absente de l'arbre`).not.toContain(code);
      }
      const idsBanque = new Set(banque.questionIds);
      expect(
        apercu.questions.every((q) => idsBanque.has(q.capture.questionId)),
        'chaque question rendue vient du bloc de CETTE fixture (`active_blocks`) — le\n' +
          'cloisonnement entre FIL-TPE et FIL-GC tient dans la même base',
      ).toBe(true);
      expect(
        apercu.questions.filter((q) =>
          q.routage.servicesCibles.includes(fixture.banque.fonctionPresente),
        ),
      ).toHaveLength(fixture.banque.cibleesPresentes);

      // Répartitions §33.4 : « total et répartition par bloc × interlocuteur ».
      expect(apercu.parBloc.reduce((somme, b) => somme + b.total, 0)).toBe(apercu.total);
      expect(apercu.parBloc.map((b) => b.blocCode)).toEqual([banque.blocCode]);
      expect(apercu.parInterlocuteur.length, 'les 9 profils du seed (11 §5)').toBeGreaterThan(0);
      for (const parcours of apercu.parInterlocuteur) {
        // Aucune question de la fixture ne cible un profil : chaque parcours est complet.
        expect(parcours.total, `parcours « ${parcours.profilCode} »`).toBe(apercu.total);
      }

      expect(await compterFigees(missionId), 'rien n’est figé avant confirmation').toBe(0);
      courant.totalPrevisualise = apercu.total;
    });

    // ── ÉTAPE 4 — le figeage M2 : exactement le total prévisualisé, puis le refus
    it(`@filrouge ${nom} · étape 4 : le figeage écrit exactement les lignes prévisualisées dans mission_questions ; le second figeage est refusé 409`, async () => {
      const { missionId, totalPrevisualise, banque } = etat(fixture);
      if (banque === undefined) throw new Error('banque non semée');
      expect(totalPrevisualise, 'l’étape 3 doit avoir eu lieu').toBeGreaterThan(0);

      const reponse = await appeler('POST', `/v1/missions/${missionId}/generate-questionnaire`, {});
      expect(reponse.statut, `figeage refusé : ${reponse.corps.slice(0, 800)}`).toBe(201);
      const figeage = lire(figeageSchema, reponse, `${nom} étape 4`);
      expect(
        figeage.total,
        '§33.4 : ce que l’opérateur a vu est ce qui est figé — le total du figeage est\n' +
          'celui de la prévisualisation, à l’unité près.',
      ).toBe(totalPrevisualise);
      expect(figeage.parBloc.reduce((somme, b) => somme + b.total, 0)).toBe(figeage.total);

      // EN BASE : les lignes figées, leur capture, leur ordre.
      const figees = await bd().query<{
        question_id: string;
        text_snapshot: string;
        position: number;
        added_ad_hoc: boolean;
      }>(
        `SELECT question_id, text_snapshot, position, added_ad_hoc
           FROM mission_questions WHERE mission_id = $1 ORDER BY position`,
        [missionId],
      );
      expect(figees.rows).toHaveLength(totalPrevisualise);
      expect(
        figees.rows.map((l) => l.position),
        'positions 1..n, sans trou ni doublon (ordre déterministe, M2 règle 2)',
      ).toEqual(figees.rows.map((_, i) => i + 1));
      const idsBanque = new Set(banque.questionIds);
      expect(figees.rows.every((l) => idsBanque.has(l.question_id) && !l.added_ad_hoc)).toBe(true);
      expect(
        figees.rows.every((l) => l.text_snapshot.length > 0),
        'M2 règle 4 : le figeage est une CAPTURE (copie version + texte), pas une référence',
      ).toBe(true);

      const missionApres = await bd().query<{ status: string }>(
        'SELECT status FROM missions WHERE id = $1',
        [missionId],
      );
      expect(
        missionApres.rows[0]?.status,
        'figer ne fait pas avancer la mission : c’est `POST …/status` qui le fait (03 §32.2)',
      ).toBe('preparation');

      // Le SECOND figeage : refusé, et rien n'a bougé.
      const second = await appeler('POST', `/v1/missions/${missionId}/generate-questionnaire`, {});
      expect(second.statut, `second figeage accepté : ${second.corps.slice(0, 800)}`).toBe(409);
      expect(
        second.code,
        'DECISIONS.md 2026-08-29 : un questionnaire déjà figé se refuse par\n' +
          '`QUESTIONNAIRE_ALREADY_FROZEN` — jamais rejoué « par sécurité », ce qui serait\n' +
          'un `resync` silencieux (05 §8.3).',
      ).toBe('QUESTIONNAIRE_ALREADY_FROZEN');
      expect(await compterFigees(missionId)).toBe(totalPrevisualise);
    });
  });
}

decrireParcours(PARCOURS_FIL_TPE);
decrireParcours(PARCOURS_FIL_GC);

// =============================================================================
// LES DEUX ÉCHELLES DANS LA MÊME BASE — le cloisonnement, comme au L1
// =============================================================================
describe('@filrouge les deux missions du parcours L3 coexistent sans se mélanger', () => {
  it('@filrouge FIL-TPE garde ses 3 + 1 unités et ses 30 questions ; FIL-GC ses 150 + 1 et ses 135', async () => {
    const tpe = etat(PARCOURS_FIL_TPE);
    const gc = etat(PARCOURS_FIL_GC);

    expect({
      unites: await compterUnites(tpe.missionId),
      questions: await compterFigees(tpe.missionId),
    }).toEqual({ unites: PARCOURS_FIL_TPE.arbre.unites + 1, questions: FIL_TPE.questions });

    expect(
      {
        unites: await compterUnites(gc.missionId),
        questions: await compterFigees(gc.missionId),
      },
      'Un compteur qui déborde d’une mission sur l’autre ne se voit jamais quand on ne\n' +
        'teste qu’une mission à la fois — c’est pour cela que le fil rouge joue les deux.',
    ).toEqual({ unites: FIL_GC.unites + 1, questions: FIL_GC.questions });

    // Aucune question figée ne pointe hors de la banque de SA mission.
    const croisees = await compter(
      `SELECT count(*)::text AS n
         FROM mission_questions mq
         JOIN questions q ON q.id = mq.question_id
         JOIN blocks b ON b.id = q.block_id
         JOIN missions m ON m.id = mq.mission_id
        WHERE mq.mission_id = ANY($1::uuid[])
          AND NOT (m.active_blocks ? b.code)`,
      [[tpe.missionId, gc.missionId]],
    );
    expect(croisees, 'une question figée hors des `active_blocks` de sa mission').toBe(0);
  });
});
