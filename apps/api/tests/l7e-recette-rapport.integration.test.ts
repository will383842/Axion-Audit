// =============================================================================
// LOT L7 / INCRÉMENT L7e — LA RECETTE D'ACCEPTATION DU §36.3 × §20.3.
//
//   « le rapport §20.3 peut être rédigé EN ENTIER depuis le ZIP,
//     sans retourner dans l'outil »  — 03 §36.3, critère d'acceptation L7-min
//
// ═══════════════════════════════════════════════════════════════════════════════
// CE QUE CE FICHIER FERME, ET DEPUIS QUAND IL ÉTAIT OUVERT
// ═══════════════════════════════════════════════════════════════════════════════
// L'en-tête de `l7c-export.integration.test.ts` le dit de la main de ses auteurs :
// « AUCUN ne porte `@critique` : la RECETTE du §36.3 — la somme des douze
// rubriques du §20.3 […] — revient à A36 ». Elle n'avait jamais été écrite. Le
// critère qui DÉCIDE du lot n'était donc éprouvé par rien : on savait que le ZIP
// se téléchargeait, on ne savait pas qu'on pouvait écrire le rapport avec.
//
// A30 a joué le geste À LA MAIN le 2026-09-09 et rendu NON TENU. Un geste manuel
// joué une fois ne rejouera pas au prochain commit. Ce fichier le rejoue à chaque
// fois, sur une archive RÉELLE produite par la route, décompressée, et confrontée
// colonne par colonne à `aide/grille-rapport-20-3.ts`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// LA FORME : UN CLIQUET BIDIRECTIONNEL (voir l'en-tête de la grille)
// ═══════════════════════════════════════════════════════════════════════════════
// Trois natures de manque, trois responsables, trois remèdes — et pas une seule
// façon de rougir. Ce que la recette tient :
//
//   ① CE QUI EST PORTÉ DOIT L'ÊTRE. Chaque colonne déclarée est cherchée dans
//      l'archive réelle. Une rubrique qui perd sa source rougit, NOMMÉE.
//   ② CE QUI EST DÉCLARÉ ABSENT DOIT L'ÊTRE. Un trou de format qui se referme
//      (une colonne `groupe_interlocuteur` qui apparaît, un `feuille_de_route.csv`
//      ajouté) rougit AUSSI — le verdict est périmé, il se re-note.
//   ③ LA CAUSE EST MESURÉE, PAS SUPPOSÉE. « Rien n'écrit dans `findings` » est
//      une mesure statique de `apps/api/src`, refaite à chaque exécution. Le jour
//      où le premier écrivain arrive, la rubrique change de nature toute seule.
//   ④ LE VERDICT GLOBAL EST SOUS TEST. « NON TENU, une seule rubrique sur douze »
//      est recalculé depuis la grille et comparé au verdict déclaré et daté.
//
// Un trou n'est donc jamais invisible, et la recette n'est jamais rouge sans
// raison : elle est verte tant que la déclaration dit vrai. C'est ce qui la rend
// gardable — une recette rouge pour toujours est une recette qu'on désactive, et
// 09 §5.7 l'interdit précisément parce que la tentation est réelle.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POURQUOI LES DEUX MISSIONS CANONIQUES, ET CE QU'ELLES SÉPARENT
// ═══════════════════════════════════════════════════════════════════════════════
// FIL-TPE (1 unité, 1 session, 30 réponses) et FIL-GC (150 unités sur 4 niveaux,
// 60 sessions, 8 100 réponses) — 09 §4bis. Les fixtures écrivent `interviews` et
// `answers` EN DIRECT, ce qu'aucun code de production ne fait : c'est exactement
// ce qui permet de séparer les deux questions. La fixture prouve que le FORMAT
// tient jusqu'à 8 100 réponses ; la mesure statique prouve que l'ALIMENTATION
// n'existe pas. Confondre les deux, c'est soit croire l'export cassé, soit croire
// le produit complet.
//
// Invariant 2 : missions FICTIVES, libellés neutres, aucune référence client.
// Traçabilité : E14 (consolidation) · E22 (console de pilotage) · E36 (lots avec
// critères) · E43 (exécutabilité autopilote).
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  appliquerMontee,
  connecter,
  creerBaseEphemere,
  executerSeed,
  MESSAGE_L1_ABSENT,
  migrationsLivrees,
  RACINE_API,
  supprimerBaseEphemere,
  uuidv7,
} from './aide/base-l1.js';
import { cellulesDeLigne, lignesDuCsv, lireArchiveExport } from './aide/archive-export.js';
import { genererFilGc, genererFilTpe, type MissionCanonique } from './aide/fil-rouge.js';
import {
  elementsDeLaGrille,
  GRILLE_20_3,
  TABLES_SANS_ECRIVAIN_DE_PRODUCTION,
  VERDICT_DECLARE,
  verdictDeRubrique,
  type TableSurveillee,
} from './aide/grille-rapport-20-3.js';

// -----------------------------------------------------------------------------
// Secrets FACTICES (11 §2) — jamais une valeur réelle dans un fichier versionné.
// -----------------------------------------------------------------------------
const SECRET_ACCES = '7e'.repeat(32);
const SECRET_RAFRAICHISSEMENT = '5f'.repeat(32);
const COURRIEL_FONDATEUR_FACTICE = 'fondateur.l7e@exemple.test';
const MOT_DE_PASSE_FONDATEUR_FACTICE = 'mot-de-passe-factice-de-seed';

// =============================================================================
// ÉTAT DE LA SUITE
// =============================================================================
let nomBase = '';
let client: Client | undefined;
let app: FastifyInstance | undefined;

/** Une archive lue : le contenu de chaque fichier, en texte, BOM retiré. */
interface ArchiveDeRecette {
  readonly mission: MissionCanonique;
  readonly fichiers: ReadonlyMap<string, Buffer>;
  readonly meta: Record<string, unknown>;
  readonly octets: number;
  readonly millisecondes: number;
}

let filTpe: ArchiveDeRecette | undefined;
let filGc: ArchiveDeRecette | undefined;

function tpe(): ArchiveDeRecette {
  if (filTpe === undefined) throw new Error('FIL-TPE non exportée');
  return filTpe;
}

function gc(): ArchiveDeRecette {
  if (filGc === undefined) throw new Error('FIL-GC non exportée');
  return filGc;
}

function lesDeux(): readonly ArchiveDeRecette[] {
  return [tpe(), gc()];
}

let compteurIp = 0;
function ipUnique(): string {
  compteurIp += 1;
  return `10.79.${String(Math.floor(compteurIp / 250) % 250)}.${String(compteurIp % 250)}`;
}

// -----------------------------------------------------------------------------
// L'INVENTAIRE STATIQUE DES ÉCRITURES DE PRODUCTION — la MESURE de la cause
// -----------------------------------------------------------------------------
/**
 * Les noms Drizzle des tables surveillées. Le dépôt écrit en Drizzle
 * (`db.insert(<nom>)`), jamais en SQL concaténé (11 §2) : c'est donc cette
 * graphie qu'on cherche, et la table `pgTable('<snake>')` qui la nomme.
 */
const NOM_DRIZZLE: Record<TableSurveillee, string> = {
  companies: 'companies',
  missions: 'missions',
  org_units: 'orgUnits',
  mission_questions: 'missionQuestions',
  mission_users: 'missionUsers',
  interviews: 'interviews',
  answers: 'answers',
  attachments: 'attachments',
  findings: 'findings',
  use_cases: 'useCases',
  tools_inventory: 'toolsInventory',
  ai_systems: 'aiSystems',
  roadmap_items: 'roadmapItems',
  unit_scores: 'unitScores',
};

/** Tous les `.ts` de production d'une racine — jamais les tests, jamais `dist`. */
function fichiersDeProduction(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        if (entree === 'node_modules' || entree === 'dist') continue;
        parcourir(chemin);
        continue;
      }
      if (!entree.endsWith('.ts')) continue;
      // Un test n'est pas du code de production : compter ses `insert` ferait
      // croire qu'une table est alimentée parce qu'une fixture l'a remplie.
      if (entree.includes('.test.')) continue;
      trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

/**
 * Les tables dans lesquelles le code de production sait écrire, mesurées.
 *
 * On lit `apps/api/src` ET `apps/api/scripts` : le seed est du code livré, et une
 * table que SEUL le seed remplit n'est pas une table alimentée par le produit.
 * On les distingue donc, et on ne compte comme « alimentée » que `src`.
 */
function tablesAvecEcrivainDeProduction(): ReadonlySet<TableSurveillee> {
  const sources = fichiersDeProduction(join(RACINE_API, 'src'))
    .map((chemin) => readFileSync(chemin, 'utf8'))
    .join('\n');
  const trouvees = new Set<TableSurveillee>();
  for (const [table, nomDrizzle] of Object.entries(NOM_DRIZZLE) as [TableSurveillee, string][]) {
    // `insert(x)` et `insert(\n  x` : le formateur coupe où il veut.
    const motif = new RegExp(String.raw`\.insert\(\s*${nomDrizzle}\b`);
    if (motif.test(sources)) trouvees.add(table);
  }
  return trouvees;
}

// -----------------------------------------------------------------------------
// LECTURE DE L'ARCHIVE
// -----------------------------------------------------------------------------
/** L'en-tête d'un CSV de l'archive, cellule par cellule. */
function enTeteDe(archive: ArchiveDeRecette, fichier: string): readonly string[] {
  const lignes = lignesDuCsv(archive.fichiers, fichier);
  return cellulesDeLigne(lignes[0] ?? '');
}

/** Le nombre de LIGNES DE DONNÉES d'un CSV — l'en-tête ne compte pas. */
function nombreDeLignes(archive: ArchiveDeRecette, fichier: string): number {
  return Math.max(0, lignesDuCsv(archive.fichiers, fichier).length - 1);
}

/** Tous les en-têtes de tous les CSV de l'archive, à plat — pour le cliquet ②. */
function toutesLesColonnes(archive: ArchiveDeRecette): readonly string[] {
  const colonnes: string[] = [];
  for (const nom of archive.fichiers.keys()) {
    if (!nom.endsWith('.csv')) continue;
    colonnes.push(...enTeteDe(archive, nom));
  }
  return colonnes;
}

/** Une valeur pointée dans `mission.json` — `client.nom`, `mission.ndaRef`… */
function valeurMeta(archive: ArchiveDeRecette, chemin: string): unknown {
  let courant: unknown = archive.meta;
  for (const segment of chemin.split('.')) {
    if (typeof courant !== 'object' || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[segment];
  }
  return courant;
}

// -----------------------------------------------------------------------------
// SEMIS
// -----------------------------------------------------------------------------
function bd(): Client {
  if (client === undefined) throw new Error('connexion absente');
  return client;
}

function api(): FastifyInstance {
  if (app === undefined) throw new Error('application non construite');
  return app;
}

/**
 * Un ADMIN — le rôle qui voit toute mission, membre ou non (03 §34.1).
 *
 * L'export d'une mission dont on n'est pas membre rend 404 ; les deux fixtures
 * canoniques n'inscrivent personne dans `mission_users`, et c'est FIDÈLE à ce que
 * le produit fait aujourd'hui. On passe donc par l'admin, qui est le rôle réel de
 * l'auditeur de siège qui télécharge un export (§34.1).
 */
async function creerAdmin(): Promise<string> {
  const id = uuidv7();
  await bd().query(
    `INSERT INTO users (id, name, email, password_hash, role, usage_profile,
                        habilitated_at, is_active, created_at, updated_at)
     VALUES ($1, 'Auditeur de siège de recette', $2, 'empreinte-factice-non-verifiee',
             'admin', 'guide_strict', now(), true, now(), now())`,
    [id, `recette.l7e.${id}@exemple.test`],
  );
  return api().jwt.sign({ sub: id });
}

/** Télécharge l'export de la route RÉELLE, le décompresse, et le chronomètre. */
async function exporter(mission: MissionCanonique, jeton: string): Promise<ArchiveDeRecette> {
  const debut = process.hrtime.bigint();
  const reponse = await api().inject({
    method: 'GET',
    url: `/v1/missions/${mission.missionId}/export`,
    headers: { 'x-forwarded-for': ipUnique(), authorization: `Bearer ${jeton}` },
  });
  const millisecondes = Number(process.hrtime.bigint() - debut) / 1e6;

  if (reponse.statusCode !== 200) {
    throw new Error(
      `l'export de ${mission.nom} a répondu ${String(reponse.statusCode)} : ${reponse.body}`,
    );
  }
  const fichiers = lireArchiveExport(reponse.rawPayload);
  const brut = fichiers.get('mission.json');
  if (brut === undefined) throw new Error('mission.json absent de l’archive');
  return {
    mission,
    fichiers,
    meta: JSON.parse(brut.toString('utf8')) as Record<string, unknown>,
    octets: reponse.rawPayload.length,
    millisecondes,
  };
}

// =============================================================================
// MISE EN PLACE
// =============================================================================
beforeAll(async () => {
  if (!migrationsLivrees()) throw new Error(MESSAGE_L1_ABSENT);

  const base = await creerBaseEphemere('l7e_recette');
  nomBase = base.nom;
  await appliquerMontee(base.url);

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

  const jeton = await creerAdmin();
  filTpe = await exporter(await genererFilTpe(bd()), jeton);
  filGc = await exporter(await genererFilGc(bd()), jeton);
}, 600_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const { fermerBase } = await import('../src/db.js');
  await fermerBase();
  if (client !== undefined) await client.end();
  if (nomBase !== '') await supprimerBaseEphemere(nomBase);
});

// =============================================================================
// ① CE QUI EST DÉCLARÉ PORTÉ DOIT L'ÊTRE — la rubrique perd sa source, ça rougit
// =============================================================================
describe('@critique §36.3 × §20.3 — chaque colonne déclarée existe dans l’archive RÉELLE', () => {
  const portes = elementsDeLaGrille().filter((element) => element.porteur !== null);

  it.each(portes.map((element) => [element.rubrique, element.nom, element] as const))(
    '@critique rubrique %s — « %s » : ses colonnes sont dans l’archive, sur les DEUX missions',
    (_numero, _nom, element) => {
      const porteur = element.porteur;
      if (porteur === null) throw new Error('élément sans porteur dans la liste des portés');

      for (const archive of lesDeux()) {
        expect(
          archive.fichiers.has(porteur.fichier),
          `rubrique ${String(element.rubrique)} (${element.nom}) — ${porteur.fichier} absent de ` +
            `l’archive de ${archive.mission.nom} : la rubrique a perdu son fichier`,
        ).toBe(true);

        if (porteur.fichier === 'mission.json') {
          // Une méta n'a pas d'en-tête CSV : on pointe la CLÉ, et on exige
          // qu'elle EXISTE — `null` est une valeur, `undefined` est une absence.
          for (const cle of porteur.colonnes) {
            expect(
              valeurMeta(archive, cle),
              `rubrique ${String(element.rubrique)} (${element.nom}) — clé ${cle} absente de ` +
                `mission.json (${archive.mission.nom})`,
            ).not.toBeUndefined();
          }
          continue;
        }

        const entete = enTeteDe(archive, porteur.fichier);
        for (const colonne of porteur.colonnes) {
          expect(
            entete,
            `rubrique ${String(element.rubrique)} (${element.nom}) — colonne « ${colonne} » ` +
              `absente de ${porteur.fichier} (${archive.mission.nom}) : la rubrique a perdu sa source`,
          ).toContain(colonne);
        }
      }
    },
  );
});

// =============================================================================
// ② CE QUI EST DÉCLARÉ ABSENT DOIT L'ÊTRE — le cliquet, dans l'autre sens
// =============================================================================
describe('@critique les TROUS DE FORMAT sont exactement là où la grille les déclare', () => {
  const trous = elementsDeLaGrille().filter((element) => element.nature === 'FORMAT_ABSENT');

  it('@critique il y a bien des trous de format, et la grille en nomme la source', () => {
    // Contrôle de vacuité : une grille vide rendrait tous les tests suivants
    // verts sans rien avoir vérifié.
    expect(trous.length).toBeGreaterThan(0);
    for (const trou of trous) {
      expect(
        trou.porteur,
        `${trou.nom} est déclaré FORMAT_ABSENT mais porte un fichier`,
      ).toBeNull();
      expect(
        trou.source,
        `rubrique ${String(trou.rubrique)} — « ${trou.nom} » : un trou non tracé n’est pas un ` +
          'trou déclaré (CLAUDE.md §3)',
      ).toBeTruthy();
      expect(trou.graphiesAttendues?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it.each(trous.map((element) => [element.rubrique, element.nom, element] as const))(
    '@critique rubrique %s — « %s » : AUCUNE colonne de l’archive ne la porte (si elle apparaît, le verdict est périmé)',
    (_numero, _nom, element) => {
      for (const archive of lesDeux()) {
        const colonnes = toutesLesColonnes(archive).map((colonne) => colonne.toLowerCase());
        for (const graphie of element.graphiesAttendues ?? []) {
          const trouvees = colonnes.filter((colonne) => colonne.includes(graphie.toLowerCase()));
          expect(
            trouvees,
            `rubrique ${String(element.rubrique)} — « ${element.nom} » est déclaré FORMAT_ABSENT, ` +
              `mais ${archive.mission.nom} porte ${trouvees.join(', ')}. Le trou s’est refermé : ` +
              `re-noter la grille et le VERDICT_DECLARE. Source du verdict : ${element.source ?? ''}`,
          ).toEqual([]);
        }
      }
    },
  );

  it('@critique aucun fichier de FEUILLE DE ROUTE dans l’archive (rubriques 9 et 10)', () => {
    for (const archive of lesDeux()) {
      const suspects = [...archive.fichiers.keys()].filter((nom) =>
        /feuille|route|roadmap|plan_action|trajectoire/i.test(nom),
      );
      expect(
        suspects,
        'un fichier de feuille de route est apparu : les rubriques 9 et 10 se re-notent ' +
          '(DECISIONS.md 2026-09-05, arbitrage maintenu le 2026-09-09)',
      ).toEqual([]);
    }
  });
});

// =============================================================================
// ③ LA CAUSE EST MESURÉE — trou d'ALIMENTATION vs trou de FORMAT
// =============================================================================
describe('@critique les TROUS D’ALIMENTATION : le fichier est correct, rien ne l’écrit', () => {
  it('@critique l’inventaire des écritures de production confirme la liste déclarée', () => {
    const avecEcrivain = tablesAvecEcrivainDeProduction();
    const inattendues = TABLES_SANS_ECRIVAIN_DE_PRODUCTION.filter((table) =>
      avecEcrivain.has(table),
    );
    expect(
      inattendues,
      `ces tables ont GAGNÉ un écrivain de production : ${inattendues.join(', ')}. Ce n’est pas ` +
        'un défaut — c’est un lot livré. Re-noter la grille : leurs rubriques passent ' +
        'd’ALIMENTATION_ABSENTE à PORTE dès qu’un parcours produit y écrit.',
    ).toEqual([]);

    // Contre-épreuve : la mesure DOIT voir les tables que le produit écrit
    // vraiment. Sans elle, une expression régulière cassée rendrait « aucune
    // table alimentée » — c’est-à-dire vert, et faux sur toute la ligne.
    for (const temoin of ['companies', 'missions', 'org_units', 'mission_questions'] as const) {
      expect(
        avecEcrivain.has(temoin),
        `la mesure ne voit pas l’écrivain de ${temoin} : elle ne mesure rien`,
      ).toBe(true);
    }
  });

  it.each(
    elementsDeLaGrille()
      .filter((element) => element.nature === 'ALIMENTATION_ABSENTE')
      .map((element) => [element.rubrique, element.nom, element] as const),
  )(
    '@critique rubrique %s — « %s » : le fichier est là, la table n’a aucun écrivain de production',
    (_numero, _nom, element) => {
      const porteur = element.porteur;
      expect(
        porteur,
        `un trou d’ALIMENTATION suppose un fichier CORRECT : ${element.nom} n’en a pas`,
      ).not.toBeNull();
      expect(element.table).not.toBeNull();
      expect(
        TABLES_SANS_ECRIVAIN_DE_PRODUCTION,
        `rubrique ${String(element.rubrique)} — ${String(element.table)} doit être déclarée sans ` +
          'écrivain de production, sinon ce n’est pas un trou d’alimentation',
      ).toContain(element.table);
    },
  );

  it('@critique les cinq fichiers de Phase 2 sont livrés VIDES — en-tête seul, jamais absents', () => {
    // C'est la signature exacte d'un trou d'alimentation, et elle se distingue à
    // l'œil d'un trou de format : le fichier EST là, ses colonnes AUSSI, il n'a
    // simplement aucune ligne. `scores.csv`, lui, est ABSENT — autre nature.
    for (const archive of lesDeux()) {
      for (const fichier of [
        'constats.csv',
        'cas_usage.csv',
        'inventaire_outils.csv',
        'registre_ia.csv',
        'pieces_jointes/manifest.csv',
      ]) {
        expect(archive.fichiers.has(fichier), `${fichier} absent (${archive.mission.nom})`).toBe(
          true,
        );
        expect(
          enTeteDe(archive, fichier).length,
          `${fichier} n’a pas d’en-tête : ce n’est plus un trou d’alimentation, c’est une panne`,
        ).toBeGreaterThan(3);
        expect(
          nombreDeLignes(archive, fichier),
          `${fichier} contient des lignes (${archive.mission.nom}) : une table déclarée sans ` +
            'écrivain vient d’être alimentée — re-noter la grille',
        ).toBe(0);
      }
    }
  });
});

// =============================================================================
// ④ LE TROU DE BRANCHEMENT — le producteur existe, aucune route ne l'appelle
// =============================================================================
describe('@critique le TROU DE BRANCHEMENT du scoring : un moteur sans route', () => {
  it('@critique le moteur de scoring existe et est testé — ce n’est pas un trou d’alimentation', () => {
    const moteurs = fichiersDeProduction(join(RACINE_API, 'src', 'scoring'));
    expect(
      moteurs.length,
      'le moteur de scoring a disparu : ce n’est plus un trou de branchement',
    ).toBeGreaterThan(0);
  });

  it('@critique aucune route de l’API n’atteint `src/scoring` — la mesure, pas la parole', () => {
    const routes = fichiersDeProduction(join(RACINE_API, 'src', 'routes'))
      .map((chemin) => readFileSync(chemin, 'utf8'))
      .join('\n');
    const domaines = fichiersDeProduction(join(RACINE_API, 'src', 'domaines'))
      .map((chemin) => readFileSync(chemin, 'utf8'))
      .join('\n');
    const importeLeScoring = /from '[^']*scoring\/[^']*'/;

    expect(
      importeLeScoring.test(routes),
      'une route importe désormais le moteur de scoring : le trou de BRANCHEMENT se referme, ' +
        'les rubriques 2 et 5 se re-notent',
    ).toBe(false);
    expect(
      importeLeScoring.test(domaines),
      'un domaine importe désormais le moteur de scoring : re-noter les rubriques 2 et 5',
    ).toBe(false);
  });

  it('@critique `scores.csv` est ABSENT et son absence est SIGNALÉE (§36.3 : « absent et signalé »)', () => {
    for (const archive of lesDeux()) {
      expect(
        archive.fichiers.has('scores.csv'),
        `scores.csv est apparu dans ${archive.mission.nom} : L8 est branché, re-noter la grille`,
      ).toBe(false);
      expect(valeurMeta(archive, 'scores.presents')).toBe(false);
      const motif = valeurMeta(archive, 'scores.motif');
      expect(typeof motif, 'l’absence des scores doit être signalée, pas seulement vraie').toBe(
        'string',
      );
      expect(String(motif).length).toBeGreaterThan(20);
    }
  });

  it('@critique aucune colonne de score dans `reponses.csv` — une colonne vide dirait autre chose', () => {
    for (const archive of lesDeux()) {
      const suspects = enTeteDe(archive, 'reponses.csv').filter((colonne) =>
        /score/i.test(colonne),
      );
      expect(
        suspects,
        'une colonne de score est apparue : un score vide se lit « aucun score calculé », pas ' +
          '« scoring non livré » (DECISIONS.md 2026-09-05)',
      ).toEqual([]);
    }
  });
});

// =============================================================================
// ⑤ LE VERDICT GLOBAL EST SOUS TEST — c'est lui qui décide du lot
// =============================================================================
describe('@critique le critère d’acceptation L7-min, recalculé et confronté au verdict déclaré', () => {
  it('@critique les douze rubriques du §20.3 sont toutes dans la grille, une fois chacune', () => {
    expect(GRILLE_20_3.map((rubrique) => rubrique.numero)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    for (const rubrique of GRILLE_20_3) {
      expect(
        rubrique.elements.length,
        `rubrique ${String(rubrique.numero)} sans élément`,
      ).toBeGreaterThan(0);
    }
  });

  it('@critique le verdict RECALCULÉ depuis la grille est exactement le verdict DÉCLARÉ', () => {
    const redigeables = GRILLE_20_3.filter((r) => verdictDeRubrique(r) === 'PORTE').map(
      (r) => r.numero,
    );
    const format = GRILLE_20_3.filter((r) => verdictDeRubrique(r) === 'FORMAT_ABSENT').map(
      (r) => r.numero,
    );
    const branchement = GRILLE_20_3.filter(
      (r) => verdictDeRubrique(r) === 'BRANCHEMENT_ABSENT',
    ).map((r) => r.numero);
    const alimentation = GRILLE_20_3.filter(
      (r) => verdictDeRubrique(r) === 'ALIMENTATION_ABSENTE',
    ).map((r) => r.numero);

    expect(
      redigeables,
      'la liste des rubriques rédigeables a changé — re-dater VERDICT_DECLARE',
    ).toEqual([...VERDICT_DECLARE.rubriquesRedigeables]);
    expect(format).toEqual([...VERDICT_DECLARE.bloqueesParLeFormat]);
    expect(branchement).toEqual([...VERDICT_DECLARE.bloqueesParLeBranchement]);
    expect(alimentation).toEqual([...VERDICT_DECLARE.bloqueesParLAlimentation]);

    // Aucune rubrique ne se perd en route : les quatre listes partitionnent 1..12.
    expect(
      [...redigeables, ...format, ...branchement, ...alimentation].sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('@critique le critère « le rapport §20.3 se rédige EN ENTIER depuis le ZIP » est NON TENU, et c’est dit', () => {
    const redigeables = GRILLE_20_3.filter((r) => verdictDeRubrique(r) === 'PORTE');
    const tenu = redigeables.length === GRILLE_20_3.length ? 'TENU' : 'NON TENU';

    expect(
      tenu,
      'le critère d’acceptation L7-min a changé d’état. S’il est TENU, c’est une bonne ' +
        'nouvelle à tracer dans VERDICT_DECLARE et à porter à la porte P-E ; s’il ne l’est ' +
        'pas, la grille doit dire pourquoi, rubrique par rubrique.',
    ).toBe(VERDICT_DECLARE.critereL7Min);

    // Le chiffre, écrit pour être lu dans le rapport de porte.
    expect(redigeables.length).toBe(VERDICT_DECLARE.rubriquesRedigeables.length);
  });
});

// =============================================================================
// ⑥ CE QUE L'ARCHIVE TIENT VRAIMENT — la forme du §36.3, sur les deux échelles
// =============================================================================
describe('@filrouge l’export §36.3 sur les DEUX missions canoniques (09 §4bis)', () => {
  it('@filrouge @critique FIL-TPE — l’archive porte les dix fichiers, la mission et sa collecte', () => {
    const archive = tpe();
    for (const fichier of [
      'mission.json',
      'arbre.csv',
      'sessions.csv',
      'reponses.csv',
      'constats.csv',
      'cas_usage.csv',
      'inventaire_outils.csv',
      'registre_ia.csv',
      'unites_hors_perimetre.csv',
      'pieces_jointes/manifest.csv',
    ]) {
      expect(archive.fichiers.has(fichier), `${fichier} absent de FIL-TPE`).toBe(true);
    }
    expect(nombreDeLignes(archive, 'arbre.csv')).toBe(1);
    expect(nombreDeLignes(archive, 'sessions.csv')).toBe(1);
    expect(nombreDeLignes(archive, 'reponses.csv')).toBe(archive.mission.reponses);
    expect(valeurMeta(archive, 'completudeGlobale.reponsesCollectees')).toBe(
      archive.mission.reponses,
    );
  });

  it('@filrouge @critique FIL-GC — 150 unités, 60 sessions, 8 100 réponses dans UNE archive', () => {
    const archive = gc();
    expect(nombreDeLignes(archive, 'arbre.csv')).toBe(archive.mission.unites);
    expect(archive.mission.unites).toBe(150);
    expect(nombreDeLignes(archive, 'sessions.csv')).toBe(archive.mission.entretiens);
    expect(nombreDeLignes(archive, 'reponses.csv')).toBe(archive.mission.reponses);
    expect(archive.mission.reponses).toBe(8_100);
    expect(valeurMeta(archive, 'perimetre.unites')).toBe(150);
  });

  it('@filrouge @critique le tri du §36.3 tient à l’échelle : bloc → unité → question', () => {
    // Sur 8 100 lignes, un tri qui « marche sur l'exemple » se voit ici et
    // nulle part ailleurs. Le §36.3 impose cet ordre parce que c'est celui dans
    // lequel le rapport se rédige, chapitre par chapitre.
    const archive = gc();
    const entete = enTeteDe(archive, 'reponses.csv');
    const iBloc = entete.indexOf('bloc_code');
    const iUnite = entete.indexOf('unite_nom');
    const lignes = lignesDuCsv(archive.fichiers, 'reponses.csv').slice(1);
    expect(lignes.length).toBe(8_100);

    // La clé de tri est un COUPLE comparé champ par champ, jamais deux chaînes
    // recollées : un séparateur choisi au hasard finit par apparaître dans un nom
    // d’unité, et le test se met alors à mesurer le séparateur.
    let blocPrecedent = '';
    let unitePrecedente = '';
    for (const ligne of lignes) {
      const cellules = cellulesDeLigne(ligne);
      const bloc = cellules[iBloc] ?? '';
      const unite = cellules[iUnite] ?? '';
      const ordonne = bloc > blocPrecedent || (bloc === blocPrecedent && unite >= unitePrecedente);
      expect(
        ordonne,
        `reponses.csv n’est plus trié bloc → unité à la ligne « ${ligne.slice(0, 80)} »`,
      ).toBe(true);
      blocPrecedent = bloc;
      unitePrecedente = unite;
    }
  });

  it('@filrouge @critique chaque CSV porte le BOM UTF-8 et le point-virgule (§36.3, Excel FR)', () => {
    for (const archive of lesDeux()) {
      for (const [nom, octets] of archive.fichiers) {
        if (!nom.endsWith('.csv')) continue;
        expect(octets.subarray(0, 3), `${nom} sans BOM : Excel FR le lira en Windows-1252`).toEqual(
          Buffer.from([0xef, 0xbb, 0xbf]),
        );
        expect(
          enTeteDe(archive, nom).length,
          `${nom} : en-tête non découpé par « ; »`,
        ).toBeGreaterThan(1);
      }
      // `mission.json` NE porte PAS de BOM : `JSON.parse` strict le refuse.
      const meta = archive.fichiers.get('mission.json');
      expect(meta?.[0]).not.toBe(0xef);
    }
  });

  it('@filrouge @critique la PROSE de l’archive est 100 % française (invariant 5)', () => {
    // ⚠ CE QUI EST MESURÉ ICI, ET CE QUI NE PEUT PAS L'ÊTRE.
    //
    // Une première rédaction balayait les EN-TÊTES de colonnes. Elle rougissait,
    // et elle avait tort : le §36.3 spécifie lui-même `kind`, `in_scope` et
    // `type` — il écrit « ref, nom, kind, parent, effectif, in_scope » et
    // « colonne `unite_in_scope` ». Les identifiants de colonnes d'un fichier de
    // données ne sont pas de l'interface, et le pack tranche la question PAR
    // L'EXEMPLE sans jamais l'énoncer (doute porté à DECISIONS.md).
    //
    // Ce qu'un auditeur LIT réellement dans l'archive, c'est la PROSE : les
    // définitions, les motifs, la règle des répondants, et le mode d'emploi des
    // fichiers. C'est elle qui doit être française, et c'est elle qu'on mesure.
    const PROSE: readonly string[] = [
      'formatHorodatage',
      'completudeGlobale.definition',
      'scores.motif',
      'piecesJointes.motif',
      'repondants.regle',
    ];
    // Des mots qu'une phrase française d'interface ne porte jamais, et qui
    // signent une chaîne restée en anglais.
    const ANGLAIS = /\b(the|this|not|available|missing|delivered|please|see|file|and|with)\b/i;

    for (const archive of lesDeux()) {
      for (const chemin of PROSE) {
        const texte = valeurMeta(archive, chemin);
        expect(typeof texte, `${chemin} n’est pas une phrase`).toBe('string');
        expect(
          ANGLAIS.test(String(texte)),
          `${chemin} contient de l’anglais : « ${String(texte)} »`,
        ).toBe(false);
      }
      // Le mode d'emploi de CHAQUE fichier — c'est lui qui porte le critère
      // « sans retourner dans l'outil » jusque dans l'archive.
      const fichiers = valeurMeta(archive, 'fichiers');
      expect(Array.isArray(fichiers)).toBe(true);
      for (const entree of fichiers as { nom: string; contenu: string }[]) {
        expect(entree.contenu.length, `${entree.nom} sans description`).toBeGreaterThan(40);
        expect(ANGLAIS.test(entree.contenu), `description anglaise : ${entree.nom}`).toBe(false);
      }
    }
  });

  it('@filrouge @critique les horodatages sont au FUSEAU DE MISSION, avec leur décalage (invariant 5)', () => {
    const archive = tpe();
    const entete = enTeteDe(archive, 'reponses.csv');
    const iHorodatage = entete.indexOf('horodatage');
    expect(iHorodatage).toBeGreaterThanOrEqual(0);
    const lignes = lignesDuCsv(archive.fichiers, 'reponses.csv').slice(1);
    const AVEC_DECALAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/;
    for (const ligne of lignes) {
      const valeur = cellulesDeLigne(ligne)[iHorodatage] ?? '';
      expect(AVEC_DECALAGE.test(valeur), `horodatage sans décalage de fuseau : « ${valeur} »`).toBe(
        true,
      );
    }
    expect(valeurMeta(archive, 'fuseau')).toBe('Europe/Paris');
  });
});

// =============================================================================
// ⑦ L'ÉCHELLE FIL-GC — ce que la DoD d'A36 demande de MESURER
// =============================================================================
describe('l’échelle FIL-GC : l’export d’un grand compte reste utilisable', () => {
  it('@critique l’export de 8 100 réponses tient dans une archive lisible et sous la minute', () => {
    const archive = gc();
    // Pas un budget de performance de route (celui-là est à A28, en k6) : un
    // garde-fou de RECETTE. Un export qui dépasse la minute sur la plus grosse
    // mission canonique n'est pas utilisable au siège, et le dire à 8 100
    // réponses coûte moins cher que de le découvrir à 80 000.
    expect(
      archive.millisecondes,
      `l’export FIL-GC a pris ${archive.millisecondes.toFixed(0)} ms`,
    ).toBeLessThan(60_000);
    expect(archive.octets).toBeGreaterThan(1_000);
  });

  it('la couverture reste LISIBLE à 150 unités : chaque unité porte son chemin et ses comptes', () => {
    const archive = gc();
    const entete = enTeteDe(archive, 'arbre.csv');
    for (const colonne of ['chemin', 'sessions_prevues', 'sessions_realisees', 'effectif']) {
      expect(entete).toContain(colonne);
    }
    const iChemin = entete.indexOf('chemin');
    const iId = entete.indexOf('unite_id');
    const iNom = entete.indexOf('nom');
    const iParent = entete.indexOf('parent_id');
    const lignes = lignesDuCsv(archive.fichiers, 'arbre.csv').slice(1);

    // ⚠ AUCUN SÉPARATEUR N'EST SUPPOSÉ ICI. Une première rédaction découpait sur
    // « / » et rougissait sur un export CORRECT : l'écrivain sépare autrement.
    // Un test de recette qui devine la mise en forme mesure l'écrivain, pas la
    // lisibilité. Ce qu'on exige est vérifiable sans elle : le chemin d'une
    // unité CONTIENT le nom de chacun de ses ancêtres, et c'est cela qui rend
    // l'arbre navigable dans un tableur à 150 lignes.
    const parId = new Map(
      lignes.map((ligne) => {
        const cellules = cellulesDeLigne(ligne);
        return [
          cellules[iId] ?? '',
          {
            nom: cellules[iNom] ?? '',
            parent: cellules[iParent] ?? '',
            chemin: cellules[iChemin] ?? '',
          },
        ];
      }),
    );
    expect(parId.size).toBe(150);

    let profondeurMaximale = 0;
    for (const unite of parId.values()) {
      expect(unite.chemin, 'une unité sans chemin est une unité introuvable').not.toBe('');
      let ancetre = unite.parent === '' ? undefined : parId.get(unite.parent);
      let profondeur = 1;
      let garde = 0;
      while (ancetre !== undefined && garde <= 150) {
        expect(
          unite.chemin,
          `le chemin de « ${unite.nom} » ne cite pas son ancêtre « ${ancetre.nom} » : ` +
            'la cartographie par service (§20.3-4) ne se lit plus',
        ).toContain(ancetre.nom);
        profondeur += 1;
        ancetre = ancetre.parent === '' ? undefined : parId.get(ancetre.parent);
        garde += 1;
      }
      profondeurMaximale = Math.max(profondeurMaximale, profondeur);
    }
    // Les quatre niveaux du §26.3 : groupe → filiale → direction → service.
    expect(profondeurMaximale, 'l’arbre de FIL-GC s’est aplati').toBe(4);
  });
});

// =============================================================================
// ⑧ CE QUE LE RAPPORT EXIGE ET QUE LA GRILLE NE VOIT PAS — §36.6-2
// =============================================================================
describe('@critique §36.6-2 — « tout chiffre du rapport est retrouvable dans reponses.csv »', () => {
  it('@critique reponses.csv porte les DEUX clés de jointure que constats.csv cite', () => {
    for (const archive of lesDeux()) {
      const reponses = enTeteDe(archive, 'reponses.csv');
      expect(reponses).toContain('answer_id');
      expect(reponses).toContain('session_id');

      const constats = enTeteDe(archive, 'constats.csv');
      expect(constats).toContain('sources_reponses');
      expect(constats).toContain('sources_sessions');
    }
  });

  it('@critique chaque réponse de FIL-GC porte un answer_id UNIQUE — sinon aucune citation ne tient', () => {
    const archive = gc();
    const lignes = lignesDuCsv(archive.fichiers, 'reponses.csv').slice(1);
    const ids = new Set(lignes.map((ligne) => cellulesDeLigne(ligne)[0]));
    expect(ids.size).toBe(lignes.length);
  });
});
